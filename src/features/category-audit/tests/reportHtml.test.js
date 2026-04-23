import test from 'node:test';
import assert from 'node:assert/strict';

import { renderHtml } from '../reportHtml.js';

function fixtureReportData() {
  return {
    category: 'mouse',
    generatedAt: '2026-04-22T12:00:00.000Z',
    stats: {
      totalKeys: 2,
      mandatoryCount: 1,
      groupCount: 1,
      tierDistribution: { easy: 1, medium: 0, hard: 1, very_hard: 0, other: 0 },
      emptyGuidanceCount: 1,
      emptyAliasesCount: 1,
      emptyHintsCount: 1,
      emptySearchDomainsCount: 1,
      patternlessOpenEnumsCount: 0,
    },
    groups: [
      { groupKey: 'general', displayName: 'General', fieldKeys: ['lighting', 'sku'] },
    ],
    keys: [
      {
        fieldKey: 'lighting',
        displayName: 'Lighting',
        group: 'general',
        priority: { required_level: 'non_mandatory', availability: 'always', difficulty: 'easy' },
        contract: { type: 'string', shape: 'list', unit: '', rounding: null, list_rules: { dedupe: false }, range: null },
        enum: { policy: 'open_prefer_known', source: 'data_lists.lighting', values: ['1 zone (rgb)', 'none'], filterUi: 'toggles', analysis: { total: 2, signatureGroups: [{ signature: '<N> zone (rgb)', count: 1, values: ['1 zone (rgb)'] }, { signature: 'none', count: 1, values: ['none'] }], topSignature: { signature: '<N> zone (rgb)', count: 1, coveragePct: 50 }, suspiciousValues: [], filterUi: 'toggles' } },
        aliases: [],
        search_hints: { domain_hints: [], query_terms: [], content_types: [], preferred_tiers: [] },
        constraints: [],
        component: null,
        ai_assist: { reasoning_note: '' },
        evidence: { min_evidence_refs: 1, tier_preference: [] },
        variance_policy: '',
        rawRule: {
          contract: { type: 'string', shape: 'list', list_rules: { dedupe: false } },
          enum: { policy: 'open_prefer_known', values: ['1 zone (rgb)', 'none'] },
          priority: { difficulty: 'easy' },
          ai_assist: { reasoning_note: '' },
        },
      },
      {
        fieldKey: 'sku',
        displayName: 'SKU',
        group: 'general',
        priority: { required_level: 'mandatory', availability: 'always', difficulty: 'hard' },
        contract: { type: 'string', shape: 'scalar', unit: '', rounding: null, list_rules: null, range: null },
        enum: { policy: '', source: '', values: [], filterUi: 'toggles', analysis: null },
        aliases: ['model number'],
        search_hints: { domain_hints: ['mfr.com'], query_terms: ['model'], content_types: [], preferred_tiers: [] },
        constraints: [{ op: 'eq', left: 'a', right: 'b', raw: 'a == b' }],
        component: null,
        ai_assist: { reasoning_note: 'Use manufacturer MPN only.' },
        evidence: { min_evidence_refs: 1, tier_preference: ['tier1'] },
        variance_policy: 'authoritative',
        rawRule: {
          contract: { type: 'string', shape: 'scalar' },
          aliases: ['model number'],
          search_hints: { domain_hints: ['mfr.com'], query_terms: ['model'] },
          priority: { difficulty: 'hard' },
          ai_assist: { reasoning_note: 'Use manufacturer MPN only.' },
        },
      },
    ],
    enums: [
      { name: 'lighting', policy: 'open_prefer_known', values: ['1 zone (rgb)', 'none'], analysis: { total: 2, signatureGroups: [{ signature: '<N> zone (rgb)', count: 1, values: ['1 zone (rgb)'] }, { signature: 'none', count: 1, values: ['none'] }], topSignature: { signature: '<N> zone (rgb)', count: 1, coveragePct: 50 }, suspiciousValues: [] }, usedBy: ['lighting'] },
    ],
    components: [],
    globalFragments: {
      identityIntro: 'IDENTITY: you are looking for the EXACT product.',
      evidenceContract: 'Evidence contract text.',
      unkPolicy: 'Honest unk beats low-confidence guess.',
    },
    tierBundles: {
      easy: { model: 'claude-haiku-4-5', useReasoning: false, thinking: false, webSearch: false },
      medium: { model: 'claude-sonnet-4-6', useReasoning: false, thinking: true, webSearch: true },
      hard: { model: 'claude-sonnet-4-6', useReasoning: true, reasoningModel: 'claude-sonnet-4-6', thinking: true, thinkingEffort: 'high', webSearch: true },
      very_hard: { model: 'claude-opus-4-7', useReasoning: true, thinking: true, webSearch: true },
      fallback: { model: 'claude-sonnet-4-6' },
    },
    compileSummary: null,
  };
}

test('renderHtml emits a valid self-contained HTML document', () => {
  const html = renderHtml(fixtureReportData());
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('<title>Key Finder Audit — mouse</title>'));
  assert.ok(html.includes('<style>'), 'inline CSS is present');
  assert.ok(html.includes('</html>'));
});

test('renderHtml includes every top-level section anchor in the TOC', () => {
  const html = renderHtml(fixtureReportData());
  for (const anchor of ['auditor-task', 'summary', 'part-1-teaching', 'generic-prompt', 'tier-bundles', 'enum-inventory', 'component-inventory', 'groups', 'part-7-per-key']) {
    assert.ok(html.includes(`href="#${anchor}"`), `TOC link to ${anchor}`);
    assert.ok(html.includes(`id="${anchor}"`), `section with id ${anchor}`);
  }
});

test('renderHtml places auditor-task + audit-standard sections before the summary', () => {
  const html = renderHtml(fixtureReportData());
  const auditorIdx = html.indexOf('id="auditor-task"');
  const standardIdx = html.indexOf('id="audit-standard"');
  const summaryIdx = html.indexOf('id="summary"');
  assert.ok(auditorIdx > 0 && standardIdx > auditorIdx && summaryIdx > standardIdx, 'auditor-task → audit-standard → summary order');
  assert.ok(html.includes('Auditor task (read this first)'));
  assert.ok(html.includes('Audit standard (the bar you apply)'));
  assert.ok(html.includes('Return format (markdown'), 'return-format spec rendered');
});

test('renderHtml renders the compiled generic prompt with placeholders for runtime slots', () => {
  const html = renderHtml(fixtureReportData());
  assert.ok(html.includes('&lt;BRAND — injected at call time'), 'BRAND placeholder rendered');
  assert.ok(html.includes('&lt;PRIMARY_FIELD_KEY — injected at call time'), 'per-key slot marked as injected');
  assert.ok(html.includes('Honest unk beats low-confidence guess'), 'resolved unkPolicy text present');
});

test('renderHtml renders tier bundle table with all 5 rows', () => {
  const html = renderHtml(fixtureReportData());
  for (const tier of ['easy', 'medium', 'hard', 'very_hard', 'fallback']) {
    assert.ok(html.includes(`<td>${tier}</td>`), `tier row ${tier}`);
  }
});

test('renderHtml renders per-key sections with always-shown sub-blocks (Contract + guidance) and conditional ones when content exists', () => {
  const html = renderHtml(fixtureReportData());
  assert.ok(html.includes('id="key-lighting"'));
  assert.ok(html.includes('id="key-sku"'));
  // Contract is always shown (every rule has a contract).
  assert.ok(html.includes('Contract'));
  // Extraction guidance heading always emitted so reviewers see the empty slot.
  assert.ok(html.includes('Extraction guidance'));
  // Search hints only emitted when present — sku fixture has domain_hints so it should render.
  assert.ok(html.includes('Search hints'));
});

test('renderHtml escapes user-supplied strings', () => {
  const data = fixtureReportData();
  data.keys[0].ai_assist.reasoning_note = 'unsafe <script>alert(1)</script>';
  data.keys[0].rawRule.ai_assist.reasoning_note = 'unsafe <script>alert(1)</script>';
  const html = renderHtml(data);
  assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script tag not emitted');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'escaped version present');
});
