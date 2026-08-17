import { Router, Response } from 'express';
import { adminAuth } from '../middleware/auth';
import { AuthRequest } from '../middleware/userAuth';
import { config } from '../config';
import { baseImageTag, parseBaseImageTag } from '../services/imageBuild.service';
import { getBuildableWpByPhp, isBuildable } from '../services/wpImageTags.service';
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
  const matrix = await getBuildableWpByPhp();
  if (!isBuildable(matrix, phpVersion, wpVersion)) {
    res.status(400).json({ error: `PHP ${phpVersion} + WordPress ${wpVersion} is not a buildable combination` });
    return;
  }
  const tag = baseImageTag(phpVersion, wpVersion);
  const job = createBuildJob({
    tag, kind: 'base', spec: { phpVersion, wpVersion }, createdBy: req.userId || 'admin',
  });
  enqueueBuild(job.id, config.wordpressDir);
  res.json({ jobId: job.id, tag });
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
  const tag = String(req.body?.tag || '');
  const spec = parseBaseImageTag(tag);
  if (!spec) {
    res.status(400).json({
      error: `${tag || 'That image'} is not a WP Launcher base image, so it cannot be rebuilt automatically. `
        + 'Custom product images are built with scripts/build-wp-image.sh.',
    });
    return;
  }
  const matrix = await getBuildableWpByPhp();
  if (!isBuildable(matrix, spec.phpVersion, spec.wpVersion)) {
    res.status(400).json({
      error: `PHP ${spec.phpVersion} + WordPress ${spec.wpVersion} is no longer buildable`,
    });
    return;
  }
  // Build under the canonical tag for those versions. For `:latest` that is the
  // default pair's tag, which the runner then re-aliases back to `:latest`.
  const buildTag = baseImageTag(spec.phpVersion, spec.wpVersion);
  const job = createBuildJob({
    tag: buildTag, kind: 'base', spec, createdBy: req.userId || 'admin',
  });
  enqueueBuild(job.id, config.wordpressDir);
  res.json({ jobId: job.id, tag: buildTag });
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
