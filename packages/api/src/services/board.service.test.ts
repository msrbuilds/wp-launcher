import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import {
  getBoard, createColumn, updateColumn, deleteColumn,
  createCard, updateCard, deleteCard, moveCard, reorderColumns,
} from './board.service';
import { deleteProject } from './project.service';

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
    expect(() => reorderColumns('p1', STRANGER, [col.id])).toThrow(/not found/i);
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

  it('renumbers the remaining columns after deleting one from the middle', () => {
    // A regression that dropped the renumbering loop would leave the
    // survivors at their original positions [0, 2] instead of [0, 1].
    const a = createColumn('p1', OWNER, { name: 'A' });
    const b = createColumn('p1', OWNER, { name: 'B' });
    const c = createColumn('p1', OWNER, { name: 'C' });
    deleteColumn(b.id, OWNER);
    const cols = getBoard('p1', OWNER).columns;
    expect(cols.map((x) => x.name)).toEqual(['A', 'C']);
    expect(cols.map((x) => x.position)).toEqual([0, 1]);
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

  it('refuses to move a card into another project’s column', () => {
    // Otherwise a card could be walked out of the project that owns it.
    db.prepare("INSERT INTO projects (id, user_id, name) VALUES ('p2', 'u-owner', 'Other')").run();
    const foreign = createColumn('p2', OWNER, { name: 'Elsewhere' });
    const [todo] = seedColumns();
    const card = createCard(todo.id, OWNER, { title: 'Stays put' });
    expect(() => moveCard(card.id, OWNER, foreign.id, 0)).toThrow(/same project/i);
  });

  it('deletes a card and renumbers the remaining ones', () => {
    // A regression that dropped the renumbering loop would leave the
    // survivors at their original positions [0, 2] instead of [0, 1].
    const [todo] = seedColumns();
    const a = createCard(todo.id, OWNER, { title: 'A' });
    const b = createCard(todo.id, OWNER, { title: 'B' });
    const c = createCard(todo.id, OWNER, { title: 'C' });
    deleteCard(b.id, OWNER);
    const cards = getBoard('p1', OWNER).columns[0].cards;
    expect(cards.map((x) => x.title)).toEqual(['A', 'C']);
    expect(cards.map((x) => x.position)).toEqual([0, 1]);
  });
});

describe('project deletion', () => {
  // board_columns and board_cards both carry FOREIGN KEY (project_id)
  // REFERENCES projects(id), and better-sqlite3 enforces foreign keys by
  // default. deleteProject must clear both before removing the project row,
  // or the DELETE dies on the constraint as soon as the project has a column.
  it('deletes a project that has board columns and cards', () => {
    const column = createColumn('p1', OWNER, { name: 'To do' });
    createCard(column.id, OWNER, { title: 'Card' });

    expect(() => deleteProject('p1', OWNER)).not.toThrow();

    expect((db.prepare('SELECT COUNT(*) c FROM board_columns WHERE project_id = ?').get('p1') as { c: number }).c).toBe(0);
    expect((db.prepare('SELECT COUNT(*) c FROM board_cards WHERE project_id = ?').get('p1') as { c: number }).c).toBe(0);
    expect(db.prepare('SELECT id FROM projects WHERE id = ?').get('p1')).toBeUndefined();
  });
});
