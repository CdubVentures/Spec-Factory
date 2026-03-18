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
    searchEngines: 'bing,startpage,duckduckgo',
    searchEnginesFallback: 'bing',
    llmModelPlan: 'gpt-4o',
    llmMaxOutputTokensPlan: 4096,
    llmModelReasoning: 'claude-sonnet',
    llmMaxOutputTokensReasoning: 4096,
    llmPlanFallbackModel: 'gpt-4o-mini',
    llmMaxOutputTokensPlanFallback: 2048,
    llmReasoningFallbackModel: 'claude-haiku',
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

  it('includes llmMaxOutputTokensReasoningFallback in output', () => {
    const result = buildIndexingRunModelPayload(makeInput());
    strictEqual(result.llmMaxOutputTokensReasoningFallback, 2048);
  });
});
