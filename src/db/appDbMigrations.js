// WHY: Idempotent ALTER TABLE migrations for the global app SQLite database.
// Mirror of specDbMigrations pattern — each statement is safe to re-run; errors
// from "duplicate column" / "no such index" are swallowed so migrations apply
// cleanly whether the DB is fresh or long-lived.

const MIGRATIONS = [
  // WHY: sent_tokens tracks what Spec Factory actually transmitted (local estimate),
  // distinct from prompt_tokens which is the provider-reported total (includes
  // tool-loop and reasoning-iteration context growth). Enables Prompt|Usage split
  // on the billing panel. Historical rows backfill sent_tokens = prompt_tokens so
  // "Usage" shows 0 for pre-capture data (honest: we didn't measure overhead then).
  `ALTER TABLE billing_entries ADD COLUMN sent_tokens INTEGER DEFAULT 0`,
];

const BACKFILLS = [
  // One-shot, idempotent: only rows that never had sent_tokens captured get
  // backfilled to equal prompt_tokens. Re-running is a no-op because the
  // predicate `sent_tokens = 0 AND prompt_tokens > 0` only matches uncaptured
  // rows; once sent_tokens is set by normal insertion, the predicate fails.
  `UPDATE billing_entries SET sent_tokens = prompt_tokens WHERE sent_tokens = 0 AND prompt_tokens > 0`,
];

function runIgnoreDuplicates(db, statements) {
  for (const sql of statements) {
    try {
      db.exec(sql);
    } catch (err) {
      const msg = String(err?.message || err);
      if (msg.includes('duplicate column name') || msg.includes('no such column') || msg.includes('no such index')) {
        continue;
      }
      throw err;
    }
  }
}

export function applyAppDbMigrations(db) {
  runIgnoreDuplicates(db, MIGRATIONS);
  for (const sql of BACKFILLS) {
    db.exec(sql);
  }
}
