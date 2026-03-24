import test from 'node:test';
import assert from 'node:assert/strict';
import { exportRunArtifacts } from '../exporter.js';

function createStorage(writeCalls) {
  return {
    resolveOutputKey: (...parts) => parts.join('/'),
    writeObject: async (uri, value, options) => {
      writeCalls.push({ uri, value, options });
    }
  };
}

test('exportRunArtifacts skips raw page rewrites when artifacts were already persisted during fetch processing', async () => {
  const writeCalls = [];

  await exportRunArtifacts({
    storage: createStorage(writeCalls),
    category: 'mouse',
    productId: 'mouse-test',
    runId: 'run-001',
    artifactsByHost: {
      'example.com__0000': {
        pageArtifactsPersisted: true,
        pageHtmlUri: 'mouse/mouse-test/runs/run-001/raw/pages/example.com__0000/page.html.gz',
        ldjsonUri: 'mouse/mouse-test/runs/run-001/raw/pages/example.com__0000/ldjson.json',
        embeddedStateUri: 'mouse/mouse-test/runs/run-001/raw/pages/example.com__0000/embedded_state.json',
        networkResponsesUri: 'mouse/mouse-test/runs/run-001/raw/network/example.com__0000/responses.ndjson.gz',
        html: '',
        ldjsonBlocks: [],
        embeddedState: {},
        networkResponses: [],
        screenshot: null,
        domSnippet: null,
        pdfDocs: [],
        extractedCandidates: [{ field: 'dpi', value: '26000' }]
      }
    },
    adapterArtifacts: [],
    normalized: { fields: {} },
    provenance: {},
    candidates: {},
    summary: {},
    events: [],
    markdownSummary: '',
    rowTsv: '',
    writeMarkdownSummary: false,
    specDb: null,
  });

  const rawPageWrites = writeCalls.filter((row) => row.uri.includes('/raw/pages/') || row.uri.includes('/raw/network/'));
  assert.equal(rawPageWrites.length, 0);
  assert.equal(
    writeCalls.some((row) => row.uri.endsWith('/extracted/example.com__0000/candidates.json')),
    true
  );
});
