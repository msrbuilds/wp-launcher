import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import Database from 'better-sqlite3';
import type { Server } from 'node:http';
import { __initSchemaForTesting, __setDbForTesting } from '../utils/db';
import { generateToken } from '../middleware/userAuth';
import { ensureHeartbeatSecret, getCloudConfig, insertHeartbeats, setCloudConfig } from '../services/productivity.service';
import { mintSiteHeartbeatToken } from '../services/siteHeartbeatToken.service';
import productivityRouter from './productivity';

// GitHub issue #13. The install-wide heartbeat secret is handed to every site
// container and printed into wp-admin, so any tenant can read it. It must never
// unlock more than ingestion and the editor status-bar total.

let db: Database.Database;
let server: Server;
let base: string;
let secret: string;
let siteToken: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/productivity', productivityRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/productivity`;
});

beforeEach(() => {
  db = new Database(':memory:');
  __initSchemaForTesting(db);
  __setDbForTesting(db);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('feature.productivityMonitor', 'true')").run();
  db.prepare("INSERT INTO users (id, email, password_hash, verified, role) VALUES ('admin-1', 'admin@example.com', 'x', 1, 'admin')").run();
  secret = ensureHeartbeatSecret();
  setCloudConfig('cloud_url', 'https://cloud.example.com');
  setCloudConfig('cloud_api_key', 'real-cloud-key');
  const now = new Date().toISOString();
  const inserted = insertHeartbeats([
    { source: 'editor', entity: 'a.ts', project: 'tenant-a', language: 'TypeScript', editor: 'vscode', time: now },
    { source: 'wordpress', entity: 'post.php', project: 'tenant-b', site_id: 'site-b', time: now },
  ]);
  expect(inserted).toBe(2);
  for (const [id, sub, status] of [['site-a', 'alpha', 'running'], ['site-old', 'old', 'expired']]) {
    db.prepare("INSERT INTO sites (id, subdomain, blueprint_id, status, expires_at) VALUES (?, ?, 'demo', ?, '2099-01-01')")
      .run(id, sub, status);
  }
  siteToken = mintSiteHeartbeatToken('site-a');
});

afterEach(() => { __setDbForTesting(null); db.close(); });
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

const withSecret = (s = secret) => ({ 'x-wpl-secret': s, 'Content-Type': 'application/json' });
const asAdmin = () => ({
  Authorization: `Bearer ${generateToken('admin-1', 'admin@example.com', 'admin')}`,
  'Content-Type': 'application/json',
});

async function call(method: string, path: string, headers: Record<string, string> = {}, body?: unknown) {
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}

/** Every route the router declares, so a route added later is covered without editing this test. */
function declaredRoutes(): { method: string; path: string }[] {
  const out: { method: string; path: string }[] = [];
  for (const layer of (productivityRouter as any).stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) out.push({ method: method.toUpperCase(), path: layer.route.path });
  }
  return out;
}

// The only routes a machine client may reach without a panel session.
const MACHINE_ROUTES = new Set(['POST /heartbeats', 'GET /cloud/status', 'GET /stats/today']);

describe('the heartbeat secret is not a panel credential (#13)', () => {
  const guarded = declaredRoutes().filter((r) => !MACHINE_ROUTES.has(`${r.method} ${r.path}`));

  it('covers the routes the router actually declares', () => {
    expect(guarded.length).toBeGreaterThan(20);
  });

  it.each(guarded)('$method $path answers a secret-only caller exactly as an anonymous one', async ({ method, path }) => {
    const anonymous = await call(method, path);
    const secretOnly = await call(method, path, withSecret());
    const siteTokenOnly = await call(method, path, withSecret(siteToken));
    expect(anonymous.status).toBe(401);
    expect(secretOnly.status).toBe(anonymous.status);
    expect(secretOnly.text).toBe(anonymous.text);
    expect(siteTokenOnly.status).toBe(anonymous.status);
    expect(siteTokenOnly.text).toBe(anonymous.text);
  });

  it('cannot read cross-tenant breakdowns', async () => {
    expect((await call('GET', '/stats/sources', withSecret())).status).toBe(401);
    expect((await call('GET', '/stats/projects', withSecret())).status).toBe(401);
  });

  it('cannot read the cloud API key', async () => {
    const r = await call('GET', '/cloud/config', withSecret());
    expect(r.status).toBe(401);
    expect(r.text).not.toContain('real-cloud-key');
  });

  it('cannot wipe productivity data', async () => {
    expect((await call('DELETE', '/data', withSecret())).status).toBe(401);
    expect((db.prepare('SELECT COUNT(*) AS n FROM productivity_heartbeats').get() as { n: number }).n).toBe(2);
  });

  it('cannot redirect cloud sync to another URL', async () => {
    expect((await call('PUT', '/cloud/config', withSecret(), { cloud_url: 'https://attacker.example', cloud_api_key: 'k' })).status).toBe(401);
    expect(getCloudConfig().cloud_url).toBe('https://cloud.example.com');
  });

  it('cannot rotate the secret and lock everyone out', async () => {
    expect((await call('POST', '/secret/rotate', withSecret())).status).toBe(401);
    expect(getCloudConfig().heartbeat_secret).toBe(secret);
  });
});

describe('per-site heartbeat tokens (#13 follow-up)', () => {
  const post = (body: unknown) => call('POST', '/heartbeats', { 'Content-Type': 'application/json' }, body);
  const lastRow = () => db.prepare('SELECT * FROM productivity_heartbeats ORDER BY id DESC LIMIT 1').get() as Record<string, unknown>;

  it("files a site's heartbeats under that site, whatever it claims", async () => {
    const r = await post({ secret: siteToken, heartbeats: [{
      source: 'editor', entity: 'post.php', entity_type: 'wp-screen', category: 'editing', is_write: true,
      site_id: 'beta', project: 'tenant-b', machine_id: 'victim-laptop', editor: 'vscode', language: 'PHP', branch: 'main',
      time: new Date().toISOString(),
    }] });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ received: 1 });
    expect(lastRow()).toMatchObject({
      source: 'wordpress', site_id: 'alpha', project: 'alpha', machine_id: 'site:alpha',
      editor: null, language: null, branch: null,
      entity: 'post.php', entity_type: 'wp-screen', category: 'editing', is_write: 1,
    });
  });

  it("cannot suppress another client's heartbeats through the duplicate check", async () => {
    const t = new Date().toISOString();
    await post({ secret: siteToken, heartbeats: [{ source: 'editor', entity: 'a.ts', machine_id: 'victim-laptop', time: t }] });
    const editor = await post({ secret, heartbeats: [{ source: 'editor', entity: 'a.ts', machine_id: 'victim-laptop', project: 'tenant-a', time: t }] });
    expect(editor.json).toEqual({ received: 1 });
  });

  it("rejects a token once its site has stopped", async () => {
    db.prepare("UPDATE sites SET status = 'expired' WHERE id = 'site-a'").run();
    expect((await post({ secret: siteToken, heartbeats: [{ source: 'wordpress', entity: 'x', time: new Date().toISOString() }] })).status).toBe(401);
  });

  it('rejects an unknown token', async () => {
    expect((await post({ secret: 'wplhb_forged', heartbeats: [{ source: 'wordpress', entity: 'x', time: new Date().toISOString() }] })).status).toBe(401);
  });
});

describe('what the heartbeat secret still does', () => {
  it('ingests heartbeats', async () => {
    const r = await call('POST', '/heartbeats', { 'Content-Type': 'application/json' }, {
      secret, heartbeats: [{ source: 'editor', entity: 'b.ts', project: 'tenant-a', time: new Date().toISOString() }],
    });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ received: 1 });
  });

  it("gives editor status bars today's totals and nothing else", async () => {
    const r = await call('GET', '/stats/today', withSecret());
    expect(r.status).toBe(200);
    // Exactly what the VS Code, JetBrains and Sublime clients parse: no
    // per-project, per-language or per-site breakdown reaches a tenant.
    expect(Object.keys(r.json).sort()).toEqual(['goal', 'heartbeatCount', 'totalSeconds']);
    expect(r.text).not.toContain('tenant-a');
    expect(r.text).not.toContain('site-b');
  });

  it('rejects a wrong secret on the status-bar route', async () => {
    expect((await call('GET', '/stats/today', withSecret('not-the-secret'))).status).toBe(401);
  });

  it('does not give a site token even the status-bar totals', async () => {
    expect((await call('GET', '/stats/today', withSecret(siteToken))).status).toBe(401);
  });

  it('answers 403 on the status-bar route while the feature is off', async () => {
    db.prepare("UPDATE settings SET value = 'false' WHERE key = 'feature.productivityMonitor'").run();
    expect((await call('GET', '/stats/today', withSecret())).status).toBe(403);
  });

  it('leaves the full breakdown to signed-in admins', async () => {
    const r = await call('GET', '/stats/today', asAdmin());
    expect(r.status).toBe(200);
    expect(r.json).toHaveProperty('byProject');
    expect(r.json).toHaveProperty('streak');
  });
});
