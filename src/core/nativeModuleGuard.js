import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);

/**
 * Synchronous belt-and-suspenders check that better-sqlite3 can load
 * under the current Node runtime. Call this during server bootstrap
 * BEFORE any SpecDb initialization.
 *
 * Returns { ok: true } on success, or { ok: false, error: string }
 * with a loud log block on failure.
 */
export function assertNativeModulesHealthy({ logger = console } = {}) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.close();
    return { ok: true };
  } catch (err) {
    const message = err?.message || String(err);
    const isMismatch = message.includes('NODE_MODULE_VERSION') || message.includes('was compiled against');

    const diagnostic = [
      '',
      '╔══════════════════════════════════════════════════════════════╗',
      '║  NATIVE MODULE LOAD FAILURE                                ║',
      '╚══════════════════════════════════════════════════════════════╝',
      '',
      `  Node:    ${process.version} (${process.execPath})`,
      `  Module:  ${process.versions.modules}`,
      `  Error:   ${message}`,
      '',
      isMismatch
        ? '  Fix:     npm rebuild better-sqlite3'
        : '  Fix:     npm install better-sqlite3',
      '',
      '  The server cannot start without a working better-sqlite3.',
      '  Run the fix command above, then restart.',
      '',
    ].join('\n');

    logger.error(diagnostic);

    return {
      ok: false,
      error: isMismatch
        ? `better-sqlite3 MODULE_VERSION mismatch (Node ${process.version}, modules ${process.versions.modules}). Run: npm rebuild better-sqlite3`
        : `better-sqlite3 failed to load: ${message}`,
    };
  }
}
