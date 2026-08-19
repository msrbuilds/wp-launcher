import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../utils/db';
import { NotFoundError, ValidationError } from '../utils/errors';
import { storeFile, deleteStoredFile } from './fileStore';

/**
 * Payment proofs: a client's evidence that they paid, and the staff decision
 * on it.
 *
 * An upload never marks an invoice paid. It moves the invoice to
 * `awaiting_verification`, which gives staff a queue; accepting is what records
 * money received. Without that split the books would hold claims rather than
 * confirmed payments, and any client could clear their own balance with any
 * file.
 */

export interface PaymentProofRecord {
  id: string;
  invoice_id: string;
  client_user_id: string | null;
  storage_path: string;
  original_name: string;
  mime: string;
  size_bytes: number;
  amount: number | null;
  note: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
}

/** Statuses on which a client may still be trying to pay. */
const UPLOADABLE_STATUSES = new Set(['sent', 'overdue', 'awaiting_verification']);

const stamp = () => new Date().toISOString().replace('Z', '').replace(/\.\d+/, '');

function parseAmount(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new ValidationError('The amount must be a positive number');
  return value;
}

/**
 * Record a proof against one of the signed-in client's invoices.
 *
 * The invoice is looked up by id *and* client id, so knowing another client's
 * invoice id is not enough to attach a document to it.
 */
export function createPaymentProof(
  clientId: string,
  invoiceId: string,
  clientUserId: string,
  file: { buffer: Buffer; originalName?: string },
  meta: { amount?: unknown; note?: unknown } = {},
): PaymentProofRecord {
  const db = getDb();
  const invoice = db.prepare('SELECT id, status FROM invoices WHERE id = ? AND client_id = ?')
    .get(invoiceId, clientId) as { id: string; status: string } | undefined;
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (!UPLOADABLE_STATUSES.has(invoice.status)) {
    throw new ValidationError(`This invoice is ${invoice.status} and is not awaiting payment`);
  }

  const amount = parseAmount(meta.amount);
  const note = typeof meta.note === 'string' ? meta.note.trim().slice(0, 2000) : null;

  // Validate and write before touching the database: a rejected file must
  // leave no row and no status change behind.
  const stored = storeFile('proofs', file.buffer);

  const id = uuidv4();
  const now = stamp();
  try {
    db.transaction(() => {
      db.prepare(`INSERT INTO payment_proofs
        (id, invoice_id, client_user_id, storage_path, original_name, mime, size_bytes, amount, note, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`).run(
        id, invoiceId, clientUserId, stored.storagePath,
        (file.originalName || '').slice(0, 255), stored.mime, stored.sizeBytes,
        amount, note, now,
      );
      db.prepare("UPDATE invoices SET status = 'awaiting_verification', updated_at = ? WHERE id = ?")
        .run(now, invoiceId);
    })();
  } catch (err) {
    deleteStoredFile(stored.storagePath);
    throw err;
  }

  return getProofById(id)!;
}

export function getProofById(id: string): PaymentProofRecord | undefined {
  return getDb().prepare('SELECT * FROM payment_proofs WHERE id = ?').get(id) as PaymentProofRecord | undefined;
}

/** Proofs on one invoice, newest first. Callers authorise the invoice first. */
export function listProofsForInvoice(invoiceId: string): PaymentProofRecord[] {
  return getDb().prepare('SELECT * FROM payment_proofs WHERE invoice_id = ? ORDER BY created_at DESC')
    .all(invoiceId) as PaymentProofRecord[];
}

/**
 * A proof reachable by the signed-in client — theirs alone, resolved through
 * the invoice rather than trusted from the request.
 */
export function getClientProof(clientId: string, proofId: string): PaymentProofRecord | undefined {
  return getDb().prepare(`
    SELECT p.* FROM payment_proofs p
    JOIN invoices i ON i.id = p.invoice_id
    WHERE p.id = ? AND i.client_id = ?
  `).get(proofId, clientId) as PaymentProofRecord | undefined;
}

/** A proof on an invoice the staff user owns. */
export function getStaffProof(userId: string, proofId: string): PaymentProofRecord | undefined {
  return getDb().prepare(`
    SELECT p.* FROM payment_proofs p
    JOIN invoices i ON i.id = p.invoice_id
    WHERE p.id = ? AND i.user_id = ?
  `).get(proofId, userId) as PaymentProofRecord | undefined;
}

function loadReviewable(userId: string, proofId: string): PaymentProofRecord {
  const proof = getStaffProof(userId, proofId);
  if (!proof) throw new NotFoundError('Payment proof not found');
  if (proof.status !== 'pending') {
    throw new ValidationError(`This proof was already ${proof.status}`);
  }
  return proof;
}

/**
 * Accept a proof: the invoice is paid.
 *
 * Any other proof still pending on the same invoice is closed as accepted too
 * — the invoice is settled, so leaving them pending would keep it in a queue
 * that has nothing left to decide.
 */
export function acceptPaymentProof(userId: string, proofId: string): PaymentProofRecord {
  const db = getDb();
  const proof = loadReviewable(userId, proofId);
  const now = stamp();
  db.transaction(() => {
    db.prepare(`UPDATE payment_proofs SET status = 'accepted', reviewed_by = ?, reviewed_at = ?, reject_reason = NULL
                WHERE invoice_id = ? AND status = 'pending'`).run(userId, now, proof.invoice_id);
    db.prepare("UPDATE invoices SET status = 'paid', updated_at = ? WHERE id = ?").run(now, proof.invoice_id);
  })();
  return getProofById(proofId)!;
}

/**
 * Reject a proof with a reason the client will read.
 *
 * The invoice only falls back to `sent` once nothing is left to review —
 * otherwise a client who uploaded two documents would see the invoice leave
 * the queue while one is still undecided.
 */
export function rejectPaymentProof(userId: string, proofId: string, reason: string): PaymentProofRecord {
  const db = getDb();
  const proof = loadReviewable(userId, proofId);
  const trimmed = (reason || '').trim();
  if (!trimmed) throw new ValidationError('Tell the client why it was rejected');

  const now = stamp();
  db.transaction(() => {
    db.prepare(`UPDATE payment_proofs SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, reject_reason = ?
                WHERE id = ?`).run(userId, now, trimmed.slice(0, 1000), proofId);
    const stillPending = (db.prepare(
      "SELECT COUNT(*) AS count FROM payment_proofs WHERE invoice_id = ? AND status = 'pending'",
    ).get(proof.invoice_id) as { count: number }).count;
    if (stillPending === 0) {
      db.prepare("UPDATE invoices SET status = 'sent', updated_at = ? WHERE id = ? AND status = 'awaiting_verification'")
        .run(now, proof.invoice_id);
    }
  })();
  return getProofById(proofId)!;
}

/** Invoices with a proof waiting on a decision, for the staff queue. */
export function countPendingProofs(userId: string): number {
  return (getDb().prepare(`
    SELECT COUNT(*) AS count FROM payment_proofs p
    JOIN invoices i ON i.id = p.invoice_id
    WHERE i.user_id = ? AND p.status = 'pending'
  `).get(userId) as { count: number }).count;
}
