import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

export interface MergeDirs {
  products: string;
  templates: string;
  blueprints: string;
}

export interface MergeResult {
  copied: string[];
  renamed: { from: string; to: string }[];
}

function jsonFilesIn(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
}

/**
 * Copy products/ and templates/ into blueprints/. Templates win an id
 * collision because they are the newer concept; the colliding product is
 * suffixed and its `id` field rewritten to match its new filename.
 *
 * Files are copied, not moved, so a failed upgrade leaves the originals intact.
 * Existing blueprints are never overwritten, which is what makes this idempotent.
 */
export function mergeBlueprintDirectories(dirs: MergeDirs): MergeResult {
  fs.mkdirSync(dirs.blueprints, { recursive: true });
  const result: MergeResult = { copied: [], renamed: [] };

  // Templates first so they own their ids.
  for (const file of jsonFilesIn(dirs.templates)) {
    const target = path.join(dirs.blueprints, file);
    if (fs.existsSync(target)) continue;
    fs.copyFileSync(path.join(dirs.templates, file), target);
    result.copied.push(file);
  }

  for (const file of jsonFilesIn(dirs.products)) {
    const id = path.basename(file, '.json');
    const templateClaimedIt = fs.existsSync(path.join(dirs.templates, file));
    const target = path.join(dirs.blueprints, file);

    if (!templateClaimedIt) {
      if (fs.existsSync(target)) continue;
      fs.copyFileSync(path.join(dirs.products, file), target);
      result.copied.push(file);
      continue;
    }

    const newId = `${id}-product`;
    const renamedTarget = path.join(dirs.blueprints, `${newId}.json`);
    if (fs.existsSync(renamedTarget)) continue;

    const parsed = JSON.parse(fs.readFileSync(path.join(dirs.products, file), 'utf8'));
    parsed.id = newId;
    fs.writeFileSync(renamedTarget, JSON.stringify(parsed, null, 2));
    result.copied.push(`${newId}.json`);
    result.renamed.push({ from: id, to: newId });
    console.warn(`[blueprints] id collision on "${id}" — the product was saved as "${newId}"`);
  }

  return result;
}

const BLUEPRINTS_TABLE = `
  CREATE TABLE IF NOT EXISTS blueprints (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    config TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

function hasTable(db: Database.Database, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
  return !!row;
}

export function renameProductsTable(db: Database.Database): void {
  if (hasTable(db, 'blueprints')) return;
  if (hasTable(db, 'products')) {
    db.prepare('ALTER TABLE products RENAME TO blueprints').run();
    return;
  }
  db.prepare(BLUEPRINTS_TABLE).run();
}

/** Every table that carries a blueprint reference. */
const BLUEPRINT_ID_TABLES = ['sites', 'site_logs', 'scheduled_launches', 'bulk_jobs'];

export function renameProductIdColumns(db: Database.Database): void {
  for (const table of BLUEPRINT_ID_TABLES) {
    if (!hasTable(db, table)) continue;
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    if (cols.includes('blueprint_id') || !cols.includes('product_id')) continue;
    db.prepare(`ALTER TABLE ${table} RENAME COLUMN product_id TO blueprint_id`).run();
  }
}

/**
 * When a collision forces a product to a new id, rows that referenced it must
 * follow. Before the merge a bare id resolved to the *product* (the old lookup
 * checked products/ before templates/), so those rows belong to the suffixed
 * copy, not to the template that kept the name.
 */
export function repointRenamedBlueprints(
  db: Database.Database,
  renamed: { from: string; to: string }[],
): void {
  if (renamed.length === 0) return;
  for (const table of BLUEPRINT_ID_TABLES) {
    if (!hasTable(db, table)) continue;
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes('blueprint_id')) continue;
    for (const { from, to } of renamed) {
      db.prepare(`UPDATE ${table} SET blueprint_id = ? WHERE blueprint_id = ?`).run(to, from);
    }
  }
}
