import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { registerConfigRoutes } from '../configRoutes.js';
import { AppDb } from '../../../../db/appDb.js';
import {
  GLOBAL_PROMPTS_FILENAME,
  GLOBAL_PROMPTS_SETTINGS_SECTION,
  setGlobalPromptsSnapshot,
} from '../../../../core/llm/prompts/globalPromptStore.js';

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function makeCtx(overrides = {}) {
  const base = {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    config: {},
    toInt,
    collectLlmModels: () => [],
    llmProviderFromModel: () => '',
    resolvePricingForModel: () => ({}),
    resolveTokenProfileForModel: () => ({}),
    resolveLlmRoleDefaults: () => ({}),
    resolveLlmKnobDefaults: () => ({}),
    llmRoutingSnapshot: () => ({}),
    buildLlmMetrics: async () => ({}),
    buildIndexingDomainChecklist: async () => ({}),
    buildReviewMetrics: async () => ({}),
    getSpecDb: () => null,
    storage: {},
    OUTPUT_ROOT: 'out',
    broadcastWs: () => {},
    HELPER_ROOT: path.resolve('category_authority'),
  };
  return { ...base, ...overrides };
}

test('config routes wire global prompts through appDb runtime settings', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'config-global-prompts-'));
  const previousCwd = process.cwd();
  process.chdir(root);
  t.after(async () => {
    process.chdir(previousCwd);
    setGlobalPromptsSnapshot({});
    await fs.rm(root, { recursive: true, force: true });
  });

  const globalRoot = path.join(root, '.workspace', 'global');
  await fs.mkdir(globalRoot, { recursive: true });
  await fs.writeFile(
    path.join(globalRoot, GLOBAL_PROMPTS_FILENAME),
    JSON.stringify({ identityWarningHard: 'json-hard' }),
    'utf8',
  );
  setGlobalPromptsSnapshot({ identityWarningHard: 'memory-hard' });

  const appDb = new AppDb({ dbPath: ':memory:' });
  t.after(() => appDb.close());
  appDb.upsertSetting({
    section: GLOBAL_PROMPTS_SETTINGS_SECTION,
    key: 'identityWarningHard',
    value: 'sql-hard',
    type: 'string',
  });

  const handler = registerConfigRoutes(makeCtx({ appDb }));
  const result = await handler(
    ['llm-policy', 'global-prompts'],
    new URLSearchParams(),
    'GET',
    {},
    {},
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.prompts.identityWarningHard.override, 'sql-hard');
});
