# Mini CRM Phase 5: Project Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every project a board of columns and cards that tracks work through to completion, with drag-and-drop ordering and per-column control over what a client will eventually see.

**Architecture:** Two tables, `board_columns` and `board_cards`, both scoped to a project. Ordering is an integer `position` rewritten for the affected columns inside a transaction — the arithmetic lives in a pure module so it is provable without a database. A new `board.service.ts` owns the queries; `project.service.ts` is already ~500 lines and does not grow. The UI is a panel on the existing project detail page, with `@dnd-kit` supplying keyboard-operable drag.

**Tech Stack:** Node.js, Express, TypeScript, better-sqlite3, React 19, `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0, shadcn/ui, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-mini-crm-design.md`

## Global Constraints

- **Cards carry no assignee.** The spec cut `assignee_user_id`: a panel has one operator, so the control would be a dropdown holding their own name. Do not add one.
- **`client_visible` defaults to 0** on every column. Forgetting the toggle must hide too much, never leak. Nothing in this phase renders a client view — the flag is stored for Phase 2 — but the default is set now.
- **Ordering is integer `position`, contiguous from 0**, rewritten for every affected column inside one transaction. No fractional positions.
- **Every board query authorises through its project**, exactly as `getProjectSites` does: look the project up with the caller's `userId`, throw `NotFoundError` if absent, then act. CRM is scoped per staff user; there is no privileged override.
- Route prefix stays `/api/projects/*`. The stored feature key stays `feature.projects`.
- Never write a hex colour or an inline `style` prop — use the semantic tokens in `packages/dashboard/src/styles/theme.css`.
- Card discussion is Phase 6. Do not add comments or attachments here.
- DB timestamps are UTC without a `Z`; append one before `new Date()`.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/api/src/services/boardOrder.ts` | **Create.** Pure ordering arithmetic — no DB, no I/O. |
| `packages/api/src/services/boardOrder.test.ts` | **Create.** Tests for the above. |
| `packages/api/src/utils/db.ts` | **Modify.** Two `CREATE TABLE IF NOT EXISTS` blocks. |
| `packages/api/src/test-helpers/db.ts` + `.test.ts` | **Modify.** Same two tables in the fixture; extend the table-list assertion. |
| `packages/api/src/services/board.service.ts` | **Create.** All board queries: read the board, CRUD columns and cards, move a card. |
| `packages/api/src/services/board.service.test.ts` | **Create.** Tests for the above. |
| `packages/api/src/routes/projects.ts` | **Modify.** Board routes under `/list/:id/board`. |
| `packages/dashboard/src/pages/admin/board/BoardPanel.tsx` | **Create.** The board: columns, cards, and their editing affordances. |
| `packages/dashboard/src/pages/admin/board/useBoard.ts` | **Create.** Data hook — load, and the mutations the panel calls. |
| `packages/dashboard/src/pages/admin/ProjectDetailPage.tsx` | **Modify.** Mount the panel. |
| `packages/dashboard/package.json` | **Modify.** Add the two `@dnd-kit` packages. |
| `CLAUDE.md` | **Modify.** Schema and endpoints. |

The board UI lives in its own directory because it is the largest screen in the panel; keeping the drag wiring beside the presentation but apart from the data hook is what makes each reviewable.

---

### Task 1: Ordering arithmetic

Pure logic first. Every drag ends in this code, and a mistake here silently scrambles a board.

**Files:**
- Create: `packages/api/src/services/boardOrder.ts`
- Create: `packages/api/src/services/boardOrder.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `sequentialPositions(ids: string[]): { id: string; position: number }[]` — assigns 0..n-1 in the given order.
  - `moveWithinList(ids: string[], id: string, toIndex: number): string[]` — returns a new order with `id` at `toIndex`.

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/services/boardOrder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sequentialPositions, moveWithinList } from './boardOrder';

describe('sequentialPositions', () => {
  it('numbers a list from zero in the order given', () => {
    expect(sequentialPositions(['c', 'a', 'b'])).toEqual([
      { id: 'c', position: 0 },
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });

  it('returns nothing for an empty list', () => {
    expect(sequentialPositions([])).toEqual([]);
  });
});

describe('moveWithinList', () => {
  it('moves an item later', () => {
    expect(moveWithinList(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
  });

  it('moves an item earlier', () => {
    expect(moveWithinList(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
  });

  it('leaves the order alone when the item is already there', () => {
    expect(moveWithinList(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'b', 'c']);
  });

  it('clamps an index past the end rather than dropping the item', () => {
    // A drop below the last card reports an index one past the end. Losing the
    // card would be worse than putting it last.
    expect(moveWithinList(['a', 'b'], 'a', 99)).toEqual(['b', 'a']);
  });

  it('clamps a negative index to the front', () => {
    expect(moveWithinList(['a', 'b'], 'b', -5)).toEqual(['b', 'a']);
  });

  it('inserts an id that was not in the list', () => {
    // Moving a card between columns: the id belongs to the destination now,
    // but was never in its order.
    expect(moveWithinList(['a', 'b'], 'new', 1)).toEqual(['a', 'new', 'b']);
  });

  it('does not mutate its input', () => {
    const original = ['a', 'b', 'c'];
    moveWithinList(original, 'a', 2);
    expect(original).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/api && npx vitest run src/services/boardOrder.test.ts`
Expected: FAIL — `Cannot find module './boardOrder'`.

- [ ] **Step 3: Write the implementation**

Create `packages/api/src/services/boardOrder.ts`:

```ts
/**
 * Ordering arithmetic for the project board.
 *
 * Positions are contiguous integers from zero, rewritten for every affected
 * column on each move. Fractional positions avoid the rewrite but accumulate
 * precision debt and eventually need rebalancing; a board holds tens of cards,
 * where rewriting a column is trivial and always correct.
 */

/** Assign 0..n-1 to ids in the order given. */
export function sequentialPositions(ids: string[]): { id: string; position: number }[] {
  return ids.map((id, position) => ({ id, position }));
}

/**
 * Place `id` at `toIndex` within `ids`, returning a new array.
 *
 * The index is clamped rather than validated: a drop below the last card
 * reports one past the end, and a card that vanished because the UI reported an
 * out-of-range index would be a far worse outcome than one placed last. An id
 * absent from the list is inserted, which is what a move between columns looks
 * like from the destination's side.
 */
export function moveWithinList(ids: string[], id: string, toIndex: number): string[] {
  const without = ids.filter((existing) => existing !== id);
  const index = Math.max(0, Math.min(toIndex, without.length));
  return [...without.slice(0, index), id, ...without.slice(index)];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/api && npx vitest run src/services/boardOrder.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd packages/api && npx tsc --noEmit
cd "e:/MSR Builds/Products/WP Launcher/App/wp-launcher"
git add packages/api/src/services/boardOrder.ts packages/api/src/services/boardOrder.test.ts
git commit -m "feat(board): ordering arithmetic for columns and cards

Every drag ends here, so the arithmetic is pure and proven without a database.
Out-of-range indexes clamp rather than throw: a card lost because the UI
reported an index one past the end is worse than one placed last."
```

---

### Task 2: Schema and the board service

**Files:**
- Modify: `packages/api/src/utils/db.ts`
- Modify: `packages/api/src/test-helpers/db.ts`, `packages/api/src/test-helpers/db.test.ts`
- Create: `packages/api/src/services/board.service.ts`
- Create: `packages/api/src/services/board.service.test.ts`

**Interfaces:**
- Consumes: `sequentialPositions`, `moveWithinList` from `./boardOrder`; `getDb`; `ValidationError`, `NotFoundError`.
- Produces, from `board.service.ts`:
  - `interface BoardColumn { id: string; project_id: string; name: string; position: number; client_visible: number; created_at: string }`
  - `interface BoardCard { id: string; project_id: string; column_id: string; title: string; description: string | null; position: number; due_date: string | null; labels: string; created_at: string; updated_at: string }`
  - `getBoard(projectId: string, userId: string): { columns: (BoardColumn & { cards: BoardCard[] })[] }`
  - `createColumn(projectId: string, userId: string, data: { name: string }): BoardColumn`
  - `updateColumn(columnId: string, userId: string, data: { name?: string; client_visible?: boolean }): BoardColumn`
  - `deleteColumn(columnId: string, userId: string): void`
  - `createCard(columnId: string, userId: string, data: { title: string; description?: string; due_date?: string; labels?: string[] }): BoardCard`
  - `updateCard(cardId: string, userId: string, data: { title?: string; description?: string; due_date?: string | null; labels?: string[] }): BoardCard`
  - `deleteCard(cardId: string, userId: string): void`
  - `moveCard(cardId: string, userId: string, toColumnId: string, toIndex: number): void`
  - `reorderColumns(projectId: string, userId: string, columnIds: string[]): void`

- [ ] **Step 1: Add both tables to the production schema**

In `packages/api/src/utils/db.ts`, inside the existing `db.exec(\`…\`)` block in `initSchema`, after the `project_sites` table:

```sql
    CREATE TABLE IF NOT EXISTS board_columns (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      -- Deny by default: forgetting the toggle hides work from the client
      -- rather than exposing an internal column to them.
      client_visible INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE INDEX IF NOT EXISTS idx_board_columns_project ON board_columns(project_id);

    CREATE TABLE IF NOT EXISTS board_cards (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      column_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      labels TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (column_id) REFERENCES board_columns(id)
    );

    CREATE INDEX IF NOT EXISTS idx_board_cards_column ON board_cards(column_id);
```

`project_id` is denormalised onto `board_cards` alongside `column_id` so a card can be authorised against its project without joining through its column on every check.

- [ ] **Step 2: Add both tables to the fixture**

In `packages/api/src/test-helpers/db.ts`, add the two DDL constants (same columns, `CREATE TABLE` without `IF NOT EXISTS`, no indexes needed) and include them in the array inside `createTestDb`. Then extend the table-list assertion in `packages/api/src/test-helpers/db.test.ts` so it reads exactly:

```ts
    expect(names).toEqual(['board_cards', 'board_columns', 'clients', 'image_builds', 'invoice_payment_methods', 'invoices', 'payment_methods', 'project_sites', 'projects', 'settings', 'site_logs', 'sites', 'snapshots', 'sqlite_sequence', 'users']);
```

- [ ] **Step 3: Write the failing tests**

Create `packages/api/src/services/board.service.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import {
  getBoard, createColumn, updateColumn, deleteColumn,
  createCard, updateCard, deleteCard, moveCard, reorderColumns,
} from './board.service';

let db: Database.Database;
const OWNER = 'u-owner';
const STRANGER = 'u-stranger';

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  for (const id of [OWNER, STRANGER]) {
    db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(id, `${id}@example.com`);
  }
  db.prepare("INSERT INTO projects (id, user_id, name) VALUES ('p1', 'u-owner', 'Redesign')").run();
});
afterEach(() => { __setDbForTesting(null); db.close(); });

describe('columns', () => {
  it('starts a project with an empty board', () => {
    expect(getBoard('p1', OWNER).columns).toEqual([]);
  });

  it('appends new columns in creation order', () => {
    createColumn('p1', OWNER, { name: 'To do' });
    createColumn('p1', OWNER, { name: 'Doing' });
    expect(getBoard('p1', OWNER).columns.map((c) => c.name)).toEqual(['To do', 'Doing']);
  });

  it('hides columns from the client until told otherwise', () => {
    // Deny by default: a forgotten toggle must hide work, never leak it.
    const col = createColumn('p1', OWNER, { name: 'Internal' });
    expect(col.client_visible).toBe(0);
    expect(updateColumn(col.id, OWNER, { client_visible: true }).client_visible).toBe(1);
  });

  it('rejects a column with no name', () => {
    expect(() => createColumn('p1', OWNER, { name: '  ' })).toThrow(/name/i);
  });

  it('refuses every operation to someone who does not own the project', () => {
    const col = createColumn('p1', OWNER, { name: 'To do' });
    expect(() => getBoard('p1', STRANGER)).toThrow(/not found/i);
    expect(() => createColumn('p1', STRANGER, { name: 'Sneak' })).toThrow(/not found/i);
    expect(() => updateColumn(col.id, STRANGER, { name: 'Renamed' })).toThrow(/not found/i);
    expect(() => deleteColumn(col.id, STRANGER)).toThrow(/not found/i);
  });

  it('reorders columns and renumbers them contiguously', () => {
    const a = createColumn('p1', OWNER, { name: 'A' });
    const b = createColumn('p1', OWNER, { name: 'B' });
    const c = createColumn('p1', OWNER, { name: 'C' });
    reorderColumns('p1', OWNER, [c.id, a.id, b.id]);
    const cols = getBoard('p1', OWNER).columns;
    expect(cols.map((x) => x.name)).toEqual(['C', 'A', 'B']);
    expect(cols.map((x) => x.position)).toEqual([0, 1, 2]);
  });

  it('deletes a column and the cards inside it', () => {
    const col = createColumn('p1', OWNER, { name: 'Doomed' });
    createCard(col.id, OWNER, { title: 'Goes with it' });
    deleteColumn(col.id, OWNER);
    expect(getBoard('p1', OWNER).columns).toEqual([]);
    expect((db.prepare('SELECT COUNT(*) c FROM board_cards').get() as { c: number }).c).toBe(0);
  });
});

describe('cards', () => {
  function seedColumns() {
    return [createColumn('p1', OWNER, { name: 'To do' }), createColumn('p1', OWNER, { name: 'Done' })];
  }

  it('appends cards to their column and returns them with the board', () => {
    const [todo] = seedColumns();
    createCard(todo.id, OWNER, { title: 'First' });
    createCard(todo.id, OWNER, { title: 'Second' });
    const board = getBoard('p1', OWNER);
    expect(board.columns[0].cards.map((c) => c.title)).toEqual(['First', 'Second']);
    expect(board.columns[1].cards).toEqual([]);
  });

  it('stores labels as a JSON array and due dates as given', () => {
    const [todo] = seedColumns();
    const card = createCard(todo.id, OWNER, { title: 'Tagged', labels: ['urgent', 'design'], due_date: '2026-09-01' });
    expect(JSON.parse(card.labels)).toEqual(['urgent', 'design']);
    expect(card.due_date).toBe('2026-09-01');
  });

  it('rejects a card with no title', () => {
    const [todo] = seedColumns();
    expect(() => createCard(todo.id, OWNER, { title: '' })).toThrow(/title/i);
  });

  it('clears a due date when explicitly set to null', () => {
    // Distinguishing "not supplied" from "cleared" matters: omitting the field
    // must leave the date alone.
    const [todo] = seedColumns();
    const card = createCard(todo.id, OWNER, { title: 'Dated', due_date: '2026-09-01' });
    expect(updateCard(card.id, OWNER, { title: 'Renamed' }).due_date).toBe('2026-09-01');
    expect(updateCard(card.id, OWNER, { due_date: null }).due_date).toBeNull();
  });

  it('refuses card operations to someone who does not own the project', () => {
    const [todo] = seedColumns();
    const card = createCard(todo.id, OWNER, { title: 'Private' });
    expect(() => createCard(todo.id, STRANGER, { title: 'Sneak' })).toThrow(/not found/i);
    expect(() => updateCard(card.id, STRANGER, { title: 'Renamed' })).toThrow(/not found/i);
    expect(() => deleteCard(card.id, STRANGER)).toThrow(/not found/i);
    expect(() => moveCard(card.id, STRANGER, todo.id, 0)).toThrow(/not found/i);
  });

  it('moves a card within its column and renumbers contiguously', () => {
    const [todo] = seedColumns();
    const a = createCard(todo.id, OWNER, { title: 'A' });
    createCard(todo.id, OWNER, { title: 'B' });
    createCard(todo.id, OWNER, { title: 'C' });
    moveCard(a.id, OWNER, todo.id, 2);
    const cards = getBoard('p1', OWNER).columns[0].cards;
    expect(cards.map((c) => c.title)).toEqual(['B', 'C', 'A']);
    expect(cards.map((c) => c.position)).toEqual([0, 1, 2]);
  });

  it('moves a card to another column, renumbering both', () => {
    const [todo, done] = seedColumns();
    const a = createCard(todo.id, OWNER, { title: 'A' });
    createCard(todo.id, OWNER, { title: 'B' });
    createCard(done.id, OWNER, { title: 'X' });
    moveCard(a.id, OWNER, done.id, 0);
    const board = getBoard('p1', OWNER);
    expect(board.columns[0].cards.map((c) => c.title)).toEqual(['B']);
    expect(board.columns[0].cards.map((c) => c.position)).toEqual([0]);
    expect(board.columns[1].cards.map((c) => c.title)).toEqual(['A', 'X']);
    expect(board.columns[1].cards.map((c) => c.position)).toEqual([0, 1]);
  });

  it('refuses to move a card into another project\u2019s column', () => {
    // Otherwise a card could be walked out of the project that owns it.
    db.prepare("INSERT INTO projects (id, user_id, name) VALUES ('p2', 'u-owner', 'Other')").run();
    const foreign = createColumn('p2', OWNER, { name: 'Elsewhere' });
    const [todo] = seedColumns();
    const card = createCard(todo.id, OWNER, { title: 'Stays put' });
    expect(() => moveCard(card.id, OWNER, foreign.id, 0)).toThrow(/same project/i);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd packages/api && npx vitest run src/services/board.service.test.ts`
Expected: FAIL — `Cannot find module './board.service'`.

- [ ] **Step 5: Write the service**

Create `packages/api/src/services/board.service.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../utils/db';
import { ValidationError, NotFoundError } from '../utils/errors';
import { sequentialPositions, moveWithinList } from './boardOrder';

export interface BoardColumn {
  id: string; project_id: string; name: string;
  position: number; client_visible: number; created_at: string;
}

export interface BoardCard {
  id: string; project_id: string; column_id: string;
  title: string; description: string | null; position: number;
  due_date: string | null; labels: string; created_at: string; updated_at: string;
}

const stamp = () => new Date().toISOString().replace('Z', '').replace(/\.\d+/, '');

/**
 * Every board operation starts here.
 *
 * The board has no ownership of its own: a caller may touch it exactly when
 * they may see the project. Resolving that in one place means no query below
 * has to remember to filter, and a missing project is indistinguishable from
 * one belonging to someone else.
 */
function assertProject(projectId: string, userId: string): void {
  const project = getDb().prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
  if (!project) throw new NotFoundError('Project not found');
}

function columnOrFail(columnId: string, userId: string): BoardColumn {
  const column = getDb().prepare('SELECT * FROM board_columns WHERE id = ?').get(columnId) as BoardColumn | undefined;
  if (!column) throw new NotFoundError('Column not found');
  assertProject(column.project_id, userId);
  return column;
}

function cardOrFail(cardId: string, userId: string): BoardCard {
  const card = getDb().prepare('SELECT * FROM board_cards WHERE id = ?').get(cardId) as BoardCard | undefined;
  if (!card) throw new NotFoundError('Card not found');
  assertProject(card.project_id, userId);
  return card;
}

export function getBoard(projectId: string, userId: string): { columns: (BoardColumn & { cards: BoardCard[] })[] } {
  assertProject(projectId, userId);
  const db = getDb();
  const columns = db.prepare('SELECT * FROM board_columns WHERE project_id = ? ORDER BY position').all(projectId) as BoardColumn[];
  const cards = db.prepare(`
    SELECT c.* FROM board_cards c
    JOIN board_columns col ON col.id = c.column_id
    WHERE col.project_id = ? ORDER BY c.position
  `).all(projectId) as BoardCard[];
  return {
    columns: columns.map((column) => ({
      ...column,
      cards: cards.filter((card) => card.column_id === column.id),
    })),
  };
}

export function createColumn(projectId: string, userId: string, data: { name: string }): BoardColumn {
  assertProject(projectId, userId);
  if (!data.name?.trim()) throw new ValidationError('Column name is required');
  const db = getDb();
  const id = uuidv4();
  const next = (db.prepare('SELECT COUNT(*) as count FROM board_columns WHERE project_id = ?')
    .get(projectId) as { count: number }).count;
  db.prepare('INSERT INTO board_columns (id, project_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, projectId, data.name.trim(), next, stamp());
  return db.prepare('SELECT * FROM board_columns WHERE id = ?').get(id) as BoardColumn;
}

export function updateColumn(columnId: string, userId: string, data: { name?: string; client_visible?: boolean }): BoardColumn {
  const existing = columnOrFail(columnId, userId);
  if (data.name !== undefined && !data.name.trim()) throw new ValidationError('Column name is required');
  const db = getDb();
  db.prepare('UPDATE board_columns SET name = ?, client_visible = ? WHERE id = ?').run(
    data.name?.trim() || existing.name,
    data.client_visible === undefined ? existing.client_visible : (data.client_visible ? 1 : 0),
    columnId,
  );
  return db.prepare('SELECT * FROM board_columns WHERE id = ?').get(columnId) as BoardColumn;
}

/** Removes the column and everything in it — the cards have nowhere else to live. */
export function deleteColumn(columnId: string, userId: string): void {
  const column = columnOrFail(columnId, userId);
  const db = getDb();
  const remove = db.transaction(() => {
    db.prepare('DELETE FROM board_cards WHERE column_id = ?').run(columnId);
    db.prepare('DELETE FROM board_columns WHERE id = ?').run(columnId);
    const remaining = db.prepare('SELECT id FROM board_columns WHERE project_id = ? ORDER BY position')
      .all(column.project_id) as { id: string }[];
    const update = db.prepare('UPDATE board_columns SET position = ? WHERE id = ?');
    for (const { id, position } of sequentialPositions(remaining.map((r) => r.id))) update.run(position, id);
  });
  remove();
}

export function reorderColumns(projectId: string, userId: string, columnIds: string[]): void {
  assertProject(projectId, userId);
  const db = getDb();
  const apply = db.transaction(() => {
    const owned = new Set((db.prepare('SELECT id FROM board_columns WHERE project_id = ?')
      .all(projectId) as { id: string }[]).map((r) => r.id));
    // Ignore anything not in this project, then append any column the caller
    // failed to mention, so a stale client cannot drop a column off the board.
    const ordered = columnIds.filter((id) => owned.has(id));
    for (const id of owned) if (!ordered.includes(id)) ordered.push(id);
    const update = db.prepare('UPDATE board_columns SET position = ? WHERE id = ?');
    for (const { id, position } of sequentialPositions(ordered)) update.run(position, id);
  });
  apply();
}

export function createCard(
  columnId: string, userId: string,
  data: { title: string; description?: string; due_date?: string; labels?: string[] },
): BoardCard {
  const column = columnOrFail(columnId, userId);
  if (!data.title?.trim()) throw new ValidationError('Card title is required');
  const db = getDb();
  const id = uuidv4();
  const now = stamp();
  const next = (db.prepare('SELECT COUNT(*) as count FROM board_cards WHERE column_id = ?')
    .get(columnId) as { count: number }).count;
  db.prepare(`INSERT INTO board_cards (id, project_id, column_id, title, description, position, due_date, labels, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, column.project_id, columnId, data.title.trim(), data.description?.trim() || null,
    next, data.due_date || null, JSON.stringify(data.labels || []), now, now,
  );
  return db.prepare('SELECT * FROM board_cards WHERE id = ?').get(id) as BoardCard;
}

export function updateCard(
  cardId: string, userId: string,
  data: { title?: string; description?: string; due_date?: string | null; labels?: string[] },
): BoardCard {
  const existing = cardOrFail(cardId, userId);
  if (data.title !== undefined && !data.title.trim()) throw new ValidationError('Card title is required');
  const db = getDb();
  db.prepare('UPDATE board_cards SET title = ?, description = ?, due_date = ?, labels = ?, updated_at = ? WHERE id = ?').run(
    data.title?.trim() || existing.title,
    data.description !== undefined ? (data.description.trim() || null) : existing.description,
    // `undefined` means "not supplied, leave it"; `null` means "clear it".
    data.due_date === undefined ? existing.due_date : data.due_date,
    data.labels === undefined ? existing.labels : JSON.stringify(data.labels),
    stamp(), cardId,
  );
  return db.prepare('SELECT * FROM board_cards WHERE id = ?').get(cardId) as BoardCard;
}

export function deleteCard(cardId: string, userId: string): void {
  const card = cardOrFail(cardId, userId);
  const db = getDb();
  const remove = db.transaction(() => {
    db.prepare('DELETE FROM board_cards WHERE id = ?').run(cardId);
    const remaining = db.prepare('SELECT id FROM board_cards WHERE column_id = ? ORDER BY position')
      .all(card.column_id) as { id: string }[];
    const update = db.prepare('UPDATE board_cards SET position = ? WHERE id = ?');
    for (const { id, position } of sequentialPositions(remaining.map((r) => r.id))) update.run(position, id);
  });
  remove();
}

/**
 * Move a card to `toIndex` in `toColumnId`, renumbering both affected columns.
 *
 * Refuses a destination in another project: a card must not be walkable out of
 * the project that owns it, which is also what keeps `project_id` on the card
 * honest.
 */
export function moveCard(cardId: string, userId: string, toColumnId: string, toIndex: number): void {
  const card = cardOrFail(cardId, userId);
  const destination = columnOrFail(toColumnId, userId);
  if (destination.project_id !== card.project_id) {
    throw new ValidationError('A card can only move within the same project');
  }
  const db = getDb();
  const fromColumnId = card.column_id;
  const apply = db.transaction(() => {
    db.prepare('UPDATE board_cards SET column_id = ?, updated_at = ? WHERE id = ?').run(toColumnId, stamp(), cardId);
    const update = db.prepare('UPDATE board_cards SET position = ? WHERE id = ?');

    const destinationIds = (db.prepare('SELECT id FROM board_cards WHERE column_id = ? ORDER BY position')
      .all(toColumnId) as { id: string }[]).map((r) => r.id);
    for (const { id, position } of sequentialPositions(moveWithinList(destinationIds, cardId, toIndex))) {
      update.run(position, id);
    }

    if (fromColumnId !== toColumnId) {
      const sourceIds = (db.prepare('SELECT id FROM board_cards WHERE column_id = ? ORDER BY position')
        .all(fromColumnId) as { id: string }[]).map((r) => r.id);
      for (const { id, position } of sequentialPositions(sourceIds)) update.run(position, id);
    }
  });
  apply();
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd packages/api && npx vitest run src/services/board.service.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 7: Run the whole API suite and typecheck**

Run: `cd packages/api && npx vitest run && npx tsc --noEmit`
Expected: all PASS, no TypeScript output.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/utils/db.ts packages/api/src/test-helpers/db.ts packages/api/src/test-helpers/db.test.ts packages/api/src/services/board.service.ts packages/api/src/services/board.service.test.ts
git commit -m "feat(board): columns, cards and moves

Every operation authorises through its project, so no individual query has to
remember to filter and a project belonging to someone else is indistinguishable
from one that does not exist.

Columns hide from the client by default, a move refuses a destination in
another project, and reorder ignores unknown ids while appending any column the
caller forgot — a stale client cannot drop a column off the board."
```

---

### Task 3: Board routes

**Files:**
- Modify: `packages/api/src/routes/projects.ts`

**Interfaces:**
- Consumes: every export of `board.service.ts`.
- Produces, all under the existing `/api/projects` router:
  - `GET /list/:id/board`
  - `POST /list/:id/board/columns`, `PUT /board/columns/:columnId`, `DELETE /board/columns/:columnId`
  - `PUT /list/:id/board/columns/reorder` — body `{ columnIds: string[] }`
  - `POST /board/columns/:columnId/cards`, `PUT /board/cards/:cardId`, `DELETE /board/cards/:cardId`
  - `PUT /board/cards/:cardId/move` — body `{ toColumnId: string; toIndex: number }`

- [ ] **Step 1: Add the imports**

```ts
import {
  getBoard, createColumn, updateColumn, deleteColumn, reorderColumns,
  createCard, updateCard, deleteCard, moveCard,
} from '../services/board.service';
```

- [ ] **Step 2: Add the routes**

Place after the existing project-site routes. Every handler follows the file's existing shape — `try`/`catch` with `res.status(err.statusCode || 500).json({ error: err.message })`:

```ts
// ── Project board ──

router.get('/list/:id/board', (req: AuthRequest, res: Response) => {
  try {
    res.json(getBoard(req.params.id, req.userId!));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/list/:id/board/columns', (req: AuthRequest, res: Response) => {
  try {
    res.json(createColumn(req.params.id, req.userId!, req.body));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/list/:id/board/columns/reorder', (req: AuthRequest, res: Response) => {
  try {
    const { columnIds } = req.body || {};
    if (!Array.isArray(columnIds)) { res.status(400).json({ error: 'columnIds must be an array' }); return; }
    reorderColumns(req.params.id, req.userId!, columnIds);
    res.json(getBoard(req.params.id, req.userId!));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/board/columns/:columnId', (req: AuthRequest, res: Response) => {
  try {
    res.json(updateColumn(req.params.columnId, req.userId!, req.body));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/board/columns/:columnId', (req: AuthRequest, res: Response) => {
  try {
    deleteColumn(req.params.columnId, req.userId!);
    res.json({ status: 'deleted' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/board/columns/:columnId/cards', (req: AuthRequest, res: Response) => {
  try {
    res.json(createCard(req.params.columnId, req.userId!, req.body));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/board/cards/:cardId', (req: AuthRequest, res: Response) => {
  try {
    res.json(updateCard(req.params.cardId, req.userId!, req.body));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/board/cards/:cardId', (req: AuthRequest, res: Response) => {
  try {
    deleteCard(req.params.cardId, req.userId!);
    res.json({ status: 'deleted' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/board/cards/:cardId/move', (req: AuthRequest, res: Response) => {
  try {
    const { toColumnId, toIndex } = req.body || {};
    if (typeof toColumnId !== 'string' || typeof toIndex !== 'number') {
      res.status(400).json({ error: 'toColumnId must be a string and toIndex a number' });
      return;
    }
    moveCard(req.params.cardId, req.userId!, toColumnId, toIndex);
    res.json({ status: 'moved' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});
```

`/list/:id/board/columns/reorder` is registered **before** `/board/columns/:columnId` in the file, but they cannot collide — the first begins `/list/`. Keep the reorder route above the generic column routes anyway, so the file reads in the order a request would be matched.

- [ ] **Step 3: Verify the suite and types**

Run: `cd packages/api && npx vitest run && npx tsc --noEmit`
Expected: all PASS, no TypeScript output.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routes/projects.ts
git commit -m "feat(board): board endpoints

Column and card routes carry their own ids rather than nesting under the
project, because the service authorises each one through the project it belongs
to — nesting would invite trusting the path instead."
```

---

### Task 4: The board UI without drag

Render and edit the board first, so drag is added to something already working.

**Files:**
- Create: `packages/dashboard/src/pages/admin/board/useBoard.ts`
- Create: `packages/dashboard/src/pages/admin/board/BoardPanel.tsx`
- Modify: `packages/dashboard/src/pages/admin/ProjectDetailPage.tsx`

**Interfaces:**
- Consumes: the endpoints from Task 3; `apiFetch`; `useToast`; `useConfirm` from `../../../components/ConfirmDialog`.
- Produces:
  - `useBoard(projectId: string, headers: Record<string, string>)` returning `{ columns, loading, error, reload, addColumn, renameColumn, setColumnVisibility, removeColumn, addCard, editCard, removeCard, moveCardTo, reorderColumns }`
  - `BoardPanel({ projectId }: { projectId: string })` as the default export of `BoardPanel.tsx`.

- [ ] **Step 1: Write the data hook**

Create `packages/dashboard/src/pages/admin/board/useBoard.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../utils/api';
import { useToast } from '../../../components/Toast';

export interface BoardCard {
  id: string; column_id: string; title: string; description: string | null;
  position: number; due_date: string | null; labels: string;
}
export interface BoardColumn {
  id: string; name: string; position: number; client_visible: number; cards: BoardCard[];
}

export function useBoard(projectId: string, headers: Record<string, string>) {
  const toast = useToast();
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/projects/list/${projectId}/board`, { headers });
      if (!res.ok) { setError('Could not load the board'); return; }
      setError('');
      setColumns((await res.json()).columns);
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, [projectId, headers]);

  useEffect(() => { reload(); }, [reload]);

  /** Every mutation goes through here so one failure path serves them all. */
  const send = useCallback(async (path: string, method: string, body?: unknown): Promise<boolean> => {
    try {
      const res = await apiFetch(path, {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error || 'That did not save');
        await reload();
        return false;
      }
      await reload();
      return true;
    } catch {
      toast.error('Could not reach the server');
      await reload();
      return false;
    }
  }, [headers, reload, toast]);

  return {
    columns, loading, error, reload,
    addColumn: (name: string) => send(`/api/projects/list/${projectId}/board/columns`, 'POST', { name }),
    renameColumn: (columnId: string, name: string) => send(`/api/projects/board/columns/${columnId}`, 'PUT', { name }),
    setColumnVisibility: (columnId: string, client_visible: boolean) =>
      send(`/api/projects/board/columns/${columnId}`, 'PUT', { client_visible }),
    removeColumn: (columnId: string) => send(`/api/projects/board/columns/${columnId}`, 'DELETE'),
    addCard: (columnId: string, title: string) =>
      send(`/api/projects/board/columns/${columnId}/cards`, 'POST', { title }),
    editCard: (cardId: string, data: { title?: string; description?: string; due_date?: string | null; labels?: string[] }) =>
      send(`/api/projects/board/cards/${cardId}`, 'PUT', data),
    removeCard: (cardId: string) => send(`/api/projects/board/cards/${cardId}`, 'DELETE'),
    moveCardTo: (cardId: string, toColumnId: string, toIndex: number) =>
      send(`/api/projects/board/cards/${cardId}/move`, 'PUT', { toColumnId, toIndex }),
    reorderColumns: (columnIds: string[]) =>
      send(`/api/projects/list/${projectId}/board/columns/reorder`, 'PUT', { columnIds }),
  };
}
```

Every mutation reloads the board, including on failure. The board is small, and a reload after a rejected change is what stops the screen drifting from the database.

- [ ] **Step 2: Write the panel**

Create `packages/dashboard/src/pages/admin/board/BoardPanel.tsx`. It renders columns side by side with horizontal scroll, each with its cards, an "Add card" input, a visibility toggle and a delete action; plus an "Add column" control:

```tsx
import { useState } from 'react';
import { Eye, EyeOff, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAdminHeaders } from '../AdminLayout';
import { useConfirm } from '../../../components/ConfirmDialog';
import { useBoard, BoardColumn } from './useBoard';

function CardTile({ card }: { card: { id: string; title: string; due_date: string | null; labels: string } }) {
  const labels: string[] = (() => { try { return JSON.parse(card.labels); } catch { return []; } })();
  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
      <p className="text-sm text-foreground">{card.title}</p>
      {(labels.length > 0 || card.due_date) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {labels.map((label) => (
            <Badge key={label} variant="secondary" className="text-xs">{label}</Badge>
          ))}
          {card.due_date && (
            <span className="text-xs text-muted-foreground">
              due {new Date(`${card.due_date}T00:00:00Z`).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Column({ column, board }: { column: BoardColumn; board: ReturnType<typeof useBoard> }) {
  const confirm = useConfirm();
  const [title, setTitle] = useState('');

  return (
    <div className="flex w-72 shrink-0 flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <Input
          className="h-8 border-transparent bg-transparent font-medium"
          defaultValue={column.name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== column.name
            && board.renameColumn(column.id, e.target.value)}
        />
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost" size="icon"
            title={column.client_visible ? 'Visible to the client' : 'Hidden from the client'}
            onClick={() => board.setColumnVisibility(column.id, column.client_visible !== 1)}
          >
            {column.client_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost" size="icon"
            onClick={async () => {
              const ok = await confirm({
                title: `Delete "${column.name}"?`,
                description: column.cards.length
                  ? `This also deletes ${column.cards.length} card(s) in it.`
                  : 'This column is empty.',
                confirmText: 'Delete',
              });
              if (ok) board.removeColumn(column.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {column.cards.map((card) => <CardTile key={card.id} card={card} />)}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          board.addCard(column.id, title.trim());
          setTitle('');
        }}
      >
        <Input className="h-8" placeholder="Add a card" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button type="submit" size="icon" variant="secondary" disabled={!title.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

export default function BoardPanel({ projectId }: { projectId: string }) {
  const headers = useAdminHeaders();
  const board = useBoard(projectId, headers);
  const [newColumn, setNewColumn] = useState('');

  if (board.loading) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading the board...
    </p>;
  }
  if (board.error) {
    return <p className="text-sm text-destructive">{board.error}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Columns are hidden from the client until you make them visible.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (newColumn.trim()) { board.addColumn(newColumn.trim()); setNewColumn(''); } }}
        >
          <Input className="h-8 w-44" placeholder="New column" value={newColumn}
                 onChange={(e) => setNewColumn(e.target.value)} />
          <Button type="submit" size="sm" disabled={!newColumn.trim()}>Add column</Button>
        </form>
      </div>

      {board.columns.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No columns yet. Add one — "To do", "In progress", "Done" is a good start.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {board.columns.map((column) => <Column key={column.id} column={column} board={board} />)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Mount it on the project page**

In `packages/dashboard/src/pages/admin/ProjectDetailPage.tsx`, import the panel and render it in its own card below the existing project details, above the linked-sites section:

```tsx
import BoardPanel from './board/BoardPanel';
```

```tsx
        <Card className="p-4">
          <h2 className="mb-3 text-lg font-semibold text-foreground">Board</h2>
          <BoardPanel projectId={id!} />
        </Card>
```

Match the surrounding markup — if the sibling sections use a different wrapper than `Card`, follow that instead; the point is that the board sits in the page's existing rhythm rather than introducing a new one.

- [ ] **Step 4: Verify the dashboard**

Run: `cd packages/dashboard && npx vitest run && npx tsc --noEmit && npm run build`
Expected: all PASS, no TypeScript output, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/pages/admin/board packages/dashboard/src/pages/admin/ProjectDetailPage.tsx
git commit -m "feat(board): render and edit the board

Columns, cards, inline rename, per-column client visibility and deletion, with
every mutation reloading the board — including on failure, so the screen cannot
drift from the database after a rejected change."
```

---

### Task 5: Drag and drop

**Files:**
- Modify: `packages/dashboard/package.json`
- Modify: `packages/dashboard/src/pages/admin/board/BoardPanel.tsx`

**Interfaces:**
- Consumes: `moveCardTo(cardId, toColumnId, toIndex)` and `reorderColumns(columnIds)` from `useBoard`.
- Produces: nothing consumed later.

- [ ] **Step 1: Install the packages**

```bash
cd packages/dashboard
npm install @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0 @dnd-kit/utilities@^3.2.2
```

`@dnd-kit/utilities` is listed explicitly even though `@dnd-kit/sortable` already depends on it: the code imports `CSS` from it directly, and relying on a transitive dependency that a future release could drop is how a build breaks for no visible reason.

Their peer requirement is `react >= 16.8`, so React 19 satisfies it. They are chosen over native HTML5 drag events because those are not keyboard-operable, which would make the board unusable without a mouse.

- [ ] **Step 2: Make cards draggable and columns droppable**

Add these imports to `BoardPanel.tsx`:

```tsx
import {
  DndContext, DragEndEvent, KeyboardSensor, PointerSensor,
  closestCorners, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

Make `CardTile` sortable. The `transform` style is the **one sanctioned inline style** in this component — `@dnd-kit` computes a pixel translation per frame, which no Tailwind class can express:

```tsx
function CardTile({ card }: { card: { id: string; title: string; due_date: string | null; labels: string } }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const labels: string[] = (() => { try { return JSON.parse(card.labels); } catch { return []; } })();
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // dnd-kit computes a per-frame pixel translation; there is no class for it.
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`cursor-grab rounded-lg border border-border bg-background p-3 shadow-sm ${isDragging ? 'opacity-50' : ''}`}
    >
      <p className="text-sm text-foreground">{card.title}</p>
      {(labels.length > 0 || card.due_date) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {labels.map((label) => (
            <Badge key={label} variant="secondary" className="text-xs">{label}</Badge>
          ))}
          {card.due_date && (
            <span className="text-xs text-muted-foreground">
              due {new Date(`${card.due_date}T00:00:00Z`).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

In `Column`, register the whole column as a drop target and wrap its cards in a `SortableContext`. The droppable must cover the column, not just the card list, or an empty column cannot be dropped into:

```tsx
  const { setNodeRef: setDropRef } = useDroppable({ id: `column:${column.id}` });
```

Then put `ref={setDropRef}` on the column's outermost `div`, and wrap the card list:

```tsx
      <SortableContext items={column.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[3rem] flex-col gap-2">
          {column.cards.map((card) => <CardTile key={card.id} card={card} />)}
        </div>
      </SortableContext>
```

`min-h-[3rem]` gives an empty column a body tall enough to aim at.

- [ ] **Step 3: Translate a drop into a move**

In `BoardPanel`, add the sensors and the drop handler. `KeyboardSensor` is what makes the board operable without a mouse:

```tsx
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const cardId = String(active.id);
    const overId = String(over.id);

    // Dropped on empty space in a column: the droppable id carries the column.
    if (overId.startsWith('column:')) {
      const toColumnId = overId.slice('column:'.length);
      const target = board.columns.find((c) => c.id === toColumnId);
      if (!target) return;
      const alreadyThere = target.cards.some((c) => c.id === cardId);
      if (alreadyThere && target.cards[target.cards.length - 1]?.id === cardId) return;
      board.moveCardTo(cardId, toColumnId, target.cards.length);
      return;
    }

    // Dropped on another card: take that card's column and index.
    const destination = board.columns.find((c) => c.cards.some((card) => card.id === overId));
    if (!destination) return;
    const toIndex = destination.cards.findIndex((card) => card.id === overId);
    if (overId === cardId) return;
    board.moveCardTo(cardId, destination.id, toIndex);
  }
```

`activationConstraint: { distance: 4 }` matters: without it, a plain click on a card registers as a drag and the card's own controls stop responding.

Wrap the columns in the context:

```tsx
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {board.columns.map((column) => <Column key={column.id} column={column} board={board} />)}
          </div>
        </DndContext>
```

- [ ] **Step 4: Apply the move locally before the server confirms**

`moveCardTo` reloads the board, so without a local update the card snaps back and then jumps when the reload lands. Add an optimistic reorder to `useBoard`, applied before the request:

```ts
  const moveCardTo = useCallback(async (cardId: string, toColumnId: string, toIndex: number) => {
    setColumns((current) => {
      const card = current.flatMap((c) => c.cards).find((c) => c.id === cardId);
      if (!card) return current;
      return current.map((column) => {
        const without = column.cards.filter((c) => c.id !== cardId);
        if (column.id !== toColumnId) return { ...column, cards: without };
        const index = Math.max(0, Math.min(toIndex, without.length));
        return { ...column, cards: [...without.slice(0, index), { ...card, column_id: toColumnId }, ...without.slice(index)] };
      });
    });
    // The reload inside send() is what corrects this if the server disagrees.
    await send(`/api/projects/board/cards/${cardId}/move`, 'PUT', { toColumnId, toIndex });
  }, [send]);
```

Return this `moveCardTo` from the hook in place of the inline version written in Task 4.

- [ ] **Step 5: Verify the dashboard**

Run: `cd packages/dashboard && npx vitest run && npx tsc --noEmit && npm run build`
Expected: all PASS, no TypeScript output, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/package.json packages/dashboard/package-lock.json packages/dashboard/src/pages/admin/board/BoardPanel.tsx
git commit -m "feat(board): drag cards between and within columns

@dnd-kit rather than native HTML5 drag events, because those cannot be operated
from the keyboard and would make the board mouse-only. The drop applies locally
first so the card does not snap back before the server confirms."
```

---

### Task 6: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the tables**

In the Database Schema list, after the `project_sites` entry:

```
- **board_columns** — id, project_id, name, position, client_visible, created_at. `client_visible` defaults to **0**: a forgotten toggle hides work from the client rather than leaking an internal column
- **board_cards** — id, project_id, column_id, title, description, position, due_date, labels (JSON array), created_at, updated_at. `project_id` is denormalised beside `column_id` so a card authorises against its project without joining through its column. **No assignee** — a panel has one operator
```

- [ ] **Step 2: Document the endpoints**

In the Mini CRM API section:

```
- `GET /list/:id/board` — columns with their cards, ordered by position
- `POST /list/:id/board/columns`, `PUT|DELETE /board/columns/:columnId` — manage columns; deleting one deletes its cards
- `PUT /list/:id/board/columns/reorder` — `{ columnIds }`; unknown ids are ignored and omitted columns appended, so a stale client cannot drop a column
- `POST /board/columns/:columnId/cards`, `PUT|DELETE /board/cards/:cardId` — manage cards
- `PUT /board/cards/:cardId/move` — `{ toColumnId, toIndex }`; refuses a destination in another project, and renumbers both affected columns in one transaction
```

Add a line on ordering:

```
Board ordering is a contiguous integer `position` rewritten for every affected
column inside a transaction; the arithmetic is in `services/boardOrder.ts` and
tested independently of the database.
```

- [ ] **Step 3: Verify and commit**

```bash
grep -n "board_columns" CLAUDE.md
git add CLAUDE.md
git commit -m "docs: project board schema and endpoints"
```

---

## Done when

- `cd packages/api && npx vitest run` and `cd packages/dashboard && npx vitest run` both pass, both typecheck, and the dashboard builds.
- A project with no board returns `{ columns: [] }` rather than erroring.

## Verify on a running panel

After `docker compose up -d --build api dashboard`:

1. Open a project. Add three columns, then cards in each.
2. Drag a card within a column, and to another column. Reload — the order holds.
3. Drag a card into an **empty** column. It lands there.
4. Move a card with the **keyboard**: tab to it, space to lift, arrows to move, space to drop.
5. Toggle a column's eye icon. Reload — the setting holds. Nothing client-facing exists yet; this is stored for the portal phase.
6. Delete a column holding cards. It warns how many will go with it.
7. Open a second project — its board is separate and empty.

Items 3 and 4 are the ones that fail quietly. A droppable area covering only the cards leaves an empty column impossible to drop into, and a board that cannot be operated from the keyboard excludes anyone not using a mouse — neither shows up in a test suite.
