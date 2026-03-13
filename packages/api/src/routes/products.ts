import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { listProducts, getProductConfig, saveProductConfig, ProductConfig, clearConfigCache } from '../services/product.service';
import { config } from '../config';
import { NotFoundError, ValidationError } from '../utils/errors';
import { productConfigSchema } from '../utils/schemas';

const router = Router();

// Move file across volumes (copy + delete) since rename fails across mount points
function moveFile(src: string, dest: string) {
  fs.copyFileSync(src, dest);
  fs.unlinkSync(src);
}

function sanitizeProduct(product: ProductConfig) {
  const { docker, plugins, ...safe } = product;
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

// List all products
router.get('/', (_req: Request, res: Response) => {
  const products = listProducts();
  res.json(products.map(sanitizeProduct));
});

// Get a specific product config
router.get('/:id', (req: Request, res: Response) => {
  const product = getProductConfig(req.params.id);
  if (!product) {
    throw new NotFoundError('Product not found');
  }
  if (req.query.full === 'true') {
    res.json(product);
    return;
  }
  res.json(sanitizeProduct(product));
});

// Create or update a product (with file uploads)
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

  const parseResult = productConfigSchema.safeParse(rawConfig);
  if (!parseResult.success) {
    throw new ValidationError(`Invalid product config: ${parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
  }

  let productConfig: ProductConfig = parseResult.data as ProductConfig;

  // Sanitize ID
  productConfig.id = productConfig.id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!productConfig.id) {
    throw new ValidationError('Invalid product ID');
  }

    // Ensure product-assets directory exists
    const assetsDir = path.resolve(config.productConfigsDir, '..', 'product-assets', productConfig.id);
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
      if (!productConfig.branding) productConfig.branding = {} as any;
      (productConfig.branding as any).image_url = `/api/assets/${productConfig.id}/images/card-image${ext}`;
    }

    if (files?.card_icon?.[0]) {
      const file = files.card_icon[0];
      const ext = path.extname(file.originalname) || '.png';
      const destPath = path.join(imagesDir, `card-icon${ext}`);
      moveFile(file.path, destPath);
      if (!productConfig.branding) productConfig.branding = {} as any;
      (productConfig.branding as any).logo_url = `/api/assets/${productConfig.id}/images/card-icon${ext}`;
    }

    // Update local plugin/theme paths to use product-assets relative paths
    if (productConfig.plugins?.preinstall) {
      for (const plugin of productConfig.plugins.preinstall) {
        if (plugin.source === 'local' && plugin.path) {
          const filename = path.basename(plugin.path);
          plugin.path = `product-assets/${productConfig.id}/plugins/${filename}`;
        }
      }
    }
    if (productConfig.themes?.install) {
      for (const theme of productConfig.themes.install) {
        if (theme.source === 'local' && theme.path) {
          const filename = path.basename(theme.path);
          theme.path = `product-assets/${productConfig.id}/themes/${filename}`;
        }
      }
    }

    // Save product config to DB
    saveProductConfig(productConfig);

    // Also write a JSON file for backup/reference
    const productFilePath = path.join(config.productConfigsDir, `${productConfig.id}.json`);
    fs.mkdirSync(config.productConfigsDir, { recursive: true });
    fs.writeFileSync(productFilePath, JSON.stringify(productConfig, null, 2));

    clearConfigCache();

    res.json({ success: true, product: productConfig });
});

// Legacy PUT for simple config updates (API key protected in index.ts)
router.put('/:id', (req: Request, res: Response) => {
  const productConfig = { ...req.body, id: req.params.id };

  if (!productConfig.name) {
    throw new ValidationError('name is required');
  }

  saveProductConfig(productConfig);
  res.json(productConfig);
});

// Delete a product
router.delete('/:id', (req: Request, res: Response) => {
  const id = req.params.id;

  // Check if product exists (DB or file) before deleting
  const productFilePath = path.join(config.productConfigsDir, `${id}.json`);
  const fileExists = fs.existsSync(productFilePath);

  const db = require('../utils/db').getDb();
  const dbExists = !!db.prepare('SELECT id FROM products WHERE id = ?').get(id);

  if (!dbExists && !fileExists) {
    throw new NotFoundError('Product not found');
  }

  // Remove from DB
  if (dbExists) {
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
  }

  // Remove JSON file
  if (fileExists) {
    fs.unlinkSync(productFilePath);
  }

  clearConfigCache();

  res.json({ success: true });
});

export default router;
