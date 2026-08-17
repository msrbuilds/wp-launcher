import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { createClient, createInvoice } from './project.service';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  for (const id of ['u-one', 'u-two']) {
    db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(id, `${id}@example.com`);
  }
});
afterEach(() => { __setDbForTesting(null); db.close(); });

function raiseInvoice(userId: string) {
  const client = createClient(userId, { name: `Client of ${userId}` });
  return createInvoice(userId, {
    client_id: client.id,
    items: [{ description: 'Work', qty: 1, rate: 100 }],
    tax_rate: 0,
    currency: 'USD',
  });
}

describe('invoice numbering', () => {
  it('numbers sequentially for a single user', () => {
    expect(raiseInvoice('u-one').invoice_number).toBe('INV-0001');
    expect(raiseInvoice('u-one').invoice_number).toBe('INV-0002');
  });

  it('does not restart the sequence for a second user', () => {
    // invoices.invoice_number is UNIQUE across the whole table. A per-user
    // sequence hands the second user INV-0001 while the first already holds
    // it, and the INSERT dies on the constraint — so the second user simply
    // cannot raise an invoice. This test fails with
    // "UNIQUE constraint failed: invoices.invoice_number" against that.
    expect(raiseInvoice('u-one').invoice_number).toBe('INV-0001');
    expect(raiseInvoice('u-two').invoice_number).toBe('INV-0002');
  });

  it('continues past nine without sorting lexically', () => {
    // 'INV-0010' sorts below 'INV-0009' as text; the query casts to INTEGER so
    // that the tenth invoice does not collide with the ninth.
    for (let i = 0; i < 9; i++) raiseInvoice('u-one');
    expect(raiseInvoice('u-one').invoice_number).toBe('INV-0010');
  });
});
