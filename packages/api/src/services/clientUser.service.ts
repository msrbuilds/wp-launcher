import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../utils/db';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors';

const BCRYPT_ROUNDS = 10;
const INVITE_HOURS = 72;
const MIN_PASSWORD = 8;

export interface ClientUserRecord {
  id: string;
  client_id: string;
  email: string;
  password_hash: string;
  verified: number;
  invite_token: string | null;
  invite_expires_at: string | null;
  token_version: number;
  last_login_at: string | null;
  created_at: string;
}

const stamp = (d = new Date()) => d.toISOString().replace('Z', '').replace(/\.\d+/, '');

/** A client belongs to one staff user; its portal logins inherit that ownership. */
function assertClient(clientId: string, userId: string): void {
  const client = getDb().prepare('SELECT id FROM clients WHERE id = ? AND user_id = ?').get(clientId, userId);
  if (!client) throw new NotFoundError('Client not found');
}

/**
 * Invite someone to a client's portal, or re-issue an invitation to someone
 * who already has one.
 *
 * Re-inviting replaces the token in place rather than creating a second login,
 * so a lost invitation email cannot leave one person with two accounts
 * differing only by which token they happened to open.
 */
export function inviteClientUser(
  clientId: string, email: string, userId: string,
): { record: ClientUserRecord; token: string } {
  assertClient(clientId, userId);
  const address = email?.trim().toLowerCase();
  if (!address || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    throw new ValidationError('A valid email address is required');
  }

  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const expires = stamp(new Date(Date.now() + INVITE_HOURS * 60 * 60 * 1000));
  const existing = db.prepare('SELECT * FROM client_users WHERE email = ?').get(address) as ClientUserRecord | undefined;

  if (existing) {
    if (existing.client_id !== clientId) {
      throw new ConflictError('That email address already has a portal login for another client');
    }
    db.prepare('UPDATE client_users SET invite_token = ?, invite_expires_at = ? WHERE id = ?')
      .run(token, expires, existing.id);
    return { record: db.prepare('SELECT * FROM client_users WHERE id = ?').get(existing.id) as ClientUserRecord, token };
  }

  const id = uuidv4();
  db.prepare(`INSERT INTO client_users (id, client_id, email, invite_token, invite_expires_at, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`).run(id, clientId, address, token, expires, stamp());
  return { record: db.prepare('SELECT * FROM client_users WHERE id = ?').get(id) as ClientUserRecord, token };
}

/** Consume an invitation: set the password, verify the login, burn the token. */
export function acceptInvite(token: string, password: string): ClientUserRecord {
  const db = getDb();
  const record = db.prepare('SELECT * FROM client_users WHERE invite_token = ?').get(token) as ClientUserRecord | undefined;
  if (!record) throw new ValidationError('That invitation is invalid or has already been used');
  if (!record.invite_expires_at || record.invite_expires_at < stamp()) {
    throw new ValidationError('That invitation has expired. Ask for a new one.');
  }
  if (!password || password.length < MIN_PASSWORD) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD} characters`);
  }
  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  db.prepare('UPDATE client_users SET password_hash = ?, verified = 1, invite_token = NULL, invite_expires_at = NULL WHERE id = ?')
    .run(hash, record.id);
  return db.prepare('SELECT * FROM client_users WHERE id = ?').get(record.id) as ClientUserRecord;
}

/**
 * Verify portal credentials.
 *
 * A wrong password and an unknown address raise the *same* error, so the
 * portal cannot be used to enumerate which of a business's clients hold logins.
 */
export async function authenticateClientUser(email: string, password: string): Promise<ClientUserRecord> {
  const db = getDb();
  const address = email?.trim().toLowerCase() || '';
  const record = db.prepare('SELECT * FROM client_users WHERE email = ?').get(address) as ClientUserRecord | undefined;
  const rejection = new ValidationError('Those details do not match an account');
  if (!record || !record.verified || !record.password_hash) throw rejection;
  const ok = await bcrypt.compare(password || '', record.password_hash);
  if (!ok) throw rejection;
  db.prepare('UPDATE client_users SET last_login_at = ? WHERE id = ?').run(stamp(), record.id);
  return db.prepare('SELECT * FROM client_users WHERE id = ?').get(record.id) as ClientUserRecord;
}

export function getClientUserById(id: string): ClientUserRecord | undefined {
  return getDb().prepare('SELECT * FROM client_users WHERE id = ?').get(id) as ClientUserRecord | undefined;
}

export function listClientUsers(clientId: string, userId: string): ClientUserRecord[] {
  assertClient(clientId, userId);
  return getDb().prepare('SELECT * FROM client_users WHERE client_id = ? ORDER BY email').all(clientId) as ClientUserRecord[];
}

export function revokeClientUser(id: string, userId: string): void {
  const db = getDb();
  const record = db.prepare('SELECT * FROM client_users WHERE id = ?').get(id) as ClientUserRecord | undefined;
  if (!record) throw new NotFoundError('Portal login not found');
  assertClient(record.client_id, userId);
  db.prepare('DELETE FROM client_users WHERE id = ?').run(id);
}
