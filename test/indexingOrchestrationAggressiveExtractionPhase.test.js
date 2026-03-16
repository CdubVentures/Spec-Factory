import test from 'node:test';
import assert from 'node:assert/strict';
import { runAggressiveExtractionPhase } from '../src/features/indexing/orchestration/index.js';

test('runAggressiveExtractionPhase runs aggressive orchestrator and refreshes deficits when extraction is enabled', async () => {
  const runCalls = [];
  const loggerWarnCalls = [];
  const runtimeEvidencePack = {
    meta: { raw_html: 'old-html', source: 'existing-pack' },
    references: [{ id: 1 }],
    snippets: [{ id: 's1' }],
  };

  const result = await runAggressiveExtractionPhase({
    config: { aggressiveModeEnabled: true },
    roundContext: {},
    storage: { marker: 'storage' },
    logger: {
      warn: (...args) => loggerWarnCalls.push(args),
    },
    category: 'mouse',
    productId: 'mouse-1',
    runId: 'run-1',
    identity: { brand: 'Logitech' },
    normalized: { fields: {} },
    provenance: {},
    fieldOrder: ['dpi'],
    categoryConfig: { criticalFieldSet: new Set(['dpi']) },
    discoveryResult: { enabled: true },
    sourceResults: [{ url: 'https://example.com/spec' }],
    artifactsByHost: { 'example.com': { domHtml: '<html>new-html</html>' } },
    runtimeEvidencePack,
    fieldsBelowPassTarget: ['dpi'],
    criticalFieldsBelowPassTarget: ['dpi'],
    selectAggressiveDomHtmlFn: (artifactsByHost) => {
      assert.equal(artifactsByHost['example.com'].domHtml, '<html>new-html</html>');
      return '<html>new-html</html>';
    },
    createAggressiveOrchestratorFn: (payload) => {
      assert.equal(payload.storage.marker, 'storage');
      assert.equal(payload.config.aggressiveModeEnabled, true);
      assert.equal(typeof payload.logger.warn, 'function');
      return {
        run: async (runPayload) => {
          runCalls.push(runPayload);
          assert.equal(runPayload.category, 'mouse');
          assert.equal(runPayload.productId, 'mouse-1');
          assert.equal(runPayload.evidencePack.meta.raw_html, '<html>new-html</html>');
          assert.equal(runPayload.evidencePack.references.length, 1);
          return { enabled: true, stage: 'completed' };
        },
      };
    },
    refreshFieldsBelowPassTargetFn: (payload) => {
      assert.equal(payload.fieldOrder[0], 'dpi');
      return {
        fieldsBelowPassTarget: ['weight_g'],
        criticalFieldsBelowPassTarget: [],
      };
    },
  });

  assert.equal(runCalls.length, 1);
  assert.equal(loggerWarnCalls.length, 0);
  assert.deepEqual(result.aggressiveExtraction, { enabled: true, stage: 'completed' });
  assert.deepEqual(result.fieldsBelowPassTarget, ['weight_g']);
  assert.deepEqual(result.criticalFieldsBelowPassTarget, []);
});
