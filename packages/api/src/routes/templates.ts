import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { listTemplates, getTemplateConfig, ProductConfig, clearTemplateCache } from '../services/product.service';
import { config } from '../config';
import { NotFoundError, ValidationError } from '../utils/errors';
import { productConfigSchema } from '../utils/schemas';

const router = Router();

// Move file across volumes (copy + delete) since rename fails across mount points
function moveFile(src: string, dest: string) {
  fs.copyFileSync(src, dest);
  fs.unlinkSync(src);
}

function sanitizeTemplate(template: ProductConfig) {
  const { docker, plugins, ...safe } = template;
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

// List all templates
router.get('/', (_req: Request, res: Response) => {
  const templates = listTemplates();
  res.json(templates.map(sanitizeTemplate));
});

// Get a specific template (full config for editing)
router.get('/:id', (req: Request, res: Response) => {
  const template = getTemplateConfig(req.params.id);
  if (!template) {
    throw new NotFoundError('Template not found');
  }
  // Return full config (including plugins) for the editor
  if (req.query.full === 'true') {
    res.json(template);
    return;
  }
  res.json(sanitizeTemplate(template));
});

// Create or update a template
// Accepts multipart form: "config" (JSON string) + "plugin_files" + "theme_files" (zip uploads) + "card_image" + "card_icon" (image uploads)
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

  const parseResult = productConfigSchema.safeParse(rawConfig);
  if (!parseResult.success) {
    throw new ValidationError(`Invalid template config: ${parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
  }

  let templateConfig: ProductConfig = parseResult.data as ProductConfig;

  // Sanitize ID: lowercase, alphanumeric + hyphens only
  templateConfig.id = templateConfig.id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!templateConfig.id) {
    throw new ValidationError('Invalid template ID');
  }

  // Ensure product-assets directory exists
  const assetsDir = path.resolve(config.templateConfigsDir, '..', 'product-assets', templateConfig.id);
  const pluginsDir = path.join(assetsDir, 'plugins');
  const themesDir = path.join(assetsDir, 'themes');
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.mkdirSync(themesDir, { recursive: true });

  // Process uploaded plugin files
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  if (files?.plugin_files) {
    for (const file of files.plugin_files) {
      const destPath = path.join(pluginsDir, path.basename(file.originalname));
      moveFile(file.path, destPath);
    }
  }

  // Process uploaded theme files
  if (files?.theme_files) {
    for (const file of files.theme_files) {
      const destPath = path.join(themesDir, path.basename(file.originalname));
      moveFile(file.path, destPath);
    }
  }

  // Process uploaded images (card_image, card_icon)
  const imagesDir = path.join(assetsDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  if (files?.card_image?.[0]) {
    const file = files.card_image[0];
    const ext = path.extname(file.originalname) || '.png';
    const destPath = path.join(imagesDir, `card-image${ext}`);
    moveFile(file.path, destPath);
    // Set the branding image_url to the served path
    if (!templateConfig.branding) templateConfig.branding = {} as any;
    (templateConfig.branding as any).image_url = `/api/assets/${templateConfig.id}/images/card-image${ext}`;
  }

  if (files?.card_icon?.[0]) {
    const file = files.card_icon[0];
    const ext = path.extname(file.originalname) || '.png';
    const destPath = path.join(imagesDir, `card-icon${ext}`);
    moveFile(file.path, destPath);
    if (!templateConfig.branding) templateConfig.branding = {} as any;
    (templateConfig.branding as any).logo_url = `/api/assets/${templateConfig.id}/images/card-icon${ext}`;
  }

  // Update local plugin/theme paths to use product-assets relative paths
  if (templateConfig.plugins?.preinstall) {
    for (const plugin of templateConfig.plugins.preinstall) {
      if (plugin.source === 'local' && plugin.path) {
        // Normalize: ensure path points into product-assets/<id>/plugins/
        const filename = path.basename(plugin.path);
        plugin.path = `product-assets/${templateConfig.id}/plugins/${filename}`;
      }
    }
  }
  if (templateConfig.themes?.install) {
    for (const theme of templateConfig.themes.install) {
      if (theme.source === 'local' && theme.path) {
        const filename = path.basename(theme.path);
        theme.path = `product-assets/${templateConfig.id}/themes/${filename}`;
      }
    }
  }

  // Write the template JSON file
  const templatePath = path.join(config.templateConfigsDir, `${templateConfig.id}.json`);
  fs.mkdirSync(config.templateConfigsDir, { recursive: true });
  fs.writeFileSync(templatePath, JSON.stringify(templateConfig, null, 2));

  // Clear cache so changes are picked up
  clearTemplateCache();

  res.json({ success: true, template: templateConfig });
});

// Delete a template
router.delete('/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const templatePath = path.join(config.templateConfigsDir, `${id}.json`);
  if (!fs.existsSync(templatePath)) {
    throw new NotFoundError('Template not found');
  }
  fs.unlinkSync(templatePath);
  clearTemplateCache();
  res.json({ success: true });
});

export default router;
