// WHY: Golden-master characterization tests locking return shapes of the
// settings I/O functions. Written against current JSON implementation.
// Must continue to pass after SQL migration to prove shapes are preserved.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  loadUserSettingsSync,
  persistUserSettingsSections,
  deriveSettingsArtifactsFromUserSettings,
} from '../userSettingsService.js';
import { AppDb } from '../../../db/appDb.js';

const FIXTURE_SETTINGS = {
  schemaVersion: 2,
  runtime: {
    autoScrollEnabled: true,
    llmTimeoutMs: 30000,
    llmProvider: 'gemini',
  },
  convergence: {},
  storage: {},
  studio: {
    mouse: {
      map: { key_list: { sheet: 'Sheet1' } },
      file_path: '/test/map.json',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  },
  ui: {
    studioAutoSaveEnabled: true,
    runtimeAutoSaveEnabled: false,
  },
};

async function tmpConfig() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'settings-char-'));
  return { settingsRoot: dir, _tmpDir: dir };
}

async function writeFixture(config) {
  await fs.mkdir(config.settingsRoot, { recursive: true });
  await fs.writeFile(
    path.join(config.settingsRoot, 'user-settings.json'),
    JSON.stringify(FIXTURE_SETTINGS, null, 2),
    'utf8',
  );
}

async function cleanup(config) {
  try { await fs.rm(config._tmpDir, { recursive: true, force: true }); } catch {}
}

// ── loadUserSettingsSync shape ──

describe('characterization: loadUserSettingsSync', () => {
  it('returns full snapshot shape from valid JSON', async () => {
    const config = await tmpConfig();
    try {
      await writeFixture(config);
      const snapshot = loadUserSettingsSync({ settingsRoot: config.settingsRoot });
      assert.equal(snapshot.schemaVersion, 2);
      assert.equal(typeof snapshot.runtime, 'object');
      assert.equal(typeof snapshot.convergence, 'object');
      assert.equal(typeof snapshot.storage, 'object');
      assert.equal(typeof snapshot.studio, 'object');
      assert.equal(typeof snapshot.ui, 'object');
    } finally {
      await cleanup(config);
    }
  });

  it('returns defaults for missing file', async () => {
    const config = await tmpConfig();
    try {
      const snapshot = loadUserSettingsSync({ settingsRoot: config.settingsRoot });
      assert.equal(typeof snapshot.runtime, 'object');
      assert.equal(typeof snapshot.ui, 'object');
    } finally {
      await cleanup(config);
    }
  });

  it('sanitizes runtime values by type', async () => {
    const config = await tmpConfig();
    try {
      await writeFixture(config);
      const snapshot = loadUserSettingsSync({ settingsRoot: config.settingsRoot });
      assert.equal(typeof snapshot.runtime.autoScrollEnabled, 'boolean');
      assert.equal(typeof snapshot.runtime.llmTimeoutMs, 'number');
      assert.equal(typeof snapshot.runtime.llmProvider, 'string');
    } finally {
      await cleanup(config);
    }
  });
});

// ── persistUserSettingsSections shape ──

describe('characterization: persistUserSettingsSections', () => {
  it('runtime round-trip preserves values', async () => {
    const appDb = new AppDb({ dbPath: ':memory:' });
    try {
      const persisted = await persistUserSettingsSections({
        appDb,
        runtime: { autoScrollEnabled: false, llmTimeoutMs: 60000 },
      });
      assert.equal(persisted.schemaVersion, 2);
      assert.equal(persisted.runtime.autoScrollEnabled, false);
      assert.equal(persisted.runtime.llmTimeoutMs, 60000);
    } finally {
      appDb.close();
    }
  });

  it('ui round-trip preserves values', async () => {
    const appDb = new AppDb({ dbPath: ':memory:' });
    try {
      const persisted = await persistUserSettingsSections({
        appDb,
        ui: { runtimeAutoSaveEnabled: true },
      });
      assert.equal(persisted.ui.runtimeAutoSaveEnabled, true);
    } finally {
      appDb.close();
    }
  });

  it('returns full snapshot shape', async () => {
    const appDb = new AppDb({ dbPath: ':memory:' });
    try {
      const persisted = await persistUserSettingsSections({
        appDb,
        runtime: { autoScrollEnabled: false },
      });
      assert.equal(typeof persisted.schemaVersion, 'number');
      assert.equal(typeof persisted.runtime, 'object');
      assert.equal(typeof persisted.convergence, 'object');
      assert.equal(typeof persisted.storage, 'object');
      assert.equal(typeof persisted.studio, 'object');
      assert.equal(typeof persisted.ui, 'object');
    } finally {
      appDb.close();
    }
  });
});

// ── deriveSettingsArtifactsFromUserSettings shape ──

describe('characterization: deriveSettingsArtifactsFromUserSettings', () => {
  it('returns { snapshot, sections, legacy } shape', () => {
    const result = deriveSettingsArtifactsFromUserSettings(FIXTURE_SETTINGS);
    assert.equal(typeof result.snapshot, 'object');
    assert.equal(typeof result.sections, 'object');
    assert.equal(typeof result.legacy, 'object');
    assert.equal(result.snapshot.schemaVersion, 2);
    assert.equal(typeof result.sections.runtime, 'object');
    assert.equal(typeof result.sections.ui, 'object');
    assert.equal(typeof result.legacy.runtime, 'object');
  });
});
