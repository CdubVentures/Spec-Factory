/**
 * Contract tests for the global prompt store — in-memory snapshot +
 * disk round-trip.
 */
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  getGlobalPrompts,
  setGlobalPromptsSnapshot,
  loadGlobalPromptsSync,
  writeGlobalPromptsPatch,
  GLOBAL_PROMPTS_FILENAME,
} from '../globalPromptStore.js';

const TMP_DIRS = [];

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
});
