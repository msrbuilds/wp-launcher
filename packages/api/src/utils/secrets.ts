import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const SECRETS_FILENAME = 'secrets.json';

export interface Secrets {
  jwtSecret: string;
  apiKey: string;
  provisionerKey: string;
}

const KEYS: (keyof Secrets)[] = ['jwtSecret', 'apiKey', 'provisionerKey'];

function generate(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function readExisting(file: string): Partial<Secrets> {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    // Missing or corrupt — treat as empty and regenerate below.
    return {};
  }
}

/**
 * Read `data/secrets.json`, generating any missing value and persisting the
 * result. Environment variables still win at the config layer; this only
 * supplies defaults for installs that never set them.
 */
export function ensureSecrets(dataDir: string): Secrets {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, SECRETS_FILENAME);
  const existing = readExisting(file);

  const secrets = {} as Secrets;
  let changed = false;
  for (const key of KEYS) {
    const value = existing[key];
    if (typeof value === 'string' && value.length >= 32) {
      secrets[key] = value;
    } else {
      secrets[key] = generate();
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  }
  return secrets;
}
