import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummaryArtifactsPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildSummaryArtifactsPhaseCallsiteContext maps runProduct summary-artifacts callsite inputs to context keys', () => {
  const writeSummaryMarkdownLLM = async () => 'summary';
  const buildMarkdownSummary = () => 'fallback';
  const tsvRowFromFields = () => 'row';

  const context = buildSummaryArtifactsPhaseCallsiteContext({
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
  assert.equal(context.writeSummaryMarkdownLLM, writeSummaryMarkdownLLM);
  assert.equal(context.buildMarkdownSummary, buildMarkdownSummary);
  assert.equal(context.tsvRowFromFields, tsvRowFromFields);
});
