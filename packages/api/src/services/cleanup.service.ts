import cron from 'node-cron';
import { getDb } from '../utils/db';
import { removeSiteContainer, listManagedContainers, pruneImages, pruneDatabases } from './docker.service';
import { siteDbIdentifier } from '../utils/dbIdentifier';
import { cleanupSiteDir } from './site.service';
import { removeTunnel } from './tunnel.service';
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
        await removeTunnel(site.subdomain).catch(() => {});
        await removeSiteContainer(site.container_id);
        console.log(`[cleanup] Removed container for site: ${site.subdomain}`);
      }

      cleanupSiteDir(site.subdomain);

      // Free up subdomain for reuse by appending a suffix to expired records
      const freedSubdomain = `${site.subdomain}--deleted-${Date.now()}`;
      db.prepare("UPDATE sites SET status = 'expired', deleted_at = datetime('now'), subdomain = ? WHERE id = ?").run(freedSubdomain, site.id);
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
    const liveContainerIds = new Set(containers.map(c => c.Id));

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
            const freedSub = `${siteId}--deleted-${Date.now()}`;
            db.prepare("UPDATE sites SET status = 'expired', deleted_at = datetime('now'), subdomain = ? WHERE id = ?").run(freedSub, site.id);
          }
        } catch (err) {
          console.error(`[watchdog] Failed to remove container ${siteId}:`, err);
        }
      }
    }

    // Inverse sweep: DB rows marked 'running' whose container is gone
    // (e.g. container removed manually, or DB write failed mid-delete).
    // Without this, the dashboard polls /ready forever and shows "Setting up...".
    const trackedRunning = db
      .prepare("SELECT id, subdomain, container_id FROM sites WHERE status = 'running' AND container_id IS NOT NULL")
      .all() as { id: string; subdomain: string; container_id: string }[];

    for (const site of trackedRunning) {
      if (liveContainerIds.has(site.container_id)) continue;
      const freedSub = `${site.subdomain}--orphan-${Date.now()}`;
      db.prepare("UPDATE sites SET status = 'expired', deleted_at = datetime('now'), subdomain = ? WHERE id = ?").run(freedSub, site.id);
      console.log(`[watchdog] Marked DB-orphan site as expired (container missing): ${site.subdomain}`);
    }
  } catch (err) {
    console.error('[watchdog] Error during orphan cleanup:', err);
  }

  // Prune dangling Docker images left behind by docker compose build
  try {
    await pruneImages();
  } catch (err) {
    console.error('[watchdog] Image prune error:', err);
  }

  try {
    await sweepOrphanedDatabases();
  } catch (err) {
    console.error('[watchdog] Database sweep error:', err);
  }
}

/**
 * Database identifiers every live site expects to keep.
 *
 * Includes `creating` deliberately: a site's database is provisioned before its
 * container exists, so a list derived from containers would lose that race and
 * drop a database out from under a launch in progress.
 *
 * Returns null if the query fails — the caller must then skip the sweep rather
 * than act on a partial list.
 */
export function expectedDbIdentifiers(): string[] | null {
  try {
    const rows = getDb()
      .prepare("SELECT subdomain FROM sites WHERE status IN ('running', 'creating')")
      .all() as { subdomain: string }[];
    return rows.map((r) => siteDbIdentifier(r.subdomain));
  } catch (err) {
    console.error('[watchdog] Could not enumerate sites; skipping database sweep:', err);
    return null;
  }
}

/** Reclaim databases whose site is gone. Never runs on a partial keep list. */
export async function sweepOrphanedDatabases(): Promise<void> {
  const keep = expectedDbIdentifiers();
  // A missed sweep costs disk. A sweep with a wrong list destroys customer
  // data, so an empty or failed enumeration must do nothing at all.
  if (keep === null || keep.length === 0) return;

  for (const engine of ['mariadb', 'mysql']) {
    try {
      const { dropped } = await pruneDatabases(engine, keep);
      if (dropped.length) console.log(`[watchdog] Reclaimed ${dropped.length} orphaned ${engine} database(s)`);
    } catch (err: any) {
      console.error(`[watchdog] Database sweep failed for ${engine}:`, err.message);
    }
  }
}
