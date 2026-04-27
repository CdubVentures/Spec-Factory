/**
 * Contract tests for the global prompt store — in-memory snapshot +
 * disk round-trip.
 */
import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AppDb } from '../../../../db/appDb.js';
import {
  getGlobalPrompts,
  setGlobalPromptsSnapshot,
  loadGlobalPromptsSync,
  writeGlobalPromptsPatch,
  GLOBAL_PROMPTS_FILENAME,
  GLOBAL_PROMPTS_SETTINGS_SECTION,
} from '../globalPromptStore.js';

const TMP_DIRS = [];

afterEach(() => setGlobalPromptsSnapshot({}));

async function makeTmpRoot() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gp-store-'));
  TMP_DIRS.push(dir);
  return dir;
}

after(async () => {
  for (const dir of TMP_DIRS) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('getGlobalPrompts / setGlobalPromptsSnapshot', () => {
  beforeEach(() => setGlobalPromptsSnapshot({}));

  it('fresh snapshot returns empty object', () => {
    assert.deepEqual(getGlobalPrompts(), {});
  });

  it('setGlobalPromptsSnapshot replaces current snapshot', () => {
    setGlobalPromptsSnapshot({ identityWarningMedium: 'A' });
    assert.deepEqual(getGlobalPrompts(), { identityWarningMedium: 'A' });
    setGlobalPromptsSnapshot({ identityWarningHard: 'B' });
    assert.deepEqual(getGlobalPrompts(), { identityWarningHard: 'B' });
  });

  it('setGlobalPromptsSnapshot normalizes null/undefined/non-object to empty', () => {
    setGlobalPromptsSnapshot(null);
    assert.deepEqual(getGlobalPrompts(), {});
    setGlobalPromptsSnapshot('string');
    assert.deepEqual(getGlobalPrompts(), {});
    setGlobalPromptsSnapshot(['array']);
    assert.deepEqual(getGlobalPrompts(), {});
  });

  it('returned snapshot is a frozen copy (no external mutation)', () => {
    setGlobalPromptsSnapshot({ identityWarningMedium: 'X' });
    const snap = getGlobalPrompts();
    assert.throws(() => { snap.identityWarningMedium = 'Y'; });
    assert.equal(getGlobalPrompts().identityWarningMedium, 'X');
  });
});

describe('loadGlobalPromptsSync', () => {
  beforeEach(() => setGlobalPromptsSnapshot({}));

  it('missing file → empty snapshot', async () => {
    const root = await makeTmpRoot();
    const out = loadGlobalPromptsSync({ settingsRoot: root });
    assert.deepEqual(out, {});
    assert.deepEqual(getGlobalPrompts(), {});
  });

  it('valid file populates snapshot', async () => {
    const root = await makeTmpRoot();
    await fs.writeFile(
      path.join(root, GLOBAL_PROMPTS_FILENAME),
      JSON.stringify({ identityWarningMedium: 'custom-med', siblingsExclusion: 'custom-sib' }),
      'utf8',
    );
    const out = loadGlobalPromptsSync({ settingsRoot: root });
    assert.deepEqual(out, { identityWarningMedium: 'custom-med', siblingsExclusion: 'custom-sib' });
    assert.equal(getGlobalPrompts().identityWarningMedium, 'custom-med');
  });

  it('malformed JSON → empty snapshot (does not throw)', async () => {
    const root = await makeTmpRoot();
    await fs.writeFile(path.join(root, GLOBAL_PROMPTS_FILENAME), '{not valid json', 'utf8');
    const out = loadGlobalPromptsSync({ settingsRoot: root });
    assert.deepEqual(out, {});
  });

  it('non-object JSON (array) → empty snapshot', async () => {
    const root = await makeTmpRoot();
    await fs.writeFile(path.join(root, GLOBAL_PROMPTS_FILENAME), '["array not object"]', 'utf8');
    const out = loadGlobalPromptsSync({ settingsRoot: root });
    assert.deepEqual(out, {});
  });

  it('loads appDb settings before JSON when both exist', async (t) => {
    const root = await makeTmpRoot();
    const appDb = new AppDb({ dbPath: ':memory:' });
    t.after(() => appDb.close());
    appDb.upsertSetting({
      section: GLOBAL_PROMPTS_SETTINGS_SECTION,
      key: 'identityWarningMedium',
      value: 'sql-med',
      type: 'string',
    });
    await fs.writeFile(
      path.join(root, GLOBAL_PROMPTS_FILENAME),
      JSON.stringify({ identityWarningMedium: 'json-med', identityWarningHard: 'json-hard' }),
      'utf8',
    );

    const out = loadGlobalPromptsSync({ settingsRoot: root, appDb });

    assert.deepEqual(out, { identityWarningMedium: 'sql-med' });
    assert.equal(getGlobalPrompts().identityWarningMedium, 'sql-med');
    assert.equal(getGlobalPrompts().identityWarningHard, undefined);
  });

  it('rebuilds appDb prompt settings from JSON when SQL is empty', async (t) => {
    const root = await makeTmpRoot();
    const appDb = new AppDb({ dbPath: ':memory:' });
    t.after(() => appDb.close());
    await fs.writeFile(
      path.join(root, GLOBAL_PROMPTS_FILENAME),
      JSON.stringify({ evidenceContract: 'json-evidence' }),
      'utf8',
    );

    const out = loadGlobalPromptsSync({ settingsRoot: root, appDb });

    assert.deepEqual(out, { evidenceContract: 'json-evidence' });
    assert.equal(
      appDb.getSetting(GLOBAL_PROMPTS_SETTINGS_SECTION, 'evidenceContract')?.value,
      'json-evidence',
    );
  });
});

describe('writeGlobalPromptsPatch', () => {
  beforeEach(() => setGlobalPromptsSnapshot({}));

  it('writes patch to disk and updates in-memory snapshot', async () => {
    const root = await makeTmpRoot();
    await writeGlobalPromptsPatch(
      { identityWarningMedium: 'med-1' },
      { settingsRoot: root },
    );
    const disk = JSON.parse(await fs.readFile(path.join(root, GLOBAL_PROMPTS_FILENAME), 'utf8'));
    assert.deepEqual(disk, { identityWarningMedium: 'med-1' });
    assert.equal(getGlobalPrompts().identityWarningMedium, 'med-1');
  });

  it('merges patch on top of existing (preserves untouched keys)', async () => {
    const root = await makeTmpRoot();
    await writeGlobalPromptsPatch({ identityWarningMedium: 'med' }, { settingsRoot: root });
    await writeGlobalPromptsPatch({ identityWarningHard: 'hard' }, { settingsRoot: root });
    const disk = JSON.parse(await fs.readFile(path.join(root, GLOBAL_PROMPTS_FILENAME), 'utf8'));
    assert.deepEqual(disk, { identityWarningMedium: 'med', identityWarningHard: 'hard' });
  });

  it('removes a key when patch value is null', async () => {
    const root = await makeTmpRoot();
    await writeGlobalPromptsPatch({ identityWarningMedium: 'x', siblingsExclusion: 'y' }, { settingsRoot: root });
    await writeGlobalPromptsPatch({ identityWarningMedium: null }, { settingsRoot: root });
    const disk = JSON.parse(await fs.readFile(path.join(root, GLOBAL_PROMPTS_FILENAME), 'utf8'));
    assert.deepEqual(disk, { siblingsExclusion: 'y' });
  });

  it('creates settings root directory if missing', async () => {
    const parent = await makeTmpRoot();
    const root = path.join(parent, 'nested', 'global');
    await writeGlobalPromptsPatch({ identityWarningMedium: 'x' }, { settingsRoot: root });
    const disk = JSON.parse(await fs.readFile(path.join(root, GLOBAL_PROMPTS_FILENAME), 'utf8'));
    assert.deepEqual(disk, { identityWarningMedium: 'x' });
  });

  it('writes appDb settings first and mirrors JSON', async (t) => {
    const root = await makeTmpRoot();
    const appDb = new AppDb({ dbPath: ':memory:' });
    t.after(() => appDb.close());

    await writeGlobalPromptsPatch(
      { identityWarningMedium: 'sql-med', siblingsExclusion: 'sql-sib' },
      { settingsRoot: root, appDb },
    );

    const rows = Object.fromEntries(
      appDb.getSection(GLOBAL_PROMPTS_SETTINGS_SECTION).map((row) => [row.key, row.value]),
    );
    assert.deepEqual(rows, { identityWarningMedium: 'sql-med', siblingsExclusion: 'sql-sib' });
    const disk = JSON.parse(await fs.readFile(path.join(root, GLOBAL_PROMPTS_FILENAME), 'utf8'));
    assert.deepEqual(disk, { identityWarningMedium: 'sql-med', siblingsExclusion: 'sql-sib' });
    assert.equal(getGlobalPrompts().siblingsExclusion, 'sql-sib');
  });

  it('removes appDb prompt keys and mirrors the removal to JSON', async (t) => {
    const root = await makeTmpRoot();
    const appDb = new AppDb({ dbPath: ':memory:' });
    t.after(() => appDb.close());
    await writeGlobalPromptsPatch(
      { identityWarningMedium: 'med', siblingsExclusion: 'sib' },
      { settingsRoot: root, appDb },
    );

    await writeGlobalPromptsPatch(
      { identityWarningMedium: null },
      { settingsRoot: root, appDb },
    );

    assert.equal(appDb.getSetting(GLOBAL_PROMPTS_SETTINGS_SECTION, 'identityWarningMedium'), null);
    assert.equal(
      appDb.getSetting(GLOBAL_PROMPTS_SETTINGS_SECTION, 'siblingsExclusion')?.value,
      'sib',
    );
    const disk = JSON.parse(await fs.readFile(path.join(root, GLOBAL_PROMPTS_FILENAME), 'utf8'));
    assert.deepEqual(disk, { siblingsExclusion: 'sib' });
  });
});
