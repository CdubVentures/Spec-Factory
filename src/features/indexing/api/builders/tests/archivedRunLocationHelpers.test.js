import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  initArchivedRunLocationHelpers,
  resolveArchivedLocalRoot,
  resolveArchivedS3Settings,
  buildArchivedRunIndexRootToken,
  buildArchivedS3CacheRoot,
  materializeArchivedRunLocation,
  refreshArchivedRunDirIndex,
  resolveArchivedIndexLabRunDirectory,
} from '../archivedRunLocationHelpers.js';

// --- helpers ---
async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'archived-helpers-'));
}

async function writeRunMeta(baseDir, category, product, runId) {
  const runDir = path.join(baseDir, category, product, runId, 'indexlab');
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'run.json'), JSON.stringify({ run_id: runId }));
  return runDir;
}

function makeS3Storage(keyMap = {}) {
  return {
    listKeys: async (prefix) => Object.keys(keyMap).filter((k) => k.startsWith(prefix)),
    readBuffer: async (key) => Buffer.from(keyMap[key] ?? '', 'utf8'),
  };
}

function configureArchivedRunLocation({
  outputRoot = '/tmp',
  runDataArchiveStorage = null,
  runDataStorageState = null,
} = {}) {
  initArchivedRunLocationHelpers({
    outputRoot,
    runDataArchiveStorage,
    runDataStorageState,
  });
}

function createLocalArchiveState(overrides = {}) {
  return {
    enabled: true,
    destinationType: 'local',
    localDirectory: '/archive',
    ...overrides,
  };
}

function createS3ArchiveState(overrides = {}) {
  return {
    enabled: true,
    destinationType: 's3',
    s3Prefix: 'runs',
    ...overrides,
  };
}

// --- tests ---

describe('initArchivedRunLocationHelpers', () => {
  it('sets state without throwing', () => {
    assert.doesNotThrow(() =>
      configureArchivedRunLocation(),
    );
  });

  it('resets caches on re-init', async () => {
    const tmpDir = await makeTmpDir();
    try {
      await writeRunMeta(tmpDir, 'mouse', 'prod-a', 'run-1');
      configureArchivedRunLocation({
        outputRoot: tmpDir,
        runDataStorageState: createLocalArchiveState({ localDirectory: tmpDir }),
      });
      const idx1 = await refreshArchivedRunDirIndex(true);
      assert.ok(idx1.size > 0, 'should have entries after scan');

      configureArchivedRunLocation();
      const idx2 = await refreshArchivedRunDirIndex(false);
      assert.equal(idx2.size, 0, 'should be empty after re-init with no archive');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('resolveArchivedLocalRoot', () => {
  it('returns empty string when state is null', () => {
    configureArchivedRunLocation();
    assert.equal(resolveArchivedLocalRoot(), '');
  });

  it('returns empty string when enabled is false', () => {
    configureArchivedRunLocation({
      runDataStorageState: createLocalArchiveState({ enabled: false }),
    });
    assert.equal(resolveArchivedLocalRoot(), '');
  });

  it('returns empty string when type is not local', () => {
    configureArchivedRunLocation({
      runDataStorageState: createS3ArchiveState({ localDirectory: '/archive' }),
    });
    assert.equal(resolveArchivedLocalRoot(), '');
  });

  it('returns empty string when localDirectory is empty', () => {
    configureArchivedRunLocation({
      runDataStorageState: createLocalArchiveState({ localDirectory: '' }),
    });
    assert.equal(resolveArchivedLocalRoot(), '');
  });

  it('returns resolved path for valid local config', () => {
    configureArchivedRunLocation({
      runDataStorageState: createLocalArchiveState({ localDirectory: '/some/archive' }),
    });
    const result = resolveArchivedLocalRoot();
    assert.equal(result, path.resolve('/some/archive'));
  });
});

describe('resolveArchivedS3Settings', () => {
  it('returns null when state is null', () => {
    configureArchivedRunLocation();
    assert.equal(resolveArchivedS3Settings(), null);
  });

  it('returns null when enabled is false', () => {
    configureArchivedRunLocation({
      runDataArchiveStorage: makeS3Storage(),
      runDataStorageState: createS3ArchiveState({ enabled: false }),
    });
    assert.equal(resolveArchivedS3Settings(), null);
  });

  it('returns null when type is not s3', () => {
    configureArchivedRunLocation({
      runDataArchiveStorage: makeS3Storage(),
      runDataStorageState: createLocalArchiveState({ s3Prefix: 'runs' }),
    });
    assert.equal(resolveArchivedS3Settings(), null);
  });

  it('returns null when s3Prefix is empty', () => {
    configureArchivedRunLocation({
      runDataArchiveStorage: makeS3Storage(),
      runDataStorageState: createS3ArchiveState({ s3Prefix: '' }),
    });
    assert.equal(resolveArchivedS3Settings(), null);
  });

  it('returns null when storage has no listKeys', () => {
    configureArchivedRunLocation({
      runDataArchiveStorage: {},
      runDataStorageState: createS3ArchiveState(),
    });
    assert.equal(resolveArchivedS3Settings(), null);
  });

  it('returns settings for valid s3 config', () => {
    const storage = makeS3Storage();
    configureArchivedRunLocation({
      runDataArchiveStorage: storage,
      runDataStorageState: createS3ArchiveState({ s3Prefix: 'data/runs' }),
    });
    const result = resolveArchivedS3Settings();
    assert.deepEqual(result, { s3Prefix: 'data/runs', storage });
  });
});

describe('buildArchivedRunIndexRootToken', () => {
  it('returns empty string when no archive is configured', () => {
    configureArchivedRunLocation();
    assert.equal(buildArchivedRunIndexRootToken(), '');
  });

  it('returns local token when only local is configured', () => {
    configureArchivedRunLocation({
      runDataStorageState: createLocalArchiveState(),
    });
    const token = buildArchivedRunIndexRootToken();
    assert.ok(token.startsWith('local:'), `expected local: prefix, got: ${token}`);
    assert.ok(!token.includes('s3:'));
  });

  it('returns s3 token when only s3 is configured', () => {
    configureArchivedRunLocation({
      runDataArchiveStorage: makeS3Storage(),
      runDataStorageState: createS3ArchiveState({ s3Prefix: 'data/runs' }),
    });
    const token = buildArchivedRunIndexRootToken();
    assert.ok(token.startsWith('s3:'), `expected s3: prefix, got: ${token}`);
    assert.ok(!token.includes('local:'));
  });
});

describe('buildArchivedS3CacheRoot', () => {
  it('builds correct path', () => {
    configureArchivedRunLocation({ outputRoot: '/tmp/output' });
    const result = buildArchivedS3CacheRoot('run-abc-123');
    assert.ok(result.includes('_runtime'));
    assert.ok(result.includes('archived_runs'));
    assert.ok(result.includes('s3'));
    assert.ok(result.includes('run-abc-123'));
  });

  it('sanitizes special characters', () => {
    configureArchivedRunLocation({ outputRoot: '/tmp/output' });
    const result = buildArchivedS3CacheRoot('run/with\\special chars!');
    assert.ok(!result.includes('!'), 'should not contain special chars in the runId segment');
  });

  it('falls back to "run" for empty runId', () => {
    configureArchivedRunLocation({ outputRoot: '/tmp/output' });
    const result = buildArchivedS3CacheRoot('');
    assert.ok(result.endsWith(path.join('s3', 'run')));
  });
});

describe('materializeArchivedRunLocation', () => {
  it('returns empty string for null location', async () => {
    configureArchivedRunLocation();
    assert.equal(await materializeArchivedRunLocation(null, 'run-1'), '');
  });

  it('returns empty string for non-object location', async () => {
    configureArchivedRunLocation();
    assert.equal(await materializeArchivedRunLocation('string', 'run-1'), '');
  });

  it('returns runDir for local type', async () => {
    configureArchivedRunLocation();
    const result = await materializeArchivedRunLocation({ type: 'local', runDir: '/some/path' }, 'run-1');
    assert.equal(result, '/some/path');
  });

  it('returns empty string for unknown type', async () => {
    configureArchivedRunLocation();
    const result = await materializeArchivedRunLocation({ type: 'unknown' }, 'run-1');
    assert.equal(result, '');
  });
});

describe('refreshArchivedRunDirIndex', () => {
  it('returns empty Map when no archive configured', async () => {
    configureArchivedRunLocation();
    const idx = await refreshArchivedRunDirIndex(false);
    assert.ok(idx instanceof Map);
    assert.equal(idx.size, 0);
  });

  it('scans local directory tree and returns Map with entries', async () => {
    const tmpDir = await makeTmpDir();
    try {
      await writeRunMeta(tmpDir, 'mouse', 'prod-a', 'run-001');
      await writeRunMeta(tmpDir, 'mouse', 'prod-b', 'run-002');

      configureArchivedRunLocation({
        outputRoot: tmpDir,
        runDataStorageState: createLocalArchiveState({ localDirectory: tmpDir }),
      });

      const idx = await refreshArchivedRunDirIndex(true);
      assert.ok(idx.size >= 2, `expected at least 2 entries, got ${idx.size}`);
      assert.ok(idx.has('run-001'));
      assert.ok(idx.has('run-002'));
      assert.equal(idx.get('run-001').type, 'local');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns cached index within TTL (no force)', async () => {
    const tmpDir = await makeTmpDir();
    try {
      await writeRunMeta(tmpDir, 'mouse', 'prod-a', 'run-ttl');
      configureArchivedRunLocation({
        outputRoot: tmpDir,
        runDataStorageState: createLocalArchiveState({ localDirectory: tmpDir }),
      });

      const idx1 = await refreshArchivedRunDirIndex(true);
      const idx2 = await refreshArchivedRunDirIndex(false);
      assert.equal(idx1, idx2, 'should return same Map reference within TTL');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('resolveArchivedIndexLabRunDirectory', () => {
  it('returns empty string for empty runId', async () => {
    configureArchivedRunLocation();
    assert.equal(await resolveArchivedIndexLabRunDirectory(''), '');
  });

  it('resolves known runId to directory', async () => {
    const tmpDir = await makeTmpDir();
    try {
      const runDir = await writeRunMeta(tmpDir, 'mouse', 'prod-a', 'run-resolve');
      configureArchivedRunLocation({
        outputRoot: tmpDir,
        runDataStorageState: createLocalArchiveState({ localDirectory: tmpDir }),
      });

      const result = await resolveArchivedIndexLabRunDirectory('run-resolve');
      assert.equal(result, runDir);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns empty string for unknown runId with no archive', async () => {
    configureArchivedRunLocation();
    assert.equal(await resolveArchivedIndexLabRunDirectory('nonexistent'), '');
  });
});
