import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { deleteClient, deleteProject } from './project.service';
import { postStaffMessage } from './clientMessage.service';

/**
 * Foreign keys are on in production, so every table added beside a client or a
 * project has to be dealt with when one is deleted. Each of these deletes was
 * a 500 with "FOREIGN KEY constraint failed" before its cascade existed.
 */

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO users (id, email) VALUES ('u1', 'staff@example.com')").run();
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c1', 'u1', 'Acme')").run();
});
afterEach(() => { __setDbForTesting(null); db.close(); });

describe('deleteClient', () => {
  it('takes the portal logins with it', () => {
    db.prepare("INSERT INTO client_users (id, client_id, email) VALUES ('cu1', 'c1', 'a@acme.test')").run();
    expect(() => deleteClient('c1', 'u1')).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS c FROM client_users').get()).toEqual({ c: 0 });
  });

  it('takes the conversation with it', () => {
    postStaffMessage('u1', 'c1', { body: 'hello' });
    expect(() => deleteClient('c1', 'u1')).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS c FROM client_messages').get()).toEqual({ c: 0 });
  });

  it('still refuses while projects or invoices exist', () => {
    db.prepare("INSERT INTO projects (id, user_id, client_id, name) VALUES ('p1', 'u1', 'c1', 'Work')").run();
    expect(() => deleteClient('c1', 'u1')).toThrow(/linked projects/);
  });

  it('refuses another staff user client', () => {
    db.prepare("INSERT INTO users (id, email) VALUES ('u2', 'other@example.com')").run();
    expect(() => deleteClient('c1', 'u2')).toThrow(/Client not found/);
    expect(db.prepare('SELECT COUNT(*) AS c FROM clients').get()).toEqual({ c: 1 });
  });
});

describe('deleteProject', () => {
  it('takes its board with it', () => {
    db.prepare("INSERT INTO projects (id, user_id, client_id, name) VALUES ('p1', 'u1', 'c1', 'Work')").run();
    db.prepare("INSERT INTO board_columns (id, project_id, name) VALUES ('col1', 'p1', 'To do')").run();
    db.prepare("INSERT INTO board_cards (id, project_id, column_id, title) VALUES ('card1', 'p1', 'col1', 'Task')").run();
    expect(() => deleteProject('p1', 'u1')).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS c FROM board_cards').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) AS c FROM board_columns').get()).toEqual({ c: 0 });
  });

  it('leaves a message that mentioned it readable', () => {
    // The reference is decoration; losing the project must not lose what was
    // said about it.
    db.prepare("INSERT INTO projects (id, user_id, client_id, name) VALUES ('p1', 'u1', 'c1', 'Work')").run();
    postStaffMessage('u1', 'c1', { body: 'about the build', projectId: 'p1' });
    deleteProject('p1', 'u1');
    const row = db.prepare('SELECT body FROM client_messages').get() as { body: string };
    expect(row.body).toBe('about the build');
  });
});
