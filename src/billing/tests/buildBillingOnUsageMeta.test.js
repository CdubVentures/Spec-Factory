// WHY: Contract tests for the three new meta fields (effort_level, web_search_enabled, duration_ms)
// that buildBillingOnUsage must persist from the onUsage payload into billing entry meta.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBillingOnUsage } from '../costLedger.js';

function makeMockAppDb() {
  const inserted = [];
  return {
    inserted,
    insertBillingEntry(entry) { inserted.push(entry); },
  };
}

function makeUsageRow(overrides = {}) {
  return {
    provider: 'openai',
    model: 'gpt-5.4',
    prompt_tokens: 100,
    completion_tokens: 50,
    cached_prompt_tokens: 0,
    total_tokens: 150,
    cost_usd: 0.005,
    reason: 'extract',
    estimated_usage: false,
    retry_without_schema: false,
    deepseek_mode_detected: false,
    json_schema_requested: true,
    ...overrides,
  };
}

function parseMeta(appDb) {
  const row = appDb.inserted[0];
  return JSON.parse(row.meta);
}

describe('buildBillingOnUsage meta fields', () => {
  it('persists effort_level, web_search_enabled, and duration_ms into meta', async () => {
    const appDb = makeMockAppDb();
    const onUsage = buildBillingOnUsage({ config: { specDbDir: '/tmp' }, appDb, category: 'mouse', productId: 'mouse-1' });
    await onUsage(makeUsageRow({ effort_level: 'high', web_search_enabled: true, duration_ms: 2345 }));

    assert.equal(appDb.inserted.length, 1);
    const meta = parseMeta(appDb);
    assert.equal(meta.effort_level, 'high');
    assert.equal(meta.web_search_enabled, true);
    assert.equal(meta.duration_ms, 2345);
  });

  it('defaults missing fields to safe values', async () => {
    const appDb = makeMockAppDb();
    const onUsage = buildBillingOnUsage({ config: { specDbDir: '/tmp' }, appDb, category: 'mouse', productId: 'mouse-1' });
    await onUsage(makeUsageRow());

    const meta = parseMeta(appDb);
    assert.equal(meta.effort_level, '');
    assert.equal(meta.web_search_enabled, false);
    assert.equal(meta.duration_ms, 0);
  });

  it('coerces non-numeric duration_ms to 0', async () => {
    const appDb = makeMockAppDb();
    const onUsage = buildBillingOnUsage({ config: { specDbDir: '/tmp' }, appDb, category: 'mouse', productId: 'mouse-1' });
    await onUsage(makeUsageRow({ duration_ms: 'abc' }));

    const meta = parseMeta(appDb);
    assert.equal(meta.duration_ms, 0);
  });

  it('preserves baked effort string xhigh', async () => {
    const appDb = makeMockAppDb();
    const onUsage = buildBillingOnUsage({ config: { specDbDir: '/tmp' }, appDb, category: 'mouse', productId: 'mouse-1' });
    await onUsage(makeUsageRow({ effort_level: 'xhigh' }));

    const meta = parseMeta(appDb);
    assert.equal(meta.effort_level, 'xhigh');
  });

  it('preserves empty string effort_level', async () => {
    const appDb = makeMockAppDb();
    const onUsage = buildBillingOnUsage({ config: { specDbDir: '/tmp' }, appDb, category: 'mouse', productId: 'mouse-1' });
    await onUsage(makeUsageRow({ effort_level: '' }));

    const meta = parseMeta(appDb);
    assert.equal(meta.effort_level, '');
  });
});

describe('buildBillingOnUsage sent_tokens', () => {
  it('persists sent_tokens from the onUsage payload into the inserted row', async () => {
    const appDb = makeMockAppDb();
    const onUsage = buildBillingOnUsage({ config: { specDbDir: '/tmp' }, appDb, category: 'mouse', productId: 'mouse-1' });
    await onUsage(makeUsageRow({ sent_tokens: 500 }));
    assert.equal(appDb.inserted[0].sent_tokens, 500);
  });

  it('defaults missing sent_tokens to 0', async () => {
    const appDb = makeMockAppDb();
    const onUsage = buildBillingOnUsage({ config: { specDbDir: '/tmp' }, appDb, category: 'mouse', productId: 'mouse-1' });
    await onUsage(makeUsageRow());
    assert.equal(appDb.inserted[0].sent_tokens, 0);
  });

  it('coerces non-numeric sent_tokens to 0', async () => {
    const appDb = makeMockAppDb();
    const onUsage = buildBillingOnUsage({ config: { specDbDir: '/tmp' }, appDb, category: 'mouse', productId: 'mouse-1' });
    await onUsage(makeUsageRow({ sent_tokens: 'abc' }));
    assert.equal(appDb.inserted[0].sent_tokens, 0);
  });
});
