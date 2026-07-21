import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { listBlueprints, getBlueprint, saveBlueprint, BlueprintConfig, clearBlueprintCache, isSafeSlug } from '../services/blueprint.service';
import { config } from '../config';
import { NotFoundError, ValidationError } from '../utils/errors';
import { blueprintConfigSchema } from '../utils/schemas';

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

  const parseResult = blueprintConfigSchema.safeParse(rawConfig);
  if (!parseResult.success) {
    throw new ValidationError(`Invalid blueprint config: ${parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
  }

  let blueprintConfig: BlueprintConfig = parseResult.data as BlueprintConfig;

  // Sanitize ID
  blueprintConfig.id = blueprintConfig.id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!blueprintConfig.id) {
    throw new ValidationError('Invalid blueprint ID');
  }

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

    // Update local plugin/theme paths to use product-assets relative paths
    if (blueprintConfig.plugins?.preinstall) {
      for (const plugin of blueprintConfig.plugins.preinstall) {
        if (plugin.source === 'local' && plugin.path) {
          const filename = path.basename(plugin.path);
          plugin.path = `product-assets/${blueprintConfig.id}/plugins/${filename}`;
        }
      }
    }
    if (blueprintConfig.themes?.install) {
      for (const theme of blueprintConfig.themes.install) {
        if (theme.source === 'local' && theme.path) {
          const filename = path.basename(theme.path);
          theme.path = `product-assets/${blueprintConfig.id}/themes/${filename}`;
        }
      }
    }

    // Save blueprint config to DB
    saveBlueprint(blueprintConfig);

    // Also write a JSON file for backup/reference
    const blueprintFilePath = path.join(config.blueprintConfigsDir, `${blueprintConfig.id}.json`);
    fs.mkdirSync(config.blueprintConfigsDir, { recursive: true });
    fs.writeFileSync(blueprintFilePath, JSON.stringify(blueprintConfig, null, 2));

    clearBlueprintCache();

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
  const id = req.params.id;
  // SBP-002: Validate slug before filesystem operations
  if (!isSafeSlug(id)) throw new NotFoundError('Blueprint not found');

  // Check if the blueprint exists (DB or file) before deleting
  const blueprintFilePath = path.join(config.blueprintConfigsDir, `${id}.json`);
  const fileExists = fs.existsSync(blueprintFilePath);

  const db = require('../utils/db').getDb();
  const dbExists = !!db.prepare('SELECT id FROM blueprints WHERE id = ?').get(id);

  if (!dbExists && !fileExists) {
    throw new NotFoundError('Blueprint not found');
  }

  // Remove from DB
  if (dbExists) {
    db.prepare('DELETE FROM blueprints WHERE id = ?').run(id);
  }

  // Remove JSON file
  if (fileExists) {
    fs.unlinkSync(blueprintFilePath);
  }

  clearBlueprintCache();

  res.json({ success: true });
});

export default router;
