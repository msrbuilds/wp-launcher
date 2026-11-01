import { Router, Response } from 'express';
import { adminAuth } from '../middleware/auth';
import { AuthRequest } from '../middleware/userAuth';
import { getBuildableWpByPhp } from '../services/wpImageTags.service';
import { getBuildJob, listBuildJobs } from '../services/imageBuildJob.service';
import { listImagesWithUsage, removeImageGuarded, startBaseBuild, startRebuild } from '../services/imageAdmin.service';

const router = Router();
router.use(adminAuth);

// GET / — built wp-launcher/* images, annotated with which blueprints use each.
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    res.json(await listImagesWithUsage());
  } catch {
    res.status(500).json({ error: 'Failed to list images' });
  }
});

// GET /versions — buildable PHP versions and, per PHP, the WordPress versions
// (fetched live from Docker Hub, newest first) to populate the build dialog.
router.get('/versions', async (_req: AuthRequest, res: Response) => {
  const wpByPhp = await getBuildableWpByPhp();
  res.json({ phpVersions: Object.keys(wpByPhp), wpByPhp });
});

// GET /builds — recent build jobs, metadata only (no log/spec blobs).
router.get('/builds', (_req: AuthRequest, res: Response) => {
  res.json(listBuildJobs(30).map(({ log: _log, spec: _spec, ...meta }) => meta));
});

// GET /builds/:id — one job including its live log (the poll endpoint).
router.get('/builds/:id', (req: AuthRequest, res: Response) => {
  const job = getBuildJob(req.params.id);
  if (!job) { res.status(404).json({ error: 'Build not found' }); return; }
  const { spec: _spec, ...rest } = job;
  res.json(rest);
});

// POST /builds — build a base image for a { phpVersion, wpVersion } pair.
router.post('/builds', async (req: AuthRequest, res: Response) => {
  const { phpVersion, wpVersion } = req.body || {};
  try {
    res.json(await startBaseBuild(phpVersion, wpVersion, req.userId || 'admin'));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * POST /rebuild — rebuild a base image by tag, for one-click recovery when a
 * launch fails on a missing image.
 *
 * Distinct from POST /builds, which takes versions: here the caller knows only
 * the tag it needs, so the versions are recovered from it. Refuses anything
 * that is not one of our base tags, notably custom product images, whose
 * baked-in plugins and themes a base rebuild would discard.
 */
router.post('/rebuild', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await startRebuild(String(req.body?.tag || ''), req.userId || 'admin'));
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// DELETE /:tag — remove an image. Guarded against blueprints that reference it
// unless ?force=true. The `(*)` captures slashes/colons in the tag.
router.delete('/:tag(*)', async (req: AuthRequest, res: Response) => {
  try {
    await removeImageGuarded(req.params.tag, req.query.force === 'true');
    res.json({ status: 'removed' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

export default router;
