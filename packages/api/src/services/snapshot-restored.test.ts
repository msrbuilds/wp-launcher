import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';

// The restore itself talks to the provisioner. Only the bookkeeping around it
// is under test here.
const restoreSnapshot = vi.fn();
vi.mock('./docker.service', () => ({
  createSnapshot: vi.fn(),
  restoreSnapshot: (...args: unknown[]) => restoreSnapshot(...args),
}));

import { restoreSnapshotToSite, listSnapshots } from './snapshot.service';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  restoreSnapshot.mockReset();
  restoreSnapshot.mockResolvedValue(undefined);

  db.prepare("INSERT INTO users (id, email) VALUES ('u1', 'a@b.c')").run();
  db.prepare(
    `INSERT INTO sites (id, subdomain, product_id, user_id, status, container_id, expires_at)
     VALUES ('s1', 'alpha', 'demo', 'u1', 'running', 'c1', '2099-01-01T00:00:00.000Z')`,
  ).run();
  for (const id of ['snap-old', 'snap-new']) {
    db.prepare(
      `INSERT INTO snapshots (id, site_id, name, db_engine, storage_path, size_bytes)
       VALUES (?, 's1', ?, 'mariadb', 'data/snapshots/' || ?, 100)`,
    ).run(id, id, id);
  }
});
afterEach(() => { __setDbForTesting(null); db.close(); });

describe('restore bookkeeping', () => {
  it('starts with no snapshot marked as restored', () => {
    expect(listSnapshots('s1', 'u1').every((s) => !s.restored_at)).toBe(true);
  });

  it('records restored_at on the snapshot that was restored', async () => {
    await restoreSnapshotToSite('s1', 'snap-old', 'u1');
    const list = listSnapshots('s1', 'u1');
    expect(list.find((s) => s.id === 'snap-old')?.restored_at).toBeTruthy();
    expect(list.find((s) => s.id === 'snap-new')?.restored_at).toBeFalsy();
  });

  it('does NOT record a restore that failed', async () => {
    // A badge on a snapshot that was never applied is worse than no badge: it
    // would tell someone their site holds state it does not.
    restoreSnapshot.mockRejectedValue(new Error('provisioner exploded'));
    await expect(restoreSnapshotToSite('s1', 'snap-old', 'u1')).rejects.toThrow('provisioner exploded');
    expect(listSnapshots('s1', 'u1').every((s) => !s.restored_at)).toBe(true);
  });

  it('moves the mark when a different snapshot is restored', async () => {
    await restoreSnapshotToSite('s1', 'snap-old', 'u1');
    await restoreSnapshotToSite('s1', 'snap-new', 'u1');
    const list = listSnapshots('s1', 'u1');
    // Both carry a timestamp; the UI badges the most recent. Keeping the older
    // one is deliberate — it is a history, not a single flag to be cleared.
    const newer = list.find((s) => s.id === 'snap-new')!.restored_at!;
    const older = list.find((s) => s.id === 'snap-old')!.restored_at!;
    expect(newer >= older).toBe(true);
  });
});
