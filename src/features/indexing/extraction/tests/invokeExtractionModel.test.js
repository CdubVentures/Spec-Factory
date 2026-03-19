import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMultimodalUserInput,
  invokeExtractionModel
} from '../invokeExtractionModel.js';

test('buildMultimodalUserInput returns text-only payload when visuals are disabled', () => {
  const result = buildMultimodalUserInput({
    userPayload: {
      targetFields: ['sensor']
    },
    promptEvidence: {
      references: []
    },
    scopedEvidencePack: {
      visual_assets: [
        {
          id: 'img-1',
          file_uri: 'file:///tmp/hero.png',
          mime_type: 'image/png'
        }
      ]
    },
    routeMatrixPolicy: {
      prime_sources_visual_send: false
    }
  });

  assert.equal(result.text.includes('"targetFields":["sensor"]'), true);
  assert.deepEqual(result.images, []);
});

test('buildMultimodalUserInput uses fallback screenshot metadata when no visuals match', () => {
  const result = buildMultimodalUserInput({
    userPayload: {
      targetFields: ['sensor']
    },
    promptEvidence: {
      references: []
    },
    scopedEvidencePack: {
      meta: {
        source_id: 'vendor:example',
        url: 'https://example.com/spec',
        visual_artifacts: {
          screenshot_uri: 'file:///tmp/fallback.jpg',
          screenshot_content_hash: 'sha256:fallback'
        }
      },
      visual_assets: []
    },
    routeMatrixPolicy: {
      prime_sources_visual_send: true
    }
  });

  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].file_uri, 'file:///tmp/fallback.jpg');
  assert.equal(result.images[0].mime_type, 'image/jpeg');
  assert.equal(result.images[0].content_hash, 'sha256:fallback');
});

test('invokeExtractionModel forwards multimodal payload, tracks usage, and sanitizes the result', async () => {
  const usageRows = [];
  const sanitizeCalls = [];
  const usageTracker = {
    prompt_tokens: 0,
    completion_tokens: 0,
    cost_usd: 0
  };
  const result = await invokeExtractionModel({
    model: 'fast-model',
    routeRole: 'extract',
    reasoningMode: false,
    reason: 'extract_batch:batch-1',
    maxTokens: 2222,
    usageTracker,
    userPayload: {
      targetFields: ['sensor']
    },
    promptEvidence: {
      references: [{ id: 'ref-sensor' }],
      snippets: [{ id: 'ref-sensor' }]
    },
    fieldSet: new Set(['sensor']),
    validRefs: new Set(['ref-sensor']),
    minEvidenceRefsByField: {
      sensor: 1
    },
    scopedEvidencePack: {
      meta: {
        host: 'example.com',
        total_chars: 120,
        source_id: 'vendor:example'
      },
      references: [{ id: 'ref-sensor' }],
      snippets: [{ id: 'ref-sensor' }],
      visual_assets: []
    },
    routeMatrixPolicy: {
      prime_sources_visual_send: false
    },
    config: {
      llmReasoningBudget: 1024,
      llmTimeoutMs: 5000
    },
    logger: {
      info() {}
    },
    job: {
      productId: 'mouse-invoke',
      category: 'mouse'
    },
    llmContext: {
      runId: 'run-1',
      round: 2,
      costRates: {},
      async recordUsage(row) {
        usageRows.push(row);
      }
    },
    evidencePack: {
      meta: {
        host: 'example.com',
        total_chars: 120
      }
    },
    callLlmFn: async (options) => {
      await options.onUsage({
        prompt_tokens: 10,
        completion_tokens: 5,
        cost_usd: 0.25
      });
      return {
        identityCandidates: {},
        fieldCandidates: [],
        conflicts: [],
        notes: []
      };
    },
    sanitizeExtractionResultFn: (options) => {
      sanitizeCalls.push(options);
      return {
        identityCandidates: {},
        fieldCandidates: [
          {
            field: 'sensor',
            value: 'Focus Pro 35K',
            evidenceRefs: ['ref-sensor']
          }
        ],
        conflicts: [],
        notes: []
      };
    }
  });

  assert.equal(usageTracker.prompt_tokens, 10);
  assert.equal(usageTracker.completion_tokens, 5);
  assert.equal(usageTracker.cost_usd, 0.25);
  assert.equal(usageRows.length, 1);
  assert.equal(sanitizeCalls.length, 1);
  assert.equal(sanitizeCalls[0].result.notes.length, 0);
  assert.equal(result.fieldCandidates.length, 1);
});
