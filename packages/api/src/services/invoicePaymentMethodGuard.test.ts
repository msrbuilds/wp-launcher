import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { assertInvoiceIsDraft, getInvoice, updateInvoice } from './project.service';
import { createPaymentMethod, setInvoicePaymentMethods, getInvoicePaymentMethods } from './paymentMethod.service';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO users (id, email) VALUES ('u1', 'a@b.c')").run();
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c1', 'u1', 'Acme')").run();
  db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, items, total, status)
              VALUES ('draft-inv', 'INV-0001', 'u1', 'c1', '[]', 100, 'draft')`).run();
  db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, items, total, status)
              VALUES ('sent-inv', 'INV-0002', 'u1', 'c1', '[]', 200, 'sent')`).run();
});
afterEach(() => { __setDbForTesting(null); db.close(); });

// PUT /invoices/:id/payment-methods is not itself unit-tested (this repo has
// no route tests), so these exercise the guard the route calls plus the
// service functions it wraps — the same sequence the route runs: getInvoice,
// assertInvoiceIsDraft, then setInvoicePaymentMethods.
describe('payment-methods PUT guard', () => {
  it('accepts a draft invoice and lets the selection be replaced', () => {
    const method = createPaymentMethod({ label: 'Bank Transfer' });
    const invoice = getInvoice('draft-inv', 'u1')!;
    expect(() => assertInvoiceIsDraft(invoice)).not.toThrow();
    setInvoicePaymentMethods(invoice.id, [method.id]);
    expect(getInvoicePaymentMethods('draft-inv').map((m) => m.label)).toEqual(['Bank Transfer']);
  });

  it('refuses a sent invoice before any mutation happens', () => {
    const method = createPaymentMethod({ label: 'Bank Transfer' });
    const invoice = getInvoice('sent-inv', 'u1')!;
    expect(() => {
      assertInvoiceIsDraft(invoice); // what the route calls before setInvoicePaymentMethods
      setInvoicePaymentMethods(invoice.id, [method.id]);
    }).toThrow(/only draft invoices can be edited/i);
    // The throw happened before setInvoicePaymentMethods ran, so nothing attached.
    expect(getInvoicePaymentMethods('sent-inv')).toEqual([]);
  });

  it('raises the exact message updateInvoice raises for the same non-draft invoice', () => {
    // Guards against the two checks silently drifting apart if one is edited
    // later without the other.
    let updateInvoiceMessage = '';
    try {
      updateInvoice('sent-inv', 'u1', { notes: 'x' });
    } catch (err: any) {
      updateInvoiceMessage = err.message;
    }
    let guardMessage = '';
    try {
      assertInvoiceIsDraft(getInvoice('sent-inv', 'u1')!);
    } catch (err: any) {
      guardMessage = err.message;
    }
    expect(guardMessage).toBe(updateInvoiceMessage);
    expect(guardMessage).toMatch(/only draft invoices can be edited/i);
  });
});
