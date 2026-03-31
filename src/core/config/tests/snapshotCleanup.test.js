import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cleanupOldSnapshots } from '../snapshotCleanup.js';

async function makeTempDir() {
  return await fsp.mkdtemp(path.join(os.tmpdir(), 'snapshot-cleanup-test-'));
}

function seedSnapshot(dir, name, ageMs = 0) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, JSON.stringify({ snapshot: name }));
  if (ageMs > 0) {
    const past = new Date(Date.now() - ageMs);
    fs.utimesSync(filePath, past, past);
  }
  return filePath;
}

test('keeps only maxCount most recent snapshots by mtime', async () => {
  const dir = await makeTempDir();
  try {
    seedSnapshot(dir, 'oldest.json', 5000);
    seedSnapshot(dir, 'middle.json', 3000);
    seedSnapshot(dir, 'newest.json', 1000);

    cleanupOldSnapshots({ dir, maxCount: 2 });

    assert.equal(fs.existsSync(path.join(dir, 'oldest.json')), false, 'oldest should be deleted');
    assert.equal(fs.existsSync(path.join(dir, 'middle.json')), true, 'middle should be kept');
    assert.equal(fs.existsSync(path.join(dir, 'newest.json')), true, 'newest should be kept');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('does nothing when count is at or below maxCount', async () => {
  const dir = await makeTempDir();
  try {
    seedSnapshot(dir, 'a.json', 2000);
    seedSnapshot(dir, 'b.json', 1000);

    cleanupOldSnapshots({ dir, maxCount: 5 });

    assert.equal(fs.existsSync(path.join(dir, 'a.json')), true);
    assert.equal(fs.existsSync(path.join(dir, 'b.json')), true);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('handles missing dir gracefully', () => {
  cleanupOldSnapshots({ dir: '/nonexistent/path', maxCount: 10 });
  // Should not throw
});

test('handles empty dir gracefully', async () => {
  const dir = await makeTempDir();
  try {
    cleanupOldSnapshots({ dir, maxCount: 10 });
    // Should not throw
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('caps at exactly maxCount files', async () => {
  const dir = await makeTempDir();
  try {
    for (let i = 0; i < 15; i++) {
      seedSnapshot(dir, `snap-${String(i).padStart(3, '0')}.json`, (15 - i) * 1000);
    }

    cleanupOldSnapshots({ dir, maxCount: 10 });

    const remaining = fs.readdirSync(dir);
    assert.equal(remaining.length, 10, `should have exactly 10 files, got ${remaining.length}`);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
