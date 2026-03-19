import { describe, it } from 'node:test';
import { ok, strictEqual, throws } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  writeRuntimeSettingsSnapshot,
  readRuntimeSettingsSnapshot,
  resolveSnapshotPath,
} from '../../src/core/config/runtimeSettingsSnapshot.js';

// WHY: Plan 05 contract test. Validates snapshot write/read round-trip,
// error handling, and env var resolution.

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sf-snapshot-test-'));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe('runtimeSettingsSnapshotTransport — Plan 05', () => {

  // --- Write/Read Round-Trip ---

  it('write → read round-trip preserves all settings', () => {
    const tmpDir = makeTmpDir();
    try {
      const body = {
        category: 'mouse',
        productId: 'mouse-test-1',
        mode: 'indexlab',
        autoScrollEnabled: true,
        fetchConcurrency: 8,
        llmModelPlan: 'gemini-2.5-flash',
        staticDomTargetMatchThreshold: 0.55,
        searchEngines: 'google,bing',
      };
      const snapshotPath = writeRuntimeSettingsSnapshot('test-run-001', body, tmpDir);
      ok(fs.existsSync(snapshotPath), 'snapshot file should exist');

      const snapshot = readRuntimeSettingsSnapshot(snapshotPath);
      strictEqual(snapshot.snapshotId, 'test-run-001');
      strictEqual(snapshot.schemaVersion, '1.0');
      strictEqual(snapshot.source, 'gui');
      ok(typeof snapshot.createdAt === 'number');

      // Settings should include pipeline settings but NOT run control
      strictEqual(snapshot.settings.autoScrollEnabled, true);
      strictEqual(snapshot.settings.fetchConcurrency, 8);
      strictEqual(snapshot.settings.llmModelPlan, 'gemini-2.5-flash');
      strictEqual(snapshot.settings.staticDomTargetMatchThreshold, 0.55);
      strictEqual(snapshot.settings.searchEngines, 'google,bing');

      // Run control fields should be excluded
      strictEqual(snapshot.settings.category, undefined);
      strictEqual(snapshot.settings.productId, undefined);
      strictEqual(snapshot.settings.mode, undefined);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('snapshot file is valid JSON', () => {
    const tmpDir = makeTmpDir();
    try {
      const snapshotPath = writeRuntimeSettingsSnapshot('json-test', { maxRunSeconds: 300 }, tmpDir);
      const raw = fs.readFileSync(snapshotPath, 'utf8');
      const parsed = JSON.parse(raw);
      ok(parsed.settings);
      strictEqual(parsed.settings.maxRunSeconds, 300);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('snapshot file has required fields', () => {
    const tmpDir = makeTmpDir();
    try {
      const snapshotPath = writeRuntimeSettingsSnapshot('fields-test', {}, tmpDir);
      const snapshot = readRuntimeSettingsSnapshot(snapshotPath);
      ok('snapshotId' in snapshot);
      ok('schemaVersion' in snapshot);
      ok('createdAt' in snapshot);
      ok('source' in snapshot);
      ok('settings' in snapshot);
    } finally {
      cleanup(tmpDir);
    }
  });

  it('creates nested _runtime/snapshots directory', () => {
    const tmpDir = makeTmpDir();
    try {
      const snapshotPath = writeRuntimeSettingsSnapshot('dir-test', {}, tmpDir);
      ok(snapshotPath.includes('_runtime'));
      ok(snapshotPath.includes('snapshots'));
      ok(fs.existsSync(snapshotPath));
    } finally {
      cleanup(tmpDir);
    }
  });

  it('sanitizes unsafe characters in runId for filename', () => {
    const tmpDir = makeTmpDir();
    try {
      const snapshotPath = writeRuntimeSettingsSnapshot('run/with\\bad:chars', {}, tmpDir);
      const filename = path.basename(snapshotPath);
      ok(!filename.includes('/'), 'filename should not contain /');
      ok(!filename.includes('\\'), 'filename should not contain \\');
      ok(!filename.includes(':'), 'filename should not contain :');
    } finally {
      cleanup(tmpDir);
    }
  });

  // --- Error Handling ---

  it('readRuntimeSettingsSnapshot throws on empty path', () => {
    throws(
      () => readRuntimeSettingsSnapshot(''),
      (err) => err.code === 'SNAPSHOT_PATH_EMPTY'
    );
  });

  it('readRuntimeSettingsSnapshot throws on null path', () => {
    throws(
      () => readRuntimeSettingsSnapshot(null),
      (err) => err.code === 'SNAPSHOT_PATH_EMPTY'
    );
  });

  it('readRuntimeSettingsSnapshot throws on non-existent file', () => {
    throws(
      () => readRuntimeSettingsSnapshot('/nonexistent/path/snapshot.json'),
      (err) => err.code === 'SNAPSHOT_READ_FAILED'
    );
  });

  it('readRuntimeSettingsSnapshot throws on invalid JSON', () => {
    const tmpDir = makeTmpDir();
    try {
      const filePath = path.join(tmpDir, 'bad.json');
      fs.writeFileSync(filePath, 'not json {{{', 'utf8');
      throws(
        () => readRuntimeSettingsSnapshot(filePath),
        (err) => err.code === 'SNAPSHOT_INVALID_JSON'
      );
    } finally {
      cleanup(tmpDir);
    }
  });

  it('readRuntimeSettingsSnapshot throws on missing settings object', () => {
    const tmpDir = makeTmpDir();
    try {
      const filePath = path.join(tmpDir, 'no-settings.json');
      fs.writeFileSync(filePath, JSON.stringify({ snapshotId: 'x' }), 'utf8');
      throws(
        () => readRuntimeSettingsSnapshot(filePath),
        (err) => err.code === 'SNAPSHOT_MISSING_SETTINGS'
      );
    } finally {
      cleanup(tmpDir);
    }
  });

  // --- resolveSnapshotPath ---

  it('resolveSnapshotPath returns path when env var is set', () => {
    strictEqual(
      resolveSnapshotPath({ RUNTIME_SETTINGS_SNAPSHOT: '/path/to/snapshot.json' }),
      '/path/to/snapshot.json'
    );
  });

  it('resolveSnapshotPath returns null when env var is empty', () => {
    strictEqual(resolveSnapshotPath({ RUNTIME_SETTINGS_SNAPSHOT: '' }), null);
  });

  it('resolveSnapshotPath returns null when env var is missing', () => {
    strictEqual(resolveSnapshotPath({}), null);
  });

  it('resolveSnapshotPath trims whitespace', () => {
    strictEqual(
      resolveSnapshotPath({ RUNTIME_SETTINGS_SNAPSHOT: '  /path/snapshot.json  ' }),
      '/path/snapshot.json'
    );
  });
});
