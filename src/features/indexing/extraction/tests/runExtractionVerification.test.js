import test from 'node:test';
import assert from 'node:assert/strict';

import { runExtractionVerification } from '../runExtractionVerification.js';

test('runExtractionVerification prioritizes judge batches, invokes both models, and writes a report', async () => {
  const prepareCalls = [];
  const invokeCalls = [];
  const reportEntries = [];
  const infoEvents = [];

  const result = await runExtractionVerification({
    job: {
      productId: 'mouse-verify',
      category: 'mouse'
    },
    categoryConfig: {
      category: 'mouse',
      fieldOrder: ['shape', 'sensor'],
      requiredFields: ['sensor']
    },
    usableBatches: [
      { id: 'advisory-batch', fields: ['shape'] },
      { id: 'judge-batch', fields: ['sensor'] }
    ],
    fieldRules: {
      shape: { ai_assist: { mode: 'advisory' } },
      sensor: { ai_assist: { mode: 'judge' } }
    },
    effectiveFieldOrder: ['shape', 'sensor'],
    evidencePack: {
      meta: { url: 'https://example.com/spec' },
      references: [{ id: 'ref-sensor' }],
      snippets: [{ id: 'ref-sensor' }],
      visual_assets: []
    },
    config: {
      llmModelPlan: 'fast-model',
      llmModelExtract: 'reason-model'
    },
    llmContext: {
      runId: 'run-1',
      round: 2,
      mode: 'normal',
      verification: {
        trigger: 'sampling'
      },
      storage: { name: 'storage' }
    },
    routeMatrixPolicy: {
      min_evidence_refs_effective: 1
    },
    knownValuesFlat: {},
    goldenExamples: [],
    componentDBs: {},
    resolveBatchRoutePolicyFn: ({ batchFields }) => ({
      route_key: `route:${batchFields.join(',')}`
    }),
    selectBatchEvidenceFn: ({ batchFields }) => ({
      references: batchFields.map((field) => ({ id: `ref-${field}` })),
      snippets: batchFields.map((field) => ({ id: `ref-${field}` })),
      visual_assets: []
    }),
    prepareBatchPromptContextFn: (options) => {
      prepareCalls.push(options.batchFields);
      return {
        validRefs: new Set(['ref-sensor']),
        fieldSet: new Set(options.batchFields),
        promptEvidence: {
          references: [{ id: 'ref-sensor' }],
          snippets: [{ id: 'ref-sensor' }]
        },
        userPayload: {
          targetFields: options.batchFields
        }
      };
    },
    budgetGuard: {
      canCall() {
        return { allowed: true };
      }
    },
    invokeModel: async (request) => {
      invokeCalls.push({
        model: request.model,
        routeRole: request.routeRole,
        reasoningMode: request.reasoningMode,
        reason: request.reason,
        targetFields: request.userPayload.targetFields
      });
      return {
        fieldCandidates: [
          {
            field: 'sensor',
            value: request.reasoningMode ? 'Focus Pro 35K' : 'Focus Pro 30K',
            evidenceRefs: ['ref-sensor']
          }
        ],
        conflicts: request.reasoningMode ? [{ field: 'sensor', values: ['A', 'B'], evidenceRefs: ['ref-sensor'] }] : []
      };
    },
    appendVerificationReportFn: async ({ entry }) => {
      reportEntries.push(entry);
      return 'reports/verify.jsonl';
    },
    logger: {
      info(event, payload) {
        infoEvents.push([event, payload]);
      }
    }
  });

  assert.deepEqual(prepareCalls, [['sensor']]);
  assert.deepEqual(invokeCalls, [
    {
      model: 'fast-model',
      routeRole: 'plan',
      reasoningMode: false,
      reason: 'verify_extract_fast',
      targetFields: ['sensor']
    },
    {
      model: 'reason-model',
      routeRole: 'extract',
      reasoningMode: true,
      reason: 'verify_extract_reason',
      targetFields: ['sensor']
    }
  ]);
  assert.equal(reportEntries.length, 1);
  assert.equal(reportEntries[0].verify_batch_count, 1);
  assert.equal(reportEntries[0].better_model, 'tie');
  assert.equal(result.reportKey, 'reports/verify.jsonl');
  assert.equal(result.verifyBatchStats.length, 1);
  assert.equal(infoEvents[0][0], 'llm_verify_report_written');
});

test('runExtractionVerification swallows verification failures and warns', async () => {
  const warningEvents = [];

  const result = await runExtractionVerification({
    job: {
      productId: 'mouse-verify-fail',
      category: 'mouse'
    },
    categoryConfig: {
      category: 'mouse',
      fieldOrder: ['sensor'],
      requiredFields: ['sensor']
    },
    usableBatches: [{ id: 'judge-batch', fields: ['sensor'] }],
    fieldRules: {
      sensor: { ai_assist: { mode: 'judge' } }
    },
    effectiveFieldOrder: ['sensor'],
    evidencePack: {
      meta: {},
      references: [],
      snippets: [],
      visual_assets: []
    },
    config: {

      llmModelExtract: 'reason-model'
    },
    llmContext: {
      verification: {
        trigger: 'sampling'
      }
    },
    routeMatrixPolicy: {},
    knownValuesFlat: {},
    goldenExamples: [],
    componentDBs: {},
    resolveBatchRoutePolicyFn: () => ({}),
    selectBatchEvidenceFn: () => ({
      references: [],
      snippets: [],
      visual_assets: []
    }),
    prepareBatchPromptContextFn: () => ({
      validRefs: new Set(),
      fieldSet: new Set(['sensor']),
      promptEvidence: {
        references: [],
        snippets: []
      },
      userPayload: {
        targetFields: ['sensor']
      }
    }),
    budgetGuard: {
      canCall() {
        return { allowed: true };
      }
    },
    invokeModel: async () => {
      throw new Error('verify broke');
    },
    appendVerificationReportFn: async () => {
      throw new Error('report should not be called');
    },
    logger: {
      warn(event, payload) {
        warningEvents.push([event, payload]);
      }
    }
  });

  assert.equal(result.reportKey, null);
  assert.deepEqual(result.verifyBatchStats, []);
  assert.equal(warningEvents[0][0], 'llm_verify_failed');
  assert.equal(warningEvents[0][1].message, 'verify broke');
});
