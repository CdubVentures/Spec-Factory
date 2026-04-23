import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdown } from '../reportMarkdown.js';

function fixtureReportData() {
  return {
    category: 'mouse',
    generatedAt: '2026-04-22T12:00:00.000Z',
    stats: {
      totalKeys: 1,
      mandatoryCount: 0,
      groupCount: 1,
      tierDistribution: { easy: 1, medium: 0, hard: 0, very_hard: 0, other: 0 },
      emptyGuidanceCount: 1,
      emptyAliasesCount: 1,
      emptyHintsCount: 1,
      emptySearchDomainsCount: 1,
      patternlessOpenEnumsCount: 0,
    },
    groups: [{ groupKey: 'general', displayName: 'General', fieldKeys: ['lighting'] }],
    keys: [
      {
        fieldKey: 'lighting',
        displayName: 'Lighting',
        group: 'general',
        priority: { required_level: 'non_mandatory', availability: 'always', difficulty: 'easy' },
        contract: { type: 'string', shape: 'list', unit: '', rounding: null, list_rules: null, range: null },
        enum: { policy: 'open_prefer_known', source: '', values: ['1 zone (rgb)'], filterUi: 'toggles', analysis: { total: 1, signatureGroups: [{ signature: '<N> zone (rgb)', count: 1, values: ['1 zone (rgb)'] }], topSignature: { signature: '<N> zone (rgb)', count: 1, coveragePct: 100 }, suspiciousValues: [] } },
        aliases: [],
        search_hints: { domain_hints: [], query_terms: [], content_types: [], preferred_tiers: [] },
        constraints: [],
        component: null,
        ai_assist: { reasoning_note: '' },
        evidence: { min_evidence_refs: 1, tier_preference: [] },
        variance_policy: '',
        rawRule: { priority: { difficulty: 'easy' }, contract: { type: 'string', shape: 'list' }, enum: { policy: 'open_prefer_known', values: ['1 zone (rgb)'] }, ai_assist: { reasoning_note: '' } },
      },
    ],
    enums: [
      { name: 'lighting', policy: 'open_prefer_known', values: ['1 zone (rgb)'], analysis: { total: 1, signatureGroups: [{ signature: '<N> zone (rgb)', count: 1, values: ['1 zone (rgb)'] }], topSignature: { signature: '<N> zone (rgb)', count: 1, coveragePct: 100 }, suspiciousValues: [] }, usedBy: ['lighting'] },
    ],
    components: [],
    globalFragments: { evidenceContract: 'Evidence contract text.' },
    tierBundles: {
      easy: { model: 'claude-haiku-4-5' },
      medium: { model: 'claude-sonnet-4-6' },
      hard: { model: 'claude-sonnet-4-6' },
      very_hard: { model: 'claude-opus-4-7' },
      fallback: { model: 'claude-sonnet-4-6' },
    },
    compileSummary: null,
  };
}

test('renderMarkdown emits valid markdown starting with a # heading', () => {
  const md = renderMarkdown(fixtureReportData());
  assert.ok(md.startsWith('# Key Finder Audit'));
  assert.ok(md.endsWith('\n'));
});

test('renderMarkdown includes all Part headings', () => {
  const md = renderMarkdown(fixtureReportData());
  assert.ok(md.includes('## Auditor task (read this first)'));
  assert.ok(md.includes('## Summary'));
  assert.ok(md.includes('## Part 1 — How the keyFinder pipeline works'));
  assert.ok(md.includes('## Part 2 — Generic category prompt (compiled)'));
  assert.ok(md.includes('## Part 3 — Tier bundles'));
  assert.ok(md.includes('## Part 4 — Enum inventory'));
  assert.ok(md.includes('## Part 5 — Component database inventory'));
  assert.ok(md.includes('## Part 6 — Field groups'));
  assert.ok(md.includes('## Part 7 — Per-key detail'));
});

test('renderMarkdown places auditor-task section before summary and includes return-format template', () => {
  const md = renderMarkdown(fixtureReportData());
  const auditorIdx = md.indexOf('## Auditor task');
  const summaryIdx = md.indexOf('## Summary');
  assert.ok(auditorIdx >= 0 && summaryIdx > auditorIdx, 'auditor-task appears before summary');
  assert.ok(md.includes('Return format (markdown'), 'return-format spec included');
  assert.ok(md.includes('Field-by-field patches'), 'per-field patch section included');
  assert.ok(md.includes('Highest-risk corrections'), 'highest-risk lead-in included');
  assert.ok(md.includes('## Audit standard'), 'audit standard section emitted');
});

test('renderMarkdown emits GitHub-flavored table syntax', () => {
  const md = renderMarkdown(fixtureReportData());
  assert.ok(md.includes('| Metric | Value |'));
  assert.ok(md.includes('| --- | --- |'));
});

test('renderMarkdown emits per-key section with code-block prompt previews', () => {
  const md = renderMarkdown(fixtureReportData());
  assert.ok(md.includes('`lighting` — Lighting'));
  assert.ok(md.includes('```text'));
  assert.ok(md.includes('Return contract:'));
});

test('renderMarkdown tells auditors to validate the full field contract before writing guidance', () => {
  const md = renderMarkdown(fixtureReportData());
  assert.ok(md.includes('Full field contract authoring order'));
  assert.ok(md.includes('priority.required_level'));
  assert.ok(md.includes('priority.availability'));
  assert.ok(md.includes('priority.difficulty'));
  assert.ok(md.includes('contract.type'));
  assert.ok(md.includes('contract.shape'));
  assert.match(md, /guidance last/i);
  assert.ok(md.includes('Example bank recipe'));
  assert.ok(md.includes('5-10'));
  assert.ok(md.includes('filter-risk'));
});

test('renderMarkdown collapses excess blank lines', () => {
  const md = renderMarkdown(fixtureReportData());
  assert.ok(!/\n{3,}/.test(md), 'no 3-blank-line runs');
});
