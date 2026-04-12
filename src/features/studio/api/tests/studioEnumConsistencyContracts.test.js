import test from 'node:test';
import assert from 'node:assert/strict';

import { invokeStudioRoute } from './helpers/studioRoutesHarness.js';

function mockSpecDb(listValueRows = []) {
  return {
    getListValues: () => listValueRows,
    close: () => {},
  };
}

test('studio enum consistency skips when review consumer is disabled', async () => {
  const emitted = [];
  const result = await invokeStudioRoute({
    readJsonBody: async () => ({
      field: 'lighting',
      apply: true,
    }),
    getSpecDbReady: async () => mockSpecDb([
      { value: '1 zone (rgb)', needs_review: false },
      { value: '7 zone (led)', needs_review: false },
      { value: '1 zone rgb', needs_review: true },
    ]),
    sessionCache: {
      getSessionRules: async () => ({
        mergedFields: {
          lighting: {
            enum: { policy: 'open_prefer_known' },
            consumers: {
              'enum.match.format_hint': { review: false },
            },
          },
        },
      }),
      invalidateSessionCache: () => {},
    },
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }, ['studio', 'mouse', 'enum-consistency'], 'POST');

  assert.equal(result.status, 200);
  assert.equal(result.body.skipped_reason, 'review_consumer_disabled');
  assert.equal(result.body.llm_enabled, false);
  assert.equal(Array.isArray(result.body.decisions), true);
  assert.equal(result.body.decisions.length, 0);
  assert.equal(emitted.length, 0);
});

test('studio enum consistency uses field format hint when request guidance is omitted', async () => {
  const calls = [];
  const result = await invokeStudioRoute({
    readJsonBody: async () => ({
      field: 'lighting',
      apply: false,
    }),
    getSpecDbReady: async () => mockSpecDb([
      { value: '1 zone (rgb)', needs_review: false },
      { value: '7 zone (led)', needs_review: false },
      { value: '1 zone rgb', needs_review: true },
    ]),
    sessionCache: {
      getSessionRules: async () => ({
        mergedFields: {
          lighting: {
            enum: {
              policy: 'open_prefer_known',
              match: { format_hint: 'XXXX zone (YYYY)' },
            },
          },
        },
      }),
      invalidateSessionCache: () => {},
    },
    runEnumConsistencyReview: async (payload) => {
      calls.push(payload);
      return {
        enabled: false,
        skipped_reason: 'missing_api_key',
        decisions: [],
      };
    },
  }, ['studio', 'mouse', 'enum-consistency'], 'POST');

  assert.equal(result.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].formatGuidance, 'XXXX zone (YYYY)');
  assert.equal(result.body.format_guidance, 'XXXX zone (YYYY)');
});
