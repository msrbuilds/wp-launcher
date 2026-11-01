import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import {
  getStoredClient, markAuthorized, pruneUnauthorizedClients, registerDcrClient, resolveClient,
  sanitizeClientName, sanitizeLogoUri,
} from './clients.service';

let db: Database.Database;
beforeEach(() => { db = createTestDb(); __setDbForTesting(db); });
afterEach(() => { __setDbForTesting(null); db.close(); });

const valid = { client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] };

describe('dynamic client registration', () => {
  it('registers a public client that can be looked up again', () => {
    const client = registerDcrClient(valid);
    expect(client.client_id).toMatch(/^dcr_[0-9a-f]{32}$/);
    expect(client.kind).toBe('dcr');
    expect(getStoredClient(client.client_id)).toEqual(client);
  });

  it('refuses confidential client auth methods', () => {
    expect(() => registerDcrClient({ ...valid, token_endpoint_auth_method: 'client_secret_basic' })).toThrow(/auth method/i);
  });

  it('accepts an explicit none auth method and the two grant types', () => {
    expect(() => registerDcrClient({ ...valid, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'] })).not.toThrow();
  });

  it('refuses other grant types', () => {
    expect(() => registerDcrClient({ ...valid, grant_types: ['client_credentials'] })).toThrow(/grant type/i);
  });

  it('refuses missing or empty redirect URIs, and unacceptable ones', () => {
    expect(() => registerDcrClient({ client_name: 'x' })).toThrow(/redirect/i);
    expect(() => registerDcrClient({ ...valid, redirect_uris: [] })).toThrow(/redirect/i);
    expect(() => registerDcrClient({ ...valid, redirect_uris: ['http://evil.example/cb'] })).toThrow(/redirect/i);
  });
});

describe('hostile metadata', () => {
  it('truncates a huge client name to 100 characters', () => {
    expect(sanitizeClientName('A'.repeat(10_000))).toHaveLength(100);
  });

  it('strips control characters and falls back when nothing is left', () => {
    expect(sanitizeClientName('Bad\u0000\u0007Name')).toBe('BadName');
    expect(sanitizeClientName('\u0000')).toBe('Unnamed app');
    expect(sanitizeClientName(42)).toBe('Unnamed app');
  });

  it('keeps only https logos', () => {
    expect(sanitizeLogoUri('javascript:x')).toBeNull();
    expect(sanitizeLogoUri('http://x.example/logo.png')).toBeNull();
    expect(sanitizeLogoUri('https://x.example/logo.png')).toBe('https://x.example/logo.png');
    expect(sanitizeLogoUri(undefined)).toBeNull();
  });

  it('stores the sanitised values on registration', () => {
    const client = registerDcrClient({ ...valid, client_name: 'X'.repeat(500), logo_uri: 'javascript:x' });
    expect(client.client_name).toHaveLength(100);
    expect(client.logo_uri).toBeNull();
  });
});

describe('pruning', () => {
  it('removes DCR clients never authorised within 24h, keeps the rest', () => {
    const old = registerDcrClient(valid);
    const fresh = registerDcrClient(valid);
    const used = registerDcrClient(valid);
    db.prepare("UPDATE oauth_clients SET created_at = datetime('now','-25 hours') WHERE client_id IN (?, ?)").run(old.client_id, used.client_id);
    db.prepare("UPDATE oauth_clients SET created_at = datetime('now','-23 hours') WHERE client_id = ?").run(fresh.client_id);
    markAuthorized(used.client_id);
    expect(pruneUnauthorizedClients()).toBe(1);
    expect(getStoredClient(old.client_id)).toBeUndefined();
    expect(getStoredClient(fresh.client_id)).toBeDefined();
    expect(getStoredClient(used.client_id)).toBeDefined();
  });
});

describe('resolveClient', () => {
  const url = 'https://client.example/meta.json';
  const doc = { client_id: url, kind: 'cimd' as const, client_name: 'Meta App', logo_uri: null, redirect_uris: ['https://client.example/cb'], cacheSeconds: 3600 };

  it('fetches a CIMD client and caches it as a cimd row', async () => {
    const fetchCimd = vi.fn().mockResolvedValue(doc);
    const client = await resolveClient(url, { fetchCimd });
    expect(client).toMatchObject({ client_id: url, kind: 'cimd', client_name: 'Meta App' });
    expect(getStoredClient(url)?.kind).toBe('cimd');
  });

  it('does not refetch inside the cache window, but does after it expires', async () => {
    const fetchCimd = vi.fn().mockResolvedValue(doc);
    await resolveClient(url, { fetchCimd });
    await resolveClient(url, { fetchCimd });
    expect(fetchCimd).toHaveBeenCalledTimes(1);
    db.prepare("UPDATE oauth_clients SET metadata_expires_at = datetime('now','-1 minute') WHERE client_id = ?").run(url);
    await resolveClient(url, { fetchCimd });
    expect(fetchCimd).toHaveBeenCalledTimes(2);
  });

  it('returns null when the CIMD fetch fails', async () => {
    const fetchCimd = vi.fn().mockRejectedValue(new Error('blocked'));
    expect(await resolveClient(url, { fetchCimd })).toBeNull();
  });

  it('returns a stored DCR client and null for unknown ids', async () => {
    const client = registerDcrClient(valid);
    expect(await resolveClient(client.client_id)).toEqual(client);
    expect(await resolveClient('dcr_nope')).toBeNull();
  });

  it('never resolves a non-https URL as CIMD', async () => {
    const fetchCimd = vi.fn();
    expect(await resolveClient('http://client.example/meta.json', { fetchCimd })).toBeNull();
    expect(fetchCimd).not.toHaveBeenCalled();
  });
});
