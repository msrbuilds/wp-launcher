import { getDb } from '../utils/db';
import { config } from '../config';
import { sendNotificationEmail } from './email.service';

/**
 * The one place Mini CRM decides who hears about something.
 *
 * Callers say what happened and to whom; this module resolves addresses and
 * sends. Delivery failures are logged, never thrown: an email that bounces
 * must not roll back the payment proof or the message that prompted it.
 */

export interface NotificationInput {
  /** Machine-readable event name, e.g. 'proof.uploaded'. */
  kind: string;
  subject: string;
  heading: string;
  lines: string[];
  /** Path within the panel or portal, e.g. '/invoices/abc'. */
  link?: string;
}

function absolute(link?: string): string | undefined {
  if (!link) return undefined;
  return `${config.publicUrl.replace(/\/$/, '')}${link.startsWith('/') ? link : `/${link}`}`;
}

async function deliver(email: string, input: NotificationInput): Promise<void> {
  try {
    await sendNotificationEmail(email, input.subject, {
      heading: input.heading,
      lines: input.lines,
      linkUrl: absolute(input.link),
      linkLabel: input.link?.startsWith('/portal') ? 'Open your portal' : 'Open in the panel',
    });
  } catch (err: any) {
    console.error(`[notify] ${input.kind} to ${email} failed:`, err?.message || err);
  }
}

/** Tell one staff user. */
export async function notifyStaff(userId: string, input: NotificationInput): Promise<void> {
  const user = getDb().prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!user?.email) return;
  await deliver(user.email, input);
}

/**
 * Tell everyone with a working portal login for this client.
 *
 * Unverified invitees are skipped: they have no password yet, so a link into
 * the portal would only bounce them to a sign-in they cannot complete.
 */
export async function notifyClient(clientId: string, input: NotificationInput): Promise<void> {
  const recipients = getDb()
    .prepare('SELECT email FROM client_users WHERE client_id = ? AND verified = 1')
    .all(clientId) as { email: string }[];
  for (const recipient of recipients) {
    await deliver(recipient.email, input);
  }
}
