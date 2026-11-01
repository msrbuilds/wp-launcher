import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createSiteTestDb } from '../../test-helpers/sites';
import { __setDbForTesting } from '../../utils/db';
import { crmInvoiceTools } from './crm-invoices';
import type { McpAuthContext } from '../../oauth/token.service';

let db: Database.Database;
const ctx: McpAuthContext = { userId: 'owner', userEmail: 'owner@example.com', userRole: 'owner', grantId: 'g', clientId: 'c', clientName: 'App', scopes: ['crm:read', 'invoices:write'] };
const tool = (name: string) => crmInvoiceTools.find((t) => t.name === name)!;
const run = (name: string, args: Record<string, unknown>) => Promise.resolve().then(() => tool(name).handler(args as never, ctx));
const STATUSES = ['draft', 'sent', 'overdue', 'awaiting_verification', 'paid', 'cancelled'];

beforeEach(() => {
  db = createSiteTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO settings (key, value) VALUES ('feature.projects', 'true')").run();
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c1', 'owner', 'Acme'), ('cx', 'alice', 'Theirs')").run();
  const inv = db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, items, subtotal, tax_rate, tax_amount, total, currency, status, issue_date)
    VALUES (?, ?, ?, ?, '[{"description":"Work","qty":1,"rate":100,"amount":100}]', 100, 0, 0, 100, 'USD', ?, '2026-11-01')`);
  inv.run('i1', 'INV-0001', 'owner', 'c1', 'draft');
  inv.run('ix', 'INV-0002', 'alice', 'cx', 'draft');
  db.prepare("INSERT INTO payment_methods (id, label, instructions, active, sort_order) VALUES ('pm1', 'Bank', 'IBAN …', 1, 0)").run();
  db.prepare("INSERT INTO payment_proofs (id, invoice_id, client_user_id, storage_path, original_name, mime, size_bytes, status) VALUES ('pr1', 'i1', NULL, '/data/uploads/proofs/secret.pdf', 'receipt.pdf', 'application/pdf', 10, 'pending')").run();
});
afterEach(() => { __setDbForTesting(null); db.close(); });

const status = () => (db.prepare("SELECT status FROM invoices WHERE id = 'i1'").get() as { status: string }).status;

describe('agent invoice transitions', () => {
  const allowed = new Set(['draft→sent', 'draft→cancelled', 'sent→cancelled', 'overdue→cancelled']);
  const pairs = STATUSES.flatMap((from) => ['sent', 'cancelled'].map((to) => [from, to] as const));

  it.each(pairs)('%s → %s', async (from, to) => {
    db.prepare("UPDATE invoices SET status = ? WHERE id = 'i1'").run(from);
    const attempt = run('crm_invoices_set_status', { invoiceId: 'i1', status: to });
    if (allowed.has(`${from}→${to}`)) {
      await attempt;
      expect(status()).toBe(to);
    } else {
      await expect(attempt).rejects.toThrow(/use the panel/i);
      expect(status()).toBe(from);
    }
  });

  it('can never ask for paid', async () => {
    await expect(run('crm_invoices_set_status', { invoiceId: 'i1', status: 'paid' })).rejects.toThrow();
    expect(tool('crm_invoices_set_status').input.safeParse({ invoiceId: 'i1', status: 'paid' }).success).toBe(false);
  });

  it('exposes no proof accept or reject tool', () => {
    expect(crmInvoiceTools.filter((t) => /accept|reject/.test(t.name))).toEqual([]);
  });
});

describe('ownership and leaks', () => {
  it('another user’s invoice is not found for every invoice tool', async () => {
    for (const [name, args] of [
      ['crm_invoices_get', { invoiceId: 'ix' }], ['crm_invoices_set_status', { invoiceId: 'ix', status: 'sent' }],
      ['crm_invoices_set_payment_methods', { invoiceId: 'ix', methodIds: ['pm1'] }], ['crm_proofs_list', { invoiceId: 'ix' }],
      ['crm_invoices_delete', { invoiceId: 'ix' }],
    ] as const) {
      await expect(run(name, args), name).rejects.toThrow(/Invoice not found/);
    }
    expect(db.prepare("SELECT status FROM invoices WHERE id = 'ix'").get()).toEqual({ status: 'draft' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM invoice_payment_methods').get()).toEqual({ n: 0 });
  });

  it('crm_proofs_list never reveals the storage path', async () => {
    const out = tool('crm_proofs_list').output.parse(await run('crm_proofs_list', { invoiceId: 'i1' })) as { proofs: Record<string, unknown>[] };
    expect(JSON.stringify(out)).not.toContain('/data/uploads');
    expect(out.proofs[0]).toMatchObject({ id: 'pr1', originalName: 'receipt.pdf', status: 'pending' });
  });
});

describe('drafting', () => {
  it('creates a draft, attaches a method, and reads it back', async () => {
    const { invoice } = await run('crm_invoices_create', { clientId: 'c1', items: [{ description: 'Design', qty: 2, rate: 50 }], taxRate: 10 }) as { invoice: { id: string; total: number; status: string } };
    expect(invoice).toMatchObject({ status: 'draft', total: 110 });
    await run('crm_invoices_set_payment_methods', { invoiceId: invoice.id, methodIds: ['pm1'] });
    const got = await run('crm_invoices_get', { invoiceId: invoice.id }) as { invoice: { paymentMethods: { id: string }[]; items: unknown[] } };
    expect(got.invoice.paymentMethods.map((m) => m.id)).toEqual(['pm1']);
    expect(got.invoice.items).toHaveLength(1);
  });

  it('declares scopes as the spec says', () => {
    for (const n of ['crm_invoices_list', 'crm_invoices_get', 'crm_payment_methods_list', 'crm_proofs_list']) expect(tool(n).scope, n).toBe('crm:read');
    for (const n of ['crm_invoices_create', 'crm_invoices_update', 'crm_invoices_delete', 'crm_invoices_set_status', 'crm_invoices_set_payment_methods']) {
      expect(tool(n)).toMatchObject({ scope: 'invoices:write', writeBucket: 'crm', feature: 'projects' });
    }
    expect(tool('crm_invoices_set_status').annotations.destructiveHint).toBe(true);
    expect(tool('crm_invoices_delete').annotations.destructiveHint).toBe(true);
  });
});
