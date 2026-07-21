import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { getDb } from '../utils/db';
import { getBool, setSetting } from './settings.service';
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
  const passwordHash = await bcrypt.hash(input.password, 10);
  const id = uuidv4();
  const db = getDb();

  const apply = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, email, password_hash, verified, role)
       VALUES (?, ?, ?, 1, 'owner')`,
    ).run(id, input.email, passwordHash);

    // An upgraded local install has every site pointing at the synthetic
    // local-user row. Hand them to the real owner before dropping it.
    db.prepare("UPDATE sites SET user_id = ? WHERE user_id = 'local-user'").run(id);
    db.prepare("DELETE FROM users WHERE id = 'local-user'").run();
  });

  apply();

  if (input.panelName) setSetting('branding.siteTitle', input.panelName);
  setSetting('panel.setupComplete', 'true');

  return db.prepare('SELECT id, email, password_hash, role, verified FROM users WHERE id = ?').get(id) as OwnerRecord;
}
