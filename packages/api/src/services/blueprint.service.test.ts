import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';

let dir: string;
let db: Database.Database;

vi.mock('../config', async () => {
  const actual = await vi.importActual<typeof import('../config')>('../config');
  return {
    ...actual,
    config: { ...actual.config, get blueprintConfigsDir() { return process.env.__TEST_BP_DIR!; } },
  };
});

async function loadService() {
  const mod = await import('./blueprint.service');
  mod.clearBlueprintCache();
  return mod;
}

function write(id: string, body: Record<string, unknown>) {
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, ...body }));
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpl-bpsvc-'));
  process.env.__TEST_BP_DIR = dir;
  db = createTestDb();
  // Mirrors the real schema from blueprints-v3.ts — saveBlueprint writes updated_at.
  db.prepare(
    `CREATE TABLE blueprints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ).run();
  db.prepare(
    `CREATE TABLE blueprint_deletions (
      id TEXT PRIMARY KEY,
      deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ).run();
  __setDbForTesting(db);
});

afterEach(() => {
  __setDbForTesting(null);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.__TEST_BP_DIR;
});

describe('persistBlueprintFile', () => {
  it('writes the blueprint JSON alongside the shipped ones', async () => {
    const { persistBlueprintFile } = await loadService();
    expect(persistBlueprintFile({ id: 'mine', name: 'Mine' } as any)).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'mine.json'), 'utf-8')).name).toBe('Mine');
  });

  it('reports failure instead of throwing when the directory cannot be written', async () => {
    // Dokploy re-clones code/ on redeploy, so a container that keeps running
    // holds a mount to the deleted inode and cannot write there. The file is a
    // convenience copy — the database is the source of truth — so a failure
    // here must not fail the request.
    const blocker = path.join(dir, 'blocker');
    fs.writeFileSync(blocker, 'not a directory');
    process.env.__TEST_BP_DIR = path.join(blocker, 'nested');
    const { persistBlueprintFile } = await loadService();
    expect(persistBlueprintFile({ id: 'mine', name: 'Mine' } as any)).toBe(false);
  });
});

describe('blueprint tombstones', () => {
  // Deleting a shipped blueprint removes its JSON file, but on Dokploy the
  // checkout is re-cloned from git on every redeploy and the file comes back.
  // The database survives, so the deletion is recorded there.
  it('hides a file-based blueprint whose deletion was recorded', async () => {
    write('demo-sqlite', { name: 'Demo SQLite' });
    write('demo-mysql', { name: 'Demo MySQL' });
    const { listBlueprints, recordBlueprintDeletion } = await loadService();

    expect(listBlueprints().map((b) => b.id).sort()).toEqual(['demo-mysql', 'demo-sqlite']);

    recordBlueprintDeletion('demo-sqlite');
    const { listBlueprints: listAgain } = await loadService();
    expect(listAgain().map((b) => b.id)).toEqual(['demo-mysql']);
  });

  it('keeps hiding it after the file is restored, as a redeploy would', async () => {
    write('demo-sqlite', { name: 'Demo SQLite' });
    const { recordBlueprintDeletion } = await loadService();
    recordBlueprintDeletion('demo-sqlite');
    fs.rmSync(path.join(dir, 'demo-sqlite.json'));

    // git restores it
    write('demo-sqlite', { name: 'Demo SQLite' });

    const { listBlueprints } = await loadService();
    expect(listBlueprints().map((b) => b.id)).toEqual([]);
  });

  it('resurrects the id when a blueprint is saved under it again', async () => {
    write('demo-sqlite', { name: 'Demo SQLite' });
    const { recordBlueprintDeletion, saveBlueprint } = await loadService();
    recordBlueprintDeletion('demo-sqlite');

    saveBlueprint({ id: 'demo-sqlite', name: 'My Own SQLite' } as any);

    const { listBlueprints } = await loadService();
    const found = listBlueprints().filter((b) => b.id === 'demo-sqlite');
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe('My Own SQLite');
  });

  it('does not hide a database-backed blueprint of the same id', async () => {
    const { recordBlueprintDeletion, saveBlueprint, listBlueprints } = await loadService();
    saveBlueprint({ id: 'custom', name: 'Custom' } as any);
    recordBlueprintDeletion('other');
    expect(listBlueprints().map((b) => b.id)).toEqual(['custom']);
  });
});

describe('blueprint.service', () => {
  it('lists file-based blueprints', async () => {
    write('demo', { name: 'Demo' });
    const { listBlueprints } = await loadService();
    expect(listBlueprints().map((b) => b.id)).toEqual(['demo']);
  });

  it('hides underscore-prefixed blueprints from listings', async () => {
    write('_default', { name: 'Default' });
    write('demo', { name: 'Demo' });
    const { listBlueprints } = await loadService();
    expect(listBlueprints().map((b) => b.id)).toEqual(['demo']);
  });

  it('falls back to _default for an unknown id, keeping the requested id', async () => {
    write('_default', { name: 'Default', database: 'sqlite' });
    const { getBlueprint } = await loadService();
    const resolved = getBlueprint('never-heard-of-it');
    expect(resolved.id).toBe('never-heard-of-it');
    expect(resolved.database).toBe('sqlite');
  });

  it('returns a minimal stub when there is no _default', async () => {
    const { getBlueprint } = await loadService();
    expect(getBlueprint('anything')).toEqual({ id: 'anything', name: 'anything' });
  });

  it('rejects path traversal ids', async () => {
    const { getBlueprint } = await loadService();
    expect(getBlueprint('../../etc/passwd')).toBeUndefined();
  });

  it('reads DB-stored blueprints and lists them alongside files', async () => {
    write('from-file', { name: 'File' });
    db.prepare("INSERT INTO blueprints (id, name, config) VALUES ('from-db', 'Db', ?)")
      .run(JSON.stringify({ id: 'from-db', name: 'Db' }));
    const { listBlueprints, getBlueprint } = await loadService();
    expect(listBlueprints().map((b) => b.id).sort()).toEqual(['from-db', 'from-file']);
    expect(getBlueprint('from-db').name).toBe('Db');
  });

  it('saves to the DB and serves the saved copy', async () => {
    const { saveBlueprint, getBlueprint } = await loadService();
    saveBlueprint({ id: 'saved', name: 'Saved' });
    expect(getBlueprint('saved').name).toBe('Saved');
    const row = db.prepare("SELECT name FROM blueprints WHERE id = 'saved'").get() as { name: string };
    expect(row.name).toBe('Saved');
  });
});
