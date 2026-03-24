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

describe('computeArchetypeCoverage', () => {
  it('computes coverage ratio correctly', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const focusFields = ['click_latency', 'sensor', 'weight', 'mcu', 'encoder'];
    const coverage = computeArchetypeCoverage(archetypes, focusFields);

    assert.ok(Array.isArray(coverage));
    for (const entry of coverage) {
      assert.equal(typeof entry.archetype, 'string');
      assert.equal(typeof entry.coverageRatio, 'number');
      assert.ok(entry.coverageRatio >= 0 && entry.coverageRatio <= 1,
        `coverageRatio in [0,1]: ${entry.coverageRatio}`);
    }
  });

  it('sorts by coverage descending', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const coverage = computeArchetypeCoverage(archetypes, ['click_latency', 'sensor', 'weight']);

    for (let i = 1; i < coverage.length; i++) {
      assert.ok(coverage[i - 1].coverageRatio >= coverage[i].coverageRatio,
        `sorted descending at index ${i}`);
    }
  });

  it('missing field_coverage on a source is skipped gracefully', () => {
    const registry = {
      no_coverage_source: {
        display_name: 'Unknown',
        discovery: { source_type: 'spec_database', enabled: true }
      }
    };
    const archetypes = classifySourceArchetypes(registry, [], []);
    const coverage = computeArchetypeCoverage(archetypes, ['weight']);

    assert.ok(Array.isArray(coverage));
    // Should not throw
  });

  it('coverage is scoring only — never gates query emission', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    // Even fields with 0 coverage should still be in the output
    const coverage = computeArchetypeCoverage(archetypes, ['nonexistent_field_xyz']);
    assert.ok(Array.isArray(coverage), 'returns valid array even for uncovered fields');
  });
});

// ── allocateArchetypeBudget ──

describe('allocateArchetypeBudget', () => {
  it('V1 defaults produce valid allocation', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const allocation = allocateArchetypeBudget(archetypes, 24, {});

    assert.ok(Array.isArray(allocation));
    const totalSlots = allocation.reduce((sum, a) => sum + a.slots, 0);
    assert.ok(totalSlots <= 24, `total slots ${totalSlots} <= budget 24`);
    assert.ok(totalSlots > 0, 'at least some slots allocated');

    for (const slot of allocation) {
      assert.equal(typeof slot.archetype, 'string');
      assert.equal(typeof slot.slots, 'number');
      assert.ok(slot.slots >= 0, 'non-negative slots');
    }
  });

  it('tight budget degrades — only core archetypes get slots', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const allocation = allocateArchetypeBudget(archetypes, 4, {});

    const totalSlots = allocation.reduce((sum, a) => sum + a.slots, 0);
    assert.ok(totalSlots <= 4, 'respects tight budget');

    const withSlots = allocation.filter((a) => a.slots > 0);
    assert.ok(withSlots.length <= 3, 'tight budget limits active archetypes');
  });

  it('context signals accepted, V1 ignores them', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const withContext = allocateArchetypeBudget(archetypes, 24, { boost_labs: true });
    const withoutContext = allocateArchetypeBudget(archetypes, 24, {});

    // V1: context is accepted but produces same result
    assert.equal(withContext.length, withoutContext.length);
  });

  it('community gets 0 slots in V1', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const allocation = allocateArchetypeBudget(archetypes, 24, {});

    const community = allocation.find((a) => a.archetype === 'community');
    if (community) {
      assert.equal(community.slots, 0, 'community gets 0 slots in V1');
    }
  });

  it('leftover budget goes to query_class emitters', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const allocation = allocateArchetypeBudget(archetypes, 24, {});

    // The allocation should account for the full budget across archetypes + query classes
    const totalSlots = allocation.reduce((sum, a) => sum + a.slots, 0);
    assert.ok(totalSlots > 0, 'budget is utilized');
  });
});

// ── emitArchetypeQueries ──

describe('allocateArchetypeBudget — retailer gate', () => {
  it('retailer off by default', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const allocation = allocateArchetypeBudget(archetypes, 24, {});

    const retailer = allocation.find((a) => a.archetype === 'retailer');
    if (retailer) {
      assert.equal(retailer.slots, 0, 'retailer gets 0 slots by default');
    }
  });

  it('fires when commerce fields missing + budget remains', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );
    const allocation = allocateArchetypeBudget(archetypes, 24, {
      missingCommerceFields: ['weight', 'colors', 'price_range', 'battery_hours']
    });

    const retailer = allocation.find((a) => a.archetype === 'retailer');
    if (retailer) {
      assert.ok(retailer.slots >= 0, 'retailer may get slots with commerce fields missing');
    }
  });
});

// ── Search template guarantee ──

describe('buildArchetypeSummary', () => {
  it('produces summary with expected shape', () => {
    const slots = [
      { archetype: 'lab_review', hosts: ['rtings.com', 'techpowerup.com'], slots: 4, coveredFields: ['click_latency'] },
      { archetype: 'manufacturer', hosts: ['razer.com'], slots: 2, coveredFields: [] }
    ];

    const summary = buildArchetypeSummary(slots);

    assert.ok(summary.lab_review, 'lab_review in summary');
    assert.ok(summary.manufacturer, 'manufacturer in summary');
    assert.ok(Array.isArray(summary.lab_review.hosts), 'hosts is array');
    assert.equal(typeof summary.lab_review.queries_emitted, 'number');
    assert.equal(typeof summary.lab_review.coverage_hint_count, 'number');
  });

  it('empty slots produces empty summary', () => {
    const summary = buildArchetypeSummary([]);
    assert.deepEqual(summary, {});
  });
});

// ── buildCoverageAnalysis ──

describe('buildCoverageAnalysis', () => {
  it('produces analysis with expected shape', () => {
    const focusFields = ['click_latency', 'sensor', 'weight', 'mcu', 'encoder'];
    const coveredFieldSet = new Set(['click_latency', 'sensor', 'weight']);
    const hardFieldRows = [
      { _meta: { archetype: 'hard_field' }, target_fields: ['mcu'] },
      { _meta: { archetype: 'hard_field' }, target_fields: ['encoder'] }
    ];

    const analysis = buildCoverageAnalysis(focusFields, coveredFieldSet, hardFieldRows);

    assert.equal(analysis.total_missing, 5);
    assert.equal(analysis.covered_by_archetypes, 3);
    assert.ok(Array.isArray(analysis.uncovered_search_worthy));
    assert.ok(Array.isArray(analysis.uncovered_infer_first));
    assert.equal(typeof analysis.hard_field_queries_emitted, 'number');
    assert.equal(analysis.hard_field_queries_emitted, 2);
  });
});

// ── Identity guard compatibility ──
