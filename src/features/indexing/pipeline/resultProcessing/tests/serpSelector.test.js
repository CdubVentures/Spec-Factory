/**
 * Unit tests for the simplified SERP URL Selector:
 * - buildSerpSelectorInput (stripped to essentials)
 * - validateSelectorOutput (just keep_ids)
 * - adaptSerpSelectorOutput (deterministic enrichment)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSerpSelectorInput,
  validateSelectorOutput,
  adaptSerpSelectorOutput,
} from '../serpSelector.js';

// ---------------------------------------------------------------------------
// Shared fixture factories
// ---------------------------------------------------------------------------

function makeCategoryConfig(overrides = {}) {
  const sourceHostMap = new Map([
    ['razer.com', { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
    ['rtings.com', { host: 'rtings.com', tierName: 'lab', role: 'review', tier: 2 }],
    ['amazon.com', { host: 'amazon.com', tierName: 'retailer', role: 'retailer', tier: 3 }],
  ]);
  return {
    category: 'mouse',
    sourceHosts: [...sourceHostMap.values()],
    sourceHostMap,
    approvedRootDomains: new Set(['razer.com', 'rtings.com']),
    denylist: ['spam-site.biz'],
    validatedRegistry: { 'rtings.com': { role: 'review' } },
    ...overrides,
  };
}

function makeVariables() {
  return { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro', category: 'mouse' };
}

function makeBrandResolution() {
  return { officialDomain: 'razer.com', supportDomain: 'support.razer.com', aliases: [] };
}

function makeCandidateRow(overrides = {}) {
  return {
    url: 'https://razer.com/gaming-mice/razer-viper-v3-pro',
    host: 'razer.com',
    title: 'Razer Viper V3 Pro',
    snippet: 'Official product page for the Razer Viper V3 Pro gaming mouse',
    rank: 1,
    provider: 'serper',
    seen_in_queries: ['razer viper v3 pro'],
    seen_by_providers: ['serper'],
    approvedDomain: true,
    ...overrides,
  };
}

function makeRows(count) {
  return Array.from({ length: count }, (_, i) => makeCandidateRow({
    url: `https://example${i}.com/page`,
    host: `example${i}.com`,
    title: `Result ${i}`,
    snippet: `Snippet ${i}`,
    rank: i + 1,
    seen_in_queries: [`query-${i}`],
    seen_by_providers: ['serper'],
    approvedDomain: false,
  }));
}

// ---------------------------------------------------------------------------
// buildSerpSelectorInput
// ---------------------------------------------------------------------------

describe('buildSerpSelectorInput', () => {
  it('returns simplified input with product, candidates, max_keep', () => {
    const { selectorInput, candidateMap, overflowRows } = buildSerpSelectorInput({
      runId: 'run-1', category: 'mouse', productId: 'mouse-razer-viper-v3-pro',
      variables: makeVariables(),
      brandResolution: makeBrandResolution(),
      candidateRows: [makeCandidateRow()],
      categoryConfig: makeCategoryConfig(),
      serpSelectorUrlCap: 50,
    });

    assert.ok(selectorInput.product);
    assert.equal(selectorInput.product.brand, 'Razer');
    assert.equal(selectorInput.product.model, 'Viper V3 Pro');
    assert.equal(selectorInput.official_domain, 'razer.com');
    assert.equal(selectorInput.max_keep, 50);
    assert.equal(selectorInput.candidates.length, 1);
    assert.equal(candidateMap.size, 1);
    assert.equal(overflowRows.length, 0);
  });

  it('candidate has only id, url, host, title, snippet', () => {
    const { selectorInput } = buildSerpSelectorInput({
      variables: makeVariables(),
      brandResolution: makeBrandResolution(),
      candidateRows: [makeCandidateRow()],
      categoryConfig: makeCategoryConfig(),

    });

    const c = selectorInput.candidates[0];
    assert.deepEqual(Object.keys(c).sort(), ['host', 'id', 'snippet', 'title', 'url']);
  });

  it('max_keep set by serpSelectorUrlCap', () => {
    const { selectorInput } = buildSerpSelectorInput({
      variables: makeVariables(),
      brandResolution: makeBrandResolution(),
      candidateRows: [makeCandidateRow()],
      categoryConfig: makeCategoryConfig(),

      serpSelectorUrlCap: 20,
    });
    assert.equal(selectorInput.max_keep, 20);
  });

  it('max_keep uses serpSelectorUrlCap as SSOT', () => {
    // WHY: serpSelectorUrlCap is the SSOT for the URL cap.
    const { selectorInput } = buildSerpSelectorInput({
      variables: makeVariables(),
      brandResolution: makeBrandResolution(),
      candidateRows: [makeCandidateRow()],
      categoryConfig: makeCategoryConfig(),
      serpSelectorUrlCap: 100,
    });
    assert.equal(selectorInput.max_keep, 100);
  });

  it('passes full title and snippet without truncation', () => {
    const longTitle = 'A'.repeat(300);
    const longSnippet = 'B'.repeat(400);
    const { selectorInput } = buildSerpSelectorInput({
      variables: makeVariables(),
      brandResolution: makeBrandResolution(),
      candidateRows: [makeCandidateRow({ title: longTitle, snippet: longSnippet })],
      categoryConfig: makeCategoryConfig(),

    });
    assert.equal(selectorInput.candidates[0].title.length, 300);
    assert.equal(selectorInput.candidates[0].snippet.length, 400);
  });

  it('caps candidates at serpSelectorUrlCap', () => {
    const rows = makeRows(150);
    const { selectorInput, overflowRows } = buildSerpSelectorInput({
      variables: makeVariables(),
      brandResolution: makeBrandResolution(),
      candidateRows: rows,
      categoryConfig: makeCategoryConfig(),

      serpSelectorUrlCap: 50,
    });
    assert.equal(selectorInput.candidates.length, 50);
    assert.equal(overflowRows.length, 100);
  });

  it('priority rows (pinned/multi-hit) kept before normal rows', () => {
    const pinnedRow = makeCandidateRow({ url: 'https://razer.com/viper', host: 'razer.com', title: 'Pinned' });
    const normalRow = makeCandidateRow({ url: 'https://random.com/page', host: 'random.com', title: 'Normal' });
    const { selectorInput } = buildSerpSelectorInput({
      variables: makeVariables(),
      brandResolution: makeBrandResolution(),
      candidateRows: [normalRow, pinnedRow],
      categoryConfig: makeCategoryConfig(),


    });
    assert.equal(selectorInput.candidates[0].host, 'razer.com');
  });

  it('handles empty candidateRows', () => {
    const { selectorInput, candidateMap, overflowRows } = buildSerpSelectorInput({
      variables: makeVariables(),
      brandResolution: makeBrandResolution(),
      candidateRows: [],
      categoryConfig: makeCategoryConfig(),

    });
    assert.equal(selectorInput.candidates.length, 0);
    assert.equal(candidateMap.size, 0);
    assert.equal(overflowRows.length, 0);
  });

  it('serpSelectorUrlCap controls the candidate cap', () => {
    // WHY: serpSelectorUrlCap is the single SSOT for the selector input cap.
    const rows = makeRows(100);
    const { selectorInput } = buildSerpSelectorInput({
      variables: makeVariables(),
      brandResolution: makeBrandResolution(),
      candidateRows: rows,
      categoryConfig: makeCategoryConfig(),

      serpSelectorUrlCap: 80,
    });
    assert.equal(selectorInput.candidates.length, 80);
  });
});

// ---------------------------------------------------------------------------
// validateSelectorOutput
// ---------------------------------------------------------------------------

describe('validateSelectorOutput', () => {
  const ids = ['c_0', 'c_1', 'c_2'];

  it('valid output with keep_ids subset', () => {
    const result = validateSelectorOutput({
      selectorOutput: { keep_ids: ['c_0', 'c_2'] },
      candidateIds: ids,
      maxTotalKeep: 10,
    });
    assert.equal(result.valid, true);
  });

  it('valid with empty keep_ids (all rejected)', () => {
    const result = validateSelectorOutput({
      selectorOutput: { keep_ids: [] },
      candidateIds: ids,
      maxTotalKeep: 10,
    });
    assert.equal(result.valid, true);
  });

  it('fails when selectorOutput is null', () => {
    const result = validateSelectorOutput({
      selectorOutput: null,
      candidateIds: ids,
      maxTotalKeep: 10,
    });
    assert.equal(result.valid, false);
  });

  it('fails when keep_ids is not an array', () => {
    const result = validateSelectorOutput({
      selectorOutput: { keep_ids: 'c_0' },
      candidateIds: ids,
      maxTotalKeep: 10,
    });
    assert.equal(result.valid, false);
  });

  it('fails on unknown id', () => {
    const result = validateSelectorOutput({
      selectorOutput: { keep_ids: ['c_99'] },
      candidateIds: ids,
      maxTotalKeep: 10,
    });
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('unknown'));
  });

  it('fails on duplicate id', () => {
    const result = validateSelectorOutput({
      selectorOutput: { keep_ids: ['c_0', 'c_0'] },
      candidateIds: ids,
      maxTotalKeep: 10,
    });
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('duplicate'));
  });

  it('fails when keep_ids exceeds maxTotalKeep', () => {
    const result = validateSelectorOutput({
      selectorOutput: { keep_ids: ['c_0', 'c_1', 'c_2'] },
      candidateIds: ids,
      maxTotalKeep: 2,
    });
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('exceeds'));
  });

  it('fails on empty id string', () => {
    const result = validateSelectorOutput({
      selectorOutput: { keep_ids: [''] },
      candidateIds: ids,
      maxTotalKeep: 10,
    });
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// adaptSerpSelectorOutput
// ---------------------------------------------------------------------------

describe('adaptSerpSelectorOutput', () => {
  function makeMap() {
    const map = new Map();
    map.set('c_0', { url: 'https://razer.com/viper', host: 'razer.com', title: 'Viper', snippet: 'Pro mouse', approvedDomain: true });
    map.set('c_1', { url: 'https://rtings.com/mouse/razer-viper', host: 'rtings.com', title: 'Review', snippet: 'Full review', approvedDomain: false });
    map.set('c_2', { url: 'https://random.com/page', host: 'random.com', title: 'Random', snippet: 'Something', approvedDomain: false });
    return map;
  }

  it('selected array matches keep_ids order', () => {
    const { selected, notSelected } = adaptSerpSelectorOutput({
      selectorOutput: { keep_ids: ['c_1', 'c_0'] },
      candidateMap: makeMap(),
      officialDomain: 'razer.com',
      supportDomain: '',
      categoryConfig: makeCategoryConfig(),
    });
    assert.equal(selected.length, 2);
    assert.equal(selected[0].url, 'https://rtings.com/mouse/razer-viper');
    assert.equal(selected[1].url, 'https://razer.com/viper');
    assert.equal(notSelected.length, 1);
    assert.equal(notSelected[0].url, 'https://random.com/page');
  });

  it('derives host_trust_class from host deterministically', () => {
    const { selected } = adaptSerpSelectorOutput({
      selectorOutput: { keep_ids: ['c_0', 'c_1'] },
      candidateMap: makeMap(),
      officialDomain: 'razer.com',
      supportDomain: '',
      categoryConfig: makeCategoryConfig(),
    });
    assert.equal(selected[0].host_trust_class, 'official');
    assert.equal(selected[1].host_trust_class, 'trusted_specdb');
  });

  it('derives identity_prelim from host trust', () => {
    const { selected } = adaptSerpSelectorOutput({
      selectorOutput: { keep_ids: ['c_0'] },
      candidateMap: makeMap(),
      officialDomain: 'razer.com',
      supportDomain: '',
    });
    assert.equal(selected[0].identity_prelim, 'exact');
  });

  it('preserves approvedDomain from original row', () => {
    const { selected } = adaptSerpSelectorOutput({
      selectorOutput: { keep_ids: ['c_0', 'c_1'] },
      candidateMap: makeMap(),
      officialDomain: 'razer.com',
      supportDomain: '',
    });
    assert.equal(selected[0].approvedDomain, true);
    assert.equal(selected[1].approvedDomain, false);
  });

  it('rank-based score: first gets 100, last gets 1', () => {
    const { selected } = adaptSerpSelectorOutput({
      selectorOutput: { keep_ids: ['c_0', 'c_1', 'c_2'] },
      candidateMap: makeMap(),
      officialDomain: 'razer.com',
      supportDomain: '',
    });
    assert.equal(selected[0].score, 100);
    assert.ok(selected[1].score > 0 && selected[1].score < 100);
    assert.equal(selected[2].score, 1);
  });

  it('single kept item gets score 100', () => {
    const { selected } = adaptSerpSelectorOutput({
      selectorOutput: { keep_ids: ['c_0'] },
      candidateMap: makeMap(),
      officialDomain: 'razer.com',
      supportDomain: '',
    });
    assert.equal(selected[0].score, 100);
  });

  it('all kept rows have triage_disposition fetch_high', () => {
    const { selected } = adaptSerpSelectorOutput({
      selectorOutput: { keep_ids: ['c_0', 'c_1'] },
      candidateMap: makeMap(),
      officialDomain: 'razer.com',
      supportDomain: '',
    });
    for (const row of selected) {
      assert.equal(row.triage_disposition, 'fetch_high');
    }
  });

  it('not-selected rows have triage_disposition fetch_low', () => {
    const { selected, notSelected } = adaptSerpSelectorOutput({
      selectorOutput: { keep_ids: ['c_0'] },
      candidateMap: makeMap(),
      officialDomain: 'razer.com',
      supportDomain: '',
    });
    assert.equal(selected.length, 1);
    for (const row of notSelected) {
      assert.equal(row.triage_disposition, 'fetch_low');
    }
  });

  it('overflow rows get selector_input_capped disposition', () => {
    const overflow = [{ url: 'https://overflow.com', host: 'overflow.com' }];
    const { notSelected } = adaptSerpSelectorOutput({
      selectorOutput: { keep_ids: ['c_0'] },
      candidateMap: makeMap(),
      overflowRows: overflow,
      officialDomain: 'razer.com',
      supportDomain: '',
    });
    const capped = notSelected.filter((r) => r.triage_disposition === 'selector_input_capped');
    assert.equal(capped.length, 1);
  });

  it('empty keep_ids returns all as notSelected', () => {
    const { selected, notSelected } = adaptSerpSelectorOutput({
      selectorOutput: { keep_ids: [] },
      candidateMap: makeMap(),
      officialDomain: 'razer.com',
      supportDomain: '',
    });
    assert.equal(selected.length, 0);
    assert.equal(notSelected.length, 3);
  });

  it('works without categoryConfig', () => {
    const { selected } = adaptSerpSelectorOutput({
      selectorOutput: { keep_ids: ['c_0'] },
      candidateMap: makeMap(),
      officialDomain: 'razer.com',
      supportDomain: '',
    });
    assert.equal(selected.length, 1);
    assert.equal(selected[0].host_trust_class, 'official');
  });
});
