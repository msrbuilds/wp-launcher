import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import {
  getPortalProjects, getPortalProject, getPortalInvoices, getPortalInvoice,
} from './portal.service';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO users (id, email) VALUES ('u1', 'a@b.c')").run();
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c1', 'u1', 'Acme')").run();
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c2', 'u1', 'Rival')").run();
  db.prepare("INSERT INTO projects (id, user_id, client_id, name) VALUES ('p1', 'u1', 'c1', 'Acme Site')").run();
  db.prepare("INSERT INTO projects (id, user_id, client_id, name) VALUES ('p2', 'u1', 'c2', 'Rival Site')").run();
  db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, project_id, items, total, status)
              VALUES ('i1', 'INV-0001', 'u1', 'c1', 'p1', '[]', 100, 'sent')`).run();
  db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, project_id, items, total, status)
              VALUES ('i2', 'INV-0002', 'u1', 'c2', 'p2', '[]', 200, 'sent')`).run();
  db.prepare("INSERT INTO board_columns (id, project_id, name, position, client_visible) VALUES ('col-open', 'p1', 'Shared', 0, 1)").run();
  db.prepare("INSERT INTO board_columns (id, project_id, name, position, client_visible) VALUES ('col-internal', 'p1', 'Internal', 1, 0)").run();
  db.prepare("INSERT INTO board_cards (id, project_id, column_id, title, position) VALUES ('card-open', 'p1', 'col-open', 'Visible work', 0)").run();
  db.prepare("INSERT INTO board_cards (id, project_id, column_id, title, position) VALUES ('card-secret', 'p1', 'col-internal', 'Internal note', 0)").run();
});
afterEach(() => { __setDbForTesting(null); db.close(); });

describe('cross-client isolation', () => {
  it('lists only the signed-in client projects', () => {
    expect(getPortalProjects('c1').map((p) => p.name)).toEqual(['Acme Site']);
    expect(getPortalProjects('c2').map((p) => p.name)).toEqual(['Rival Site']);
  });

  it('refuses another client project by id', () => {
    // The single most important assertion in this phase: knowing an id must
    // not be enough to read it.
    expect(getPortalProject('c2', 'p1')).toBeUndefined();
    expect(getPortalProject('c1', 'p1')).toBeDefined();
  });

  it('lists only the signed-in client invoices', () => {
    expect(getPortalInvoices('c1').map((i) => i.invoice_number)).toEqual(['INV-0001']);
    expect(getPortalInvoices('c2').map((i) => i.invoice_number)).toEqual(['INV-0002']);
  });

  it('refuses another client invoice by id', () => {
    expect(getPortalInvoice('c2', 'i1')).toBeUndefined();
    expect(getPortalInvoice('c1', 'i1')).toBeDefined();
  });
});

describe('board visibility', () => {
  it('shows only columns marked visible to the client', () => {
    expect(getPortalProject('c1', 'p1')!.columns.map((c) => c.name)).toEqual(['Shared']);
  });

  it('does not leak cards from a hidden column', () => {
    const titles = getPortalProject('c1', 'p1')!.columns.flatMap((c) => c.cards.map((card) => card.title));
    expect(titles).toEqual(['Visible work']);
    expect(titles).not.toContain('Internal note');
  });

  it('shows no columns at all when none are shared', () => {
    db.prepare("UPDATE board_columns SET client_visible = 0 WHERE project_id = 'p1'").run();
    const result = getPortalProject('c1', 'p1')!;
    expect(result.columns).toEqual([]);
    expect(result.project.name).toBe('Acme Site');
  });
});

describe('invoice detail', () => {
  it('includes only the payment methods attached to that invoice', () => {
    db.prepare("INSERT INTO payment_methods (id, label, instructions) VALUES ('pm1', 'Bank', 'IBAN ...')").run();
    db.prepare("INSERT INTO payment_methods (id, label, instructions) VALUES ('pm2', 'Wise', 'Wise ...')").run();
    db.prepare("INSERT INTO invoice_payment_methods (invoice_id, payment_method_id) VALUES ('i1', 'pm1')").run();
    expect(getPortalInvoice('c1', 'i1')!.paymentMethods.map((m) => m.label)).toEqual(['Bank']);
  });

  it('never exposes a draft invoice', () => {
    // A draft is unfinished work; the client should not see it at all.
    db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, items, total, status)
                VALUES ('i-draft', 'INV-0003', 'u1', 'c1', '[]', 50, 'draft')`).run();
    expect(getPortalInvoices('c1').map((i) => i.invoice_number)).toEqual(['INV-0001']);
    expect(getPortalInvoice('c1', 'i-draft')).toBeUndefined();
  });

  it('never exposes a cancelled invoice', () => {
    db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, items, total, status)
                VALUES ('i-void', 'INV-0004', 'u1', 'c1', '[]', 50, 'cancelled')`).run();
    expect(getPortalInvoices('c1').map((i) => i.invoice_number)).toEqual(['INV-0001']);
    expect(getPortalInvoice('c1', 'i-void')).toBeUndefined();
  });
});
