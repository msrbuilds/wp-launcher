import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';
import { getDb } from '../utils/db';
import { config } from '../config';
import { sendNotificationEmail } from './email.service';

/**
 * The one place Mini CRM decides who hears about something, and when.
 *
 * Callers say what happened and to whom. This module resolves the recipient's
 * preference, sends immediately or queues the line for their daily digest, and
 * records what went out. Delivery failures are logged, never thrown: an email
 * that bounces must not roll back the payment proof or message that caused it.
 */

export type RecipientType = 'staff' | 'client';
export type NotificationMode = 'immediate' | 'daily' | 'off';

export const NOTIFICATION_MODES: NotificationMode[] = ['immediate', 'daily', 'off'];

export interface NotificationInput {
  /** Machine-readable event name, e.g. 'proof.uploaded'. */
  kind: string;
  subject: string;
  heading: string;
  lines: string[];
  /** Path within the panel or portal, e.g. '/invoices/abc'. */
  link?: string;
}

const stamp = () => new Date().toISOString().replace('Z', '').replace(/\.\d+/, '');

function absolute(link?: string | null): string | undefined {
  if (!link) return undefined;
  return `${config.publicUrl.replace(/\/$/, '')}${link.startsWith('/') ? link : `/${link}`}`;
}

const linkLabel = (link?: string | null) =>
  link?.startsWith('/portal') ? 'Open your portal' : 'Open in the panel';

// ── Preferences ──

/**
 * A recipient's mode.
 *
 * A missing row means `immediate`: nobody is silently opted out of hearing
 * about their own invoices because a row was never written for them.
 */
export function getNotificationMode(type: RecipientType, id: string): NotificationMode {
  const row = getDb().prepare('SELECT mode FROM notification_prefs WHERE recipient_type = ? AND recipient_id = ?')
    .get(type, id) as { mode: string } | undefined;
  return NOTIFICATION_MODES.includes(row?.mode as NotificationMode)
    ? (row!.mode as NotificationMode)
    : 'immediate';
}

export function setNotificationMode(type: RecipientType, id: string, mode: string): NotificationMode {
  const chosen: NotificationMode = NOTIFICATION_MODES.includes(mode as NotificationMode)
    ? (mode as NotificationMode)
    : 'immediate';
  getDb().prepare(`
    INSERT INTO notification_prefs (recipient_type, recipient_id, mode, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(recipient_type, recipient_id) DO UPDATE SET mode = excluded.mode, updated_at = excluded.updated_at
  `).run(type, id, chosen, stamp());
  return chosen;
}

// ── Sending ──

function addressFor(type: RecipientType, id: string): string | undefined {
  const row = type === 'staff'
    ? getDb().prepare('SELECT email FROM users WHERE id = ?').get(id)
    : getDb().prepare('SELECT email FROM client_users WHERE id = ? AND verified = 1').get(id);
  return (row as { email?: string } | undefined)?.email;
}

async function deliver(
  email: string, kind: string, subject: string,
  opts: { heading: string; lines: string[]; link?: string | null },
): Promise<boolean> {
  try {
    await sendNotificationEmail(email, subject, {
      heading: opts.heading,
      lines: opts.lines,
      linkUrl: absolute(opts.link),
      linkLabel: linkLabel(opts.link),
    });
    return true;
  } catch (err: any) {
    console.error(`[notify] ${kind} to ${email} failed:`, err?.message || err);
    return false;
  }
}

/**
 * Record and route one notification.
 *
 * `off` writes no row at all: a suppressed notification is neither pending nor
 * sent, and stamping it as sent would put a lie in the table. A failed
 * immediate send leaves the row pending, so the digest carries it rather than
 * the news being lost to a temporary mail outage.
 */
async function notifyOne(type: RecipientType, id: string, input: NotificationInput): Promise<void> {
  const mode = getNotificationMode(type, id);
  if (mode === 'off') return;

  const body = input.lines.join('\n');
  const rowId = uuidv4();
  getDb().prepare(`INSERT INTO notifications
    (id, recipient_type, recipient_id, kind, subject, body, link, created_at, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`)
    .run(rowId, type, id, input.kind, input.subject, body, input.link ?? null, stamp());

  if (mode !== 'immediate') return;

  const email = addressFor(type, id);
  if (!email) return;
  const sent = await deliver(email, input.kind, input.subject, {
    heading: input.heading, lines: input.lines, link: input.link,
  });
  if (sent) {
    getDb().prepare('UPDATE notifications SET sent_at = ? WHERE id = ?').run(stamp(), rowId);
  }
}

/**
 * Tell one staff user.
 *
 * Never rejects. Call sites fire these without awaiting, so a rejection would
 * surface as an unhandled rejection rather than anywhere useful — and none of
 * them should fail the request that triggered the notification.
 */
export async function notifyStaff(userId: string, input: NotificationInput): Promise<void> {
  try {
    await notifyOne('staff', userId, input);
  } catch (err: any) {
    console.error(`[notify] ${input.kind} for staff ${userId} failed:`, err?.message || err);
  }
}

/**
 * Tell everyone with a working portal login for this client.
 *
 * Unverified invitees are skipped: they have no password yet, so a link into
 * the portal would only bounce them to a sign-in they cannot complete. Each
 * has their own preference. Never rejects, for the same reason as notifyStaff.
 */
export async function notifyClient(clientId: string, input: NotificationInput): Promise<void> {
  try {
    const recipients = getDb()
      .prepare('SELECT id FROM client_users WHERE client_id = ? AND verified = 1')
      .all(clientId) as { id: string }[];
    for (const recipient of recipients) {
      await notifyOne('client', recipient.id, input);
    }
  } catch (err: any) {
    console.error(`[notify] ${input.kind} for client ${clientId} failed:`, err?.message || err);
  }
}

// ── Digests ──

export interface PendingGroup {
  recipient_type: RecipientType;
  recipient_id: string;
  rows: { id: string; subject: string; body: string; link: string | null; created_at: string }[];
}

/** Everything still waiting to go out, grouped by who it is for. */
export function pendingByRecipient(): PendingGroup[] {
  const rows = getDb().prepare(`
    SELECT id, recipient_type, recipient_id, subject, body, link, created_at
    FROM notifications WHERE sent_at IS NULL ORDER BY recipient_type, recipient_id, created_at, rowid
  `).all() as (PendingGroup['rows'][number] & { recipient_type: RecipientType; recipient_id: string })[];

  const groups = new Map<string, PendingGroup>();
  for (const row of rows) {
    const key = `${row.recipient_type}:${row.recipient_id}`;
    if (!groups.has(key)) {
      groups.set(key, { recipient_type: row.recipient_type, recipient_id: row.recipient_id, rows: [] });
    }
    groups.get(key)!.rows.push({
      id: row.id, subject: row.subject, body: row.body, link: row.link, created_at: row.created_at,
    });
  }
  return [...groups.values()];
}

/**
 * Turn a group of pending lines into the digest text.
 *
 * Kept separate from sending so it can be tested without a mail server, and so
 * the one-item case reads as itself rather than "1 update" with a list of one.
 */
export function digestContent(group: PendingGroup): { subject: string; heading: string; lines: string[]; link?: string } {
  const count = group.rows.length;
  return {
    subject: count === 1 ? group.rows[0].subject : `${count} updates from your project`,
    heading: count === 1 ? group.rows[0].subject : 'Since yesterday',
    lines: group.rows.map((row) => (count === 1 ? row.body : `${row.subject} — ${row.body}`)),
    // One link only makes sense when there is one thing to look at.
    link: count === 1 ? (group.rows[0].link ?? undefined) : undefined,
  };
}

/**
 * Send every pending notification as one email per recipient.
 *
 * A recipient whose address has gone (a revoked portal login) has their rows
 * stamped anyway: leaving them pending would retry the same undeliverable
 * lines every day forever.
 */
export async function sendDigests(): Promise<{ recipients: number; notifications: number }> {
  const db = getDb();
  const groups = pendingByRecipient();
  let recipients = 0;
  let notifications = 0;

  for (const group of groups) {
    const email = addressFor(group.recipient_type, group.recipient_id);
    const content = digestContent(group);
    const markSent = () => {
      const now = stamp();
      const update = db.prepare('UPDATE notifications SET sent_at = ? WHERE id = ?');
      for (const row of group.rows) update.run(now, row.id);
    };

    if (!email) { markSent(); continue; }

    const sent = await deliver(email, 'digest', content.subject, {
      heading: content.heading, lines: content.lines, link: content.link,
    });
    // A failed send stays pending, so tomorrow's digest carries it rather than
    // the news being lost to one bad night for the mail server.
    if (!sent) continue;
    markSent();
    recipients += 1;
    notifications += group.rows.length;
  }

  return { recipients, notifications };
}

export function startDigestScheduler(): void {
  // 08:00 daily: a "daily digest" that lands at an unpredictable hour is not
  // one. Anyone on `immediate` has already been told and has nothing pending.
  cron.schedule('0 8 * * *', () => {
    sendDigests()
      .then(({ recipients, notifications }) => {
        if (recipients > 0) {
          console.log(`[notify] Sent ${notifications} queued notification(s) to ${recipients} recipient(s)`);
        }
      })
      .catch((err) => console.error('[notify] Digest run failed:', err?.message || err));
  });
  console.log('[notify] Daily notification digest scheduled for 08:00');
}
