import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveVideoFilePath, CRAWL_VIDEO_BASE_DIR } from '../runtimeOpsVideoHelpers.js';

describe('runtimeOpsVideoHelpers', () => {
  describe('CRAWL_VIDEO_BASE_DIR', () => {
    it('is rooted in os.tmpdir()', () => {
      assert.ok(CRAWL_VIDEO_BASE_DIR.startsWith(os.tmpdir()), 'base dir should be in os temp');
      assert.ok(CRAWL_VIDEO_BASE_DIR.includes('spec-factory-crawl-videos'));
    });
  });

  describe('resolveVideoFilePath', () => {
    it('returns the convention-based path for a valid workerId', () => {
      const result = resolveVideoFilePath('run-123', 'fetch-1');
      assert.ok(result.endsWith(path.join('run-123', 'fetch-1.webm')));
    });

    it('returns null for path traversal workerId', () => {
      assert.equal(resolveVideoFilePath('run-1', '../etc/passwd'), null);
    });

    it('returns null for absolute path workerId', () => {
      assert.equal(resolveVideoFilePath('run-1', '/etc/passwd'), null);
    });

    it('returns null for empty workerId', () => {
      assert.equal(resolveVideoFilePath('run-1', ''), null);
    });

    it('returns null for path traversal runId', () => {
      assert.equal(resolveVideoFilePath('../../../etc', 'fetch-1'), null);
    });
  });

  describe('video file serving (integration)', () => {
    let tempVideoDir;
    const runId = 'test-run-video';
    const workerId = 'fetch-1';

    beforeEach(() => {
      tempVideoDir = path.join(os.tmpdir(), 'spec-factory-crawl-videos', runId);
      fs.mkdirSync(tempVideoDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tempVideoDir, { recursive: true, force: true });
    });

    it('resolves to an existing file when video is present', () => {
      const videoPath = path.join(tempVideoDir, `${workerId}.webm`);
      fs.writeFileSync(videoPath, 'fake-webm-content');

      const resolved = resolveVideoFilePath(runId, workerId);
      assert.ok(fs.existsSync(resolved), 'resolved path should exist');
    });

    it('resolves to a non-existing path when no video', () => {
      const resolved = resolveVideoFilePath(runId, 'fetch-999');
      assert.ok(!fs.existsSync(resolved), 'path for missing video should not exist');
    });
  });
});
