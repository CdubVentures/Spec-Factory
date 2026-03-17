import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { detectEmptyModelFields } from '../llmModelValidation.ts';

/* ------------------------------------------------------------------ */
/*  detectEmptyModelFields                                              */
/* ------------------------------------------------------------------ */

describe('detectEmptyModelFields', () => {
  it('returns no issues when all model fields are populated', () => {
    const issues = detectEmptyModelFields({
      llmModelPlan: 'gpt-4o',
      llmModelReasoning: 'claude-sonnet',
    });
    strictEqual(issues.length, 0);
  });

  it('returns error for empty model string', () => {
    const issues = detectEmptyModelFields({
      llmModelPlan: '',
      llmModelReasoning: 'claude-sonnet',
    });
    strictEqual(issues.length, 1);
    strictEqual(issues[0].severity, 'error');
    strictEqual(issues[0].ringFields.includes('llmModelPlan'), true);
  });

  it('returns error for whitespace-only model string', () => {
    const issues = detectEmptyModelFields({
      llmModelPlan: '   ',
    });
    strictEqual(issues.length, 1);
    strictEqual(issues[0].severity, 'error');
    strictEqual(issues[0].key, 'empty-model-llmModelPlan');
  });

  it('returns multiple errors for multiple empty fields', () => {
    const issues = detectEmptyModelFields({
      llmModelPlan: '',
      llmModelReasoning: '',
    });
    strictEqual(issues.length, 2);
    const keys = issues.map((i) => i.key).sort();
    deepStrictEqual(keys, ['empty-model-llmModelPlan', 'empty-model-llmModelReasoning']);
  });

  it('returns empty array for empty input', () => {
    const issues = detectEmptyModelFields({});
    strictEqual(issues.length, 0);
  });
});
