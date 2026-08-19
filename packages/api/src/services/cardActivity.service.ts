import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../utils/db';
import { NotFoundError, ValidationError } from '../utils/errors';
import { storeFile, deleteStoredFile } from './fileStore';
import { cardOrFail } from './boardAccess';

/**
 * Comments and attachments on a board card. Staff-only.
 *
 * Clients see cards in visible columns but write in their own thread instead:
 * that keeps one client-facing conversation, stops client input being stranded
 * on a card nobody rechecks or in a column later hidden, and leaves this a
 * frank internal record.
 */

export interface CardComment {
  id: string; card_id: string; author_id: string | null;
  author_label: string; body: string; created_at: string;
}

export interface CardAttachment {
  id: string; card_id: string; storage_path: string; original_name: string;
  mime: string; size_bytes: number; uploaded_by: string | null; created_at: string;
}

const MAX_BODY = 5000;
const stamp = () => new Date().toISOString().replace('Z', '').replace(/\.\d+/, '');

function authorLabel(userId: string): string {
  const user = getDb().prepare('SELECT name, email FROM users WHERE id = ?').get(userId) as
    { name: string | null; email: string } | undefined;
  return (user?.name || user?.email || 'Staff').slice(0, 255);
}

// ── Comments ──

export function listCardComments(cardId: string, userId: string): CardComment[] {
  cardOrFail(cardId, userId);
  // rowid breaks ties: timestamps are second-resolution, so a burst of
  // comments would otherwise reorder itself on every read.
  return getDb().prepare('SELECT * FROM card_comments WHERE card_id = ? ORDER BY created_at, rowid')
    .all(cardId) as CardComment[];
}

export function addCardComment(cardId: string, userId: string, rawBody: unknown): CardComment {
  cardOrFail(cardId, userId);
  const body = typeof rawBody === 'string' ? rawBody.trim() : '';
  if (!body) throw new ValidationError('Write something first');
  const id = uuidv4();
  getDb().prepare(`INSERT INTO card_comments (id, card_id, author_id, author_label, body, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, cardId, userId, authorLabel(userId), body.slice(0, MAX_BODY), stamp());
  return getDb().prepare('SELECT * FROM card_comments WHERE id = ?').get(id) as CardComment;
}

/**
 * Remove a comment.
 *
 * Authorised through the card's project, not the author: a panel has one
 * operator, and a comment nobody can delete because a colleague wrote it would
 * be a worse outcome than one anybody on the project can.
 */
export function deleteCardComment(commentId: string, userId: string): void {
  const db = getDb();
  const comment = db.prepare('SELECT card_id FROM card_comments WHERE id = ?').get(commentId) as
    { card_id: string } | undefined;
  if (!comment) throw new NotFoundError('Comment not found');
  cardOrFail(comment.card_id, userId);
  db.prepare('DELETE FROM card_comments WHERE id = ?').run(commentId);
}

// ── Attachments ──

export function listCardAttachments(cardId: string, userId: string): CardAttachment[] {
  cardOrFail(cardId, userId);
  return getDb().prepare('SELECT * FROM card_attachments WHERE card_id = ? ORDER BY created_at')
    .all(cardId) as CardAttachment[];
}

export function addCardAttachment(
  cardId: string, userId: string, file: { buffer: Buffer; originalName?: string },
): CardAttachment {
  cardOrFail(cardId, userId);
  // Validated and written first, so a rejected file leaves no row behind.
  const stored = storeFile('attachments', file.buffer);
  const id = uuidv4();
  try {
    getDb().prepare(`INSERT INTO card_attachments
      (id, card_id, storage_path, original_name, mime, size_bytes, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, cardId, stored.storagePath, (file.originalName || '').slice(0, 255),
      stored.mime, stored.sizeBytes, userId, stamp(),
    );
  } catch (err) {
    deleteStoredFile(stored.storagePath);
    throw err;
  }
  return getDb().prepare('SELECT * FROM card_attachments WHERE id = ?').get(id) as CardAttachment;
}

/** An attachment on a card in a project this user owns. */
export function getCardAttachment(attachmentId: string, userId: string): CardAttachment | undefined {
  return getDb().prepare(`
    SELECT a.* FROM card_attachments a
    JOIN board_cards c ON c.id = a.card_id
    JOIN projects p ON p.id = c.project_id
    WHERE a.id = ? AND p.user_id = ?
  `).get(attachmentId, userId) as CardAttachment | undefined;
}

export function deleteCardAttachment(attachmentId: string, userId: string): void {
  const attachment = getCardAttachment(attachmentId, userId);
  if (!attachment) throw new NotFoundError('Attachment not found');
  getDb().prepare('DELETE FROM card_attachments WHERE id = ?').run(attachmentId);
  // After the row, so a failed delete never leaves a row pointing at nothing.
  deleteStoredFile(attachment.storage_path);
}

/**
 * Everything hanging off a set of cards, for the board's counts.
 *
 * One query per kind rather than per card: a board with fifty cards should not
 * issue a hundred queries to draw its badges.
 */
export function countsForProject(projectId: string): Record<string, { comments: number; attachments: number }> {
  const db = getDb();
  const counts: Record<string, { comments: number; attachments: number }> = {};
  const bump = (cardId: string, key: 'comments' | 'attachments', n: number) => {
    counts[cardId] ??= { comments: 0, attachments: 0 };
    counts[cardId][key] = n;
  };
  for (const row of db.prepare(`
    SELECT c.card_id AS cardId, COUNT(*) AS n FROM card_comments c
    JOIN board_cards b ON b.id = c.card_id WHERE b.project_id = ? GROUP BY c.card_id
  `).all(projectId) as { cardId: string; n: number }[]) bump(row.cardId, 'comments', row.n);
  for (const row of db.prepare(`
    SELECT a.card_id AS cardId, COUNT(*) AS n FROM card_attachments a
    JOIN board_cards b ON b.id = a.card_id WHERE b.project_id = ? GROUP BY a.card_id
  `).all(projectId) as { cardId: string; n: number }[]) bump(row.cardId, 'attachments', row.n);
  return counts;
}

/**
 * Remove everything hanging off a set of cards.
 *
 * Called by the board before deleting cards: both tables carry a foreign key
 * to `board_cards`, so without this any card that was ever commented on is
 * undeletable. Files go too, or the store grows for the life of the install.
 */
export function purgeCardActivity(cardIds: string[]): void {
  if (cardIds.length === 0) return;
  const db = getDb();
  const placeholders = cardIds.map(() => '?').join(', ');
  const files = db.prepare(`SELECT storage_path FROM card_attachments WHERE card_id IN (${placeholders})`)
    .all(...cardIds) as { storage_path: string }[];
  db.prepare(`DELETE FROM card_comments WHERE card_id IN (${placeholders})`).run(...cardIds);
  db.prepare(`DELETE FROM card_attachments WHERE card_id IN (${placeholders})`).run(...cardIds);
  for (const file of files) deleteStoredFile(file.storage_path);
}
