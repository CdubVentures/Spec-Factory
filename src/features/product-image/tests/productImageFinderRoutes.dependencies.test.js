import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { registerProductImageFinderRoutes } from '../api/productImageFinderRoutes.js';
import {
  initOperationsRegistry,
  listOperations,
  _resetForTest,
} from '../../../core/operations/operationsRegistry.js';

const CATEGORY = 'mouse';
const PRODUCT_ID = 'pif-deps-locked';

const PRODUCT_ROW = {
  product_id: PRODUCT_ID,
  category: CATEGORY,
  brand: 'Asus',
  model: 'ROG Gladius III Wireless AimPoint EVA-02',
  base_model: 'ROG Gladius III Wireless AimPoint',
  variant: 'EVA-02',
};

function makeSpecDb({ resolvedConnection = false } = {}) {
  return {
    getProduct: () => PRODUCT_ROW,
    getCompiledRules: () => ({
      fields: {
        connection: {
          field_key: 'connection',
          product_image_dependent: true,
          ui: { label: 'Connection' },
        },
        weight_g: {
          field_key: 'weight_g',
          product_image_dependent: false,
        },
      },
    }),
    getFieldCandidatesByProductAndField: (_productId, fieldKey) => {
      if (fieldKey !== 'connection' || !resolvedConnection) return [];
      return [{ field_key: fieldKey, status: 'resolved', value: 'wireless', confidence: 98 }];
    },
    getResolvedFieldCandidate: () => null,
  };
}

function makeCtx({ requestBody = {}, resolvedConnection = false } = {}) {
  const responses = [];
  const broadcasts = [];
  const specDb = makeSpecDb({ resolvedConnection });
  const ctx = {
    jsonRes: (_res, status, body) => {
      responses.push({ status, body });
      return { status, body };
    },
    readJsonBody: async () => requestBody,
    getSpecDb: (category) => (category === CATEGORY ? specDb : null),
    broadcastWs: (channel, data) => broadcasts.push({ channel, data }),
    config: {},
    appDb: {},
    logger: { error: () => {}, warn: () => {}, info: () => {} },
  };
  initOperationsRegistry({ broadcastWs: ctx.broadcastWs });
  return { ctx, responses, broadcasts };
}

describe('Product Image Finder dependency lock', () => {
  beforeEach(() => {
    _resetForTest();
  });

  it('GET /dependencies reports missing Product Image Dependent keys without requiring a PIF summary row', async () => {
    const { ctx } = makeCtx();
    const handler = registerProductImageFinderRoutes(ctx);

    const result = await handler(
      ['product-image-finder', CATEGORY, PRODUCT_ID, 'dependencies'],
      new URLSearchParams(),
      'GET',
      {},
      {},
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.ready, false);
    assert.deepEqual(result.body.required_keys, ['connection']);
    assert.deepEqual(result.body.missing_keys, ['connection']);
    assert.deepEqual(result.body.resolved_keys, []);
  });

  it('blocks PIF run, loop, and eval routes before operation registration when dependencies are missing', async () => {
    const routeCases = [
      {
        parts: ['product-image-finder', CATEGORY, PRODUCT_ID],
        body: { variant_key: 'color:black', mode: 'view' },
      },
      {
        parts: ['product-image-finder', CATEGORY, PRODUCT_ID, 'loop'],
        body: { variant_key: 'color:black' },
      },
      {
        parts: ['product-image-finder', CATEGORY, PRODUCT_ID, 'evaluate-carousel'],
        body: { variant_key: 'color:black' },
      },
      {
        parts: ['product-image-finder', CATEGORY, PRODUCT_ID, 'evaluate-view'],
        body: { variant_key: 'color:black', view: 'top' },
      },
      {
        parts: ['product-image-finder', CATEGORY, PRODUCT_ID, 'evaluate-hero'],
        body: { variant_key: 'color:black' },
      },
    ];

    for (const routeCase of routeCases) {
      _resetForTest();
      const { ctx } = makeCtx({ requestBody: routeCase.body });
      const handler = registerProductImageFinderRoutes(ctx);

      const result = await handler(
        routeCase.parts,
        new URLSearchParams(),
        'POST',
        { body: routeCase.body },
        {},
      );

      assert.equal(result.status, 409, routeCase.parts.join('/'));
      assert.equal(result.body.error, 'pif_dependency_missing');
      assert.deepEqual(result.body.dependency_status.missing_keys, ['connection']);
      assert.equal(listOperations().length, 0, 'locked routes must not register operations');
    }
  });
});
