import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';

// vi.hoisted, so the spy exists before the hoisted vi.mock factory runs and
// the import below can stay static.
const { sendNotificationEmail } = vi.hoisted(() => ({ sendNotificationEmail: vi.fn() }));
vi.mock('./email.service', () => ({ sendNotificationEmail }));

import {
  getNotificationMode, setNotificationMode, notifyStaff, notifyClient,
  pendingByRecipient, digestContent, sendDigests,
} from './notification.service';

let db: Database.Database;

const event = (kind = 'proof.uploaded') => ({
  kind, subject: 'Payment proof submitted', heading: 'A client sent proof',
  lines: ['INV-0001 is awaiting your verification.'], link: '/invoices/i1',
});

const pendingCount = () =>
  (db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE sent_at IS NULL').get() as { c: number }).c;

beforeEach(() => {
  sendNotificationEmail.mockReset();
  sendNotificationEmail.mockResolvedValue(undefined);
  db = createTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO users (id, email) VALUES ('u1', 'staff@example.com')").run();
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c1', 'u1', 'Acme')").run();
  db.prepare("INSERT INTO client_users (id, client_id, email, verified) VALUES ('cu1', 'c1', 'buyer@acme.test', 1)").run();
  db.prepare("INSERT INTO client_users (id, client_id, email, verified) VALUES ('cu2', 'c1', 'invited@acme.test', 0)").run();
});
afterEach(() => { __setDbForTesting(null); db.close(); });

describe('preferences', () => {
  it('treats a missing row as immediate', () => {
    // Nobody is silently opted out of hearing about their own invoices.
    expect(getNotificationMode('staff', 'u1')).toBe('immediate');
    expect(getNotificationMode('client', 'cu1')).toBe('immediate');
  });

  it('round-trips a chosen mode', () => {
    setNotificationMode('client', 'cu1', 'daily');
    expect(getNotificationMode('client', 'cu1')).toBe('daily');
    setNotificationMode('client', 'cu1', 'off');
    expect(getNotificationMode('client', 'cu1')).toBe('off');
  });

  it('falls back to immediate on an unrecognised mode rather than silencing anyone', () => {
    setNotificationMode('staff', 'u1', 'weekly-ish');
    expect(getNotificationMode('staff', 'u1')).toBe('immediate');
  });

  it('keeps one row per recipient', () => {
    setNotificationMode('staff', 'u1', 'daily');
    setNotificationMode('staff', 'u1', 'off');
    expect(db.prepare('SELECT COUNT(*) AS c FROM notification_prefs').get()).toEqual({ c: 1 });
  });
});

describe('immediate mode', () => {
  it('sends and records the notification as sent', async () => {
    await notifyStaff('u1', event());
    expect(sendNotificationEmail).toHaveBeenCalledOnce();
    expect(sendNotificationEmail.mock.calls[0][0]).toBe('staff@example.com');
    expect(pendingCount()).toBe(0);
  });

  it('leaves the row pending when the send fails', async () => {
    // The digest then carries it, rather than the news being lost to one bad
    // night for the mail server.
    sendNotificationEmail.mockRejectedValue(new Error('smtp down'));
    await notifyStaff('u1', event());
    expect(pendingCount()).toBe(1);
  });
});

describe('daily mode', () => {
  it('queues without sending', async () => {
    setNotificationMode('staff', 'u1', 'daily');
    await notifyStaff('u1', event());
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(pendingCount()).toBe(1);
  });
});

describe('off mode', () => {
  it('neither sends nor records', async () => {
    // A suppressed notification is neither pending nor sent; stamping it sent
    // would put a lie in the table, and leaving it pending would resurrect it
    // in the next digest.
    setNotificationMode('staff', 'u1', 'off');
    await notifyStaff('u1', event());
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(db.prepare('SELECT COUNT(*) AS c FROM notifications').get()).toEqual({ c: 0 });
  });
});

describe('notifyClient', () => {
  it('reaches every verified login and skips invitees', async () => {
    await notifyClient('c1', event('message.fromStaff'));
    expect(sendNotificationEmail.mock.calls.map((c) => c[0])).toEqual(['buyer@acme.test']);
  });

  it('honours each login own preference', async () => {
    db.prepare("INSERT INTO client_users (id, client_id, email, verified) VALUES ('cu3', 'c1', 'boss@acme.test', 1)").run();
    setNotificationMode('client', 'cu1', 'daily');
    await notifyClient('c1', event('message.fromStaff'));
    expect(sendNotificationEmail.mock.calls.map((c) => c[0])).toEqual(['boss@acme.test']);
    expect(pendingCount()).toBe(1);
  });

  it('tells nobody at another client', async () => {
    db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c2', 'u1', 'Rival')").run();
    db.prepare("INSERT INTO client_users (id, client_id, email, verified) VALUES ('cu9', 'c2', 'rival@x.test', 1)").run();
    await notifyClient('c1', event('message.fromStaff'));
    expect(sendNotificationEmail.mock.calls.map((c) => c[0])).toEqual(['buyer@acme.test']);
  });
});

describe('digestContent', () => {
  it('reads as itself when there is only one thing to say', () => {
    const content = digestContent({
      recipient_type: 'client', recipient_id: 'cu1',
      rows: [{ id: 'n1', subject: 'Payment received', body: 'INV-0001 is paid.', link: '/portal/invoices', created_at: '2026-08-19 09:00:00' }],
    });
    expect(content.subject).toBe('Payment received');
    expect(content.lines).toEqual(['INV-0001 is paid.']);
    expect(content.link).toBe('/portal/invoices');
  });

  it('summarises several and drops the link, which would only point at one', () => {
    const content = digestContent({
      recipient_type: 'client', recipient_id: 'cu1',
      rows: [
        { id: 'n1', subject: 'Payment received', body: 'INV-0001 is paid.', link: '/portal/invoices', created_at: '2026-08-19 09:00:00' },
        { id: 'n2', subject: 'New message', body: 'Kick-off Monday?', link: '/portal/messages', created_at: '2026-08-19 10:00:00' },
      ],
    });
    expect(content.subject).toBe('2 updates from your project');
    expect(content.lines).toEqual([
      'Payment received — INV-0001 is paid.',
      'New message — Kick-off Monday?',
    ]);
    expect(content.link).toBeUndefined();
  });
});

describe('sendDigests', () => {
  it('sends one email per recipient and stamps their rows', async () => {
    setNotificationMode('staff', 'u1', 'daily');
    setNotificationMode('client', 'cu1', 'daily');
    await notifyStaff('u1', event());
    await notifyStaff('u1', event('message.fromClient'));
    await notifyClient('c1', event('message.fromStaff'));
    sendNotificationEmail.mockClear();

    const result = await sendDigests();
    expect(result).toEqual({ recipients: 2, notifications: 3 });
    expect(sendNotificationEmail).toHaveBeenCalledTimes(2);
    expect(pendingCount()).toBe(0);
  });

  it('does nothing when nothing is pending', async () => {
    expect(await sendDigests()).toEqual({ recipients: 0, notifications: 0 });
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it('keeps rows pending when the send fails so tomorrow carries them', async () => {
    setNotificationMode('staff', 'u1', 'daily');
    await notifyStaff('u1', event());
    sendNotificationEmail.mockRejectedValue(new Error('smtp down'));
    expect(await sendDigests()).toEqual({ recipients: 0, notifications: 0 });
    expect(pendingCount()).toBe(1);
  });

  it('stops retrying a recipient whose address is gone', async () => {
    // A revoked portal login would otherwise leave undeliverable rows to be
    // retried every day for the life of the install.
    setNotificationMode('client', 'cu1', 'daily');
    await notifyClient('c1', event('message.fromStaff'));
    db.prepare("DELETE FROM client_users WHERE id = 'cu1'").run();
    await sendDigests();
    expect(pendingCount()).toBe(0);
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });
});

describe('pendingByRecipient', () => {
  it('groups by recipient, oldest first', async () => {
    setNotificationMode('staff', 'u1', 'daily');
    await notifyStaff('u1', { ...event(), subject: 'First' });
    await notifyStaff('u1', { ...event(), subject: 'Second' });
    const groups = pendingByRecipient();
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.subject)).toEqual(['First', 'Second']);
  });
});
