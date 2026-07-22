import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDb } from '../utils/db';
import { ValidationError, UnauthorizedError, NotFoundError } from '../utils/errors';

/**
 * `user` is the pre-v3 name for `member`; rows are renamed by the roles-v3
 * migration, but the literal stays in the union because JWTs issued before the
 * upgrade still carry it.
 */
export type UserRole = 'owner' | 'admin' | 'member' | 'user';

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  verified: number;
  role: UserRole;
  name: string | null;
  avatar_url: string | null;
  pending_email: string | null;
  email_change_token: string | null;
  email_change_expires_at: string | null;
  verification_token: string | null;
  verification_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function registerUser(email: string): Promise<{
  user: UserRecord;
  verificationToken: string;
  isNew: boolean;
}> {
  const db = getDb();

  const registerTxn = db.transaction((email: string) => {
    // Check if user already exists — atomic with insert
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRecord | undefined;

    if (existing && existing.verified) {
      // User already verified — return existing with a new verification token for re-login
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour
      db.prepare('UPDATE users SET verification_token = ?, verification_expires_at = ? WHERE id = ?')
        .run(token, expiresAt, existing.id);
      return {
        user: { ...existing, verification_token: token, verification_expires_at: expiresAt },
        verificationToken: token,
        isNew: false,
      };
    }

    if (existing && !existing.verified) {
      // Not yet verified — update token and resend
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      db.prepare('UPDATE users SET verification_token = ?, verification_expires_at = ? WHERE id = ?')
        .run(token, expiresAt, existing.id);
      return {
        user: { ...existing, verification_token: token, verification_expires_at: expiresAt },
        verificationToken: token,
        isNew: false,
      };
    }

    // Create new user — no password yet; user sets it after email verification
    const id = uuidv4();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    db.prepare(`
      INSERT INTO users (id, email, password_hash, verified, verification_token, verification_expires_at)
      VALUES (?, ?, '', 0, ?, ?)
    `).run(id, email, token, expiresAt);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord;

    return { user, verificationToken: token, isNew: true };
  });

  return registerTxn(email);
}

export async function verifyUserEmail(token: string): Promise<{
  user: UserRecord;
  needsPassword: boolean;
  passwordSetToken: string | null;
}> {
  const db = getDb();

  const verifyTxn = db.transaction((token: string) => {
    const user = db.prepare('SELECT * FROM users WHERE verification_token = ?').get(token) as UserRecord | undefined;

    if (!user) {
      throw new ValidationError('Invalid or expired verification token');
    }

    if (user.verification_expires_at && new Date(user.verification_expires_at) < new Date()) {
      throw new ValidationError('Verification token has expired. Please request a new one.');
    }

    const wasAlreadyVerified = user.verified === 1;
    let needsPassword = false;
    let passwordSetToken: string | null = null;

    if (!wasAlreadyVerified) {
      // First-time verification — mark verified but require password set
      needsPassword = true;
      passwordSetToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiresAt = new Date(Date.now() + 900000).toISOString(); // 15 minutes

      db.prepare(`
        UPDATE users SET verified = 1, verification_token = ?, verification_expires_at = ?,
        updated_at = datetime('now') WHERE id = ?
      `).run(passwordSetToken, tokenExpiresAt, user.id);
    } else {
      // Already verified — just clear the token (magic-link login)
      db.prepare(`
        UPDATE users SET verification_token = NULL, verification_expires_at = NULL,
        updated_at = datetime('now') WHERE id = ?
      `).run(user.id);
    }

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRecord;
    return { user: updatedUser, needsPassword, passwordSetToken };
  });

  return verifyTxn(token);
}

export async function setInitialPassword(token: string, newPassword: string): Promise<UserRecord> {
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE verification_token = ? AND verified = 1').get(token) as UserRecord | undefined;

  if (!user) {
    throw new ValidationError('Invalid or expired password-set token');
  }

  if (user.verification_expires_at && new Date(user.verification_expires_at) < new Date()) {
    throw new ValidationError('Password-set token has expired. Please register again.');
  }

  const hash = await bcrypt.hash(newPassword, 10);
  db.prepare(`
    UPDATE users SET password_hash = ?, verification_token = NULL,
    verification_expires_at = NULL, updated_at = datetime('now') WHERE id = ?
  `).run(hash, user.id);

  return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRecord;
}

export async function loginUser(email: string, password: string): Promise<UserRecord> {
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRecord | undefined;
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.verified) {
    throw new UnauthorizedError('Please verify your email first');
  }

  if (!user.password_hash) {
    throw new UnauthorizedError('Please complete your account setup first');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  return user;
}

export async function updatePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRecord | undefined;
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) {
    throw new ValidationError('Current password is incorrect');
  }

  const hash = await bcrypt.hash(newPassword, 10);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hash, userId);
}

export function getUserById(id: string): UserRecord | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined;
}

/** Update the user's display name. An empty string clears it. */
export function updateProfile(id: string, name: string): UserRecord {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined;
  if (!user) throw new NotFoundError('User not found');

  const trimmed = name.trim();
  db.prepare("UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?")
    .run(trimmed || null, id);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord;
}

/** Set (or clear, with null) the user's avatar URL. */
export function setAvatarUrl(id: string, url: string | null): void {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined;
  if (!user) throw new NotFoundError('User not found');
  db.prepare("UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?")
    .run(url, id);
}

/**
 * Begin an email change. Verifies the current password and that the new address
 * is free, then stores it as pending behind a verification token. The change
 * only takes effect once the token is confirmed via {@link confirmEmailChange}.
 */
export async function requestEmailChange(
  id: string,
  newEmail: string,
  currentPassword: string,
): Promise<{ token: string; pendingEmail: string }> {
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined;
  if (!user) throw new NotFoundError('User not found');

  const email = newEmail.toLowerCase().trim();
  if (!email || !email.includes('@')) {
    throw new ValidationError('A valid email address is required');
  }
  if (email === user.email) {
    throw new ValidationError('That is already your email address');
  }

  if (!user.password_hash || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    throw new ValidationError('Current password is incorrect');
  }

  const taken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, id);
  if (taken) {
    throw new ValidationError('That email address is already in use');
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour
  db.prepare(`
    UPDATE users SET pending_email = ?, email_change_token = ?, email_change_expires_at = ?,
    updated_at = datetime('now') WHERE id = ?
  `).run(email, token, expiresAt, id);

  return { token, pendingEmail: email };
}

/**
 * Confirm a pending email change. Re-checks that the address is still free (it
 * could have been claimed while the link sat in an inbox), then swaps it in.
 */
export function confirmEmailChange(token: string): UserRecord {
  const db = getDb();

  const confirmTxn = db.transaction((token: string) => {
    const user = db.prepare('SELECT * FROM users WHERE email_change_token = ?')
      .get(token) as UserRecord | undefined;
    if (!user || !user.pending_email) {
      throw new ValidationError('Invalid or expired email-change link');
    }
    if (user.email_change_expires_at && new Date(user.email_change_expires_at) < new Date()) {
      throw new ValidationError('This email-change link has expired. Please request a new one.');
    }

    const taken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
      .get(user.pending_email, user.id);
    if (taken) {
      throw new ValidationError('That email address is no longer available');
    }

    db.prepare(`
      UPDATE users SET email = ?, pending_email = NULL, email_change_token = NULL,
      email_change_expires_at = NULL, updated_at = datetime('now') WHERE id = ?
    `).run(user.pending_email, user.id);

    return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRecord;
  });

  return confirmTxn(token);
}

export function listUsers(limit = 100, offset = 0): UserRecord[] {
  const db = getDb();
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as UserRecord[];
}

export function getUsersCount(): number {
  const db = getDb();
  return (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
}

export function updateUserRole(id: string, role: 'member' | 'admin'): void {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined;
  if (!user) throw new NotFoundError('User not found');

  // The owner is the panel's root of authority — there is exactly one, and it
  // cannot be demoted, or the install could be left with nobody in charge.
  if (user.role === 'owner') {
    throw new ValidationError('The owner role cannot be changed');
  }

  db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(role, id);
}

export function deleteUser(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}
