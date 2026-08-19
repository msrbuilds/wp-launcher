import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { __setStoreRootForTesting, resolveStoredPath } from './fileStore';
import {
  listCardComments, addCardComment, deleteCardComment,
  listCardAttachments, addCardAttachment, getCardAttachment, deleteCardAttachment,
  countsForProject,
} from './cardActivity.service';
import { deleteCard, deleteColumn } from './board.service';
import { deleteProject } from './project.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x07, 0x08]);

let db: Database.Database;
let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wpl-cards-'));
  __setStoreRootForTesting(root);
  db = createTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO users (id, email, name) VALUES ('u1', 'staff@example.com', 'Sam')").run();
  db.prepare("INSERT INTO users (id, email) VALUES ('u2', 'other@example.com')").run();
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c1', 'u1', 'Acme')").run();
  db.prepare("INSERT INTO projects (id, user_id, client_id, name) VALUES ('p1', 'u1', 'c1', 'Acme Site')").run();
  db.prepare("INSERT INTO projects (id, user_id, name) VALUES ('p2', 'u2', 'Not yours')").run();
  db.prepare("INSERT INTO board_columns (id, project_id, name, position) VALUES ('col1', 'p1', 'To do', 0)").run();
  db.prepare("INSERT INTO board_columns (id, project_id, name, position) VALUES ('col2', 'p2', 'Theirs', 0)").run();
  db.prepare("INSERT INTO board_cards (id, project_id, column_id, title, position) VALUES ('card1', 'p1', 'col1', 'Task', 0)").run();
  db.prepare("INSERT INTO board_cards (id, project_id, column_id, title, position) VALUES ('card2', 'p2', 'col2', 'Theirs', 0)").run();
});
afterEach(() => {
  __setDbForTesting(null);
  db.close();
  __setStoreRootForTesting(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('comments', () => {
  it('records the author and keeps the order written', () => {
    for (let i = 0; i < 4; i++) addCardComment('card1', 'u1', `note ${i}`);
    const comments = listCardComments('card1', 'u1');
    expect(comments.map((c) => c.body)).toEqual(['note 0', 'note 1', 'note 2', 'note 3']);
    expect(comments[0].author_label).toBe('Sam');
  });

  it('refuses a card in another staff user project', () => {
    expect(() => addCardComment('card2', 'u1', 'prying')).toThrow(/Card not found/);
    expect(() => listCardComments('card2', 'u1')).toThrow(/Card not found/);
  });

  it('demands a body', () => {
    expect(() => addCardComment('card1', 'u1', '   ')).toThrow(/Write something/);
    expect(() => addCardComment('card1', 'u1', null)).toThrow(/Write something/);
  });

  it('deletes only through a card the caller may touch', () => {
    const comment = addCardComment('card1', 'u1', 'internal');
    expect(() => deleteCardComment(comment.id, 'u2')).toThrow(/not found/);
    expect(listCardComments('card1', 'u1')).toHaveLength(1);
    deleteCardComment(comment.id, 'u1');
    expect(listCardComments('card1', 'u1')).toHaveLength(0);
  });
});

describe('attachments', () => {
  it('stores the file and lists it against the card', () => {
    const attachment = addCardAttachment('card1', 'u1', { buffer: PNG, originalName: 'mock.png' });
    expect(attachment.mime).toBe('image/png');
    expect(attachment.original_name).toBe('mock.png');
    expect(fs.readFileSync(resolveStoredPath(attachment.storage_path)).equals(PNG)).toBe(true);
    expect(listCardAttachments('card1', 'u1').map((a) => a.id)).toEqual([attachment.id]);
  });

  it('refuses a card in another staff user project', () => {
    expect(() => addCardAttachment('card2', 'u1', { buffer: PNG })).toThrow(/Card not found/);
  });

  it('validates by contents, leaving no row behind', () => {
    expect(() => addCardAttachment('card1', 'u1', { buffer: Buffer.from('<?php ?>') })).toThrow();
    expect(listCardAttachments('card1', 'u1')).toHaveLength(0);
  });

  it('refuses to hand another staff user the file', () => {
    const attachment = addCardAttachment('card1', 'u1', { buffer: PNG });
    expect(getCardAttachment(attachment.id, 'u2')).toBeUndefined();
    expect(getCardAttachment(attachment.id, 'u1')).toBeDefined();
  });

  it('removes the file from disk when deleted', () => {
    const attachment = addCardAttachment('card1', 'u1', { buffer: PNG });
    const onDisk = resolveStoredPath(attachment.storage_path);
    deleteCardAttachment(attachment.id, 'u1');
    expect(fs.existsSync(onDisk)).toBe(false);
    expect(listCardAttachments('card1', 'u1')).toHaveLength(0);
  });

  it('refuses another staff user deleting it', () => {
    const attachment = addCardAttachment('card1', 'u1', { buffer: PNG });
    expect(() => deleteCardAttachment(attachment.id, 'u2')).toThrow(/not found/);
    expect(fs.existsSync(resolveStoredPath(attachment.storage_path))).toBe(true);
  });
});

describe('countsForProject', () => {
  it('reports each card totals', () => {
    addCardComment('card1', 'u1', 'one');
    addCardComment('card1', 'u1', 'two');
    addCardAttachment('card1', 'u1', { buffer: PNG });
    expect(countsForProject('p1')).toEqual({ card1: { comments: 2, attachments: 1 } });
  });

  it('omits cards with nothing on them', () => {
    expect(countsForProject('p1')).toEqual({});
  });
});

describe('deleting a card, column or project', () => {
  it('takes comments and attachments with the card', () => {
    addCardComment('card1', 'u1', 'internal');
    const attachment = addCardAttachment('card1', 'u1', { buffer: PNG });
    const onDisk = resolveStoredPath(attachment.storage_path);
    // Both tables carry a foreign key to board_cards; without the purge this
    // throws SQLITE_CONSTRAINT and the card is undeletable forever.
    expect(() => deleteCard('card1', 'u1')).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS c FROM card_comments').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) AS c FROM card_attachments').get()).toEqual({ c: 0 });
    expect(fs.existsSync(onDisk)).toBe(false);
  });

  it('takes them with the column', () => {
    addCardComment('card1', 'u1', 'internal');
    addCardAttachment('card1', 'u1', { buffer: PNG });
    expect(() => deleteColumn('col1', 'u1')).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS c FROM card_comments').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) AS c FROM card_attachments').get()).toEqual({ c: 0 });
  });

  it('takes them with the project', () => {
    addCardComment('card1', 'u1', 'internal');
    addCardAttachment('card1', 'u1', { buffer: PNG });
    expect(() => deleteProject('p1', 'u1')).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS c FROM card_comments').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) AS c FROM card_attachments').get()).toEqual({ c: 0 });
  });
});
