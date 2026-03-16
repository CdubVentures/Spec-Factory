import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummaryArtifactsContext } from '../src/features/indexing/orchestration/index.js';

test('buildSummaryArtifactsContext computes rowTsv and leaves markdown empty when summary writing is disabled', async () => {
  const llmCalls = [];
  const markdownCalls = [];
  const tsvCalls = [];

  const result = await buildSummaryArtifactsContext({
    config: { writeMarkdownSummary: false, llmEnabled: true, llmWriteSummary: true },
    fieldOrder: ['dpi'],
    normalized: { fields: { dpi: 32000 } },
    provenance: { dpi: [] },
    summary: { confidence: 0.9 },
    logger: { info: () => {} },
    llmContext: { id: 'llm' },
    writeSummaryMarkdownLLMFn: async (payload) => {
      llmCalls.push(payload);
      return 'llm-markdown';
    },
    buildMarkdownSummaryFn: (payload) => {
      markdownCalls.push(payload);
      return 'fallback-markdown';
    },
    tsvRowFromFieldsFn: (fieldOrder, fields) => {
      tsvCalls.push({ fieldOrder, fields });
      return 'row-tsv';
    },
  });

  assert.equal(result.rowTsv, 'row-tsv');
  assert.equal(result.markdownSummary, '');
  assert.equal(llmCalls.length, 0);
  assert.equal(markdownCalls.length, 0);
  assert.deepEqual(tsvCalls, [{ fieldOrder: ['dpi'], fields: { dpi: 32000 } }]);
});

test('buildSummaryArtifactsContext uses llm summary and falls back to deterministic markdown when llm returns empty', async () => {
  const llmCalls = [];
  const markdownCalls = [];

  const result = await buildSummaryArtifactsContext({
    config: { writeMarkdownSummary: true, llmEnabled: true, llmWriteSummary: true },
    fieldOrder: ['dpi'],
    normalized: { fields: { dpi: 32000 } },
    provenance: { dpi: [{ source: 'a' }] },
    summary: { confidence: 0.9 },
    logger: { info: () => {} },
    llmContext: { id: 'llm' },
    writeSummaryMarkdownLLMFn: async (payload) => {
      llmCalls.push(payload);
      return '';
    },
    buildMarkdownSummaryFn: (payload) => {
      markdownCalls.push(payload);
      return 'fallback-markdown';
    },
    tsvRowFromFieldsFn: () => 'row-tsv',
  });

  assert.equal(result.rowTsv, 'row-tsv');
  assert.equal(result.markdownSummary, 'fallback-markdown');
  assert.equal(llmCalls.length, 1);
  assert.equal(markdownCalls.length, 1);
});
