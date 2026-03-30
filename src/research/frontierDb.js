// WHY: Thin factory for frontier database. SQLite is the sole implementation.
// The JSON-based FrontierDb class was removed (2026-03-29) — it never persisted
// to disk and better-sqlite3 is a hard dependency.

import { FrontierDbSqlite } from './frontierSqlite.js';

export { FrontierDbSqlite };

export function createFrontier({ storage, key, config = {} } = {}) {
  const dbPath = '_intel/frontier/frontier.db';
  if (typeof config._logger?.info === 'function') {
    config._logger.info('frontier_sqlite_enabled', { dbPath });
  }
  return new FrontierDbSqlite({ dbPath, config });
}
