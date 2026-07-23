import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { registerUser, updatePassword, getUserById } from './user.service';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
});

afterEach(() => {
  __setDbForTesting(null);
  db.close();
});

describe('user.service — session invalidation', () => {
  it('bumps token_version on password change so old JWTs are rejected', async () => {
    const { user } = await registerUser('a@example.com');
    db.prepare('UPDATE users SET verified = 1, password_hash = ? WHERE id = ?')
      .run(await import('bcryptjs').then((b) => b.hash('current-pass', 4)), user.id);

    const before = getUserById(user.id)!;
    expect(before.token_version).toBe(0);

    const { tokenVersion } = await updatePassword(user.id, 'current-pass', 'a-brand-new-pass');
    expect(tokenVersion).toBe(1);
    expect(getUserById(user.id)!.token_version).toBe(1);
  });

  it('rejects a password change with the wrong current password (no bump)', async () => {
    const { user } = await registerUser('b@example.com');
    db.prepare('UPDATE users SET verified = 1, password_hash = ? WHERE id = ?')
      .run(await import('bcryptjs').then((b) => b.hash('right', 4)), user.id);

    await expect(updatePassword(user.id, 'wrong', 'whatever-long-enough')).rejects.toThrow();
    expect(getUserById(user.id)!.token_version).toBe(0);
  });
});

describe('user.service — registration resend throttle', () => {
  it('does not reissue or resend within the cooldown window', async () => {
    const first = await registerUser('c@example.com');
    expect(first.isNew).toBe(true);
    expect(first.throttled).toBe(false);

    const second = await registerUser('c@example.com');
    // Same still-valid token, and the caller is told to stay silent.
    expect(second.throttled).toBe(true);
    expect(second.verificationToken).toBe(first.verificationToken);
  });

  it('reissues a fresh token once the previous one is old enough', async () => {
    const first = await registerUser('d@example.com');
    // Backdate the token past the cooldown by pushing its expiry back an hour.
    db.prepare("UPDATE users SET verification_expires_at = datetime('now','-2 minutes') WHERE email = 'd@example.com'").run();

    const second = await registerUser('d@example.com');
    expect(second.throttled).toBe(false);
    expect(second.verificationToken).not.toBe(first.verificationToken);
  });
});
