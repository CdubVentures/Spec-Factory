import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import {
  PHASE_OVERRIDE_REGISTRY,
  uiPhaseIdToOverrideKey,
  type PhaseOverrideRegistryEntry,
} from '../llmPhaseOverridesBridge.ts';
import { resolvePhaseModel } from '../llmPhaseOverridesBridge.ts';

describe('PHASE_OVERRIDE_REGISTRY', () => {
  it('has exactly 7 entries', () => {
    strictEqual(PHASE_OVERRIDE_REGISTRY.length, 7);
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
      'extraction',
      'needset',
      'search-planner',
      'serp-triage',
      'validate',
      'write',
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

  it('returns override key for serp-triage', () => {
    strictEqual(uiPhaseIdToOverrideKey('serp-triage'), 'serpTriage');
  });

  it('returns undefined for global', () => {
    strictEqual(uiPhaseIdToOverrideKey('global'), undefined);
  });

  it('returns override key for extraction', () => {
    strictEqual(uiPhaseIdToOverrideKey('extraction'), 'extraction');
  });

  it('returns override key for validate', () => {
    strictEqual(uiPhaseIdToOverrideKey('validate'), 'validate');
  });

  it('returns override key for write', () => {
    strictEqual(uiPhaseIdToOverrideKey('write'), 'write');
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
