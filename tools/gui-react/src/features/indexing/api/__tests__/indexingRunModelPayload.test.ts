import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { buildIndexingRunModelPayload } from '../indexingRunModelPayload.ts';
import type { BuildIndexingRunModelPayloadInput } from '../indexingRunModelPayload.ts';

/* ------------------------------------------------------------------ */
/*  Factory                                                             */
/* ------------------------------------------------------------------ */

function makeInput(
  overrides: Partial<BuildIndexingRunModelPayloadInput> = {},
): BuildIndexingRunModelPayloadInput {
  return {
    searchProvider: 'searxng',
    llmModelPlan: 'gpt-4o',
    llmModelTriage: 'gpt-4o',
    llmMaxOutputTokensPlan: 4096,
    llmModelFast: 'gpt-4o-mini',
    llmMaxOutputTokensFast: 2048,
    llmMaxOutputTokensTriage: 2048,
    llmModelReasoning: 'claude-sonnet',
    llmMaxOutputTokensReasoning: 4096,
    llmModelExtract: 'gpt-4o',
    llmMaxOutputTokensExtract: 4096,
    llmModelValidate: 'gpt-4o',
    llmMaxOutputTokensValidate: 4096,
    llmModelWrite: 'gpt-4o',
    llmMaxOutputTokensWrite: 4096,
    llmPlanFallbackModel: 'gpt-4o-mini',
    llmMaxOutputTokensPlanFallback: 2048,
    llmMaxOutputTokensExtractFallback: 2048,
    llmMaxOutputTokensValidateFallback: 2048,
    llmMaxOutputTokensWriteFallback: 2048,
    llmReasoningFallbackModel: 'claude-haiku',
    llmExtractFallbackModel: 'gpt-4o-mini',
    llmValidateFallbackModel: 'gpt-4o-mini',
    llmWriteFallbackModel: 'gpt-4o-mini',
    llmMaxOutputTokensReasoningFallback: 2048,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Fix 2: Fallback model names included in run payload                 */
/* ------------------------------------------------------------------ */

describe('buildIndexingRunModelPayload — fallback fields', () => {
  it('includes llmReasoningFallbackModel in output', () => {
    const result = buildIndexingRunModelPayload(makeInput());
    strictEqual(result.llmReasoningFallbackModel, 'claude-haiku');
  });

  it('includes llmExtractFallbackModel in output', () => {
    const result = buildIndexingRunModelPayload(makeInput());
    strictEqual(result.llmExtractFallbackModel, 'gpt-4o-mini');
  });

  it('includes llmValidateFallbackModel in output', () => {
    const result = buildIndexingRunModelPayload(makeInput());
    strictEqual(result.llmValidateFallbackModel, 'gpt-4o-mini');
  });

  it('includes llmWriteFallbackModel in output', () => {
    const result = buildIndexingRunModelPayload(makeInput());
    strictEqual(result.llmWriteFallbackModel, 'gpt-4o-mini');
  });

  it('includes llmMaxOutputTokensReasoningFallback in output', () => {
    const result = buildIndexingRunModelPayload(makeInput());
    strictEqual(result.llmMaxOutputTokensReasoningFallback, 2048);
  });
});
