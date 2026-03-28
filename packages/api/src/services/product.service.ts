import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { getDb } from '../utils/db';

// SBP-002: Strict slug validation to prevent path traversal
const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/i;
export function isSafeSlug(id: string): boolean {
  return SAFE_SLUG_RE.test(id) && !id.includes('..');
}

export interface ProductPluginConfig {
  source: 'wordpress.org' | 'url' | 'local';
  slug?: string;
  url?: string;
  path?: string;
  activate?: boolean;
}

export interface ProductThemeConfig {
  source: 'wordpress.org' | 'url' | 'local';
  slug?: string;
  url?: string;
  path?: string;
  activate?: boolean;
}

export interface ProductConfig {
  id: string;
  name: string;
  wordpress?: {
    version?: string;
    locale?: string;
  };
  plugins?: {
    preinstall?: ProductPluginConfig[];
    remove?: string[];
  };
  themes?: {
    install?: ProductThemeConfig[];
    remove?: string[];
  };
  demo?: {
    default_expiration?: string;
    max_concurrent_sites?: number;
    admin_user?: string;
    admin_email?: string;
    landing_page?: string;
    rate_limit?: {
      max_per_ip_per_hour?: number;
    };
  };
  restrictions?: {
    disable_file_mods?: boolean;
    hidden_menu_items?: string[];
    blocked_capabilities?: string[];
  };
  branding?: {
    banner_text?: string;
    logo_url?: string;
    description?: string;
    image_url?: string;
  };
  database?: 'sqlite' | 'mysql' | 'mariadb';
  docker?: {
    image?: string;
  };
}

// Cache for loaded product configs
const configCache = new Map<string, ProductConfig>();

export function getProductConfig(productId: string): ProductConfig {
  // SBP-002: Reject path traversal attempts
  if (!isSafeSlug(productId)) return undefined as any;

  // Check cache first
  if (configCache.has(productId)) {
    return configCache.get(productId)!;
  }

  // Try loading from file
  const filePath = path.join(config.productConfigsDir, `${productId}.json`);
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as ProductConfig;
    configCache.set(productId, parsed);
    return parsed;
  }

  // Try loading from DB
  const db = getDb();
  const row = db.prepare('SELECT config FROM products WHERE id = ?').get(productId) as { config: string } | undefined;
  if (row) {
    const parsed = JSON.parse(row.config) as ProductConfig;
    configCache.set(productId, parsed);
    return parsed;
  }

  // Try loading from templates directory
  const templatePath = path.join(config.templateConfigsDir, `${productId}.json`);
  if (fs.existsSync(templatePath)) {
    const raw = fs.readFileSync(templatePath, 'utf-8');
    const parsed = JSON.parse(raw) as ProductConfig;
    configCache.set(productId, parsed);
    return parsed;
  }

  // Fall back to default config
  const defaultPath = path.join(config.productConfigsDir, '_default.json');
  if (fs.existsSync(defaultPath)) {
    const raw = fs.readFileSync(defaultPath, 'utf-8');
    const parsed = JSON.parse(raw) as ProductConfig;
    // Override id/name
    parsed.id = productId;
    parsed.name = productId;
    return parsed;
  }

  // Return minimal default
  return {
    id: productId,
    name: productId,
  };
}

export function listProducts(): ProductConfig[] {
  const products: ProductConfig[] = [];

  // Load from files
  if (fs.existsSync(config.productConfigsDir)) {
    const files = fs.readdirSync(config.productConfigsDir).filter(
      (f) => f.endsWith('.json') && !f.startsWith('_'),
    );
    for (const file of files) {
      const raw = fs.readFileSync(path.join(config.productConfigsDir, file), 'utf-8');
      products.push(JSON.parse(raw));
    }
  }

  // Load from DB
  const db = getDb();
  const rows = db.prepare('SELECT config FROM products').all() as { config: string }[];
  for (const row of rows) {
    const parsed = JSON.parse(row.config) as ProductConfig;
    if (!products.find((p) => p.id === parsed.id)) {
      products.push(parsed);
    }
  }

  return products;
}

export function saveProductConfig(productConfig: ProductConfig): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO products (id, name, config, updated_at) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET name = ?, config = ?, updated_at = datetime('now')
  `).run(productConfig.id, productConfig.name, JSON.stringify(productConfig), productConfig.name, JSON.stringify(productConfig));

  // Update cache
  configCache.set(productConfig.id, productConfig);
}

export function clearConfigCache(): void {
  configCache.clear();
}

export function clearTemplateCache(): void {
  templateCache.clear();
}

// --- Templates (local mode starter configs, stored in templates/ directory) ---

const templateCache = new Map<string, ProductConfig>();

export function getTemplateConfig(templateId: string): ProductConfig | null {
  // SBP-002: Reject path traversal attempts
  if (!isSafeSlug(templateId)) return null;

  if (templateCache.has(templateId)) {
    return templateCache.get(templateId)!;
  }

  const filePath = path.join(config.templateConfigsDir, `${templateId}.json`);
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as ProductConfig;
    templateCache.set(templateId, parsed);
    return parsed;
  }

  return null;
}

export function listTemplates(): ProductConfig[] {
  const templates: ProductConfig[] = [];

  if (fs.existsSync(config.templateConfigsDir)) {
    const files = fs.readdirSync(config.templateConfigsDir).filter(
      (f) => f.endsWith('.json') && !f.startsWith('_'),
    );
    for (const file of files) {
      const raw = fs.readFileSync(path.join(config.templateConfigsDir, file), 'utf-8');
      templates.push(JSON.parse(raw));
    }
  }

  return templates;
}
