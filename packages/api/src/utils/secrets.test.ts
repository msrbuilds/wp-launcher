import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ensureSecrets, SECRETS_FILENAME } from './secrets';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpl-secrets-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('ensureSecrets', () => {
  it('creates a secrets file with three strong values', () => {
    const secrets = ensureSecrets(dir);
    expect(fs.existsSync(path.join(dir, SECRETS_FILENAME))).toBe(true);
    for (const key of ['jwtSecret', 'apiKey', 'provisionerKey'] as const) {
      expect(secrets[key].length, key).toBeGreaterThanOrEqual(32);
    }
  });

  it('returns the same values on a second call', () => {
    const first = ensureSecrets(dir);
    const second = ensureSecrets(dir);
    expect(second).toEqual(first);
  });

  it('generates distinct values for each secret', () => {
    const s = ensureSecrets(dir);
    expect(new Set([s.jwtSecret, s.apiKey, s.provisionerKey]).size).toBe(3);
  });

  it('backfills a single missing key without touching the others', () => {
    const first = ensureSecrets(dir);
    const file = path.join(dir, SECRETS_FILENAME);
    const partial = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete partial.apiKey;
    fs.writeFileSync(file, JSON.stringify(partial));

    const second = ensureSecrets(dir);
    expect(second.jwtSecret).toBe(first.jwtSecret);
    expect(second.provisionerKey).toBe(first.provisionerKey);
    expect(second.apiKey).not.toBe(first.apiKey);
    expect(second.apiKey.length).toBeGreaterThanOrEqual(32);
  });

  it('recovers from an unreadable secrets file by regenerating', () => {
    fs.writeFileSync(path.join(dir, SECRETS_FILENAME), 'not json at all');
    const secrets = ensureSecrets(dir);
    expect(secrets.jwtSecret.length).toBeGreaterThanOrEqual(32);
  });
});
