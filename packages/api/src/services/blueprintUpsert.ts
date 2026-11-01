import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { getDb } from '../utils/db';
import { NotFoundError, ValidationError } from '../utils/errors';
import { blueprintConfigSchema } from '../utils/schemas';
import {
  clearBlueprintCache, isSafeSlug, persistBlueprintFile, recordBlueprintDeletion, saveBlueprint, type BlueprintConfig,
} from './blueprint.service';

/**
 * Blueprint validation, saving and deletion, extracted from routes/blueprints.ts
 * so the panel and the MCP admin tools apply exactly the same rules.
 */

/** Schema-validates a raw config and normalises its id to a safe slug. */
export function validateBlueprintConfig(raw: unknown): BlueprintConfig {
  const parsed = blueprintConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(`Invalid blueprint config: ${parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
  }
  const blueprint = parsed.data as BlueprintConfig;
  blueprint.id = blueprint.id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!blueprint.id) throw new ValidationError('Invalid blueprint ID');
  return blueprint;
}

/** Points local plugin/theme paths at product-assets, then saves to the DB (authoritative) and the JSON file (best-effort). */
export function saveBlueprintConfig(blueprint: BlueprintConfig): BlueprintConfig {
  for (const plugin of blueprint.plugins?.preinstall ?? []) {
    if (plugin.source === 'local' && plugin.path) plugin.path = `product-assets/${blueprint.id}/plugins/${path.basename(plugin.path)}`;
  }
  for (const theme of blueprint.themes?.install ?? []) {
    if (theme.source === 'local' && theme.path) theme.path = `product-assets/${blueprint.id}/themes/${path.basename(theme.path)}`;
  }
  saveBlueprint(blueprint);
  persistBlueprintFile(blueprint);
  clearBlueprintCache();
  return blueprint;
}

/** JSON-only create or update (no file uploads). With `id`, the stored id wins over the body's. */
export function upsertBlueprintJson(raw: unknown, opts: { id?: string } = {}): BlueprintConfig {
  const body = raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {};
  if (opts.id) body.id = opts.id;
  return saveBlueprintConfig(validateBlueprintConfig(body));
}

export function deleteBlueprint(id: string): void {
  if (!isSafeSlug(id)) throw new NotFoundError('Blueprint not found');
  const filePath = path.join(config.blueprintConfigsDir, `${id}.json`);
  const fileExists = fs.existsSync(filePath);
  const db = getDb();
  const dbExists = !!db.prepare('SELECT id FROM blueprints WHERE id = ?').get(id);
  if (!dbExists && !fileExists) throw new NotFoundError('Blueprint not found');
  if (dbExists) db.prepare('DELETE FROM blueprints WHERE id = ?').run(id);
  if (fileExists) fs.unlinkSync(filePath);
  // Unlinking is not durable where the checkout is re-cloned on redeploy, so
  // record the deletion in the database, which is a persistent volume.
  recordBlueprintDeletion(id);
  clearBlueprintCache();
}
