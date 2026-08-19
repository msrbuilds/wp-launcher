import { getDb } from '../utils/db';
import { NotFoundError } from '../utils/errors';

/**
 * Who may touch a board, resolved in one place.
 *
 * The board has no ownership of its own: a caller may touch it exactly when
 * they may see the project. Keeping this here rather than inside
 * `board.service` lets card comments and attachments authorise the same way
 * without either module importing the other.
 *
 * A missing row and one belonging to someone else are deliberately
 * indistinguishable, so ids cannot be probed for existence.
 */

export interface BoardColumnRow {
  id: string; project_id: string; name: string;
  position: number; client_visible: number; created_at: string;
}

export interface BoardCardRow {
  id: string; project_id: string; column_id: string;
  title: string; description: string | null; position: number;
  due_date: string | null; labels: string; created_at: string; updated_at: string;
}

export function assertProject(projectId: string, userId: string): void {
  if (!ownsProject(projectId, userId)) throw new NotFoundError('Project not found');
}

function ownsProject(projectId: string, userId: string): boolean {
  return !!getDb().prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
}

/**
 * Both of these answer with their own noun whether the row is missing or
 * simply someone else's. Reporting "Project not found" for the second case
 * would tell a caller that the id they guessed exists.
 */
export function columnOrFail(columnId: string, userId: string): BoardColumnRow {
  const column = getDb().prepare('SELECT * FROM board_columns WHERE id = ?').get(columnId) as BoardColumnRow | undefined;
  if (!column || !ownsProject(column.project_id, userId)) throw new NotFoundError('Column not found');
  return column;
}

export function cardOrFail(cardId: string, userId: string): BoardCardRow {
  const card = getDb().prepare('SELECT * FROM board_cards WHERE id = ?').get(cardId) as BoardCardRow | undefined;
  if (!card || !ownsProject(card.project_id, userId)) throw new NotFoundError('Card not found');
  return card;
}
