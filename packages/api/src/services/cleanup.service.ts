import cron from 'node-cron';
import { getDb } from '../utils/db';
import { removeSiteContainer, listManagedContainers } from './docker.service';
import { fireWebhookEvent } from './webhook.service';

interface ExpiredSite {
  id: string;
  subdomain: string;
  container_id: string | null;
}

export function startCleanupScheduler(): void {
  // Run cleanup every minute
  cron.schedule('* * * * *', async () => {
    try {
      await cleanupExpiredSites();
    } catch (err) {
      console.error('[cleanup] Error during scheduled cleanup:', err);
    }
  });

  console.log('[cleanup] Cleanup scheduler started (runs every 60s)');

  // Run an immediate cleanup on startup
  cleanupExpiredSites().catch((err) => {
    console.error('[cleanup] Error during initial cleanup:', err);
  });
}

async function cleanupExpiredSites(): Promise<void> {
  const db = getDb();

  const expiredSites = db
    .prepare("SELECT id, subdomain, container_id FROM sites WHERE status = 'running' AND expires_at < datetime('now')")
    .all() as ExpiredSite[];

  if (expiredSites.length === 0) return;

  console.log(`[cleanup] Found ${expiredSites.length} expired site(s) to clean up`);

  for (const site of expiredSites) {
    try {
      if (site.container_id) {
        await removeSiteContainer(site.container_id);
        console.log(`[cleanup] Removed container for site: ${site.subdomain}`);
      }

      db.prepare("UPDATE sites SET status = 'expired', deleted_at = datetime('now') WHERE id = ?").run(site.id);
      console.log(`[cleanup] Marked site as expired: ${site.subdomain}`);

      fireWebhookEvent('site.expired', {
        siteId: site.id, subdomain: site.subdomain,
      }).catch(() => {});
    } catch (err) {
      console.error(`[cleanup] Failed to clean up site ${site.subdomain}:`, err);
    }
  }
}

/**
 * Watchdog: find and clean up orphaned containers that the DB doesn't know about
 * or containers whose expiry labels have passed.
 */
export async function cleanupOrphanedContainers(): Promise<void> {
  const db = getDb();

  try {
    const containers = await listManagedContainers();

    for (const container of containers) {
      const siteId = container.Labels?.['wp-launcher.site-id'];
      const expiresAtStr = container.Labels?.['wp-launcher.expires-at'];

      if (!siteId) continue;

      // Check if container is tracked in DB
      const site = db.prepare("SELECT id, status FROM sites WHERE subdomain = ?").get(siteId) as { id: string; status: string } | undefined;

      // If not in DB or already marked expired, remove the container
      const isOrphaned = !site || site.status === 'expired';
      const isExpiredByLabel = expiresAtStr && new Date(expiresAtStr).getFullYear() < 9999 && new Date(expiresAtStr).getTime() < Date.now();

      if (isOrphaned || isExpiredByLabel) {
        try {
          await removeSiteContainer(container.Id);
          console.log(`[watchdog] Removed orphaned/expired container: ${siteId}`);

          if (site && site.status !== 'expired') {
            db.prepare("UPDATE sites SET status = 'expired', deleted_at = datetime('now') WHERE id = ?").run(site.id);
          }
        } catch (err) {
          console.error(`[watchdog] Failed to remove container ${siteId}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('[watchdog] Error during orphan cleanup:', err);
  }
}
