import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRunSummaryOperationsSection } from '../src/features/indexing/orchestration/finalize/buildRunSummaryOperationsSection.js';

// WHY: Verifies buildRunSummaryOperationsSection reports the phase-resolved
// model via resolvePhaseModel() when _resolved*BaseModel overrides are set,
// falling back to config.llmModelPlan when no override exists.

test('buildRunSummaryOperationsSection reports phase-resolved models', async (t) => {
  const config = {
    llmApiKey: 'test-key',
    llmProvider: 'test-provider',
    llmModelPlan: 'global-model',
    _resolvedExtractionBaseModel: 'extraction-model-override',
    _resolvedNeedsetBaseModel: 'needset-model-override',
    _resolvedValidateBaseModel: 'validate-model-override',
  };

  const result = buildRunSummaryOperationsSection({ config });

  await t.test('model_extract uses _resolvedExtractionBaseModel when set', () => {
    assert.equal(result.llm.model_extract, 'extraction-model-override');
  });

  await t.test('model_plan uses _resolvedNeedsetBaseModel when set', () => {
    assert.equal(result.llm.model_plan, 'needset-model-override');
  });

  await t.test('model_validate uses _resolvedValidateBaseModel when set', () => {
    assert.equal(result.llm.model_validate, 'validate-model-override');
  });

  await t.test('falls back to llmModelPlan when no override', () => {
    const fallbackResult = buildRunSummaryOperationsSection({
      config: { llmApiKey: 'k', llmModelPlan: 'fallback-model' },
    });
    assert.equal(fallbackResult.llm.model_extract, 'fallback-model');
    assert.equal(fallbackResult.llm.model_plan, 'fallback-model');
    assert.equal(fallbackResult.llm.model_validate, 'fallback-model');
  });
});
