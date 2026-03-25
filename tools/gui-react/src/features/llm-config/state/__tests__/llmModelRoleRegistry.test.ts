import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import {
  LLM_MODEL_ROLES,
  LLM_MODEL_FIELD_LABELS,
  LLM_TOKEN_VALIDATION_ENTRIES,
} from '../llmModelRoleRegistry.ts';

describe('LLM_MODEL_ROLES', () => {
  it('has exactly 2 primary entries', () => {
    strictEqual(LLM_MODEL_ROLES.length, 2);
  });

  it('every primary role has role, modelKey, tokenKey, label', () => {
    for (const entry of LLM_MODEL_ROLES) {
      ok(entry.role, `missing role on entry with modelKey=${entry.modelKey}`);
      ok(entry.modelKey, `missing modelKey on entry with role=${entry.role}`);
      ok(entry.tokenKey, `missing tokenKey on entry with role=${entry.role}`);
      ok(entry.label, `missing label on entry with role=${entry.role}`);
    }
  });

  it('every primary role has fallbackModelKey and fallbackTokenKey', () => {
    for (const entry of LLM_MODEL_ROLES) {
      ok(entry.fallbackModelKey, `missing fallbackModelKey on ${entry.role}`);
      ok(entry.fallbackTokenKey, `missing fallbackTokenKey on ${entry.role}`);
    }
  });
});

describe('LLM_MODEL_FIELD_LABELS (derived)', () => {
  it('is derived from the registry with 2 entries', () => {
    strictEqual(Object.keys(LLM_MODEL_FIELD_LABELS).length, 2);
  });

  it('maps modelKey → label for each registry entry', () => {
    for (const entry of LLM_MODEL_ROLES) {
      strictEqual(LLM_MODEL_FIELD_LABELS[entry.modelKey], entry.label);
    }
  });

  it('matches the expected values', () => {
    deepStrictEqual(LLM_MODEL_FIELD_LABELS, {
      llmModelPlan: 'Base model',
      llmModelReasoning: 'Reasoning model',
    });
  });
});

describe('LLM_TOKEN_VALIDATION_ENTRIES (derived)', () => {
  it('has 4 entries: 2 primary + 2 fallback', () => {
    strictEqual(LLM_TOKEN_VALIDATION_ENTRIES.length, 4);
  });

  it('primary entries come before their fallbacks', () => {
    const planIdx = LLM_TOKEN_VALIDATION_ENTRIES.findIndex((e) => e.phase === 'Plan');
    const planFbIdx = LLM_TOKEN_VALIDATION_ENTRIES.findIndex((e) => e.phase === 'Plan Fallback');
    ok(planIdx < planFbIdx, 'Plan should come before Plan Fallback');
  });

  it('every entry has phase, modelKey, tokenKey', () => {
    for (const entry of LLM_TOKEN_VALIDATION_ENTRIES) {
      ok(entry.phase, 'missing phase');
      ok(entry.modelKey, 'missing modelKey');
      ok(entry.tokenKey, 'missing tokenKey');
    }
  });

  it('matches the expected entries order and values', () => {
    const expected = [
      { phase: 'Plan', modelKey: 'llmModelPlan', tokenKey: 'llmMaxOutputTokensPlan' },
      { phase: 'Plan Fallback', modelKey: 'llmPlanFallbackModel', tokenKey: 'llmMaxOutputTokensPlanFallback' },
      { phase: 'Reasoning', modelKey: 'llmModelReasoning', tokenKey: 'llmMaxOutputTokensReasoning' },
      { phase: 'Reasoning Fallback', modelKey: 'llmReasoningFallbackModel', tokenKey: 'llmMaxOutputTokensPlanFallback' },
    ];
    deepStrictEqual(LLM_TOKEN_VALIDATION_ENTRIES, expected);
  });
});
