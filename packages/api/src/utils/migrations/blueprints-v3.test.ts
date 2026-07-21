import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type Database from 'better-sqlite3';
import { createTestDb } from '../../test-helpers/db';
import {
  mergeBlueprintDirectories,
  renameProductsTable,
  renameProductIdColumns,
  repointRenamedBlueprints,
} from './blueprints-v3';

let root: string;

function write(dir: string, id: string, body: Record<string, unknown>) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, ...body }));
}

function read(dir: string, id: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wpl-bp-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('mergeBlueprintDirectories', () => {
  it('copies products and templates into one directory', () => {
    const products = path.join(root, 'products');
    const templates = path.join(root, 'templates');
    const blueprints = path.join(root, 'blueprints');
    write(products, 'demo-sqlite', { name: 'Demo' });
    write(templates, 'starter', { name: 'Starter' });

    mergeBlueprintDirectories({ products, templates, blueprints });

    expect(read(blueprints, 'demo-sqlite').name).toBe('Demo');
    expect(read(blueprints, 'starter').name).toBe('Starter');
  });

  it('copies rather than moves, so a failed upgrade leaves the originals', () => {
    const products = path.join(root, 'products');
    const blueprints = path.join(root, 'blueprints');
    write(products, 'demo-sqlite', { name: 'Demo' });

    mergeBlueprintDirectories({ products, templates: path.join(root, 'templates'), blueprints });

    expect(fs.existsSync(path.join(products, 'demo-sqlite.json'))).toBe(true);
  });

  it('carries _default across, since it is the fallback config', () => {
    const products = path.join(root, 'products');
    const blueprints = path.join(root, 'blueprints');
    write(products, '_default', { name: 'Default' });

    mergeBlueprintDirectories({ products, templates: path.join(root, 'templates'), blueprints });

    expect(fs.existsSync(path.join(blueprints, '_default.json'))).toBe(true);
  });

  it('on an id collision keeps the template and suffixes the product', () => {
    const products = path.join(root, 'products');
    const templates = path.join(root, 'templates');
    const blueprints = path.join(root, 'blueprints');
    write(products, 'starter', { name: 'Product Starter' });
    write(templates, 'starter', { name: 'Template Starter' });

    const result = mergeBlueprintDirectories({ products, templates, blueprints });

    expect(read(blueprints, 'starter').name).toBe('Template Starter');
    expect(read(blueprints, 'starter-product').name).toBe('Product Starter');
    expect(read(blueprints, 'starter-product').id).toBe('starter-product');
    expect(result.renamed).toEqual([{ from: 'starter', to: 'starter-product' }]);
  });

  it('is idempotent — a second run changes nothing', () => {
    const products = path.join(root, 'products');
    const blueprints = path.join(root, 'blueprints');
    write(products, 'demo-sqlite', { name: 'Demo' });

    mergeBlueprintDirectories({ products, templates: path.join(root, 'templates'), blueprints });
    fs.writeFileSync(path.join(blueprints, 'demo-sqlite.json'), JSON.stringify({ id: 'demo-sqlite', name: 'Edited' }));
    const second = mergeBlueprintDirectories({ products, templates: path.join(root, 'templates'), blueprints });

    expect(read(blueprints, 'demo-sqlite').name).toBe('Edited');
    expect(second.copied).toEqual([]);
  });

  it('tolerates missing source directories', () => {
    const blueprints = path.join(root, 'blueprints');
    expect(() =>
      mergeBlueprintDirectories({
        products: path.join(root, 'nope'),
        templates: path.join(root, 'also-nope'),
        blueprints,
      }),
    ).not.toThrow();
    expect(fs.existsSync(blueprints)).toBe(true);
  });
});

describe('renameProductsTable', () => {
  function seedProductsTable(db: Database.Database) {
    db.prepare(
      `CREATE TABLE products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        config TEXT NOT NULL
      )`,
    ).run();
    db.prepare("INSERT INTO products (id, name, config) VALUES ('p1', 'One', '{}')").run();
  }

  function tableNames(db: Database.Database): string[] {
    return (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map((r) => r.name);
  }

  it('renames products to blueprints, preserving rows', () => {
    const db = createTestDb();
    seedProductsTable(db);

    renameProductsTable(db);

    expect(tableNames(db)).toContain('blueprints');
    expect(tableNames(db)).not.toContain('products');
    const row = db.prepare("SELECT name FROM blueprints WHERE id = 'p1'").get() as { name: string };
    expect(row.name).toBe('One');
    db.close();
  });

  it('creates blueprints when no products table exists', () => {
    const db = createTestDb();
    renameProductsTable(db);
    expect(tableNames(db)).toContain('blueprints');
    db.close();
  });

  it('is idempotent', () => {
    const db = createTestDb();
    seedProductsTable(db);
    renameProductsTable(db);
    renameProductsTable(db);
    const row = db.prepare('SELECT COUNT(*) AS c FROM blueprints').get() as { c: number };
    expect(row.c).toBe(1);
    db.close();
  });
});

describe('renameProductIdColumns', () => {
  function columns(db: Database.Database, table: string): string[] {
    return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  }

  it('renames product_id to blueprint_id on every table that has it', () => {
    const db = createTestDb();
    renameProductIdColumns(db);
    expect(columns(db, 'sites')).toContain('blueprint_id');
    expect(columns(db, 'sites')).not.toContain('product_id');
    expect(columns(db, 'site_logs')).toContain('blueprint_id');
    db.close();
  });

  it('preserves the values', () => {
    const db = createTestDb();
    db.prepare(
      "INSERT INTO sites (id, subdomain, product_id, expires_at) VALUES ('s1', 'sub', 'demo-sqlite', '9999-12-31T23:59:59.999Z')",
    ).run();

    renameProductIdColumns(db);

    const row = db.prepare("SELECT blueprint_id FROM sites WHERE id = 's1'").get() as { blueprint_id: string };
    expect(row.blueprint_id).toBe('demo-sqlite');
    db.close();
  });

  it('is idempotent', () => {
    const db = createTestDb();
    renameProductIdColumns(db);
    expect(() => renameProductIdColumns(db)).not.toThrow();
    expect(columns(db, 'sites')).toContain('blueprint_id');
    db.close();
  });

  it('skips tables that do not exist', () => {
    const db = createTestDb();
    db.prepare('DROP TABLE site_logs').run();
    expect(() => renameProductIdColumns(db)).not.toThrow();
    db.close();
  });
});

describe('repointRenamedBlueprints', () => {
  it('moves rows that referenced a renamed product onto its new id', () => {
    const db = createTestDb();
    renameProductIdColumns(db);
    db.prepare(
      "INSERT INTO sites (id, subdomain, blueprint_id, expires_at) VALUES ('s1', 'sub', 'starter', '9999-12-31T23:59:59.999Z')",
    ).run();

    repointRenamedBlueprints(db, [{ from: 'starter', to: 'starter-product' }]);

    const row = db.prepare("SELECT blueprint_id FROM sites WHERE id = 's1'").get() as { blueprint_id: string };
    expect(row.blueprint_id).toBe('starter-product');
    db.close();
  });

  it('leaves untouched ids alone', () => {
    const db = createTestDb();
    renameProductIdColumns(db);
    db.prepare(
      "INSERT INTO sites (id, subdomain, blueprint_id, expires_at) VALUES ('s1', 'sub', 'demo-sqlite', '9999-12-31T23:59:59.999Z')",
    ).run();

    repointRenamedBlueprints(db, [{ from: 'starter', to: 'starter-product' }]);

    const row = db.prepare("SELECT blueprint_id FROM sites WHERE id = 's1'").get() as { blueprint_id: string };
    expect(row.blueprint_id).toBe('demo-sqlite');
    db.close();
  });
});
