import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../utils/db';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors';

export interface PaymentMethodRecord {
  id: string;
  label: string;
  instructions: string;
  active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const now = () => new Date().toISOString().replace('Z', '').replace(/\.\d+/, '');

/**
 * The operator's payment methods, in the order they should be presented.
 *
 * Sorted by `sort_order` then `label` so the operator controls sequence and
 * ties fall back to something stable rather than insertion order.
 */
export function listPaymentMethods(opts: { activeOnly?: boolean } = {}): PaymentMethodRecord[] {
  const sql = `SELECT * FROM payment_methods${opts.activeOnly ? ' WHERE active = 1' : ''} ORDER BY sort_order, label`;
  return getDb().prepare(sql).all() as PaymentMethodRecord[];
}

export function createPaymentMethod(data: { label: string; instructions?: string; active?: boolean }): PaymentMethodRecord {
  if (!data.label?.trim()) throw new ValidationError('Payment method label is required');
  const db = getDb();
  const id = uuidv4();
  const stamp = now();
  db.prepare(`INSERT INTO payment_methods (id, label, instructions, active, sort_order, created_at, updated_at)
              VALUES (?, ?, ?, ?, 0, ?, ?)`).run(
    id, data.label.trim(), data.instructions?.trim() || '', data.active === false ? 0 : 1, stamp, stamp,
  );
  return db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(id) as PaymentMethodRecord;
}

export function updatePaymentMethod(
  id: string,
  data: { label?: string; instructions?: string; active?: boolean; sort_order?: number },
): PaymentMethodRecord {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(id) as PaymentMethodRecord | undefined;
  if (!existing) throw new NotFoundError('Payment method not found');
  if (data.label !== undefined && !data.label.trim()) throw new ValidationError('Payment method label is required');
  db.prepare(`UPDATE payment_methods SET label = ?, instructions = ?, active = ?, sort_order = ?, updated_at = ? WHERE id = ?`).run(
    data.label?.trim() || existing.label,
    data.instructions !== undefined ? data.instructions.trim() : existing.instructions,
    data.active === undefined ? existing.active : (data.active ? 1 : 0),
    data.sort_order === undefined ? existing.sort_order : data.sort_order,
    now(), id,
  );
  return db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(id) as PaymentMethodRecord;
}

/**
 * Remove a method the operator no longer offers.
 *
 * Refused while any invoice still attaches it: deleting would blank the payment
 * instructions on an invoice already in a client's inbox. Deactivating is the
 * way to retire a method — it disappears from future invoices and stays on old
 * ones.
 */
export function deletePaymentMethod(id: string): void {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM payment_methods WHERE id = ?').get(id);
  if (!existing) throw new NotFoundError('Payment method not found');
  const used = (db.prepare('SELECT COUNT(*) as count FROM invoice_payment_methods WHERE payment_method_id = ?')
    .get(id) as { count: number }).count;
  if (used > 0) {
    throw new ConflictError('This payment method is in use by an invoice. Deactivate it instead to hide it from new invoices.');
  }
  db.prepare('DELETE FROM payment_methods WHERE id = ?').run(id);
}

/**
 * The methods attached to one invoice, in presentation order.
 *
 * Deliberately not filtered by `active`: a method retired after an invoice was
 * sent must still render on that invoice.
 */
export function getInvoicePaymentMethods(invoiceId: string): PaymentMethodRecord[] {
  return getDb().prepare(`
    SELECT pm.* FROM payment_methods pm
    JOIN invoice_payment_methods ipm ON ipm.payment_method_id = pm.id
    WHERE ipm.invoice_id = ?
    ORDER BY pm.sort_order, pm.label
  `).all(invoiceId) as PaymentMethodRecord[];
}

/**
 * Replace an invoice's attached methods with exactly `methodIds`.
 *
 * Unknown ids are skipped rather than throwing: a stale id in a submitted form
 * should not reject the operator's whole save. In one transaction so a failure
 * cannot leave an invoice with a half-applied selection.
 */
export function setInvoicePaymentMethods(invoiceId: string, methodIds: string[]): void {
  const db = getDb();
  const apply = db.transaction((ids: string[]) => {
    db.prepare('DELETE FROM invoice_payment_methods WHERE invoice_id = ?').run(invoiceId);
    const insert = db.prepare('INSERT OR IGNORE INTO invoice_payment_methods (invoice_id, payment_method_id) VALUES (?, ?)');
    for (const methodId of ids) {
      const known = db.prepare('SELECT id FROM payment_methods WHERE id = ?').get(methodId);
      if (known) insert.run(invoiceId, methodId);
    }
  });
  apply(methodIds || []);
}
