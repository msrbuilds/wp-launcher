import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createSiteTestDb } from '../../test-helpers/sites';
import { __setDbForTesting } from '../../utils/db';
import * as notificationService from '../../services/notification.service';
import { crmMessageTools } from './crm-messages';
import type { McpAuthContext } from '../../oauth/token.service';

let db: Database.Database;
const ctx: McpAuthContext = { userId: 'owner', userEmail: 'owner@example.com', userRole: 'owner', grantId: 'g', clientId: 'c', clientName: 'App', scopes: ['crm:read', 'crm:write'] };
const tool = (name: string) => crmMessageTools.find((t) => t.name === name)!;
const run = (name: string, args: Record<string, unknown>) => Promise.resolve().then(() => tool(name).handler(args as never, ctx));

beforeEach(() => {
  db = createSiteTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c1', 'owner', 'Acme'), ('cx', 'alice', 'Theirs')").run();
  db.prepare("INSERT INTO projects (id, user_id, client_id, name, status) VALUES ('px', 'alice', 'cx', 'Their project', 'active')").run();
  const n = db.prepare("INSERT INTO notifications (id, recipient_type, recipient_id, kind, subject, body, created_at) VALUES (?, 'staff', ?, 'k', 's', 'b', datetime('now'))");
  n.run('n1', 'owner');
  n.run('nx', 'alice');
  vi.spyOn(notificationService, 'notifyClient').mockResolvedValue();
});
afterEach(() => { __setDbForTesting(null); db.close(); vi.restoreAllMocks(); });

describe('client messages', () => {
  it('sends to the caller’s client and notifies them, like the panel does', async () => {
    const { message } = await run('crm_messages_send', { clientId: 'c1', body: 'Your site is ready' }) as { message: { body: string; authorType: string } };
    expect(message).toMatchObject({ body: 'Your site is ready', authorType: 'staff' });
    expect(notificationService.notifyClient).toHaveBeenCalledWith('c1', expect.objectContaining({ kind: 'message.fromStaff' }));
  });

  it('refuses another user’s client and sends nothing', async () => {
    await expect(run('crm_messages_send', { clientId: 'cx', body: 'hi' })).rejects.toThrow(/Client not found/);
    expect(notificationService.notifyClient).not.toHaveBeenCalled();
    await expect(run('crm_messages_list', { clientId: 'cx' })).rejects.toThrow(/Client not found/);
  });

  it('drops a reference to a project that is not this client’s instead of leaking its name', async () => {
    await run('crm_messages_send', { clientId: 'c1', body: 'See project', projectId: 'px' });
    expect(db.prepare('SELECT project_id FROM client_messages').get()).toEqual({ project_id: null });
  });

  it('is destructive-flagged, since it emails a client', () => {
    expect(tool('crm_messages_send')).toMatchObject({ scope: 'crm:write', writeBucket: 'crm', feature: 'projects', annotations: { destructiveHint: true } });
  });
});

describe('notifications', () => {
  it('lists only the caller’s notifications', async () => {
    const out = await run('notifications_list', {}) as { items: { id: string }[]; unread: number };
    expect(out.items.map((i) => i.id)).toEqual(['n1']);
    expect(out.unread).toBe(1);
  });

  it('cannot mark someone else’s notification read', async () => {
    expect(await run('notifications_mark_read', { ids: ['nx'] })).toEqual({ marked: 0 });
    expect(db.prepare("SELECT read_at FROM notifications WHERE id = 'nx'").get()).toEqual({ read_at: null });
    expect(await run('notifications_mark_read', {})).toEqual({ marked: 1 });
  });
});
