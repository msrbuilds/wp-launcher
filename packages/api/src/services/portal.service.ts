import { getDb } from '../utils/db';

/**
 * Everything a signed-in portal client may read.
 *
 * Every function takes `clientId` first and puts it in the WHERE clause. The
 * caller supplies it from the verified token and never from a request
 * parameter, so knowing another client's project or invoice id is not enough
 * to read it.
 */

/**
 * Statuses a client may see. Drafts are unfinished work and cancelled invoices
 * are withdrawn; neither should appear in someone's portal.
 */
const VISIBLE_INVOICE_STATUSES = ['sent', 'paid', 'overdue', 'awaiting_verification'];
const STATUS_PLACEHOLDERS = VISIBLE_INVOICE_STATUSES.map(() => '?').join(', ');

export interface PortalProject {
  id: string; name: string; description: string | null; status: string; created_at: string;
}
export interface PortalCard {
  id: string; title: string; description: string | null; due_date: string | null; labels: string;
}
export interface PortalColumn { id: string; name: string; cards: PortalCard[] }
export interface PortalInvoiceSummary {
  id: string; invoice_number: string; total: number; currency: string;
  status: string; issue_date: string; due_date: string | null;
}

export function getPortalProjects(clientId: string): PortalProject[] {
  return getDb().prepare(`
    SELECT id, name, description, status, created_at
    FROM projects WHERE client_id = ? ORDER BY created_at DESC
  `).all(clientId) as PortalProject[];
}

export function getPortalProject(
  clientId: string, projectId: string,
): { project: PortalProject; columns: PortalColumn[] } | undefined {
  const db = getDb();
  const project = db.prepare(`
    SELECT id, name, description, status, created_at
    FROM projects WHERE id = ? AND client_id = ?
  `).get(projectId, clientId) as PortalProject | undefined;
  if (!project) return undefined;

  const columns = db.prepare(`
    SELECT id, name FROM board_columns
    WHERE project_id = ? AND client_visible = 1 ORDER BY position
  `).all(projectId) as { id: string; name: string }[];

  // Cards are reached *through* the visible columns rather than filtered
  // afterwards, so a card in a hidden column has no route into this result
  // even though nothing on the card itself records visibility.
  const cards = columns.length === 0 ? [] : db.prepare(`
    SELECT c.id, c.title, c.description, c.due_date, c.labels, c.column_id
    FROM board_cards c
    JOIN board_columns col ON col.id = c.column_id
    WHERE col.project_id = ? AND col.client_visible = 1
    ORDER BY c.position
  `).all(projectId) as (PortalCard & { column_id: string })[];

  return {
    project,
    columns: columns.map((column) => ({
      ...column,
      cards: cards.filter((card) => card.column_id === column.id),
    })),
  };
}

export function getPortalInvoices(clientId: string): PortalInvoiceSummary[] {
  return getDb().prepare(`
    SELECT id, invoice_number, total, currency, status, issue_date, due_date
    FROM invoices
    WHERE client_id = ? AND status IN (${STATUS_PLACEHOLDERS})
    ORDER BY issue_date DESC
  `).all(clientId, ...VISIBLE_INVOICE_STATUSES) as PortalInvoiceSummary[];
}

export function getPortalInvoice(
  clientId: string, invoiceId: string,
): { invoice: Record<string, unknown>; paymentMethods: { id: string; label: string; instructions: string }[] } | undefined {
  const db = getDb();
  const invoice = db.prepare(`
    SELECT id, invoice_number, items, subtotal, tax_rate, tax_amount, total, currency,
           status, issue_date, due_date, notes
    FROM invoices
    WHERE id = ? AND client_id = ? AND status IN (${STATUS_PLACEHOLDERS})
  `).get(invoiceId, clientId, ...VISIBLE_INVOICE_STATUSES) as Record<string, unknown> | undefined;
  if (!invoice) return undefined;

  const paymentMethods = db.prepare(`
    SELECT pm.id, pm.label, pm.instructions
    FROM payment_methods pm
    JOIN invoice_payment_methods ipm ON ipm.payment_method_id = pm.id
    WHERE ipm.invoice_id = ?
    ORDER BY pm.sort_order, pm.label
  `).all(invoiceId) as { id: string; label: string; instructions: string }[];

  return { invoice, paymentMethods };
}
