import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { listBlueprints, getBlueprint, saveBlueprint, BlueprintConfig } from '../services/blueprint.service';
import { config } from '../config';
import { NotFoundError, ValidationError } from '../utils/errors';
import { deleteBlueprint, saveBlueprintConfig, validateBlueprintConfig } from '../services/blueprintUpsert';

const router = Router();

// Move file across volumes (copy + delete) since rename fails across mount points
function moveFile(src: string, dest: string) {
  fs.copyFileSync(src, dest);
  fs.unlinkSync(src);
}

function sanitizeBlueprint(blueprint: BlueprintConfig) {
  const { docker, plugins, ...safe } = blueprint;
  if (safe.demo) {
    const { admin_email, ...safeDemoFields } = safe.demo;
    safe.demo = safeDemoFields;
  }
  return safe;
}

// Multer: store uploads in a temp dir, then move to correct location
const uploadDir = path.join(config.dataDir, 'uploads-tmp');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 100 * 1024 * 1024 } });

// List all blueprints
router.get('/', (_req: Request, res: Response) => {
  const blueprints = listBlueprints();
  res.json(blueprints.map(sanitizeBlueprint));
});

// Get a specific blueprint
router.get('/:id', (req: Request, res: Response) => {
  const blueprint = getBlueprint(req.params.id);
  if (!blueprint) {
    throw new NotFoundError('Blueprint not found');
  }
  if (req.query.full === 'true') {
    res.json(blueprint);
    return;
  }
  res.json(sanitizeBlueprint(blueprint));
});

// Create or update a blueprint (with file uploads)
// Accepts multipart form: "config" (JSON string) + "plugin_files" + "theme_files" + "card_image" + "card_icon"
router.post('/', upload.fields([
  { name: 'plugin_files', maxCount: 20 },
  { name: 'theme_files', maxCount: 20 },
  { name: 'card_image', maxCount: 1 },
  { name: 'card_icon', maxCount: 1 },
]), (req: Request, res: Response) => {
  const configStr = req.body.config;
  if (!configStr) {
    throw new ValidationError('config field is required (JSON string)');
  }

  let rawConfig: any;
  try {
    rawConfig = JSON.parse(configStr);
  } catch {
    throw new ValidationError('Invalid JSON in config field');
  }

  let blueprintConfig: BlueprintConfig = validateBlueprintConfig(rawConfig);

    // Ensure product-assets directory exists
    const assetsDir = path.resolve(config.blueprintConfigsDir, '..', 'product-assets', blueprintConfig.id);
    const pluginsDir = path.join(assetsDir, 'plugins');
    const themesDir = path.join(assetsDir, 'themes');
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.mkdirSync(themesDir, { recursive: true });

    // Process uploaded plugin files
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const ALLOWED_UPLOAD_EXTS = ['.zip', '.tar', '.gz', '.php'];
    if (files?.plugin_files) {
      for (const file of files.plugin_files) {
        const basename = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
        const ext = path.extname(basename).toLowerCase();
        const safeName = ALLOWED_UPLOAD_EXTS.includes(ext) ? basename : basename + '.zip';
        const destPath = path.join(pluginsDir, safeName);
        moveFile(file.path, destPath);
      }
    }

    // Process uploaded theme files
    if (files?.theme_files) {
      for (const file of files.theme_files) {
        const basename = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
        const ext = path.extname(basename).toLowerCase();
        const safeName = ALLOWED_UPLOAD_EXTS.includes(ext) ? basename : basename + '.zip';
        const destPath = path.join(themesDir, safeName);
        moveFile(file.path, destPath);
      }
    }

    // Process uploaded images (card_image, card_icon)
    const imagesDir = path.join(assetsDir, 'images');
    fs.mkdirSync(imagesDir, { recursive: true });

    const ALLOWED_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    if (files?.card_image?.[0]) {
      const file = files.card_image[0];
      const rawExt = path.extname(file.originalname).toLowerCase();
      const ext = ALLOWED_IMAGE_EXTS.includes(rawExt) ? rawExt : '.png';
      const destPath = path.join(imagesDir, `card-image${ext}`);
      moveFile(file.path, destPath);
      if (!blueprintConfig.branding) blueprintConfig.branding = {} as any;
      (blueprintConfig.branding as any).image_url = `/api/assets/${blueprintConfig.id}/images/card-image${ext}`;
    }

    if (files?.card_icon?.[0]) {
      const file = files.card_icon[0];
      const rawExt = path.extname(file.originalname).toLowerCase();
      const ext = ALLOWED_IMAGE_EXTS.includes(rawExt) ? rawExt : '.png';
      const destPath = path.join(imagesDir, `card-icon${ext}`);
      moveFile(file.path, destPath);
      if (!blueprintConfig.branding) blueprintConfig.branding = {} as any;
      (blueprintConfig.branding as any).logo_url = `/api/assets/${blueprintConfig.id}/images/card-icon${ext}`;
    }

    // Rewrites local paths, saves to the DB and writes the best-effort JSON copy.
    blueprintConfig = saveBlueprintConfig(blueprintConfig);

    res.json({ success: true, blueprint: blueprintConfig });
});

// Legacy PUT for simple config updates (API key protected in index.ts)
router.put('/:id', (req: Request, res: Response) => {
  const blueprintConfig = { ...req.body, id: req.params.id };

  if (!blueprintConfig.name) {
    throw new ValidationError('name is required');
  }

  saveBlueprint(blueprintConfig);
  res.json(blueprintConfig);
});

// Delete a blueprint
router.delete('/:id', (req: Request, res: Response) => {
  deleteBlueprint(req.params.id);
  res.json({ success: true });
});

export default router;
