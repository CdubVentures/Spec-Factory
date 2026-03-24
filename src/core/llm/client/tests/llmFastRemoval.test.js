import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_DEFAULTS } from '../../../../shared/settingsDefaults.js';
import { SETTINGS_CLAMPING_INT_RANGE_MAP } from '../../../../shared/settingsClampingRanges.js';
import { RUNTIME_SETTINGS_ROUTE_GET } from '../../../config/settingsKeyMap.js';
import { resolveLlmRoute } from '../routing.js';
import { resolveLlmRoleDefaults, resolveLlmKnobDefaults } from '../../../../api/helpers/llmHelpers.js';

// ---------------------------------------------------------------------------
// Contract: 'fast' role/model/token cap removed from config surface
// ---------------------------------------------------------------------------

test('SETTINGS_DEFAULTS.runtime does not contain llmModelFast', () => {
  assert.equal(Object.hasOwn(SETTINGS_DEFAULTS.runtime, 'llmModelFast'), false);
});

test('SETTINGS_DEFAULTS.runtime does not contain llmMaxOutputTokensFast', () => {
  assert.equal(Object.hasOwn(SETTINGS_DEFAULTS.runtime, 'llmMaxOutputTokensFast'), false);
});

test('SETTINGS_CLAMPING_INT_RANGE_MAP does not contain llmMaxOutputTokensFast', () => {
  assert.equal(Object.hasOwn(SETTINGS_CLAMPING_INT_RANGE_MAP, 'llmMaxOutputTokensFast'), false);
});

test('RUNTIME_SETTINGS_ROUTE_GET.stringMap does not contain llmModelFast', () => {
  assert.equal(Object.hasOwn(RUNTIME_SETTINGS_ROUTE_GET.stringMap, 'llmModelFast'), false);
});

test('RUNTIME_SETTINGS_ROUTE_GET.intMap does not contain llmMaxOutputTokensFast', () => {
  assert.equal(Object.hasOwn(RUNTIME_SETTINGS_ROUTE_GET.intMap, 'llmMaxOutputTokensFast'), false);
});

test('default registry models do not have role: fast', () => {
  const registry = JSON.parse(SETTINGS_DEFAULTS.runtime.llmProviderRegistryJson);
  for (const provider of registry) {
    for (const model of provider.models) {
      assert.notEqual(model.role, 'fast',
        `${provider.name}/${model.modelId} should not have role: fast`);
    }
  }
});

test('resolveLlmRoleDefaults does not contain fast key', () => {
  const defaults = resolveLlmRoleDefaults({ llmModelPlan: 'test-model' });
  assert.equal(Object.hasOwn(defaults, 'fast'), false);
});

test('resolveLlmKnobDefaults does not contain fast_pass key', () => {
  const defaults = resolveLlmKnobDefaults({
    llmModelPlan: 'test-model',
    llmMaxOutputTokensPlan: 4096,
  });
  assert.equal(Object.hasOwn(defaults, 'fast_pass'), false);
});

// ---------------------------------------------------------------------------
// Contract: discovery_planner_primary routes to plan role
// ---------------------------------------------------------------------------

test('reason discovery_planner_primary resolves to plan role', () => {
  const config = {
    llmModelPlan: 'gemini-2.5-flash',
    llmModelExtract: 'gemini-2.5-flash',
    geminiApiKey: 'test-key',
  };
  const route = resolveLlmRoute(config, { reason: 'discovery_planner_primary' });
  assert.equal(route.role, 'plan');
});

test('reason verify_extract_fast resolves to plan role', () => {
  const config = {
    llmModelPlan: 'gemini-2.5-flash',
    llmModelExtract: 'gemini-2.5-flash',
    llmPlanProvider: 'gemini',
    llmPlanBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    llmPlanApiKey: 'test-key',
  };
  const route = resolveLlmRoute(config, { reason: 'verify_extract_fast' });
  assert.equal(route.role, 'plan');
});
