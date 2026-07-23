import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { getDb } from '../utils/db';
import { getBool, setSetting } from './settings.service';
import { BCRYPT_ROUNDS } from './user.service';
import { ValidationError, ConflictError } from '../utils/errors';

const MIN_PASSWORD_LENGTH = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SetupInput {
  email: string;
  password: string;
  panelName?: string;
}

export interface OwnerRecord {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  verified: number;
}

/**
 * Every column that can point at a user id. The synthetic `local-user` row owns
 * rows in most of these on an upgraded local install, and several carry a
 * foreign key to users(id), so all of them must be handed over before that row
 * can be deleted.
 */
const USER_OWNED_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['sites', 'user_id'],
  ['site_logs', 'user_id'],
  ['clients', 'user_id'],
  ['projects', 'user_id'],
  ['invoices', 'user_id'],
  ['site_shares', 'owner_id'],
  ['site_shares', 'shared_with_id'],
  ['remote_connections', 'user_id'],
  ['sync_history', 'user_id'],
  ['bulk_jobs', 'user_id'],
  ['scheduled_launches', 'user_id'],
];

function hasColumn(db: ReturnType<typeof getDb>, table: string, column: string): boolean {
  // PRAGMA on a missing table returns an empty list rather than throwing.
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

export function isSetupComplete(): boolean {
  return getBool('panel.setupComplete');
}

export async function runSetup(input: SetupInput): Promise<OwnerRecord> {
  if (isSetupComplete()) {
    throw new ConflictError('Setup has already been completed');
  }
  if (!EMAIL_PATTERN.test(input.email)) {
    throw new ValidationError('A valid email address is required');
  }
  if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  // Hash outside the transaction — bcrypt is async and better-sqlite3
  // transactions must stay synchronous.
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const id = uuidv4();
  const db = getDb();

  const apply = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, email, password_hash, verified, role)
       VALUES (?, ?, ?, 1, 'owner')`,
    ).run(id, input.email, passwordHash);

    // An upgraded local install has sites, logs, clients, projects and more
    // pointing at the synthetic local-user row. Hand every one of them to the
    // real owner before dropping it, or the delete trips a foreign key.
    for (const [table, column] of USER_OWNED_COLUMNS) {
      if (!hasColumn(db, table, column)) continue;
      db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = 'local-user'`).run(id);
    }
    db.prepare("DELETE FROM users WHERE id = 'local-user'").run();
  });

  apply();

  if (input.panelName) setSetting('branding.siteTitle', input.panelName);
  setSetting('panel.setupComplete', 'true');

  return db.prepare('SELECT id, email, password_hash, role, verified FROM users WHERE id = ?').get(id) as OwnerRecord;
}
