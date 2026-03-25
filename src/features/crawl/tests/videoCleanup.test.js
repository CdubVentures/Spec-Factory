import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// WHY: Import will fail until the module is created (RED phase).
import { cleanupStaleVideoDirs } from '../videoCleanup.js';

describe('cleanupStaleVideoDirs', () => {
  let baseDir;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-cleanup-test-'));
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it('deletes directories older than maxAgeMs', () => {
    const oldDir = path.join(baseDir, 'old-run');
    fs.mkdirSync(oldDir);
    fs.writeFileSync(path.join(oldDir, 'fetch-1.webm'), 'fake');
    // WHY: Set mtime to 25 hours ago to simulate old directory
    const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
    fs.utimesSync(oldDir, oldTime, oldTime);

    cleanupStaleVideoDirs({ baseDir, maxAgeMs: 24 * 60 * 60 * 1000 });

    assert.ok(!fs.existsSync(oldDir), 'old directory should be deleted');
  });

  it('retains directories newer than maxAgeMs', () => {
    const newDir = path.join(baseDir, 'new-run');
    fs.mkdirSync(newDir);
    fs.writeFileSync(path.join(newDir, 'fetch-1.webm'), 'fake');

    cleanupStaleVideoDirs({ baseDir, maxAgeMs: 24 * 60 * 60 * 1000 });

    assert.ok(fs.existsSync(newDir), 'new directory should be retained');
  });

  it('handles empty base directory without error', () => {
    assert.doesNotThrow(() => {
      cleanupStaleVideoDirs({ baseDir, maxAgeMs: 24 * 60 * 60 * 1000 });
    });
  });

  it('handles non-existent base directory without error', () => {
    assert.doesNotThrow(() => {
      cleanupStaleVideoDirs({ baseDir: '/tmp/does-not-exist-video-test', maxAgeMs: 1000 });
    });
  });

  it('deletes only old directories in a mixed set', () => {
    const oldDir = path.join(baseDir, 'old-run');
    const newDir = path.join(baseDir, 'new-run');
    fs.mkdirSync(oldDir);
    fs.mkdirSync(newDir);
    fs.writeFileSync(path.join(oldDir, 'v.webm'), 'fake');
    fs.writeFileSync(path.join(newDir, 'v.webm'), 'fake');

    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
    fs.utimesSync(oldDir, oldTime, oldTime);

    cleanupStaleVideoDirs({ baseDir, maxAgeMs: 24 * 60 * 60 * 1000 });

    assert.ok(!fs.existsSync(oldDir), 'old directory should be deleted');
    assert.ok(fs.existsSync(newDir), 'new directory should be retained');
  });
});
