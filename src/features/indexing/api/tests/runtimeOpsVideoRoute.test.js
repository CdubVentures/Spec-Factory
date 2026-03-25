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

    it('returns null when no video dir or manifest exists', () => {
      assert.equal(resolveVideoFilePath('nonexistent-run-xyz', 'fetch-1'), null);
    });
  });

  describe('manifest-based resolution', () => {
    let tempVideoDir;
    const runId = 'test-run-manifest';

    beforeEach(() => {
      tempVideoDir = path.join(CRAWL_VIDEO_BASE_DIR, runId);
      fs.mkdirSync(tempVideoDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tempVideoDir, { recursive: true, force: true });
    });

    it('resolves via manifest.json mapping workerId to UUID filename', () => {
      const uuidName = 'abc123def456.webm';
      fs.writeFileSync(path.join(tempVideoDir, uuidName), 'fake-video');
      fs.writeFileSync(
        path.join(tempVideoDir, 'manifest.json'),
        JSON.stringify({ 'fetch-1': uuidName }),
      );

      const resolved = resolveVideoFilePath(runId, 'fetch-1');
      assert.ok(resolved, 'should resolve to a path');
      assert.ok(resolved.endsWith(uuidName), 'should point to UUID file');
      assert.ok(fs.existsSync(resolved), 'resolved path should exist');
    });

    it('returns null when worker not in manifest', () => {
      fs.writeFileSync(
        path.join(tempVideoDir, 'manifest.json'),
        JSON.stringify({ 'fetch-1': 'abc.webm' }),
      );
      assert.equal(resolveVideoFilePath(runId, 'fetch-99'), null);
    });

    it('falls back to direct convention name if file exists', () => {
      fs.writeFileSync(path.join(tempVideoDir, 'fetch-2.webm'), 'direct-video');

      const resolved = resolveVideoFilePath(runId, 'fetch-2');
      assert.ok(resolved, 'should resolve direct path');
      assert.ok(resolved.endsWith('fetch-2.webm'));
    });

    it('rejects path traversal in manifest filename', () => {
      fs.writeFileSync(
        path.join(tempVideoDir, 'manifest.json'),
        JSON.stringify({ 'fetch-1': '../../../etc/passwd' }),
      );
      assert.equal(resolveVideoFilePath(runId, 'fetch-1'), null);
    });
  });
});
