import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../utils/db';
import { NotFoundError, ValidationError } from '../utils/errors';

/**
 * One conversation per client, written from both sides.
 *
 * A message may point at a project or an invoice. Both are validated to belong
 * to the same client before the row is written: an unchecked reference would
 * let either side pull another client's project name back into this thread
 * when it renders as a chip.
 */

export type MessageAuthor = 'staff' | 'client';

export interface ClientMessageRecord {
  id: string;
  client_id: string;
  author_type: MessageAuthor;
  author_id: string | null;
  author_label: string;
  body: string;
  project_id: string | null;
  invoice_id: string | null;
  created_at: string;
}

export interface ClientMessageView extends ClientMessageRecord {
  project_name: string | null;
  invoice_number: string | null;
}

const MAX_BODY = 5000;

const stamp = () => new Date().toISOString().replace('Z', '').replace(/\.\d+/, '');

function normaliseBody(raw: unknown): string {
  const body = typeof raw === 'string' ? raw.trim() : '';
  if (!body) throw new ValidationError('Write something first');
  return body.slice(0, MAX_BODY);
}

/**
 * Keep a reference only if it belongs to this client; drop anything else.
 *
 * Dropped rather than rejected: a stale project id in a form should not lose
 * the message someone just typed, and the reference is decoration on a body
 * that stands on its own.
 */
function scopedReferences(
  clientId: string, projectId: unknown, invoiceId: unknown,
): { projectId: string | null; invoiceId: string | null } {
  const db = getDb();
  const project = typeof projectId === 'string' && projectId
    ? db.prepare('SELECT id FROM projects WHERE id = ? AND client_id = ?').get(projectId, clientId)
    : undefined;
  const invoice = typeof invoiceId === 'string' && invoiceId
    ? db.prepare('SELECT id FROM invoices WHERE id = ? AND client_id = ?').get(invoiceId, clientId)
    : undefined;
  return {
    projectId: project ? (projectId as string) : null,
    invoiceId: invoice ? (invoiceId as string) : null,
  };
}

/** The whole thread, oldest first, with reference labels resolved. */
export function listClientMessages(clientId: string): ClientMessageView[] {
  return getDb().prepare(`
    SELECT m.*, p.name AS project_name, i.invoice_number
    FROM client_messages m
    LEFT JOIN projects p ON p.id = m.project_id
    LEFT JOIN invoices i ON i.id = m.invoice_id
    WHERE m.client_id = ?
    ORDER BY m.created_at, m.rowid
  `).all(clientId) as ClientMessageView[];
}

function insert(
  clientId: string,
  author: { type: MessageAuthor; id: string | null; label: string },
  input: { body: unknown; projectId?: unknown; invoiceId?: unknown },
): ClientMessageView {
  const body = normaliseBody(input.body);
  const refs = scopedReferences(clientId, input.projectId, input.invoiceId);
  const id = uuidv4();
  getDb().prepare(`INSERT INTO client_messages
    (id, client_id, author_type, author_id, author_label, body, project_id, invoice_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, clientId, author.type, author.id, author.label.slice(0, 255), body,
    refs.projectId, refs.invoiceId, stamp(),
  );
  return getDb().prepare(`
    SELECT m.*, p.name AS project_name, i.invoice_number
    FROM client_messages m
    LEFT JOIN projects p ON p.id = m.project_id
    LEFT JOIN invoices i ON i.id = m.invoice_id
    WHERE m.id = ?
  `).get(id) as ClientMessageView;
}

/** The staff side. The client must belong to this user. */
export function postStaffMessage(
  userId: string, clientId: string,
  input: { body: unknown; projectId?: unknown; invoiceId?: unknown },
): ClientMessageView {
  const db = getDb();
  const client = db.prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?').get(clientId, userId);
  if (!client) throw new NotFoundError('Client not found');
  const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(userId) as
    { name: string | null; email: string } | undefined;
  return insert(clientId, { type: 'staff', id: userId, label: user?.name || user?.email || 'Support' }, input);
}

/** The client side. `clientId` comes from the verified portal token. */
export function postClientMessage(
  clientId: string, clientUserId: string,
  input: { body: unknown; projectId?: unknown; invoiceId?: unknown },
): ClientMessageView {
  const author = getDb().prepare('SELECT email FROM client_users WHERE id = ?').get(clientUserId) as
    { email: string } | undefined;
  return insert(clientId, { type: 'client', id: clientUserId, label: author?.email || 'Client' }, input);
}

/** Staff read: asserts ownership before returning anyone's conversation. */
export function listStaffClientMessages(userId: string, clientId: string): ClientMessageView[] {
  const client = getDb().prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?').get(clientId, userId);
  if (!client) throw new NotFoundError('Client not found');
  return listClientMessages(clientId);
}
