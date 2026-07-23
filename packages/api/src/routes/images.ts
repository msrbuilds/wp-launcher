import { Router, Response } from 'express';
import { adminAuth } from '../middleware/auth';
import { AuthRequest } from '../middleware/userAuth';
import { config } from '../config';
import { baseImageTag, validatePhpWp } from '../services/imageBuild.service';
import {
  createBuildJob, getBuildJob, listBuildJobs, enqueueBuild,
} from '../services/imageBuildJob.service';
import { listWplImages, removeImage } from '../services/docker.service';
import { listBlueprints } from '../services/blueprint.service';

const router = Router();
router.use(adminAuth);

const blueprintsUsing = (tag: string): string[] =>
  listBlueprints().filter((b) => b.docker?.image === tag).map((b) => b.id);

// GET / — built wp-launcher/* images, annotated with which blueprints use each.
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const images = await listWplImages();
    res.json(images.map((i) => ({ ...i, usedByBlueprints: blueprintsUsing(i.tag) })));
  } catch {
    res.status(500).json({ error: 'Failed to list images' });
  }
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
router.post('/builds', (req: AuthRequest, res: Response) => {
  const { phpVersion, wpVersion } = req.body || {};
  try {
    validatePhpWp(phpVersion, wpVersion);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
    return;
  }
  const tag = baseImageTag(phpVersion, wpVersion);
  const job = createBuildJob({
    tag, kind: 'base', spec: { phpVersion, wpVersion }, createdBy: req.userId || 'admin',
  });
  enqueueBuild(job.id, config.wordpressDir);
  res.json({ jobId: job.id, tag });
});

// DELETE /:tag — remove an image. Guarded against blueprints that reference it
// unless ?force=true. The `(*)` captures slashes/colons in the tag.
router.delete('/:tag(*)', async (req: AuthRequest, res: Response) => {
  const tag = req.params.tag;
  const force = req.query.force === 'true';
  if (!force) {
    const used = blueprintsUsing(tag);
    if (used.length) { res.status(409).json({ error: `In use by blueprint(s): ${used.join(', ')}` }); return; }
  }
  try {
    await removeImage(tag);
    res.json({ status: 'removed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
