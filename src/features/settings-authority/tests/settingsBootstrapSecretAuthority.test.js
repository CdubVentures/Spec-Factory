import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRuntimeSettingsToConfig, mergeAndPersistRuntimePatch } from '../userSettingsService.js';
import { AppDb } from '../../../db/appDb.js';

// ── Step 4: Bootstrap mode applies empty-string secrets from SQL ─────────────

test('bootstrap mode applies empty-string secret from SQL (SQL is sole authority)', () => {
  const config = { geminiApiKey: 'leftover-from-init' };

  applyRuntimeSettingsToConfig(config, { geminiApiKey: '' }, { mode: 'bootstrap' });

  assert.equal(config.geminiApiKey, '',
    'empty secret from SQL should overwrite config in bootstrap mode');
});

// ── Step 5a: Unrelated patch does NOT heal blank secrets ─────────────────────

test('mergeAndPersistRuntimePatch does not heal blank secrets from config', async (t) => {
  const appDb = new AppDb({ dbPath: ':memory:' });
  t.after(() => appDb.close());

  // Seed SQL with a blank geminiApiKey
  appDb.upsertSetting({ section: 'runtime', key: 'geminiApiKey', value: '', type: 'string' });
  appDb.upsertSetting({ section: 'runtime', key: 'llmTimeoutMs', value: '30000', type: 'string' });

  // Config has a value (as if it came from env in the old world)
  const config = { geminiApiKey: 'from-env', llmTimeoutMs: 30000 };

  const { sanitizedPatch } = await mergeAndPersistRuntimePatch({
    appDb,
    patch: { llmTimeoutMs: 45000 },
    config,
  });

  assert.equal(Object.hasOwn(sanitizedPatch, 'geminiApiKey'), false,
    'sanitizedPatch must not contain healed secret');

  // Verify SQL still has blank
  const rows = appDb.getSection('runtime');
  const geminiRow = rows.find((r) => r.key === 'geminiApiKey');
  assert.equal(geminiRow?.value, '',
    'SQL geminiApiKey must remain blank (no healing)');
});
