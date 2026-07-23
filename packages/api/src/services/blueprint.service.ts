import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { getDb } from '../utils/db';

// SBP-002: Strict slug validation to prevent path traversal
const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/i;
export function isSafeSlug(id: string): boolean {
  return SAFE_SLUG_RE.test(id) && !id.includes('..');
}

export interface BlueprintPluginConfig {
  source: 'wordpress.org' | 'url' | 'local';
  slug?: string;
  url?: string;
  path?: string;
  activate?: boolean;
}

export interface BlueprintThemeConfig {
  source: 'wordpress.org' | 'url' | 'local';
  slug?: string;
  url?: string;
  path?: string;
  activate?: boolean;
}

export interface BlueprintConfig {
  id: string;
  name: string;
  /** Offered on the public demo portal. Off unless explicitly published. */
  public?: boolean;
  wordpress?: {
    version?: string;
    locale?: string;
  };
  plugins?: {
    preinstall?: BlueprintPluginConfig[];
    remove?: string[];
  };
  themes?: {
    install?: BlueprintThemeConfig[];
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

const blueprintCache = new Map<string, BlueprintConfig>();

export function clearBlueprintCache(): void {
  blueprintCache.clear();
}

/**
 * Lookup order: cache, then the blueprints directory, then the blueprints
 * table, then `_default` as a template for unknown ids, then a bare stub.
 */
export function getBlueprint(id: string): BlueprintConfig {
  if (!isSafeSlug(id)) return undefined as any;
  if (blueprintCache.has(id)) return blueprintCache.get(id)!;

  const filePath = path.join(config.blueprintConfigsDir, `${id}.json`);
  if (fs.existsSync(filePath)) {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as BlueprintConfig;
    blueprintCache.set(id, parsed);
    return parsed;
  }

  const row = getDb().prepare('SELECT config FROM blueprints WHERE id = ?').get(id) as
    | { config: string }
    | undefined;
  if (row) {
    const parsed = JSON.parse(row.config) as BlueprintConfig;
    blueprintCache.set(id, parsed);
    return parsed;
  }

  // Unknown id: shape it from _default but keep the id the caller asked for.
  const defaultPath = path.join(config.blueprintConfigsDir, '_default.json');
  if (fs.existsSync(defaultPath)) {
    const parsed = JSON.parse(fs.readFileSync(defaultPath, 'utf-8')) as BlueprintConfig;
    parsed.id = id;
    parsed.name = id;
    return parsed;
  }

  return { id, name: id };
}

export function listBlueprints(): BlueprintConfig[] {
  const blueprints: BlueprintConfig[] = [];

  if (fs.existsSync(config.blueprintConfigsDir)) {
    const files = fs
      .readdirSync(config.blueprintConfigsDir)
      .filter((f) => f.endsWith('.json') && !f.startsWith('_'));
    for (const file of files) {
      blueprints.push(JSON.parse(fs.readFileSync(path.join(config.blueprintConfigsDir, file), 'utf-8')));
    }
  }

  const rows = getDb().prepare('SELECT config FROM blueprints').all() as { config: string }[];
  for (const row of rows) {
    const parsed = JSON.parse(row.config) as BlueprintConfig;
    if (!blueprints.find((b) => b.id === parsed.id)) blueprints.push(parsed);
  }

  return blueprints;
}

export function saveBlueprint(blueprint: BlueprintConfig): void {
  getDb()
    .prepare(
      `INSERT INTO blueprints (id, name, config, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, config = excluded.config, updated_at = datetime('now')`,
    )
    .run(blueprint.id, blueprint.name, JSON.stringify(blueprint));
  blueprintCache.set(blueprint.id, blueprint);
}
