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
 * Lookup order: cache, then the blueprints table, then the blueprints
 * directory, then `_default` as a template for unknown ids, then a bare stub.
 *
 * The table is consulted first on purpose. Shipped blueprints exist both as
 * JSON in the checkout and, once edited in the panel, as a row. Where the
 * checkout is re-cloned on redeploy the file reverts to the version in git,
 * so preferring the file would silently discard the operator's edits.
 */
export function getBlueprint(id: string): BlueprintConfig {
  if (!isSafeSlug(id)) return undefined as any;
  if (blueprintCache.has(id)) return blueprintCache.get(id)!;

  const row = getDb().prepare('SELECT config FROM blueprints WHERE id = ?').get(id) as
    | { config: string }
    | undefined;
  if (row) {
    const parsed = JSON.parse(row.config) as BlueprintConfig;
    blueprintCache.set(id, parsed);
    return parsed;
  }

  const filePath = path.join(config.blueprintConfigsDir, `${id}.json`);
  if (fs.existsSync(filePath)) {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as BlueprintConfig;
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

/**
 * Write a blueprint's JSON next to the shipped ones, as a convenience copy.
 *
 * Best-effort by design: `saveBlueprint` has already stored the authoritative
 * copy in the database. The directory lives in the repo checkout, which some
 * platforms (Dokploy) delete and re-clone on redeploy — a container running
 * through that keeps a mount to the deleted inode and cannot write there at
 * all. Failing the request over a backup copy would be the wrong trade.
 *
 * @returns whether the file was written.
 */
export function persistBlueprintFile(blueprint: BlueprintConfig): boolean {
  try {
    fs.mkdirSync(config.blueprintConfigsDir, { recursive: true });
    fs.writeFileSync(
      path.join(config.blueprintConfigsDir, `${blueprint.id}.json`),
      JSON.stringify(blueprint, null, 2),
    );
    return true;
  } catch (err: any) {
    console.warn(
      `[blueprints] could not write ${blueprint.id}.json to ${config.blueprintConfigsDir} ` +
      `(${err.code || err.message}). The blueprint is saved in the database and remains usable; ` +
      'this usually means the checkout was re-cloned under a running container — restart the API to restore it.',
    );
    return false;
  }
}

/**
 * Record that a shipped, file-based blueprint was deleted.
 *
 * Unlinking the JSON file is not enough on platforms that re-clone the checkout
 * on redeploy — git restores the file and the blueprint reappears. The database
 * is a persistent volume, so the deletion is remembered here and applied when
 * listing. Saving a blueprint under the same id clears the record.
 */
export function recordBlueprintDeletion(id: string): void {
  getDb()
    .prepare('INSERT INTO blueprint_deletions (id) VALUES (?) ON CONFLICT(id) DO NOTHING')
    .run(id);
}

function deletedBlueprintIds(): Set<string> {
  const rows = getDb().prepare('SELECT id FROM blueprint_deletions').all() as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

export function listBlueprints(): BlueprintConfig[] {
  const blueprints: BlueprintConfig[] = [];
  const deleted = deletedBlueprintIds();

  // Database first: a shipped blueprint edited in the panel exists in both
  // places, and the file reverts to git's version on redeploy.
  const rows = getDb().prepare('SELECT config FROM blueprints').all() as { config: string }[];
  for (const row of rows) {
    blueprints.push(JSON.parse(row.config) as BlueprintConfig);
  }

  if (fs.existsSync(config.blueprintConfigsDir)) {
    const files = fs
      .readdirSync(config.blueprintConfigsDir)
      .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
      // A restored file whose deletion was recorded stays deleted.
      .filter((f) => !deleted.has(f.replace(/\.json$/, '')));
    for (const file of files) {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(config.blueprintConfigsDir, file), 'utf-8'),
      ) as BlueprintConfig;
      if (!blueprints.find((b) => b.id === parsed.id)) blueprints.push(parsed);
    }
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
  // Re-creating an id the operator previously deleted un-deletes it.
  getDb().prepare('DELETE FROM blueprint_deletions WHERE id = ?').run(blueprint.id);
  blueprintCache.set(blueprint.id, blueprint);
}
