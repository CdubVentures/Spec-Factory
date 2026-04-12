import test from 'node:test';
import assert from 'node:assert/strict';
import { sendDataChangeResponse } from '../routeSharedHelpers.js';

test('sendDataChangeResponse emits typed data-change contract for review mutation routes', () => {
  const emitted = [];
  const responses = [];

  const handled = sendDataChangeResponse({
    jsonRes: (_res, status, body) => responses.push({ status, body }),
    res: {},
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
    eventType: 'key-review-accept',
    category: 'mouse',
    payload: { customPayload: { id: 42 } },
    broadcastExtra: {
      productId: 'mouse-razer-viper-v3-pro',
      field: 'dpi',
      lane: 'primary',
    },
  });

  assert.equal(handled, true);
  assert.equal(responses.length, 1);
  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].body.ok, true);
  assert.deepEqual(responses[0].body.customPayload, { id: 42 });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');
  assert.equal(emitted[0].payload.type, 'data-change');
  assert.equal(emitted[0].payload.event, 'key-review-accept');
  assert.equal(emitted[0].payload.category, 'mouse');
  assert.deepEqual(emitted[0].payload.categories, ['mouse']);
  assert.deepEqual(emitted[0].payload.entities.productIds, ['mouse-razer-viper-v3-pro']);
  assert.deepEqual(emitted[0].payload.entities.fieldKeys, ['dpi']);
  assert.equal(emitted[0].payload.meta.lane, 'primary');
});
