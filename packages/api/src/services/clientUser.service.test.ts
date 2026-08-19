import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import {
  inviteClientUser, acceptInvite, authenticateClientUser,
  getClientUserById, listClientUsers, revokeClientUser,
} from './clientUser.service';

let db: Database.Database;
const OWNER = 'u-owner';
const STRANGER = 'u-stranger';

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  for (const id of [OWNER, STRANGER]) {
    db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(id, `${id}@example.com`);
  }
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c1', 'u-owner', 'Acme')").run();
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c2', 'u-owner', 'Other')").run();
});
afterEach(() => { __setDbForTesting(null); db.close(); });

describe('inviting', () => {
  it('creates an unverified login with a single-use token', () => {
    const { record, token } = inviteClientUser('c1', 'ada@acme.test', OWNER);
    expect(record.verified).toBe(0);
    expect(record.client_id).toBe('c1');
    expect(token).toHaveLength(64);
    expect(record.invite_token).toBe(token);
  });

  it('refuses to invite into a client the caller does not own', () => {
    expect(() => inviteClientUser('c1', 'ada@acme.test', STRANGER)).toThrow(/not found/i);
  });

  it('refuses the same address on a second client', () => {
    inviteClientUser('c1', 'ada@acme.test', OWNER);
    expect(() => inviteClientUser('c2', 'ada@acme.test', OWNER)).toThrow(/another client/i);
  });

  it('re-inviting replaces the token rather than adding a second login', () => {
    const first = inviteClientUser('c1', 'ada@acme.test', OWNER);
    const second = inviteClientUser('c1', 'ada@acme.test', OWNER);
    expect(second.token).not.toBe(first.token);
    expect(listClientUsers('c1', OWNER)).toHaveLength(1);
  });

  it('normalises the address so case cannot create a duplicate login', () => {
    inviteClientUser('c1', 'Ada@Acme.test', OWNER);
    const again = inviteClientUser('c1', 'ada@acme.TEST', OWNER);
    expect(again.record.email).toBe('ada@acme.test');
    expect(listClientUsers('c1', OWNER)).toHaveLength(1);
  });

  it('rejects an address that is not one', () => {
    expect(() => inviteClientUser('c1', 'not-an-email', OWNER)).toThrow(/valid email/i);
  });
});

describe('accepting an invite', () => {
  it('sets a password, verifies, and burns the token', () => {
    const { token } = inviteClientUser('c1', 'ada@acme.test', OWNER);
    const accepted = acceptInvite(token, 'a-good-password');
    expect(accepted.verified).toBe(1);
    expect(accepted.invite_token).toBeNull();
    expect(() => acceptInvite(token, 'another-password')).toThrow(/invalid|used/i);
  });

  it('rejects an expired token', () => {
    const { record, token } = inviteClientUser('c1', 'ada@acme.test', OWNER);
    db.prepare("UPDATE client_users SET invite_expires_at = '2000-01-01 00:00:00' WHERE id = ?").run(record.id);
    expect(() => acceptInvite(token, 'a-good-password')).toThrow(/expired/i);
  });

  it('rejects an unknown token', () => {
    expect(() => acceptInvite('nope', 'a-good-password')).toThrow(/invalid/i);
  });

  it('requires a password of reasonable length', () => {
    const { token } = inviteClientUser('c1', 'ada@acme.test', OWNER);
    expect(() => acceptInvite(token, 'short')).toThrow(/password/i);
  });
});

describe('authenticating', () => {
  function accepted() {
    const { token } = inviteClientUser('c1', 'ada@acme.test', OWNER);
    return acceptInvite(token, 'a-good-password');
  }

  it('accepts the right password and records the sign-in', async () => {
    accepted();
    const user = await authenticateClientUser('ada@acme.test', 'a-good-password');
    expect(user.client_id).toBe('c1');
    expect(user.last_login_at).toBeTruthy();
  });

  it('gives the same error for a wrong password and an unknown address', async () => {
    // These must be indistinguishable, or the portal becomes a way to discover
    // which of a business's clients hold logins.
    accepted();
    const wrongPassword = await authenticateClientUser('ada@acme.test', 'not-it').catch((e) => e.message);
    const unknownEmail = await authenticateClientUser('nobody@acme.test', 'a-good-password').catch((e) => e.message);
    expect(wrongPassword).toBe(unknownEmail);
  });

  it('refuses a login that was invited but never accepted', async () => {
    inviteClientUser('c2', 'bob@other.test', OWNER);
    await expect(authenticateClientUser('bob@other.test', 'anything')).rejects.toThrow();
  });
});

describe('revoking', () => {
  it('removes the login and refuses it afterwards', async () => {
    const { token } = inviteClientUser('c1', 'ada@acme.test', OWNER);
    const user = acceptInvite(token, 'a-good-password');
    revokeClientUser(user.id, OWNER);
    expect(getClientUserById(user.id)).toBeUndefined();
    await expect(authenticateClientUser('ada@acme.test', 'a-good-password')).rejects.toThrow();
  });

  it('refuses revocation by someone who does not own the client', () => {
    const { token } = inviteClientUser('c1', 'ada@acme.test', OWNER);
    const user = acceptInvite(token, 'a-good-password');
    expect(() => revokeClientUser(user.id, STRANGER)).toThrow(/not found/i);
    expect(getClientUserById(user.id)).toBeDefined();
  });

  it('lists logins only to the owner of the client', () => {
    inviteClientUser('c1', 'ada@acme.test', OWNER);
    expect(listClientUsers('c1', OWNER)).toHaveLength(1);
    expect(() => listClientUsers('c1', STRANGER)).toThrow(/not found/i);
  });
});
