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

describe('classifySourceArchetypes', () => {
  it('groups sources into correct archetypes by discovery.source_type', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );

    const byType = {};
    for (const a of archetypes) {
      byType[a.archetype] = byType[a.archetype] || [];
      byType[a.archetype].push(a);
    }

    assert.ok(byType.lab_review, 'lab_review archetype present');
    assert.ok(byType.retailer, 'retailer archetype present');
    assert.ok(byType.spec_database, 'spec_database archetype present');
    assert.ok(byType.manufacturer, 'manufacturer archetype present');

    const labHosts = byType.lab_review.flatMap((a) => a.hosts);
    assert.ok(labHosts.includes('rtings.com'), 'rtings.com in lab_review');
    assert.ok(labHosts.includes('techpowerup.com'), 'techpowerup.com in lab_review');
  });

  it('manufacturer archetype from brand resolution hints', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), ['razer.com', 'logitechg.com']
    );

    const mfr = archetypes.find((a) => a.archetype === 'manufacturer');
    assert.ok(mfr, 'manufacturer archetype exists');
    assert.ok(mfr.hosts.includes('razer.com'), 'razer.com in manufacturer hosts');
  });

  it('empty registry returns empty array', () => {
    const archetypes = classifySourceArchetypes({}, [], []);
    assert.ok(Array.isArray(archetypes));
    assert.equal(archetypes.length, 0);
  });

  it('coveredFields is advisory hint set on each archetype', () => {
    const archetypes = classifySourceArchetypes(
      makeSourceRegistry(), makeSourceHosts(), makeManufacturerHosts()
    );

    for (const a of archetypes) {
      assert.ok(Array.isArray(a.coveredFields), `${a.archetype} has coveredFields array`);
    }

    const lab = archetypes.find((a) => a.archetype === 'lab_review');
    assert.ok(lab.coveredFields.length > 0, 'lab_review covers fields');
    assert.ok(lab.coveredFields.includes('click_latency'), 'lab covers click_latency');
  });
});

// ── computeArchetypeCoverage ──

describe('cross-category behavior', () => {
  it('empty registry produces valid output via fallback emitters', () => {
    const archetypes = classifySourceArchetypes({}, [], ['example.com']);

    // Should produce at least manufacturer archetype from manufacturerHosts
    const mfr = archetypes.find((a) => a.archetype === 'manufacturer');
    if (mfr) {
      assert.ok(mfr.hosts.includes('example.com'));
    }
  });

  it('category with only manufacturer + retailer sources produces valid allocation', () => {
    const registry = {
      amazon_com: makeSourceRegistry().amazon_com
    };
    const archetypes = classifySourceArchetypes(registry, makeSourceHosts(), ['brand-site.com']);
    const allocation = allocateArchetypeBudget(archetypes, 12, {});

    assert.ok(Array.isArray(allocation));
    const totalSlots = allocation.reduce((sum, a) => sum + a.slots, 0);
    assert.ok(totalSlots > 0, 'produces non-zero allocation');
  });
});

// ── Phase 4 — Planner context: grouped fields + archetype metadata ──

describe('manufacturer archetype excludes low-value subdomains', () => {
  it('support.razer.com excluded from manufacturer hosts', () => {
    const archetypes = classifySourceArchetypes(
      {}, [], ['razer.com', 'support.razer.com']
    );
    const mfr = archetypes.find((a) => a.archetype === 'manufacturer');
    assert.ok(mfr, 'manufacturer archetype exists');
    assert.ok(mfr.hosts.includes('razer.com'), 'official domain preserved');
    assert.ok(!mfr.hosts.includes('support.razer.com'), 'support subdomain excluded');
  });

  it('official domain razer.com preserved', () => {
    const archetypes = classifySourceArchetypes(
      {}, [], ['razer.com', 'support.razer.com', 'help.razer.com']
    );
    const mfr = archetypes.find((a) => a.archetype === 'manufacturer');
    assert.ok(mfr.hosts.includes('razer.com'), 'razer.com kept');
    assert.equal(mfr.hosts.length, 1, 'only official domain in hosts');
  });

  it('mysupport.brand.com excluded', () => {
    const archetypes = classifySourceArchetypes(
      {}, [], ['logitech.com', 'mysupport.logitech.com']
    );
    const mfr = archetypes.find((a) => a.archetype === 'manufacturer');
    assert.ok(mfr.hosts.includes('logitech.com'));
    assert.ok(!mfr.hosts.includes('mysupport.logitech.com'));
  });

  it('forum.brand.com excluded', () => {
    const archetypes = classifySourceArchetypes(
      {}, [], ['corsair.com', 'forum.corsair.com']
    );
    const mfr = archetypes.find((a) => a.archetype === 'manufacturer');
    assert.ok(mfr.hosts.includes('corsair.com'));
    assert.ok(!mfr.hosts.includes('forum.corsair.com'));
  });

  it('slot recovery — budget matches clean host list', () => {
    // With support subdomain: budget should be identical to without it
    const withSupport = classifySourceArchetypes({}, [], ['razer.com', 'support.razer.com']);
    const withoutSupport = classifySourceArchetypes({}, [], ['razer.com']);

    const allocWith = allocateArchetypeBudget(withSupport, 24, {});
    const allocWithout = allocateArchetypeBudget(withoutSupport, 24, {});

    const mfrWith = allocWith.find((a) => a.archetype === 'manufacturer');
    const mfrWithout = allocWithout.find((a) => a.archetype === 'manufacturer');
    assert.equal(mfrWith.slots, mfrWithout.slots, 'manufacturer slots identical');
  });

  it('emitArchetypeQueries with valid hosts only emits correct count', () => {
    const slot = {
      archetype: 'manufacturer',
      hosts: ['razer.com'],
      slots: 3,
      coveredFields: []
    };
    const rows = emitArchetypeQueries(slot, makeIdentity(), 'Razer Viper V3 Pro', ['weight']);
    assert.ok(rows.length > 0, 'emits queries for valid host');
    assert.ok(rows.every((r) => !r.query.includes('support.')), 'no support domain in queries');
  });
});

// ── isZeroYieldHost ──
