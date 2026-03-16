import crypto from 'crypto';
import { getDb } from '../utils/db';

export interface Webhook {
  id: string;
  url: string;
  events: string;
  secret: string | null;
  active: number;
  created_at: string;
}

function isWebhooksEnabled(): boolean {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'feature.webhooks'").get() as { value: string } | undefined;
  return row?.value === 'true';
}

export function listWebhooks(): Webhook[] {
  return getDb().prepare('SELECT * FROM webhooks ORDER BY created_at DESC').all() as Webhook[];
}

export function createWebhook(url: string, events: string[], secret?: string): Webhook {
  const id = crypto.randomUUID();
  const eventsStr = events.join(',');
  const webhookSecret = secret || crypto.randomBytes(16).toString('hex');
  getDb().prepare(
    'INSERT INTO webhooks (id, url, events, secret, active) VALUES (?, ?, ?, ?, 1)'
  ).run(id, url, eventsStr, webhookSecret);
  return getDb().prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as Webhook;
}

export function deleteWebhook(id: string): void {
  getDb().prepare('DELETE FROM webhooks WHERE id = ?').run(id);
}

export function toggleWebhook(id: string, active: boolean): void {
  getDb().prepare('UPDATE webhooks SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

export async function fireWebhookEvent(event: string, payload: Record<string, any>): Promise<void> {
  if (!isWebhooksEnabled()) return;

  const webhooks = getDb().prepare(
    "SELECT * FROM webhooks WHERE active = 1"
  ).all() as Webhook[];

  for (const webhook of webhooks) {
    const events = webhook.events.split(',').map(e => e.trim());
    if (!events.includes(event) && !events.includes('*')) continue;

    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });

    // Sign the payload with HMAC-SHA256
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-WPL-Event': event,
    };
    if (webhook.secret) {
      const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');
      headers['X-WPL-Signature'] = `sha256=${signature}`;
    }

    // Fire and forget — don't block on webhook delivery
    fetch(webhook.url, { method: 'POST', headers, body }).catch((err) => {
      console.error(`[webhooks] Failed to deliver ${event} to ${webhook.url}: ${err.message}`);
    });
  }
}
