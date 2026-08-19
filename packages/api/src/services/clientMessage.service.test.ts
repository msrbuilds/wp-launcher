import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import {
  listClientMessages, listStaffClientMessages, postStaffMessage, postClientMessage,
} from './clientMessage.service';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO users (id, email, name) VALUES ('u1', 'staff@example.com', 'Sam')").run();
  db.prepare("INSERT INTO users (id, email) VALUES ('u2', 'other@example.com')").run();
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c1', 'u1', 'Acme')").run();
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c2', 'u1', 'Rival')").run();
  db.prepare("INSERT INTO projects (id, user_id, client_id, name) VALUES ('p1', 'u1', 'c1', 'Acme Site')").run();
  db.prepare("INSERT INTO projects (id, user_id, client_id, name) VALUES ('p2', 'u1', 'c2', 'Rival Secret Rebrand')").run();
  db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, items, total, status)
              VALUES ('i1', 'INV-0001', 'u1', 'c1', '[]', 100, 'sent')`).run();
  db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, items, total, status)
              VALUES ('i2', 'INV-0002', 'u1', 'c2', '[]', 200, 'sent')`).run();
  db.prepare("INSERT INTO client_users (id, client_id, email, verified) VALUES ('cu1', 'c1', 'buyer@acme.test', 1)").run();
});
afterEach(() => { __setDbForTesting(null); db.close(); });

describe('posting', () => {
  it('records who wrote it on each side', () => {
    postStaffMessage('u1', 'c1', { body: 'Kick-off Monday?' });
    postClientMessage('c1', 'cu1', { body: 'Monday works' });
    const thread = listClientMessages('c1');
    expect(thread.map((m) => [m.author_type, m.author_label, m.body])).toEqual([
      ['staff', 'Sam', 'Kick-off Monday?'],
      ['client', 'buyer@acme.test', 'Monday works'],
    ]);
  });

  it('falls back to the staff email when they have no name', () => {
    db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c3', 'u2', 'Third')").run();
    expect(postStaffMessage('u2', 'c3', { body: 'hello' }).author_label).toBe('other@example.com');
  });

  it('refuses to write into another staff user client thread', () => {
    expect(() => postStaffMessage('u2', 'c1', { body: 'hello' })).toThrow(/Client not found/);
    expect(listClientMessages('c1')).toHaveLength(0);
  });

  it('demands a body', () => {
    expect(() => postStaffMessage('u1', 'c1', { body: '   ' })).toThrow(/Write something/);
    expect(() => postClientMessage('c1', 'cu1', { body: null })).toThrow(/Write something/);
  });

  it('trims and caps a very long body', () => {
    const message = postClientMessage('c1', 'cu1', { body: `  ${'x'.repeat(6000)}  ` });
    expect(message.body.length).toBe(5000);
  });
});

describe('references', () => {
  it('keeps a reference to this client own project and invoice', () => {
    const message = postStaffMessage('u1', 'c1', { body: 'see attached', projectId: 'p1', invoiceId: 'i1' });
    expect(message.project_id).toBe('p1');
    expect(message.project_name).toBe('Acme Site');
    expect(message.invoice_number).toBe('INV-0001');
  });

  it('drops a reference to another client project', () => {
    // The chip renders the project name, so an unchecked reference would leak
    // another client's project title into this conversation.
    const message = postClientMessage('c1', 'cu1', { body: 'what about this', projectId: 'p2' });
    expect(message.project_id).toBeNull();
    expect(message.project_name).toBeNull();
    expect(message.body).toBe('what about this');
  });

  it('drops a reference to another client invoice', () => {
    const message = postClientMessage('c1', 'cu1', { body: 'about the bill', invoiceId: 'i2' });
    expect(message.invoice_id).toBeNull();
    expect(message.invoice_number).toBeNull();
  });

  it('drops an unknown reference rather than losing the message', () => {
    const message = postStaffMessage('u1', 'c1', { body: 'still sent', projectId: 'gone', invoiceId: 'gone' });
    expect(message.project_id).toBeNull();
    expect(message.invoice_id).toBeNull();
    expect(message.body).toBe('still sent');
  });
});

describe('reading', () => {
  it('returns only this client conversation', () => {
    postStaffMessage('u1', 'c1', { body: 'for Acme' });
    postStaffMessage('u1', 'c2', { body: 'for Rival' });
    expect(listClientMessages('c1').map((m) => m.body)).toEqual(['for Acme']);
    expect(listClientMessages('c2').map((m) => m.body)).toEqual(['for Rival']);
  });

  it('refuses another staff user client thread', () => {
    postStaffMessage('u1', 'c1', { body: 'private' });
    expect(() => listStaffClientMessages('u2', 'c1')).toThrow(/Client not found/);
    expect(listStaffClientMessages('u1', 'c1')).toHaveLength(1);
  });

  it('keeps messages in the order they were written', () => {
    // Timestamps are second-resolution, so same-second messages need the
    // rowid tiebreak or the thread reorders itself on every read.
    for (let i = 0; i < 5; i++) postStaffMessage('u1', 'c1', { body: `m${i}` });
    expect(listClientMessages('c1').map((m) => m.body)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
  });
});
