import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  getNodeDiagnostics,
  runNativeModulePreflight,
  getCategoryList,
  classifyError,
} from './nativeModulePreflight.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('getNodeDiagnostics', () => {
  it('returns shape matching current process values', () => {
    const diag = getNodeDiagnostics();
    assert.equal(diag.version, process.version);
    assert.equal(diag.execPath, process.execPath);
    assert.equal(diag.moduleVersion, Number(process.versions.modules));
    assert.equal(diag.arch, process.arch);
    assert.equal(diag.platform, process.platform);
  });

  it('moduleVersion is a finite positive number', () => {
    const diag = getNodeDiagnostics();
    assert.equal(typeof diag.moduleVersion, 'number');
    assert.ok(Number.isFinite(diag.moduleVersion));
    assert.ok(diag.moduleVersion > 0);
  });
});

describe('classifyError', () => {
  it('returns mismatch for NODE_MODULE_VERSION errors', () => {
    assert.equal(
      classifyError('was compiled against a different Node.js version using NODE_MODULE_VERSION 137'),
      'mismatch',
    );
  });

  it('returns mismatch for "was compiled against" errors', () => {
    assert.equal(
      classifyError('The module was compiled against a different Node.js version'),
      'mismatch',
    );
  });

  it('returns missing for Cannot find module errors', () => {
    assert.equal(classifyError("Cannot find module 'better-sqlite3'"), 'missing');
  });

  it('returns missing for MODULE_NOT_FOUND errors', () => {
    assert.equal(classifyError('code: MODULE_NOT_FOUND'), 'missing');
  });

  it('returns unknown-error for unrecognized messages', () => {
    assert.equal(classifyError('some random error'), 'unknown-error');
  });

  it('returns unknown-error for empty string', () => {
    assert.equal(classifyError(''), 'unknown-error');
  });
});

describe('runNativeModulePreflight', () => {
  it('returns ok: true with loaded status on this machine', async () => {
    const result = await runNativeModulePreflight({ root: ROOT });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'loaded');
    assert.equal(result.errorMessage, null);
  });

  it('reports matching node version and path', async () => {
    const result = await runNativeModulePreflight({ root: ROOT });
    assert.equal(result.nodeVersion, process.version);
    assert.equal(result.nodePath, process.execPath);
    assert.equal(result.moduleVersion, Number(process.versions.modules));
  });

  it('does not attempt rebuild when module loads successfully', async () => {
    const result = await runNativeModulePreflight({ root: ROOT });
    assert.equal(result.rebuildAttempted, false);
    assert.equal(result.rebuildSucceeded, null);
  });

  it('falls back to an in-process probe when child-process spawning is unavailable', async () => {
    let rebuildCalls = 0;
    const result = await runNativeModulePreflight({
      root: ROOT,
      probeFn: async () => ({
        ok: false,
        output: 'spawn EPERM',
        code: 'EPERM',
        spawnUnavailable: true,
      }),
      fallbackProbeFn: async () => ({ ok: true, output: '' }),
      rebuildFn: async () => {
        rebuildCalls += 1;
        return { ok: false, stdout: '', stderr: 'should not rebuild' };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'loaded');
    assert.equal(result.rebuildAttempted, false);
    assert.equal(rebuildCalls, 0);
  });
});

describe('getCategoryList', () => {
  it('returns array of category names from category_authority', () => {
    const categories = getCategoryList(ROOT);
    assert.ok(Array.isArray(categories));
    assert.ok(categories.length > 0, 'expected at least one category');
  });

  it('excludes underscore-prefixed directories', () => {
    const categories = getCategoryList(ROOT);
    for (const name of categories) {
      assert.ok(!name.startsWith('_'), `unexpected _-prefixed entry: ${name}`);
    }
  });

  it('returns sorted names', () => {
    const categories = getCategoryList(ROOT);
    const sorted = [...categories].sort();
    assert.deepEqual(categories, sorted);
  });

  it('returns empty array for nonexistent root', () => {
    const categories = getCategoryList('/nonexistent/path');
    assert.deepEqual(categories, []);
  });
});
