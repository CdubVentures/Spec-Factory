import test from 'node:test';
import assert from 'node:assert/strict';

import { renderKeyFinderPreview } from '../adapters/keyFinderAdapter.js';

const TIER_BUNDLES = {
  easy: { model: 'claude-haiku-4-5', useReasoning: false, thinking: false, webSearch: false },
  medium: { model: 'claude-sonnet-4-6', useReasoning: false, thinking: true, thinkingEffort: 'low', webSearch: true },
  hard: { model: 'claude-sonnet-4-6', useReasoning: true, reasoningModel: 'claude-sonnet-4-6', thinking: true, thinkingEffort: 'high', webSearch: true },
  very_hard: { model: 'claude-opus-4-7', useReasoning: true, thinking: true, thinkingEffort: 'high', webSearch: true },
  fallback: { model: 'claude-sonnet-4-6', useReasoning: false, thinking: false, webSearch: false },
};

function baseRule(overrides = {}) {
  return {
    field_key: 'sensor',
    display_name: 'Sensor',
    priority: { difficulty: 'hard' },
    contract: { type: 'string', shape: 'scalar' },
    enum: { policy: 'open_prefer_known', values: ['PMW3395', 'PAW3395'] },
    aliases: ['Focus Pro 45K'],
    search_hints: { domain_hints: ['sensor.fyi'], query_terms: ['sensor model'] },
    cross_field_constraints: [{ op: 'lte', target: 'release_date' }],
    component: { type: 'sensor' },
    ai_assist: { reasoning_note: 'Chip/model only.' },
    ...overrides,
  };
}

test('renderKeyFinderPreview returns all preview blocks', () => {
  const out = renderKeyFinderPreview(baseRule(), 'sensor', { tierBundles: TIER_BUNDLES });
  assert.ok(out.header.startsWith('Field key: sensor'));
  assert.ok(out.guidance.includes('Chip/model only.'));
  assert.ok(out.contract.startsWith('Return contract:'));
  assert.ok(out.contract.includes('Type: string (scalar)'));
  assert.ok(out.contract.includes('PMW3395'));
  assert.ok(out.searchHints.includes('sensor.fyi'));
  assert.ok(out.crossField.includes('release_date'));
  assert.equal(out.componentRel, 'This key IS the sensor component identity.');
});

test('renderKeyFinderPreview resolves data-list enum values from knownValues', () => {
  const out = renderKeyFinderPreview(baseRule({
    enum: { policy: 'open_prefer_known', source: 'data_lists.sensor', values: [] },
  }), 'sensor', {
    tierBundles: TIER_BUNDLES,
    knownValues: { enums: { sensor: { policy: 'open_prefer_known', values: ['PMW3395'] } } },
  });

  assert.ok(out.contract.includes('Preferred canonical values (open_prefer_known): PMW3395'));
  assert.ok(out.contract.includes('Emit an unlisted value only when direct evidence proves a real value'));
});

test('renderKeyFinderPreview resolves tier bundle by rule difficulty', () => {
  const hard = renderKeyFinderPreview(baseRule({ priority: { difficulty: 'hard' } }), 'sensor', { tierBundles: TIER_BUNDLES });
  assert.equal(hard.tierBundle.name, 'hard');
  assert.equal(hard.tierBundle.model, 'claude-sonnet-4-6');
  assert.equal(hard.tierBundle.useReasoning, true);
  const easy = renderKeyFinderPreview(baseRule({ priority: { difficulty: 'easy' } }), 'sensor', { tierBundles: TIER_BUNDLES });
  assert.equal(easy.tierBundle.name, 'easy');
  assert.equal(easy.tierBundle.model, 'claude-haiku-4-5');
});

test('renderKeyFinderPreview uses fallback tier values for unknown difficulties', () => {
  const weird = renderKeyFinderPreview(baseRule({ priority: { difficulty: 'ultra' } }), 'sensor', { tierBundles: TIER_BUNDLES });
  assert.equal(weird.tierBundle.name, 'medium', 'unknown difficulty falls through to medium');
});

test('renderKeyFinderPreview overlays fallback bundle onto missing tier fields', () => {
  const out = renderKeyFinderPreview(baseRule({ priority: { difficulty: 'easy' } }), 'sensor', {
    tierBundles: {
      easy: { model: '' },   // empty model should inherit fallback.model
      fallback: { model: 'claude-haiku-4-5', useReasoning: false, thinking: false, webSearch: false },
    },
  });
  assert.equal(out.tierBundle.model, 'claude-haiku-4-5', 'empty tier.model inherits fallback.model');
});

test('renderKeyFinderPreview empties searchHints when searchHintsEnabled=false', () => {
  const out = renderKeyFinderPreview(baseRule(), 'sensor', { tierBundles: TIER_BUNDLES, searchHintsEnabled: false });
  assert.equal(out.searchHints, '');
});

test('renderKeyFinderPreview empties componentRel when componentInjectionEnabled=false', () => {
  const out = renderKeyFinderPreview(baseRule(), 'sensor', { tierBundles: TIER_BUNDLES, componentInjectionEnabled: false });
  assert.equal(out.componentRel, '');
});

test('renderKeyFinderPreview returns empty guidance when reasoning_note is blank', () => {
  const out = renderKeyFinderPreview(baseRule({ ai_assist: { reasoning_note: '' } }), 'sensor', { tierBundles: TIER_BUNDLES });
  assert.equal(out.guidance, '');
});

test('renderKeyFinderPreview renders constraints DSL when cross_field_constraints is absent', () => {
  const rule = baseRule();
  delete rule.cross_field_constraints;
  rule.constraints = ['sensor_date <= release_date'];
  const out = renderKeyFinderPreview(rule, 'sensor', { tierBundles: TIER_BUNDLES });
  assert.ok(out.crossField.includes('release_date'));
});
