import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import {
  listPaymentMethods, createPaymentMethod, updatePaymentMethod, deletePaymentMethod,
  getInvoicePaymentMethods, setInvoicePaymentMethods,
} from './paymentMethod.service';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO users (id, email) VALUES ('u1', 'a@b.c')").run();
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c1', 'u1', 'Acme')").run();
  db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, items, total)
              VALUES ('inv1', 'INV-0001', 'u1', 'c1', '[]', 100)`).run();
  db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, items, total)
              VALUES ('inv2', 'INV-0002', 'u1', 'c1', '[]', 200)`).run();
});
afterEach(() => { __setDbForTesting(null); db.close(); });

describe('payment method list', () => {
  it('rejects a method with no label', () => {
    expect(() => createPaymentMethod({ label: '   ' })).toThrow(/label/i);
  });

  it('creates active by default and returns it', () => {
    const m = createPaymentMethod({ label: 'Bank Transfer', instructions: 'IBAN GB00 ...' });
    expect(m.label).toBe('Bank Transfer');
    expect(m.instructions).toBe('IBAN GB00 ...');
    expect(m.active).toBe(1);
  });

  it('orders by sort_order then label, not by insertion', () => {
    const b = createPaymentMethod({ label: 'B method' });
    const a = createPaymentMethod({ label: 'A method' });
    updatePaymentMethod(b.id, { sort_order: 1 });
    updatePaymentMethod(a.id, { sort_order: 2 });
    expect(listPaymentMethods().map((m) => m.label)).toEqual(['B method', 'A method']);
  });

  it('can filter to active methods only', () => {
    createPaymentMethod({ label: 'Live' });
    const off = createPaymentMethod({ label: 'Retired' });
    updatePaymentMethod(off.id, { active: false });
    expect(listPaymentMethods({ activeOnly: true }).map((m) => m.label)).toEqual(['Live']);
    expect(listPaymentMethods().map((m) => m.label).sort()).toEqual(['Live', 'Retired']);
  });

  it('reports a missing method rather than silently doing nothing', () => {
    expect(() => updatePaymentMethod('nope', { label: 'x' })).toThrow(/not found/i);
    expect(() => deletePaymentMethod('nope')).toThrow(/not found/i);
  });
});

describe('invoice attachment', () => {
  it('attaches nothing by default', () => {
    // Absence means hidden: an invoice created before any method existed, or
    // one the operator never configured, shows no payment instructions.
    expect(getInvoicePaymentMethods('inv1')).toEqual([]);
  });

  it('returns the attached methods in list order', () => {
    const first = createPaymentMethod({ label: 'Bank' });
    const second = createPaymentMethod({ label: 'Wise' });
    updatePaymentMethod(first.id, { sort_order: 1 });
    updatePaymentMethod(second.id, { sort_order: 2 });
    setInvoicePaymentMethods('inv1', [second.id, first.id]);
    expect(getInvoicePaymentMethods('inv1').map((m) => m.label)).toEqual(['Bank', 'Wise']);
  });

  it('replaces the selection rather than appending to it', () => {
    const a = createPaymentMethod({ label: 'A' });
    const b = createPaymentMethod({ label: 'B' });
    setInvoicePaymentMethods('inv1', [a.id, b.id]);
    setInvoicePaymentMethods('inv1', [b.id]);
    expect(getInvoicePaymentMethods('inv1').map((m) => m.label)).toEqual(['B']);
  });

  it('keeps each invoice independent', () => {
    const a = createPaymentMethod({ label: 'A' });
    setInvoicePaymentMethods('inv1', [a.id]);
    expect(getInvoicePaymentMethods('inv2')).toEqual([]);
  });

  it('ignores an unknown method id instead of failing the whole save', () => {
    const a = createPaymentMethod({ label: 'A' });
    setInvoicePaymentMethods('inv1', [a.id, 'ghost']);
    expect(getInvoicePaymentMethods('inv1').map((m) => m.label)).toEqual(['A']);
  });

  it('still shows a deactivated method on invoices already using it', () => {
    // Retiring a method must not silently blank the payment instructions on
    // invoices already sent to clients.
    const a = createPaymentMethod({ label: 'Old Bank' });
    setInvoicePaymentMethods('inv1', [a.id]);
    updatePaymentMethod(a.id, { active: false });
    expect(getInvoicePaymentMethods('inv1').map((m) => m.label)).toEqual(['Old Bank']);
  });

  it('refuses to delete a method an invoice still uses', () => {
    // Deleting would blank the instructions on an invoice already sent. The
    // operator deactivates instead, which hides it from future invoices.
    const a = createPaymentMethod({ label: 'In Use' });
    setInvoicePaymentMethods('inv1', [a.id]);
    expect(() => deletePaymentMethod(a.id)).toThrow(/in use/i);
    expect(getInvoicePaymentMethods('inv1')).toHaveLength(1);
  });

  it('deletes a method no invoice uses', () => {
    const a = createPaymentMethod({ label: 'Unused' });
    deletePaymentMethod(a.id);
    expect(listPaymentMethods()).toEqual([]);
  });
});
