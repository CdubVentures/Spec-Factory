import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

test('runtime flow draft normalization exports are sourced from dedicated contract and normalizer modules', async () => {
  const {
    runtimeFlowDraftNormalization,
    runtimeFlowDraftContracts,
    runtimeFlowDraftNormalizer,
  } = await loadBundledModule(
    'test/fixtures/runtimeFlowDraftNormalizationModuleBoundary.entry.ts',
    { prefix: 'runtime-flow-draft-normalization-boundary-' },
  );

  assert.strictEqual(
    runtimeFlowDraftNormalization.SEARCH_PROVIDER_OPTIONS,
    runtimeFlowDraftContracts.SEARCH_PROVIDER_OPTIONS,
  );
  assert.strictEqual(
    runtimeFlowDraftNormalization.OCR_BACKEND_OPTIONS,
    runtimeFlowDraftContracts.OCR_BACKEND_OPTIONS,
  );
  assert.strictEqual(
    runtimeFlowDraftNormalization.RESUME_MODE_OPTIONS,
    runtimeFlowDraftContracts.RESUME_MODE_OPTIONS,
  );
  assert.strictEqual(
    runtimeFlowDraftNormalization.REPAIR_DEDUPE_RULE_OPTIONS,
    runtimeFlowDraftContracts.REPAIR_DEDUPE_RULE_OPTIONS,
  );
  assert.strictEqual(
    runtimeFlowDraftNormalization.AUTOMATION_QUEUE_STORAGE_ENGINE_OPTIONS,
    runtimeFlowDraftContracts.AUTOMATION_QUEUE_STORAGE_ENGINE_OPTIONS,
  );
  assert.strictEqual(
    runtimeFlowDraftNormalization.RUNTIME_NUMBER_BOUNDS,
    runtimeFlowDraftContracts.RUNTIME_NUMBER_BOUNDS,
  );
  assert.strictEqual(runtimeFlowDraftNormalization.toRuntimeDraft, runtimeFlowDraftContracts.toRuntimeDraft);
  assert.strictEqual(runtimeFlowDraftNormalization.runtimeDraftEqual, runtimeFlowDraftContracts.runtimeDraftEqual);
  assert.strictEqual(runtimeFlowDraftNormalization.normalizeToken, runtimeFlowDraftContracts.normalizeToken);
  assert.strictEqual(runtimeFlowDraftNormalization.parseBoundedNumber, runtimeFlowDraftContracts.parseBoundedNumber);
  assert.strictEqual(
    runtimeFlowDraftNormalization.normalizeRuntimeDraft,
    runtimeFlowDraftNormalizer.normalizeRuntimeDraft,
  );
});
