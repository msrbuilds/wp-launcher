import type Database from 'better-sqlite3';

/** Rows the old code created for itself; never eligible to become the owner. */
export const SYNTHETIC_USER_IDS = ['admin', 'local-user'];

export function runRolesMigration(db: Database.Database): void {
  const apply = db.transaction(() => {
    db.prepare("UPDATE users SET role = 'member' WHERE role = 'user'").run();

    const existingOwner = db.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").get();
    if (existingOwner) return;

    const placeholders = SYNTHETIC_USER_IDS.map(() => '?').join(', ');
    const candidate = db
      .prepare(
        `SELECT id FROM users
         WHERE role = 'admin' AND id NOT IN (${placeholders})
         ORDER BY created_at ASC, id ASC
         LIMIT 1`,
      )
      .get(...SYNTHETIC_USER_IDS) as { id: string } | undefined;

    if (candidate) {
      db.prepare("UPDATE users SET role = 'owner' WHERE id = ?").run(candidate.id);
    }
  });

  apply();
}
