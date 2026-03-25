import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import {
  PHASE_OVERRIDE_REGISTRY,
  uiPhaseIdToOverrideKey,
  type PhaseOverrideRegistryEntry,
} from '../llmPhaseOverridesBridge.ts';
import { resolvePhaseModel } from '../llmPhaseOverridesBridge.ts';

describe('PHASE_OVERRIDE_REGISTRY', () => {
  it('has exactly 5 entries', () => {
    strictEqual(PHASE_OVERRIDE_REGISTRY.length, 5);
  });

  it('every entry has uiPhaseId, overrideKey, and globalModel', () => {
    for (const entry of PHASE_OVERRIDE_REGISTRY) {
      ok(entry.uiPhaseId, 'missing uiPhaseId');
      ok(entry.overrideKey, 'missing overrideKey');
      ok(entry.globalModel, 'missing globalModel');
      ok(entry.groupToggle, 'missing groupToggle');
      ok(entry.globalTokens, 'missing globalTokens');
    }
  });

  it('maps the expected UI phase IDs', () => {
    const ids = PHASE_OVERRIDE_REGISTRY.map((e) => e.uiPhaseId).sort();
    deepStrictEqual(ids, [
      'brand-resolver',
      'needset',
      'search-planner',
      'serp-selector',
      'validate',
    ]);
  });
});

describe('uiPhaseIdToOverrideKey', () => {
  it('returns override key for needset', () => {
    strictEqual(uiPhaseIdToOverrideKey('needset'), 'needset');
  });

  it('returns override key for brand-resolver', () => {
    strictEqual(uiPhaseIdToOverrideKey('brand-resolver'), 'brandResolver');
  });

  it('returns override key for search-planner', () => {
    strictEqual(uiPhaseIdToOverrideKey('search-planner'), 'searchPlanner');
  });

  it('returns override key for serp-selector', () => {
    strictEqual(uiPhaseIdToOverrideKey('serp-selector'), 'serpSelector');
  });

  it('returns undefined for global', () => {
    strictEqual(uiPhaseIdToOverrideKey('global'), undefined);
  });

  it('returns override key for validate', () => {
    strictEqual(uiPhaseIdToOverrideKey('validate'), 'validate');
  });
});

describe('resolvePhaseModel with unmapped phase', () => {
  it('returns null for unmapped phase', () => {
    const result = resolvePhaseModel({}, 'nonexistent' as never, {
      llmModelPlan: 'gpt-4o',
      llmModelReasoning: 'o1',
      llmPlanUseReasoning: false,
      llmMaxOutputTokensPlan: 4096,
    });
    strictEqual(result, null);
  });
});
