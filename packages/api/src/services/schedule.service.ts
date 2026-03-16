import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';
import { getDb } from '../utils/db';
import { createSite } from './site.service';

export interface ScheduledLaunch {
  id: string;
  product_id: string;
  user_id: string | null;
  user_email: string | null;
  scheduled_at: string;
  config: string;
  status: string;
  site_id: string | null;
  error: string | null;
  created_at: string;
}

export function scheduleNewLaunch(
  productId: string,
  scheduledAt: string,
  userId?: string,
  userEmail?: string,
  config?: Record<string, any>,
): ScheduledLaunch {
  const db = getDb();
  const id = uuidv4();

  // Validate scheduled_at is in the future
  const scheduledDate = new Date(scheduledAt);
  if (isNaN(scheduledDate.getTime())) throw new Error('Invalid date format');
  if (scheduledDate.getTime() < Date.now()) throw new Error('Scheduled time must be in the future');

  // Max 7 days in the future
  const maxDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  if (scheduledDate.getTime() > maxDate.getTime()) throw new Error('Cannot schedule more than 7 days in advance');

  // Store in SQLite-compatible format (no T, no Z) for datetime comparison
  const sqliteDate = scheduledDate.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

  db.prepare(
    'INSERT INTO scheduled_launches (id, product_id, user_id, user_email, scheduled_at, config, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, productId, userId || null, userEmail || null, sqliteDate, JSON.stringify(config || {}), 'pending');

  return db.prepare('SELECT * FROM scheduled_launches WHERE id = ?').get(id) as ScheduledLaunch;
}

export function listScheduledLaunches(userId?: string): ScheduledLaunch[] {
  const db = getDb();
  if (userId && userId !== 'admin') {
    return db.prepare("SELECT * FROM scheduled_launches WHERE user_id = ? ORDER BY scheduled_at ASC").all(userId) as ScheduledLaunch[];
  }
  return db.prepare("SELECT * FROM scheduled_launches ORDER BY scheduled_at ASC").all() as ScheduledLaunch[];
}

export function cancelScheduledLaunch(id: string, userId?: string): void {
  const db = getDb();
  const launch = db.prepare('SELECT * FROM scheduled_launches WHERE id = ?').get(id) as ScheduledLaunch | undefined;
  if (!launch) throw new Error('Scheduled launch not found');
  if (launch.status !== 'pending') throw new Error('Can only cancel pending launches');
  if (userId && userId !== 'admin' && launch.user_id !== userId) throw new Error('Access denied');
  db.prepare("UPDATE scheduled_launches SET status = 'cancelled' WHERE id = ?").run(id);
}

async function processScheduledLaunches(): Promise<void> {
  const db = getDb();

  // Check if feature is enabled
  const flag = db.prepare("SELECT value FROM settings WHERE key = 'feature.scheduledLaunch'").get() as { value: string } | undefined;
  if (!flag || flag.value !== 'true') return;

  const due = db.prepare(
    "SELECT * FROM scheduled_launches WHERE status = 'pending' AND scheduled_at <= datetime('now')"
  ).all() as ScheduledLaunch[];

  if (due.length === 0) return;

  console.log(`[scheduler] Processing ${due.length} scheduled launch(es)`);

  for (const launch of due) {
    try {
      db.prepare("UPDATE scheduled_launches SET status = 'launching' WHERE id = ?").run(launch.id);

      const config = JSON.parse(launch.config || '{}');
      const site = await createSite({
        productId: launch.product_id,
        userId: launch.user_id || undefined,
        userEmail: launch.user_email || undefined,
        ...config,
      });

      db.prepare("UPDATE scheduled_launches SET status = 'completed', site_id = ? WHERE id = ?").run(site.id, launch.id);
      console.log(`[scheduler] Launched scheduled site: ${site.subdomain} (${launch.id})`);
    } catch (err: any) {
      db.prepare("UPDATE scheduled_launches SET status = 'failed', error = ? WHERE id = ?").run(err.message, launch.id);
      console.error(`[scheduler] Failed to launch scheduled site ${launch.id}:`, err.message);
    }
  }
}

export function startScheduleProcessor(): void {
  // Check every minute for due scheduled launches
  cron.schedule('* * * * *', async () => {
    try {
      await processScheduledLaunches();
    } catch (err) {
      console.error('[scheduler] Error processing scheduled launches:', err);
    }
  });

  console.log('[scheduler] Schedule processor started (runs every 60s)');
}
