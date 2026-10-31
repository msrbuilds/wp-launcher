import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSiteTestDb } from '../test-helpers/sites';
import { __setDbForTesting } from '../utils/db';
import { pushSelective, pullSelective } from './sync-incremental.service';

const mocks = vi.hoisted(() => ({ exec: vi.fn(), fetch: vi.fn() }));
vi.mock('./docker.service', () => ({ execWpCommands: mocks.exec }));
vi.mock('../utils/ssrf', () => ({ safeFetch: mocks.fetch }));
let db: ReturnType<typeof createSiteTestDb>;
beforeEach(() => {
  db = createSiteTestDb();
  __setDbForTesting(db);
  db.exec(`
    CREATE TABLE remote_connections (id TEXT PRIMARY KEY, url TEXT, api_key TEXT, user_id TEXT);
    CREATE TABLE sync_history (id TEXT PRIMARY KEY, site_id TEXT, remote_connection_id TEXT, direction TEXT, status TEXT, user_id TEXT, completed_at TEXT, error TEXT);
    INSERT INTO remote_connections VALUES ('remote', 'https://example.com', 'test-key', 'alice');
    INSERT INTO sites (id, subdomain, blueprint_id, user_id, expires_at, container_id) VALUES ('site', 'site', 'demo', 'alice', '2099-01-01', 'container');
  `);
  mocks.exec.mockReset().mockResolvedValue({ results: [{ exitCode: 0, output: '{"ID":1,"post_title":"Hello"}' }] });
  mocks.fetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ imported: 1, posts: [] }) });
});
afterEach(() => { __setDbForTesting(null); db.close(); });

describe.each([['push', pushSelective], ['pull', pullSelective]] as const)('selective %s', (_direction, sync) => {
  it.each([undefined, [1]])('rejects files before any writes, including mixed selections (%s)', async (content) => {
    await expect(sync('site', 'remote', content, ['plugins/example'], 'alice')).rejects.toMatchObject({ statusCode: 400 });
    expect(db.prepare('SELECT * FROM sync_history').all()).toEqual([]);
    expect(mocks.exec).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('rejects malformed file selections', async () => {
    await expect(sync('site', 'remote', [1], { length: 0 } as any, 'alice')).rejects.toMatchObject({ statusCode: 400 });
  });
  it('preserves content-only jobs', async () => {
    const job = await sync('site', 'remote', [1], [], 'alice');
    await vi.waitFor(() => expect(db.prepare('SELECT status FROM sync_history WHERE id = ?').get(job.syncId)).toEqual({ status: 'completed' }));
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it('still rejects another user’s connection', async () => {
    await expect(sync('site', 'remote', [1], [], 'bob')).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
