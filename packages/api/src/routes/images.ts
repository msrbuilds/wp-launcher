import { Router, Response } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { adminAuth } from '../middleware/auth';
import { AuthRequest } from '../middleware/userAuth';
import { config } from '../config';
import { sanitizeImageTag, baseImageTag, ALL_PHP_VERSIONS, BuildSource } from '../services/imageBuild.service';
import {
  createBuildJob, getBuildJob, listBuildJobs, enqueueBuild, makeTempContextDir,
} from '../services/imageBuildJob.service';
import { listWplImages, removeImage } from '../services/docker.service';
import { listBlueprints } from '../services/blueprint.service';

const router = Router();
router.use(adminAuth);

const uploadDir = path.join(config.dataDir, 'uploads-tmp');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 100 * 1024 * 1024 } });

const isPhp = (v: unknown): boolean => ALL_PHP_VERSIONS.includes(v as (typeof ALL_PHP_VERSIONS)[number]);
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

// POST /builds — start a build. Multipart: a `spec` JSON part plus optional
// plugin_files / theme_files zips (matching each 'local' source in order).
router.post('/builds', upload.fields([
  { name: 'plugin_files', maxCount: 20 },
  { name: 'theme_files', maxCount: 20 },
]), (req: AuthRequest, res: Response) => {
  let spec: any;
  try { spec = JSON.parse(req.body.spec); } catch { res.status(400).json({ error: 'Invalid spec JSON' }); return; }

  if (spec.kind === 'base') {
    if (!isPhp(spec.phpVersion)) { res.status(400).json({ error: 'Unsupported PHP version' }); return; }
    const job = createBuildJob({ tag: baseImageTag(spec.phpVersion), kind: 'base', spec, createdBy: req.userId || 'admin' });
    enqueueBuild(job.id, config.wordpressDir);
    res.json({ jobId: job.id, tag: job.tag });
    return;
  }

  // custom
  let tag: string;
  try { tag = sanitizeImageTag(spec.name, spec.tag); } catch (e: any) { res.status(400).json({ error: e.message }); return; }
  if (!isPhp(spec.phpVersion)) { res.status(400).json({ error: 'Unsupported PHP version' }); return; }

  // Place uploaded zips into a fresh context dir and rewrite 'local' sources to filenames.
  const ctx = makeTempContextDir();
  const files = req.files as { [f: string]: Express.Multer.File[] } | undefined;
  const place = (list: BuildSource[], uploaded?: Express.Multer.File[]): BuildSource[] => {
    let u = 0;
    return (list || []).map((s) => {
      if (s.source !== 'local') return s;
      const f = uploaded?.[u++];
      if (!f) return { source: 'local' };
      const name = path.basename(f.originalname).replace(/[^a-z0-9._-]/gi, '_');
      fs.copyFileSync(f.path, path.join(ctx, name));
      fs.unlinkSync(f.path);
      return { source: 'local', filename: name };
    });
  };
  const finalSpec = {
    kind: 'custom' as const, name: spec.name, tag: spec.tag, phpVersion: spec.phpVersion,
    plugins: place(spec.plugins, files?.plugin_files),
    themes: place(spec.themes, files?.theme_files),
  };
  const job = createBuildJob({ tag, kind: 'custom', spec: finalSpec, createdBy: req.userId || 'admin' });
  enqueueBuild(job.id, config.wordpressDir, ctx);
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
