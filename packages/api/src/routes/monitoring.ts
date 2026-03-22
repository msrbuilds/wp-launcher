import { Router, Request, Response } from 'express';
import { adminAuth } from '../middleware/auth';
import {
  getMonitoringContainers,
  getMonitoringSystem,
  getMonitoringDisk,
  removeSiteContainer,
  pruneImages,
  pruneVolumes,
  pruneBuildCache,
} from '../services/docker.service';
import { cleanupOrphanedContainers } from '../services/cleanup.service';
import { getDb } from '../utils/db';

const router = Router();
router.use(adminAuth);

// List all managed containers with DB cross-referencing
router.get('/containers', async (_req: Request, res: Response) => {
  try {
    const containers = await getMonitoringContainers();
    const db = getDb();

    // Get all non-deleted sites from DB for cross-referencing
    const sites = db.prepare(
      "SELECT id, subdomain, container_id, status, expires_at FROM sites WHERE deleted_at IS NULL"
    ).all() as { id: string; subdomain: string; container_id: string; status: string; expires_at: string }[];

    const sitesBySubdomain = new Map(sites.map(s => [s.subdomain, s]));
    const sitesByContainerId = new Map(sites.map(s => [s.container_id, s]));

    const now = new Date().toISOString();

    const result = containers.map(c => {
      const siteId = c.labels['wp-launcher.site-id'] || '';
      const site = sitesBySubdomain.get(siteId) || sitesByContainerId.get(c.idFull);

      let flag = 'normal';
      if (!site) {
        flag = 'orphaned';
      } else if (c.state !== 'running') {
        flag = 'leftover';
      } else if (site.expires_at && site.expires_at < now && site.expires_at !== '9999-12-31T23:59:59.000Z') {
        flag = 'stale';
      }

      return {
        ...c,
        siteId,
        dbStatus: site?.status || null,
        expiresAt: site?.expires_at || c.labels['wp-launcher.expires-at'] || null,
        flag,
      };
    });

    const counts = { normal: 0, stale: 0, orphaned: 0, leftover: 0 };
    for (const c of result) counts[c.flag as keyof typeof counts]++;

    res.json({ containers: result, counts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// System info
router.get('/system', async (_req: Request, res: Response) => {
  try {
    const system = await getMonitoringSystem();
    res.json(system);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Docker disk usage
router.get('/disk', async (_req: Request, res: Response) => {
  try {
    const disk = await getMonitoringDisk();
    res.json(disk);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Force remove a container
router.post('/containers/:id/force-remove', async (req: Request, res: Response) => {
  try {
    const containerId = req.params.id;
    await removeSiteContainer(containerId);

    // Update DB if this container is tracked
    const db = getDb();
    db.prepare("UPDATE sites SET status = 'expired', deleted_at = datetime('now') WHERE container_id LIKE ?")
      .run(`${containerId}%`);

    res.json({ message: 'Container removed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cleanup orphaned containers
router.post('/cleanup/orphans', async (_req: Request, res: Response) => {
  try {
    await cleanupOrphanedContainers();
    res.json({ message: 'Orphan cleanup completed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cleanup stale containers (expired in DB but still running)
router.post('/cleanup/stale', async (_req: Request, res: Response) => {
  try {
    const containers = await getMonitoringContainers();
    const db = getDb();
    const now = new Date().toISOString();

    const sites = db.prepare(
      "SELECT subdomain, container_id, expires_at FROM sites WHERE status = 'running' AND deleted_at IS NULL"
    ).all() as { subdomain: string; container_id: string; expires_at: string }[];

    const sitesBySubdomain = new Map(sites.map(s => [s.subdomain, s]));

    let removed = 0;
    for (const c of containers) {
      if (c.state !== 'running') continue;
      const siteId = c.labels['wp-launcher.site-id'] || '';
      const site = sitesBySubdomain.get(siteId);
      if (site && site.expires_at && site.expires_at < now && site.expires_at !== '9999-12-31T23:59:59.000Z') {
        try {
          await removeSiteContainer(c.idFull);
          db.prepare("UPDATE sites SET status = 'expired' WHERE subdomain = ?").run(siteId);
          removed++;
        } catch { /* skip individual failures */ }
      }
    }

    res.json({ message: `Removed ${removed} stale container(s)` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Prune images
router.post('/prune/images', async (_req: Request, res: Response) => {
  try {
    const result = await pruneImages();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Prune volumes
router.post('/prune/volumes', async (_req: Request, res: Response) => {
  try {
    const result = await pruneVolumes();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Prune build cache
router.post('/prune/buildcache', async (_req: Request, res: Response) => {
  try {
    const result = await pruneBuildCache();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
