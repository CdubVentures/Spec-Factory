import test from 'node:test';
import assert from 'node:assert/strict';

import { extractReportData, parseConstraintExpression } from '../reportData.js';

function fixtureLoadedRules() {
  return {
    rules: {
      fields: {
        sensor: {
          field_key: 'sensor',
          display_name: 'Sensor',
          priority: { required_level: 'mandatory', availability: 'always', difficulty: 'hard' },
          contract: { type: 'string', shape: 'scalar' },
          enum: { policy: 'open_prefer_known', source: 'data_lists.sensor', values: [] },
          aliases: ['PMW3395', 'PAW3395'],
          search_hints: { domain_hints: ['sensor.fyi'], query_terms: ['sensor'], content_types: [], preferred_tiers: [] },
          constraints: [],
          component: { type: 'sensor', source: 'component_db.sensor' },
          ai_assist: { reasoning_note: 'Chip/model only.', variant_inventory_usage: { enabled: false } },
          evidence: { min_evidence_refs: 1, tier_preference: ['tier1'] },
          variance_policy: 'authoritative',
          group: 'sensor_performance',
          ui: { label: 'Sensor', group: 'Sensor & Performance' },
        },
        dpi: {
          field_key: 'dpi',
          display_name: 'DPI',
          priority: { required_level: 'non_mandatory', availability: 'always', difficulty: 'easy' },
          contract: { type: 'number', shape: 'scalar', unit: 'dpi', rounding: { decimals: 0, mode: 'nearest' } },
          enum: { policy: 'open', source: null, values: [] },
          aliases: [],
          search_hints: { domain_hints: [], query_terms: [], content_types: [], preferred_tiers: [] },
          constraints: ['dpi <= 45000'],
          component: null,
          ai_assist: { reasoning_note: '' },
          evidence: { min_evidence_refs: 1 },
          group: 'sensor_performance',
          ui: { label: 'DPI', group: 'Sensor & Performance' },
        },
        lighting: {
          field_key: 'lighting',
          display_name: 'Lighting',
          priority: { required_level: 'non_mandatory', availability: 'always', difficulty: 'easy' },
          contract: { type: 'string', shape: 'list', list_rules: { dedupe: false } },
          enum: { policy: 'open_prefer_known', source: 'data_lists.lighting', values: [] },
          aliases: [],
          search_hints: { domain_hints: [], query_terms: [], content_types: [], preferred_tiers: [] },
          constraints: [],
          component: null,
          ai_assist: { reasoning_note: '' },
          evidence: { min_evidence_refs: 1 },
          group: 'general',
          ui: { label: 'Lighting', group: 'General' },
        },
      },
    },
    knownValues: {
      enums: {
        sensor: { policy: 'open_prefer_known', values: ['PMW3395', 'PAW3395', 'Focus Pro 45K'] },
        lighting: { policy: 'open_prefer_known', values: ['1 zone (rgb)', '2 zone (rgb)', 'none'] },
      },
    },
    componentDBs: {
      sensor: {
        component_type: 'sensor',
        items: [
          { name: 'PMW3395', maker: 'pixart', aliases: [], properties: { dpi: 26000, ips: 650 } },
          { name: 'Focus Pro 45K', maker: 'razer', aliases: [], properties: { dpi: 45000, ips: 900 } },
        ],
      },
    },
  };
}

function fixtureFieldGroups() {
  return {
    group_index: {
      general: ['lighting'],
      sensor_performance: ['sensor', 'dpi'],
    },
  };
}

function fixtureGlobalFragments() {
  return {
    identityIntro: 'IDENTITY: intro',
    identityWarningEasy: 'warn easy',
    evidenceContract: 'evidence contract text',
    unkPolicy: 'unk policy text',
  };
}

function fixtureTierBundles() {
  return {
    easy: { model: 'claude-haiku-4-5', useReasoning: false, thinking: false, webSearch: false },
    medium: { model: 'claude-sonnet-4-6', useReasoning: false, thinking: true, thinkingEffort: 'low', webSearch: true },
    hard: { model: 'claude-sonnet-4-6', useReasoning: true, reasoningModel: 'claude-sonnet-4-6', thinking: true, thinkingEffort: 'high', webSearch: true },
    very_hard: { model: 'claude-opus-4-7', useReasoning: true, thinking: true, thinkingEffort: 'high', webSearch: true },
  };
}

function callExtract(overrides = {}) {
  return extractReportData({
    category: 'mouse',
    loadedRules: overrides.loadedRules ?? fixtureLoadedRules(),
    fieldGroups: overrides.fieldGroups ?? fixtureFieldGroups(),
    globalFragments: overrides.globalFragments ?? fixtureGlobalFragments(),
    tierBundles: overrides.tierBundles ?? fixtureTierBundles(),
    now: overrides.now ?? new Date('2026-04-22T12:00:00Z'),
  });
}

test('extractReportData returns category + ISO timestamp + expected top-level keys', () => {
  const data = callExtract();
  assert.equal(data.category, 'mouse');
  assert.equal(data.generatedAt, '2026-04-22T12:00:00.000Z');
  assert.ok(data.stats);
  assert.ok(Array.isArray(data.groups));
  assert.ok(Array.isArray(data.keys));
  assert.ok(Array.isArray(data.enums));
  assert.ok(Array.isArray(data.components));
});

test('extractReportData normalizes priority triple on every key', () => {
  const data = callExtract();
  const sensor = data.keys.find((k) => k.fieldKey === 'sensor');
  assert.deepEqual(sensor.priority, { required_level: 'mandatory', availability: 'always', difficulty: 'hard' });
});

test('extractReportData carries variant inventory usage as one enabled flag', () => {
  const data = callExtract();
  const sensor = data.keys.find((k) => k.fieldKey === 'sensor');
  assert.deepEqual(sensor.ai_assist, {
    reasoning_note: 'Chip/model only.',
    variant_inventory_usage: { enabled: false },
  });
});

test('extractReportData resolves enum values from known_values when rule has source only', () => {
  const data = callExtract();
  const sensor = data.keys.find((k) => k.fieldKey === 'sensor');
  assert.deepEqual(sensor.enum.values, ['PMW3395', 'PAW3395', 'Focus Pro 45K']);
  assert.equal(sensor.enum.policy, 'open_prefer_known');
  assert.ok(sensor.enum.analysis, 'attaches per-key enum analysis');
});

test('extractReportData sets filterUi based on contract type', () => {
  const data = callExtract();
  assert.equal(data.keys.find((k) => k.fieldKey === 'sensor').enum.filterUi, 'toggles');
  assert.equal(data.keys.find((k) => k.fieldKey === 'dpi').enum.filterUi, 'range');
});

test('extractReportData identifies component relations (parent + subfield_of)', () => {
  const data = callExtract();
  const sensor = data.keys.find((k) => k.fieldKey === 'sensor');
  const dpi = data.keys.find((k) => k.fieldKey === 'dpi');
  assert.deepEqual(sensor.component, { type: 'sensor', relation: 'parent', source: 'component_db.sensor' });
  assert.deepEqual(dpi.component, { type: 'sensor', relation: 'subfield_of', source: 'component_db.sensor' });
});

test('extractReportData parses string-DSL constraints into structured ops', () => {
  const data = callExtract();
  const dpi = data.keys.find((k) => k.fieldKey === 'dpi');
  assert.equal(dpi.constraints.length, 1);
  assert.equal(dpi.constraints[0].op, 'lte');
  assert.equal(dpi.constraints[0].left, 'dpi');
  assert.equal(dpi.constraints[0].right, '45000');
});

test('extractReportData builds groups in field_groups order, preserving field_key order', () => {
  const data = callExtract();
  assert.equal(data.groups.length, 2);
  const byKey = Object.fromEntries(data.groups.map((g) => [g.groupKey, g]));
  assert.deepEqual(byKey.general.fieldKeys, ['lighting']);
  assert.deepEqual(byKey.sensor_performance.fieldKeys, ['sensor', 'dpi']);
});

test('extractReportData builds enum inventory with usedBy pointers', () => {
  const data = callExtract();
  const lighting = data.enums.find((e) => e.name === 'lighting');
  assert.ok(lighting);
  assert.deepEqual(lighting.usedBy, ['lighting']);
  assert.equal(lighting.values.length, 3);
  const sensor = data.enums.find((e) => e.name === 'sensor');
  assert.deepEqual(sensor.usedBy, ['sensor']);
});

test('extractReportData builds component inventory with identity + subfields', () => {
  const data = callExtract();
  const sensorComp = data.components.find((c) => c.type === 'sensor');
  assert.ok(sensorComp);
  assert.equal(sensorComp.entityCount, 2);
  assert.deepEqual(sensorComp.identityFields, ['sensor']);
  assert.deepEqual(sensorComp.subfields.sort(), ['dpi']);
});

test('extractReportData stats surface gap counters', () => {
  const data = callExtract();
  assert.equal(data.stats.totalKeys, 3);
  assert.equal(data.stats.mandatoryCount, 1);
  assert.equal(data.stats.emptyGuidanceCount, 2, 'dpi + lighting have empty reasoning_note');
  assert.equal(data.stats.emptyAliasesCount, 2, 'dpi + lighting have no aliases');
  assert.equal(data.stats.emptyHintsCount, 2);
});

test('extractReportData carries global fragments + tier bundles through unchanged', () => {
  const data = callExtract();
  assert.equal(data.globalFragments.identityIntro, 'IDENTITY: intro');
  assert.equal(data.tierBundles.easy.model, 'claude-haiku-4-5');
  assert.equal(data.tierBundles.very_hard.model, 'claude-opus-4-7');
});

test('parseConstraintExpression maps operators: <= lte, >= gte, < lt, > gt, = eq', () => {
  assert.equal(parseConstraintExpression('a <= b').op, 'lte');
  assert.equal(parseConstraintExpression('a >= b').op, 'gte');
  assert.equal(parseConstraintExpression('a < b').op, 'lt');
  assert.equal(parseConstraintExpression('a > b').op, 'gt');
  assert.equal(parseConstraintExpression('a == b').op, 'eq');
  assert.equal(parseConstraintExpression('a = b').op, 'eq');
});

test('parseConstraintExpression returns null for empty / non-string input', () => {
  assert.equal(parseConstraintExpression(''), null);
  assert.equal(parseConstraintExpression('   '), null);
});

test('parseConstraintExpression returns unknown op for unparseable expressions', () => {
  const r = parseConstraintExpression('something weird');
  assert.equal(r.op, 'unknown');
  assert.equal(r.raw, 'something weird');
});
