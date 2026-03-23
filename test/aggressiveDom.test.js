import test from 'node:test';
import assert from 'node:assert/strict';
import { AggressiveDomExtractor } from '../src/features/indexing/extraction/aggressiveDom.js';

test('AggressiveDomExtractor extracts basic field candidates from HTML text', async () => {
  const extractor = new AggressiveDomExtractor({
    config: {
      llmModelPlan: 'test-fast-model',
      llmModelReasoning: 'test-deep-model',
    }
  });
  const result = await extractor.extractFromDom(
    '<html><body><div>weight: 59 g</div><div>dpi: 26000</div></body></html>',
    ['weight', 'dpi', 'sensor'],
    { productId: 'mouse-1' },
    { source_id: 'manufacturer' }
  );

  assert.equal(result.model, 'test-fast-model');
  assert.equal(result.force_deep, false);
  assert.equal(result.fieldCandidates.some((row) => row.field === 'weight'), true);
  assert.equal(result.fieldCandidates.some((row) => row.field === 'dpi'), true);
});

test('AggressiveDomExtractor uses deep model when forceDeep is true', async () => {
  const extractor = new AggressiveDomExtractor({
    config: {
      llmModelPlan: 'test-fast-model',
      llmModelReasoning: 'test-deep-model',
    }
  });
  const result = await extractor.extractFromDom(
    '<div>weight: 58 g</div>',
    ['weight'],
    { productId: 'mouse-2' },
    { source_id: 'manufacturer' },
    { forceDeep: true }
  );
  assert.equal(result.model, 'test-deep-model');
  assert.equal(result.force_deep, true);
});
