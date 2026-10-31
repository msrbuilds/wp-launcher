import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { localApiConfig } from './api-config';
import { getSites } from './docker';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpl-cli-'));
  vi.stubEnv('WPL_DIR', dir);
  vi.stubEnv('API_KEY', '');
  vi.stubEnv('API_PORT', '');
  fs.writeFileSync(path.join(dir, '.env'), 'API_KEY="install-key"\nAPI_PORT=3800\n');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('authenticated CLI site listing', () => {
  it('loads quoted installation settings and permits environment overrides', () => {
    expect(localApiConfig(dir, {})).toEqual({ apiKey: 'install-key', port: '3800' });
    expect(localApiConfig(dir, { API_KEY: 'override', API_PORT: '3900' })).toEqual({ apiKey: 'override', port: '3900' });
  });
  it('uses generated installation credentials when no API_KEY was configured', () => {
    fs.writeFileSync(path.join(dir, '.env'), '');
    fs.mkdirSync(path.join(dir, 'data'));
    fs.writeFileSync(path.join(dir, 'data', 'secrets.json'), JSON.stringify({ apiKey: 'generated-key' }));
    expect(localApiConfig(dir, {})).toEqual({ apiKey: 'generated-key', port: '3737' });
  });
  it('sends credentials, requests all sites, and normalizes the API response', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ sites: [{ id: 's1', url: 'http://site.localhost', productId: 'demo' }] }));
    vi.stubGlobal('fetch', fetcher);
    expect(await getSites()).toEqual([expect.objectContaining({ id: 's1', site_url: 'http://site.localhost', product_id: 'demo' })]);
    expect(fetcher).toHaveBeenCalledWith('http://localhost:3800/api/sites?all=true', expect.objectContaining({
      headers: { 'X-API-Key': 'install-key' }, redirect: 'error',
    }));
  });
  it('authenticates the dashboard proxy fallback as well', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('connection refused')).mockResolvedValueOnce(Response.json({ sites: [] }));
    vi.stubGlobal('fetch', fetcher);
    expect(await getSites()).toEqual([]);
    expect(fetcher).toHaveBeenLastCalledWith('http://localhost/api/sites?all=true', expect.objectContaining({ headers: { 'X-API-Key': 'install-key' }, redirect: 'error' }));
  });
  it.each([401, 403])('surfaces HTTP %s instead of reporting an empty installation', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status }));
    vi.stubGlobal('fetch', fetcher);
    await expect(getSites()).rejects.toThrow('rejected the API key');
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('does not make anonymous requests when credentials are missing', async () => {
    fs.writeFileSync(path.join(dir, '.env'), '');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(getSites()).rejects.toThrow('API key is missing');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not interpret API_PORT as a URL that could receive credentials', () => {
    expect(() => localApiConfig(dir, { API_PORT: '80@attacker.example' })).toThrow('API_PORT');
  });
});
