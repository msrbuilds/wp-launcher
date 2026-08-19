import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../utils/db';
import { ValidationError, NotFoundError } from '../utils/errors';
import { sequentialPositions, moveWithinList } from './boardOrder';
import { assertProject, columnOrFail, cardOrFail } from './boardAccess';
import { purgeCardActivity } from './cardActivity.service';

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
    // Comments and attachments carry a foreign key to board_cards, so a
    // column holding a commented-on card is otherwise undeletable.
    const cardIds = (db.prepare('SELECT id FROM board_cards WHERE column_id = ?')
      .all(columnId) as { id: string }[]).map((r) => r.id);
    purgeCardActivity(cardIds);
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

/**
 * `labels` reaches here as whatever JSON the caller sent, typed as
 * `string[]` only by the TS signature — a frontend guard is not a guarantee.
 * `undefined` (not supplied) is left to the caller to interpret.
 */
function assertLabels(labels: unknown): void {
  if (labels === undefined) return;
  if (!Array.isArray(labels) || labels.some((label) => typeof label !== 'string')) {
    throw new ValidationError('Labels must be an array of strings');
  }
}

export function createCard(
  columnId: string, userId: string,
  data: { title: string; description?: string; due_date?: string; labels?: string[] },
): BoardCard {
  const column = columnOrFail(columnId, userId);
  if (!data.title?.trim()) throw new ValidationError('Card title is required');
  assertLabels(data.labels);
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
  assertLabels(data.labels);
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
    purgeCardActivity([cardId]);
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
