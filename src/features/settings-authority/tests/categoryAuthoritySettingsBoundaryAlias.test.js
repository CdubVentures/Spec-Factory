import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  loadUserSettingsSync,
  persistUserSettingsSections,
} from '../userSettingsService.js';
import { AppDb } from '../../../db/appDb.js';

const USER_SETTINGS_RELATIVE_PATH = path.join('_runtime', 'user-settings.json');
const LEGACY_HELPER_DIR = `helper${'_files'}`;

async function withTempWorkspace(run) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-category-authority-root-'));
  const previousCwd = process.cwd();
  process.chdir(workspace);

  try {
    await run({ workspace });
  } finally {
    process.chdir(previousCwd);
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

async function writeUserSettings(root, payload) {
  await fs.mkdir(path.join(root, '_runtime'), { recursive: true });
  await fs.writeFile(
    path.join(root, USER_SETTINGS_RELATIVE_PATH),
    JSON.stringify(payload, null, 2) + '\n',
    'utf8',
  );
}

test('loadUserSettingsSync reads settings from categoryAuthorityRoot alias', async () => {
  await withTempWorkspace(async ({ workspace }) => {
    const categoryAuthorityRoot = path.join(workspace, 'category-root');
    await writeUserSettings(categoryAuthorityRoot, {
      schemaVersion: 2,
      runtime: {},
      convergence: {},
      storage: {
        enabled: false,
        destinationType: 'local',
        localDirectory: '',
        awsRegion: '',
        s3Bucket: '',
        s3Prefix: '',
        s3AccessKeyId: '',
        s3SecretAccessKey: '',
        s3SessionToken: '',
        updatedAt: null,
      },
      studio: {},
      ui: {
        studioAutoSaveAllEnabled: true,
        studioAutoSaveEnabled: false,
        studioAutoSaveMapEnabled: false,
        runtimeAutoSaveEnabled: false,
      },
    });

    const loaded = loadUserSettingsSync({
      categoryAuthorityRoot,
      strictRead: true,
    });
    assert.equal(loaded.ui.studioAutoSaveAllEnabled, true);
    assert.equal(loaded.ui.runtimeAutoSaveEnabled, false);
  });
});

test('persistUserSettingsSections round-trips settings via SQL', async () => {
  const appDb = new AppDb({ dbPath: ':memory:' });
  try {
    await persistUserSettingsSections({
      appDb,
      ui: {
        studioAutoSaveAllEnabled: true,
        runtimeAutoSaveEnabled: false,
      },
    });

    const loaded = loadUserSettingsSync({ appDb });
    assert.equal(loaded.ui.studioAutoSaveAllEnabled, true);
    assert.equal(loaded.ui.runtimeAutoSaveEnabled, false);
  } finally {
    appDb.close();
  }
});

test('loadUserSettingsSync defaults to canonical category_authority root when no root options are provided', async () => {
  await withTempWorkspace(async ({ workspace }) => {
    const canonicalRoot = path.join(workspace, 'category_authority');
    const legacyRoot = path.join(workspace, LEGACY_HELPER_DIR);

    await writeUserSettings(canonicalRoot, {
      schemaVersion: 2,
      runtime: {},
      convergence: {},
      storage: {
        enabled: false,
        destinationType: 'local',
        localDirectory: '',
        awsRegion: '',
        s3Bucket: '',
        s3Prefix: '',
        s3AccessKeyId: '',
        s3SecretAccessKey: '',
        s3SessionToken: '',
        updatedAt: null,
      },
      studio: {},
      ui: {
        studioAutoSaveAllEnabled: true,
        studioAutoSaveEnabled: true,
        studioAutoSaveMapEnabled: true,
        runtimeAutoSaveEnabled: false,
      },
    });

    await writeUserSettings(legacyRoot, {
      schemaVersion: 2,
      runtime: {},
      convergence: {},
      storage: {
        enabled: false,
        destinationType: 'local',
        localDirectory: '',
        awsRegion: '',
        s3Bucket: '',
        s3Prefix: '',
        s3AccessKeyId: '',
        s3SecretAccessKey: '',
        s3SessionToken: '',
        updatedAt: null,
      },
      studio: {},
      ui: {
        studioAutoSaveAllEnabled: false,
        studioAutoSaveEnabled: false,
        studioAutoSaveMapEnabled: false,
        runtimeAutoSaveEnabled: true,
      },
    });

    const loaded = loadUserSettingsSync({ strictRead: true });
    assert.equal(loaded.ui.studioAutoSaveAllEnabled, true);
    assert.equal(loaded.ui.runtimeAutoSaveEnabled, false);
  });
});

test('persistUserSettingsSections persists and reads back via appDb', async () => {
  const appDb = new AppDb({ dbPath: ':memory:' });
  try {
    await persistUserSettingsSections({
      appDb,
      ui: {
        studioAutoSaveAllEnabled: true,
        runtimeAutoSaveEnabled: false,
      },
    });

    const loaded = loadUserSettingsSync({ appDb });
    assert.equal(loaded.ui.studioAutoSaveAllEnabled, true);
    assert.equal(loaded.ui.runtimeAutoSaveEnabled, false);
  } finally {
    appDb.close();
  }
});
