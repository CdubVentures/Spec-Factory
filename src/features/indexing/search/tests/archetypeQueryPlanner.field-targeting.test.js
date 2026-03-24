import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySourceArchetypes,
  computeArchetypeCoverage,
  allocateArchetypeBudget,
  emitArchetypeQueries,
  classifyFieldSearchWorthiness,
  identifyUncoveredFields,
  emitHardFieldQueries,
  intentFingerprint,
  buildArchetypeSummary,
  buildCoverageAnalysis,
  isZeroYieldHost,
  makeSourceRegistry,
  makeSourceHosts,
  makeManufacturerHosts,
  makeIdentity,
  makeFieldRules,
} from './helpers/archetypeQueryPlannerHarness.js';

describe('classifyFieldSearchWorthiness', () => {
  const fieldRules = makeFieldRules();

  it('click_latency → always (regardless of tier)', () => {
    const result = classifyFieldSearchWorthiness('click_latency', fieldRules.click_latency, new Set());
    assert.equal(result, 'always');
  });

  it('critical required_level field → always', () => {
    const result = classifyFieldSearchWorthiness('polling_rate', fieldRules.polling_rate, new Set());
    assert.equal(result, 'always');
  });

  it('coating → infer_first', () => {
    const result = classifyFieldSearchWorthiness('coating', fieldRules.coating, new Set());
    assert.equal(result, 'infer_first');
  });

  it('discontinued → never', () => {
    const result = classifyFieldSearchWorthiness('discontinued', fieldRules.discontinued, new Set());
    assert.equal(result, 'never');
  });

  it('non-empty search_hints.query_terms → at least conditional', () => {
    const result = classifyFieldSearchWorthiness('mcu', fieldRules.mcu, new Set());
    assert.ok(
      result === 'always' || result === 'conditional',
      `mcu worthiness is ${result}, expected always or conditional`
    );
  });

  it('worthiness is NOT tier-restricted', () => {
    // A field with low required_level but good search hints should still be searchable
    const result = classifyFieldSearchWorthiness('colors', fieldRules.colors, new Set());
    assert.ok(result !== 'never', `colors (optional) is not "never" with query_terms`);
  });
});

// ── identifyUncoveredFields ──

describe('identifyUncoveredFields', () => {
  it('filters to search-worthy (always + conditional)', () => {
    const focusFields = ['click_latency', 'mcu', 'encoder', 'coating', 'discontinued'];
    const coveredFieldSet = new Set(['click_latency']);
    const categoryConfig = { fieldRules: { fields: makeFieldRules() } };

    const uncovered = identifyUncoveredFields(focusFields, coveredFieldSet, categoryConfig);

    assert.ok(uncovered.searchWorthy.length > 0, 'has search-worthy uncovered');
    assert.ok(uncovered.searchWorthy.includes('mcu'), 'mcu is search-worthy uncovered');
    assert.ok(uncovered.searchWorthy.includes('encoder'), 'encoder is search-worthy uncovered');
  });

  it('never-class excluded', () => {
    const focusFields = ['discontinued', 'mcu'];
    const coveredFieldSet = new Set();
    const categoryConfig = { fieldRules: { fields: makeFieldRules() } };

    const uncovered = identifyUncoveredFields(focusFields, coveredFieldSet, categoryConfig);

    assert.ok(!uncovered.searchWorthy.includes('discontinued'), 'discontinued excluded');
  });

  it('infer_first excluded from hard-field emission', () => {
    const focusFields = ['coating', 'mcu'];
    const coveredFieldSet = new Set();
    const categoryConfig = { fieldRules: { fields: makeFieldRules() } };

    const uncovered = identifyUncoveredFields(focusFields, coveredFieldSet, categoryConfig);

    assert.ok(!uncovered.searchWorthy.includes('coating'), 'coating (infer_first) excluded from searchWorthy');
    assert.ok(Array.isArray(uncovered.inferFirst), 'inferFirst array present');
    assert.ok(uncovered.inferFirst.includes('coating'), 'coating in inferFirst');
  });
});

// ── intentFingerprint ──

describe('Phase 4 — Planner context: grouped fields + archetype metadata', () => {
  it('buildCoverageAnalysis groups fields by tier — full set preserved, not truncated', () => {
    const focusFields = ['click_latency', 'sensor', 'weight', 'mcu', 'encoder', 'dpi', 'polling_rate'];
    const coveredFieldSet = new Set(['click_latency', 'sensor', 'weight']);
    const hardFieldRows = [
      { _meta: { archetype: 'hard_field' }, target_fields: ['mcu'] },
      { _meta: { archetype: 'hard_field' }, target_fields: ['encoder'] }
    ];

    const analysis = buildCoverageAnalysis(focusFields, coveredFieldSet, hardFieldRows);

    // Full field set preserved — no truncation
    assert.equal(analysis.total_missing, focusFields.length, 'all 7 focus fields counted');
    assert.equal(analysis.covered_by_archetypes, coveredFieldSet.size, '3 covered by archetypes');

    // Uncovered fields are grouped into search_worthy vs infer_first
    assert.ok(Array.isArray(analysis.uncovered_search_worthy), 'uncovered_search_worthy is array');
    assert.ok(analysis.uncovered_search_worthy.length > 0, 'has search-worthy uncovered fields');

    // Grouped totals account for all focus fields
    const accountedFor = analysis.covered_by_archetypes
      + analysis.uncovered_search_worthy.length
      + analysis.uncovered_infer_first.length;
    assert.ok(accountedFor <= focusFields.length, 'grouped fields do not exceed total');
    assert.equal(analysis.hard_field_queries_emitted, 2, 'hard field queries counted');
  });

  it('buildArchetypeSummary maps to archetypes_emitted + hosts_targeted', () => {
    const slots = [
      { archetype: 'lab_review', hosts: ['rtings.com', 'techpowerup.com'], slots: 4, coveredFields: ['click_latency'] },
      { archetype: 'manufacturer', hosts: ['razer.com'], slots: 2, coveredFields: [] },
      { archetype: 'spec_database', hosts: ['eloshapes.com'], slots: 2, coveredFields: ['weight'] }
    ];

    const summary = buildArchetypeSummary(slots);

    // archetypes_emitted = keys of summary
    const archetypesEmitted = Object.keys(summary);
    assert.equal(archetypesEmitted.length, 3, '3 archetypes emitted');
    assert.ok(archetypesEmitted.includes('lab_review'), 'lab_review emitted');
    assert.ok(archetypesEmitted.includes('manufacturer'), 'manufacturer emitted');
    assert.ok(archetypesEmitted.includes('spec_database'), 'spec_database emitted');

    // hosts_targeted = union of all summary[x].hosts
    const hostsTargeted = new Set(Object.values(summary).flatMap((s) => s.hosts));
    assert.ok(hostsTargeted.has('rtings.com'), 'rtings targeted');
    assert.ok(hostsTargeted.has('techpowerup.com'), 'techpowerup targeted');
    assert.ok(hostsTargeted.has('razer.com'), 'razer targeted');
    assert.ok(hostsTargeted.has('eloshapes.com'), 'eloshapes targeted');
    assert.equal(hostsTargeted.size, 4, '4 hosts targeted');

    // Each entry carries planner-facing shape
    for (const [key, entry] of Object.entries(summary)) {
      assert.equal(typeof entry.queries_emitted, 'number', `${key}.queries_emitted is number`);
      assert.equal(typeof entry.coverage_hint_count, 'number', `${key}.coverage_hint_count is number`);
    }
  });
});

// ── manufacturer archetype excludes low-value subdomains ──
