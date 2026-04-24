import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createGlobalPromptsHandler } from '../globalPromptsHandler.js';
import {
  setGlobalPromptsSnapshot,
  loadGlobalPromptsSync,
  GLOBAL_PROMPTS_FILENAME,
} from '../../../core/llm/prompts/globalPromptStore.js';
import {
  GLOBAL_PROMPT_KEYS,
  GLOBAL_PROMPTS,
} from '../../../core/llm/prompts/globalPromptRegistry.js';

const TMP_DIRS = [];
const origCwd = process.cwd();

async function makeTmpWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gp-handler-'));
  TMP_DIRS.push(root);
  await fs.mkdir(path.join(root, '.workspace', 'global'), { recursive: true });
  return root;
}

async function withTmpWorkspace(callback) {
  const root = await makeTmpWorkspace();
  const previousCwd = process.cwd();
  process.chdir(root);
  try {
    return await callback(root);
  } finally {
    process.chdir(previousCwd);
  }
}

after(async () => {
  process.chdir(origCwd);
  for (const dir of TMP_DIRS) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function buildHandler() {
  let lastResponse = null;
  const broadcasts = [];
  const handler = createGlobalPromptsHandler({
    jsonRes: (_res, status, body) => { lastResponse = { status, body }; },
    readJsonBody: async (req) => req._body ?? {},
    broadcastWs: (event, payload) => broadcasts.push({ event, payload }),
  });
  return {
    handler,
    broadcasts,
    async get() {
      lastResponse = null;
      await handler(['llm-policy', 'global-prompts'], {}, 'GET', {}, {});
      return lastResponse;
    },
    async put(body) {
      lastResponse = null;
      await handler(['llm-policy', 'global-prompts'], {}, 'PUT', { _body: body }, {});
      return lastResponse;
    },
  };
}

describe('globalPromptsHandler — routing', () => {
  beforeEach(() => setGlobalPromptsSnapshot({}));

  it('returns false for non-matching route', async () => {
    const { handler } = buildHandler();
    const result = await handler(['other'], {}, 'GET', {}, {});
    assert.equal(result, false);
  });

  it('returns false for llm-policy without global-prompts segment', async () => {
    const { handler } = buildHandler();
    const result = await handler(['llm-policy'], {}, 'GET', {}, {});
    assert.equal(result, false);
  });
});

describe('GET /llm-policy/global-prompts', () => {
  beforeEach(() => setGlobalPromptsSnapshot({}));

  it('returns 200 with registry metadata and empty overrides', async () => {
    const { get } = buildHandler();
    const res = await get();
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual([...res.body.keys].sort(), [...GLOBAL_PROMPT_KEYS].sort());
    for (const key of GLOBAL_PROMPT_KEYS) {
      const entry = res.body.prompts[key];
      assert.equal(entry.label, GLOBAL_PROMPTS[key].label);
      assert.equal(entry.defaultTemplate, GLOBAL_PROMPTS[key].defaultTemplate);
      assert.equal(entry.override, '');
    }
  });

  it('surfaces current in-memory override in the response', async () => {
    setGlobalPromptsSnapshot({ identityWarningMedium: 'my-custom' });
    const { get } = buildHandler();
    const res = await get();
    assert.equal(res.body.prompts.identityWarningMedium.override, 'my-custom');
    assert.equal(res.body.prompts.identityWarningHard.override, '');
  });
});

describe('PUT /llm-policy/global-prompts', () => {
  beforeEach(() => setGlobalPromptsSnapshot({}));

  it('persists valid patch and returns updated snapshot', async () => {
    await withTmpWorkspace(async (root) => {
      const { put, broadcasts } = buildHandler();
      const res = await put({ identityWarningMedium: 'new-med', siblingsExclusion: 'new-sib' });
      assert.equal(res.status, 200);
      assert.equal(res.body.prompts.identityWarningMedium.override, 'new-med');
      assert.equal(res.body.prompts.siblingsExclusion.override, 'new-sib');
      const disk = JSON.parse(await fs.readFile(
        path.join(root, '.workspace', 'global', GLOBAL_PROMPTS_FILENAME),
        'utf8',
      ));
      assert.deepEqual(disk, { identityWarningMedium: 'new-med', siblingsExclusion: 'new-sib' });
      assert.ok(broadcasts.length > 0);
      assert.equal(broadcasts[0].payload.event, 'user-settings-updated');
      assert.equal(broadcasts[0].payload.meta?.source, 'global-prompts');
    });
  });

  it('422s on unknown key', async () => {
    await withTmpWorkspace(async () => {
      const { put } = buildHandler();
      const res = await put({ notARealKey: 'value' });
      assert.equal(res.status, 422);
      assert.equal(res.body.ok, false);
      assert.equal(res.body.error, 'invalid_global_prompts_patch');
    });
  });

  it('422s on non-string value (array)', async () => {
    await withTmpWorkspace(async () => {
      const { put } = buildHandler();
      const res = await put({ identityWarningMedium: ['not', 'a', 'string'] });
      assert.equal(res.status, 422);
    });
  });

  it('accepts null value (removes key)', async () => {
    await withTmpWorkspace(async (root) => {
      const { put } = buildHandler();
      await put({ identityWarningMedium: 'med-1' });
      const res = await put({ identityWarningMedium: null });
      assert.equal(res.status, 200);
      assert.equal(res.body.prompts.identityWarningMedium.override, '');
      const disk = JSON.parse(await fs.readFile(
        path.join(root, '.workspace', 'global', GLOBAL_PROMPTS_FILENAME),
        'utf8',
      ));
      assert.deepEqual(disk, {});
    });
  });

  it('merges patch on top of existing disk state', async () => {
    await withTmpWorkspace(async (root) => {
      const { put } = buildHandler();
      await put({ identityWarningMedium: 'med' });
      await put({ identityWarningHard: 'hard' });
      const disk = JSON.parse(await fs.readFile(
        path.join(root, '.workspace', 'global', GLOBAL_PROMPTS_FILENAME),
        'utf8',
      ));
      assert.deepEqual(disk, { identityWarningMedium: 'med', identityWarningHard: 'hard' });
    });
  });

  it('round-trip: PUT → loadGlobalPromptsSync → getGlobalPrompts returns persisted value', async () => {
    await withTmpWorkspace(async () => {
      const { put } = buildHandler();
      await put({ evidenceContract: 'custom-evidence' });
      setGlobalPromptsSnapshot({});
      loadGlobalPromptsSync();
      const { get } = buildHandler();
      const res = await get();
      assert.equal(res.body.prompts.evidenceContract.override, 'custom-evidence');
    });
  });
});
