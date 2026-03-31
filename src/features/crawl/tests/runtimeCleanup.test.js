import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cleanupStaleRunDirs } from '../runtimeCleanup.js';

async function makeTempDir() {
  return await fsp.mkdtemp(path.join(os.tmpdir(), 'run-cleanup-test-'));
}

function seedRunDir(baseDir, name, ageMs = 0) {
  const dir = path.join(baseDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'run.json'), '{}');
  if (ageMs > 0) {
    const past = new Date(Date.now() - ageMs);
    fs.utimesSync(dir, past, past);
  }
  return dir;
}

test('deletes run dirs older than maxAgeMs', async () => {
  const base = await makeTempDir();
  try {
    seedRunDir(base, '20260301000000-aaa', 10 * 24 * 60 * 60 * 1000); // 10 days old
    seedRunDir(base, '20260329000000-bbb', 1 * 60 * 60 * 1000);       // 1 hour old

    cleanupStaleRunDirs({ baseDir: base, maxAgeMs: 7 * 24 * 60 * 60 * 1000 });

    assert.equal(fs.existsSync(path.join(base, '20260301000000-aaa')), false, 'old dir should be deleted');
    assert.equal(fs.existsSync(path.join(base, '20260329000000-bbb')), true, 'recent dir should be kept');
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test('keeps run dirs newer than maxAgeMs', async () => {
  const base = await makeTempDir();
  try {
    seedRunDir(base, '20260330010000-ccc'); // just created
    seedRunDir(base, '20260330020000-ddd'); // just created

    cleanupStaleRunDirs({ baseDir: base, maxAgeMs: 7 * 24 * 60 * 60 * 1000 });

    assert.equal(fs.existsSync(path.join(base, '20260330010000-ccc')), true);
    assert.equal(fs.existsSync(path.join(base, '20260330020000-ddd')), true);
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test('skips non-run directories like products/', async () => {
  const base = await makeTempDir();
  try {
    const productsDir = path.join(base, 'products');
    fs.mkdirSync(productsDir, { recursive: true });
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    fs.utimesSync(productsDir, past, past);

    cleanupStaleRunDirs({ baseDir: base, maxAgeMs: 1 });

    assert.equal(fs.existsSync(productsDir), true, 'products/ should be preserved');
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test('handles missing baseDir gracefully', () => {
  cleanupStaleRunDirs({ baseDir: '/nonexistent/path', maxAgeMs: 1000 });
  // Should not throw
});

test('handles empty baseDir gracefully', async () => {
  const base = await makeTempDir();
  try {
    cleanupStaleRunDirs({ baseDir: base, maxAgeMs: 1000 });
    // Should not throw
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});
