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
    globalFragments: {
      evidenceContract: 'Evidence contract text.',
      scalarSourceTierStrategy: 'Source tier strategy text.',
      scalarSourceGuidanceCloser: 'Scalar source closer text.',
      valueConfidenceRubric: 'Value confidence rubric text.',
    },
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
  assert.match(md, /Downloadable JSON patch files/i);
  assert.match(md, /<category>-<sort_order>-<field_key>\.field-studio-patch\.v1\.json/);
  assert.match(md, /"schema_version": "field-studio-patch\.v1"/);
  assert.match(md, /"field_overrides"/);
  assert.match(md, /"data_lists"/);
  assert.match(md, /"component_sources"/);
  assert.doesNotMatch(md, /"mode": "scratch"/);
  assert.doesNotMatch(md, /data_lists\.mode/);
  assert.match(md, /<sort_order>-<field_key>/);
  assert.match(md, /Mapping Studio guidance:/);
  assert.match(md, /Component Source Mapping belongs/);
  assert.match(md, /component type and component property variance/i);
  assert.match(md, /component identity, component attribute, or standalone/i);
  assert.match(md, /do not wait for an existing component DB property/i);
  assert.match(md, /semantic ownership/i);
  assert.match(md, /boolean, date, url, range/i);
  assert.match(md, /schema_blocked_component_attributes/i);
  assert.match(md, /auto-generated identity facets/i);
  assert.match(md, /must not be listed under `component_sources\.\<component_type\>\.roles\.properties\[\]`/i);
  assert.match(md, /record them as `identity_facet`/i);
  assert.match(md, /component DB is already the lookup\/lock path/i);
  assert.match(md, /use `open_prefer_known` by default/i);
  assert.match(md, /Use `closed` only/i);
  assert.match(md, /Tolerance/i);
  assert.match(md, /Component only \/ scoped/i);
  assert.match(md, /component_type/i);
  assert.match(md, /roles\.properties/i);
  assert.match(md, /variance_policy/i);
  assert.match(md, /component_only/i);
  assert.doesNotMatch(md, /Component Review/i);
  assert.match(md, /Enum Data Lists/i);
  assert.match(md, /Key Navigator guidance:/);
  assert.match(md, /"priority"/);
  assert.match(md, /"contract"/);
  assert.match(md, /"enum"/);
  assert.match(md, /"ai_assist"/);
  assert.doesNotMatch(md, /- variant_dependent:/);
  assert.doesNotMatch(md, /- Product Image Dependent:/);
  assert.match(md, /color_edition_context/);
  assert.match(md, /pif_priority_images/);
  assert.match(md, /reasoning_note/);
  assert.match(md, /search_hints/);
  assert.match(md, /roles\.properties/);
  assert.doesNotMatch(md, /keyfinder-field-studio-changes\.txt/);
  assert.ok(
    md.indexOf('Component Source Mapping belongs') < md.indexOf('Enum Data Lists belong'),
    'component source mapping comes before enum data lists',
  );
  assert.ok(
    md.indexOf('Mapping Studio guidance:') < md.indexOf('Key Navigator guidance:'),
    'Mapping Studio comes before Key Navigator',
  );
  assert.ok(md.indexOf('Enum Data Lists belong') < md.indexOf('Key Navigator guidance:'), 'enum list guidance comes before Key Navigator guidance');
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
  assert.match(md, /Search \/ routing/i);
  assert.match(md, /model\/search strength/i);
  assert.match(md, /benchmark-depth/i);
  assert.match(md, /category benchmark\/example set/i);
  assert.doesNotMatch(md, /mouseData\.xlsm/i);
  assert.doesNotMatch(md, /C2:BT83/i);
  // Behavior: priority axes use "human Googler" / "typical product not flagship" calibration
  assert.match(md, /typical product/i);
  assert.match(md, /flagship/i);
  // Behavior: very_hard tier is bounded by lab/instrumented/internal-component cases
  assert.match(md, /very_hard/i);
  assert.match(md, /lab/i);
  assert.match(md, /internal-component|internal component/i);
  assert.ok(md.includes('contract.type'));
  assert.ok(md.includes('contract.shape'));
  assert.match(md, /no contract change/i);
  assert.match(md, /Consumer-surface impact/i);
  assert.match(md, /Unknown \/ not-applicable/i);
  assert.match(md, /Boolean is not automatically enough/i);
  assert.match(md, /Never add `unk` to enum values/i);
  assert.match(md, /blank\/omitted as no submitted value/i);
  assert.match(md, /battery_hours/i);
  assert.match(md, /no battery\/wired-only/i);
  assert.doesNotMatch(md, /yes\/no\/n\/a\/unk are real stored states/i);
  assert.match(md, /guidance last/i);
  assert.ok(md.includes('Example bank recipe'));
  assert.ok(md.includes('5-10'));
  assert.ok(md.includes('filter-risk'));
});

test('renderMarkdown resolves non-camelized global prompt fragment slots', () => {
  const md = renderMarkdown(fixtureReportData());
  assert.ok(md.includes('Source tier strategy text.'));
  assert.ok(md.includes('Scalar source closer text.'));
  assert.ok(md.includes('Value confidence rubric text.'));
  assert.ok(!md.includes('SOURCE_TIER_STRATEGY â€” fragment not configured'));
  assert.ok(!md.includes('VALUE_CONFIDENCE_GUIDANCE â€” fragment not configured'));
});

test('renderMarkdown collapses excess blank lines', () => {
  const md = renderMarkdown(fixtureReportData());
  assert.ok(!/\n{3,}/.test(md), 'no 3-blank-line runs');
});

test('renderMarkdown does not describe constraints DSL as unreachable', () => {
  const data = fixtureReportData();
  data.keys[0] = {
    ...data.keys[0],
    fieldKey: 'sensor_date',
    constraints: [{ op: 'lte', left: 'sensor_date', right: 'release_date', raw: 'sensor_date <= release_date' }],
    rawRule: {
      ...data.keys[0].rawRule,
      constraints: ['sensor_date <= release_date'],
    },
  };
  data.groups[0] = { ...data.groups[0], fieldKeys: ['sensor_date'] };

  const md = renderMarkdown(data);
  assert.ok(md.includes('sensor_date <= release_date'), 'authored constraint still rendered');
  assert.doesNotMatch(md, /KNOWN BUG|alias mismatch|unreachable/i);
});
