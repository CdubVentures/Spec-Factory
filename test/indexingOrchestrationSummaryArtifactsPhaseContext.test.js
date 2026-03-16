import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummaryArtifactsPhaseContext } from '../src/features/indexing/orchestration/index.js';

test('buildSummaryArtifactsPhaseContext maps runProduct summary-artifact inputs to phase contract keys', () => {
  const writeSummaryMarkdownLLM = async () => 'summary';
  const buildMarkdownSummary = () => 'fallback';
  const tsvRowFromFields = () => 'row';

  const context = buildSummaryArtifactsPhaseContext({
    config: { writeMarkdownSummary: true },
    fieldOrder: ['dpi'],
    normalized: { fields: { dpi: 32000 } },
    provenance: { dpi: [{ source: 'a' }] },
    summary: { confidence: 0.9 },
    logger: { info() {} },
    llmContext: { id: 'llm' },
    writeSummaryMarkdownLLM,
    buildMarkdownSummary,
    tsvRowFromFields,
  });

  assert.deepEqual(context.config, { writeMarkdownSummary: true });
  assert.deepEqual(context.fieldOrder, ['dpi']);
  assert.deepEqual(context.normalized, { fields: { dpi: 32000 } });
  assert.deepEqual(context.provenance, { dpi: [{ source: 'a' }] });
  assert.deepEqual(context.summary, { confidence: 0.9 });
  assert.equal(typeof context.writeSummaryMarkdownLLMFn, 'function');
  assert.equal(context.buildMarkdownSummaryFn, buildMarkdownSummary);
  assert.equal(context.tsvRowFromFieldsFn, tsvRowFromFields);
});
