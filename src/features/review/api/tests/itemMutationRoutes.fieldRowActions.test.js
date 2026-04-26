// RED: Review grid field-row destructive actions.
// Contract:
//   POST   /review/:category/field-row/:fieldKey/unpublish-all
//     -> every active product, scalar key only, preserve candidates + run history.
//   DELETE /review/:category/field-row/:fieldKey
//     -> every active product, scalar key only, wipe candidates + keyFinder
//        primary run history for that key.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { handleReviewItemMutationRoute } from '../itemMutationRoutes.js';
import {
  makeItemRouteHarness,
  makeSeededRuntimeSpecDb,
} from './fixtures/reviewMutationRouteBuilders.js';
import {
  readKeyFinder,
  writeKeyFinder,
} from '../../../key/index.js';
import * as keyFinderRegistry from '../../../../core/operations/keyFinderRegistry.js';

async function withProductRoot(fn) {
  const root = path.join('.tmp', `_test_review_field_row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(root, { recursive: true });
  try {
    return await fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    keyFinderRegistry._resetForTest();
  }
}

function writeProductJson(root, productId, fieldKey = 'polling_rate') {
  const productDir = path.join(root, productId);
  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(path.join(productDir, 'product.json'), JSON.stringify({
    schema_version: 2,
    product_id: productId,
    category: 'mouse',
    fields: {
      [fieldKey]: { value: '1000', confidence: 0.92, source: 'pipeline' },
    },
    candidates: {
      [fieldKey]: [{ source_id: `src-${productId}`, value: '1000' }],
    },
  }, null, 2));
}

function writeProductJsonFields(root, productId, fields) {
  const productDir = path.join(root, productId);
  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(path.join(productDir, 'product.json'), JSON.stringify({
    schema_version: 2,
    product_id: productId,
    category: 'mouse',
    fields: Object.fromEntries(
      fields.map((fieldKey) => [fieldKey, { value: `${fieldKey}-value`, confidence: 0.92, source: 'pipeline' }]),
    ),
    candidates: Object.fromEntries(
      fields.map((fieldKey) => [fieldKey, [{ source_id: `src-${productId}-${fieldKey}`, value: `${fieldKey}-value` }]]),
    ),
  }, null, 2));
}

function readProductJson(root, productId) {
  return JSON.parse(fs.readFileSync(path.join(root, productId, 'product.json'), 'utf8'));
}

function seedKeyFinderDoc(root, productId, fieldKey, runs) {
  writeKeyFinder({
    productId,
    productRoot: root,
    data: {
      selected: { keys: { [fieldKey]: { value: '1000', confidence: 0.92 } } },
      runs,
      run_count: runs.length,
      last_ran_at: runs.at(-1)?.ran_at || '',
    },
  });
}

function seedKeyFinderDocFields(root, productId, fieldKeys, runs) {
  writeKeyFinder({
    productId,
    productRoot: root,
    data: {
      selected: {
        keys: Object.fromEntries(
          fieldKeys.map((fieldKey) => [fieldKey, { value: `${fieldKey}-value`, confidence: 0.92 }]),
        ),
      },
      runs,
      run_count: runs.length,
      last_ran_at: runs.at(-1)?.ran_at || '',
    },
  });
}

function primaryRun(runNumber, fieldKey) {
  return {
    run_number: runNumber,
    ran_at: `2026-01-0${runNumber}T00:00:00.000Z`,
    selected: { keys: { [fieldKey]: { value: '1000' } } },
    response: {
      primary_field_key: fieldKey,
      results: { [fieldKey]: { value: '1000' } },
      discovery_log: {
        queries_run: [`${fieldKey} query`],
        urls_checked: [`https://example.com/${fieldKey}`],
      },
    },
  };
}

function passengerRun(runNumber, primaryFieldKey, passengerFieldKey) {
  return {
    run_number: runNumber,
    ran_at: `2026-01-0${runNumber}T00:00:00.000Z`,
    selected: {
      keys: {
        [primaryFieldKey]: { value: 'PixArt' },
        [passengerFieldKey]: { value: '1000' },
      },
    },
    response: {
      primary_field_key: primaryFieldKey,
      results: {
        [primaryFieldKey]: { value: 'PixArt' },
        [passengerFieldKey]: { value: '1000' },
      },
      discovery_log: {
        queries_run: [`${primaryFieldKey} query`],
        urls_checked: [`https://example.com/${primaryFieldKey}`],
      },
    },
  };
}

function makeFieldRowSpecDb({ productIds, variantDependentFields = [], fieldKeys = ['polling_rate'] }) {
  const calls = {
    demote: [],
    deleteAllCandidates: [],
    deleteFinderRuns: [],
    evidenceDeletes: [],
    confidenceResets: [],
  };
  const rowsByProductAndField = new Map();
  for (const [productIndex, productId] of productIds.entries()) {
    for (const [fieldIndex, fieldKey] of fieldKeys.entries()) {
      rowsByProductAndField.set(`${productId}:${fieldKey}`, [{
        id: (productIndex * fieldKeys.length) + fieldIndex + 1,
        product_id: productId,
        field_key: fieldKey,
        value: `${fieldKey}-value`,
        unit: null,
        confidence: 0.92,
        source_id: `src-${productId}-${fieldKey}`,
        source_type: 'key_finder',
        model: 'test-model',
        validation_json: null,
        metadata_json: {},
        status: 'resolved',
        variant_id: null,
      }]);
    }
  }
  const variantDependentSet = new Set(variantDependentFields);
  const compiledFields = Object.fromEntries(
    fieldKeys.map((fieldKey) => [
      fieldKey,
      { type: 'string', variant_dependent: variantDependentSet.has(fieldKey) },
    ]),
  );
  const specDb = makeSeededRuntimeSpecDb({
    getAllProducts: () => productIds.map((product_id) => ({ product_id, status: 'active' })),
    getCompiledRules: () => ({
      fields: {
        ...compiledFields,
        release_date: { type: 'string', variant_dependent: true },
        colors: { type: 'array', variant_dependent: false },
      },
    }),
    getFieldCandidatesByProductAndField: (productId, fieldKey) => rowsByProductAndField.get(`${productId}:${fieldKey}`) || [],
    demoteResolvedCandidates: (productId, fieldKey, variantId) => {
      calls.demote.push({ productId, fieldKey, variantId });
      const key = `${productId}:${fieldKey}`;
      const rows = rowsByProductAndField.get(key) || [];
      rowsByProductAndField.set(key, rows.map((row) => ({ ...row, status: 'candidate' })));
    },
    deleteFieldCandidatesByProductAndField: (productId, fieldKey) => {
      calls.deleteAllCandidates.push({ productId, fieldKey });
      rowsByProductAndField.set(`${productId}:${fieldKey}`, []);
    },
    deleteFieldCandidateEvidenceByCandidateId: (candidateId) => {
      calls.evidenceDeletes.push(candidateId);
    },
    resetFieldCandidateConfidence: (candidateId) => {
      calls.confidenceResets.push(candidateId);
    },
    deleteFinderRun: (moduleType, productId, runNumber) => {
      calls.deleteFinderRuns.push({ moduleType, productId, runNumber });
    },
  });
  specDb._test = calls;
  return specDb;
}

test('product non-variant unpublish clears only scalar keys for one product and preserves run history', async () => {
  await withProductRoot(async (root) => {
    const fieldKeys = ['polling_rate', 'sensor_model'];
    writeProductJsonFields(root, 'mouse-001', [...fieldKeys, 'release_date', 'colors']);
    writeProductJsonFields(root, 'mouse-002', [...fieldKeys, 'release_date', 'colors']);
    seedKeyFinderDocFields(root, 'mouse-001', ['polling_rate', 'sensor_model', 'release_date'], [
      primaryRun(1, 'polling_rate'),
      primaryRun(2, 'sensor_model'),
      primaryRun(3, 'release_date'),
    ]);
    seedKeyFinderDocFields(root, 'mouse-002', fieldKeys, [
      primaryRun(1, 'polling_rate'),
      primaryRun(2, 'sensor_model'),
    ]);

    const specDb = makeFieldRowSpecDb({
      productIds: ['mouse-001', 'mouse-002'],
      fieldKeys,
    });
    const broadcasts = [];
    const { calls, context } = makeItemRouteHarness({
      getSpecDb: () => specDb,
      productRoot: root,
      broadcastWs: (type, payload) => broadcasts.push({ type, payload }),
    });

    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'product', 'mouse-001', 'non-variant-keys', 'unpublish-all'],
      method: 'POST',
      req: {},
      res: {},
      context,
    });

    assert.equal(calls.responses[0]?.status, 200);
    assert.equal(calls.responses[0]?.body?.status, 'unpublished');
    assert.equal(calls.responses[0]?.body?.product_id, 'mouse-001');
    assert.deepEqual(calls.responses[0]?.body?.field_keys, fieldKeys);
    assert.deepEqual(specDb._test.demote, [
      { productId: 'mouse-001', fieldKey: 'polling_rate', variantId: null },
      { productId: 'mouse-001', fieldKey: 'sensor_model', variantId: null },
    ]);

    const productOne = readProductJson(root, 'mouse-001');
    assert.equal(productOne.fields.polling_rate, undefined);
    assert.equal(productOne.fields.sensor_model, undefined);
    assert.ok(productOne.fields.release_date, 'variant-dependent field is untouched');
    assert.ok(productOne.fields.colors, 'reserved variant generator field is untouched');

    const productTwo = readProductJson(root, 'mouse-002');
    assert.ok(productTwo.fields.polling_rate, 'other products are untouched');
    assert.ok(productTwo.fields.sensor_model, 'other products are untouched');

    const keyDoc = readKeyFinder({ productId: 'mouse-001', productRoot: root });
    assert.equal(keyDoc.runs.length, 3, 'unpublish preserves every run');
    assert.equal(keyDoc.selected.keys.polling_rate, undefined);
    assert.equal(keyDoc.selected.keys.sensor_model, undefined);
    assert.ok(keyDoc.selected.keys.release_date, 'variant-dependent selection is untouched');

    const event = broadcasts.find((entry) => entry.payload?.event === 'key-finder-unpublished');
    assert.ok(event, 'expected key-finder-unpublished data-change event');
    assert.deepEqual(event.payload.entities.productIds, ['mouse-001']);
    assert.deepEqual(event.payload.entities.fieldKeys, fieldKeys);
    assert.equal(event.payload.meta.scope, 'review-product-non-variant-keys');
  });
});

test('product non-variant delete wipes scalar key candidates and primary run history for one product', async () => {
  await withProductRoot(async (root) => {
    const fieldKeys = ['polling_rate', 'sensor_model'];
    writeProductJsonFields(root, 'mouse-001', [...fieldKeys, 'release_date', 'colors']);
    writeProductJsonFields(root, 'mouse-002', [...fieldKeys, 'release_date', 'colors']);
    seedKeyFinderDocFields(root, 'mouse-001', ['polling_rate', 'sensor_model', 'release_date'], [
      primaryRun(1, 'polling_rate'),
      primaryRun(2, 'sensor_model'),
      primaryRun(3, 'release_date'),
    ]);
    seedKeyFinderDocFields(root, 'mouse-002', fieldKeys, [
      primaryRun(1, 'polling_rate'),
      primaryRun(2, 'sensor_model'),
    ]);

    const specDb = makeFieldRowSpecDb({
      productIds: ['mouse-001', 'mouse-002'],
      fieldKeys,
    });
    const broadcasts = [];
    const { calls, context } = makeItemRouteHarness({
      getSpecDb: () => specDb,
      productRoot: root,
      broadcastWs: (type, payload) => broadcasts.push({ type, payload }),
    });

    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'product', 'mouse-001', 'non-variant-keys'],
      method: 'DELETE',
      req: {},
      res: {},
      context,
    });

    assert.equal(calls.responses[0]?.status, 200);
    assert.equal(calls.responses[0]?.body?.status, 'deleted');
    assert.deepEqual(calls.responses[0]?.body?.field_keys, fieldKeys);
    assert.deepEqual(specDb._test.deleteAllCandidates, [
      { productId: 'mouse-001', fieldKey: 'polling_rate' },
      { productId: 'mouse-001', fieldKey: 'sensor_model' },
    ]);
    assert.deepEqual(specDb._test.deleteFinderRuns, [
      { moduleType: 'keyFinder', productId: 'mouse-001', runNumber: 1 },
      { moduleType: 'keyFinder', productId: 'mouse-001', runNumber: 2 },
    ]);

    const productOne = readProductJson(root, 'mouse-001');
    assert.equal(productOne.fields.polling_rate, undefined);
    assert.equal(productOne.fields.sensor_model, undefined);
    assert.equal(productOne.candidates.polling_rate, undefined);
    assert.equal(productOne.candidates.sensor_model, undefined);
    assert.ok(productOne.fields.release_date, 'variant-dependent field is untouched');
    assert.ok(productOne.candidates.release_date, 'variant-dependent candidates are untouched');

    const docOne = readKeyFinder({ productId: 'mouse-001', productRoot: root });
    assert.deepEqual(docOne.runs.map((run) => run.response.primary_field_key), ['release_date']);
    assert.equal(docOne.selected.keys.polling_rate, undefined);
    assert.equal(docOne.selected.keys.sensor_model, undefined);
    assert.ok(docOne.selected.keys.release_date, 'variant-dependent selection is untouched');

    const productTwo = readProductJson(root, 'mouse-002');
    assert.ok(productTwo.fields.polling_rate, 'other products are untouched');
    assert.ok(readKeyFinder({ productId: 'mouse-002', productRoot: root }).runs.length > 0);

    const event = broadcasts.find((entry) => entry.payload?.event === 'key-finder-field-deleted');
    assert.ok(event, 'expected key-finder-field-deleted data-change event');
    assert.deepEqual(event.payload.entities.productIds, ['mouse-001']);
    assert.deepEqual(event.payload.entities.fieldKeys, fieldKeys);
    assert.deepEqual(event.payload.meta.deleted_runs_by_field, { polling_rate: [1], sensor_model: [2] });
  });
});

test('product non-variant actions 409 when any targeted scalar key is in flight and do not partially mutate', async () => {
  await withProductRoot(async (root) => {
    const fieldKeys = ['polling_rate', 'sensor_model'];
    writeProductJsonFields(root, 'mouse-001', fieldKeys);
    seedKeyFinderDocFields(root, 'mouse-001', fieldKeys, [
      primaryRun(1, 'polling_rate'),
      primaryRun(2, 'sensor_model'),
    ]);
    keyFinderRegistry.register('mouse-001', 'sensor_model', 'primary');
    const specDb = makeFieldRowSpecDb({
      productIds: ['mouse-001'],
      fieldKeys,
    });
    const { calls, context } = makeItemRouteHarness({
      getSpecDb: () => specDb,
      productRoot: root,
    });

    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'product', 'mouse-001', 'non-variant-keys'],
      method: 'DELETE',
      req: {},
      res: {},
      context,
    });

    assert.equal(calls.responses[0]?.status, 409);
    assert.equal(calls.responses[0]?.body?.error, 'key_busy');
    assert.deepEqual(calls.responses[0]?.body?.busy_field_keys, ['sensor_model']);
    assert.equal(specDb._test.deleteAllCandidates.length, 0);
    assert.ok(readProductJson(root, 'mouse-001').fields.polling_rate);
    assert.equal(readKeyFinder({ productId: 'mouse-001', productRoot: root }).runs.length, 2);
  });
});

test('field-row unpublish all clears published values for every active product and preserves keyFinder run history', async () => {
  await withProductRoot(async (root) => {
    const productIds = ['mouse-001', 'mouse-002'];
    for (const productId of productIds) {
      writeProductJson(root, productId);
      seedKeyFinderDoc(root, productId, 'polling_rate', [primaryRun(1, 'polling_rate')]);
    }
    const specDb = makeFieldRowSpecDb({ productIds });
    const broadcasts = [];
    const { calls, context } = makeItemRouteHarness({
      getSpecDb: () => specDb,
      productRoot: root,
      broadcastWs: (type, payload) => broadcasts.push({ type, payload }),
    });

    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'field-row', 'polling_rate', 'unpublish-all'],
      method: 'POST',
      req: {},
      res: {},
      context,
    });

    assert.equal(calls.responses[0]?.status, 200);
    assert.equal(calls.responses[0]?.body?.status, 'unpublished');
    assert.equal(calls.responses[0]?.body?.field, 'polling_rate');
    assert.equal(calls.responses[0]?.body?.product_count, 2);
    assert.deepEqual(specDb._test.demote.map((call) => call.productId), productIds);

    for (const productId of productIds) {
      const productJson = readProductJson(root, productId);
      assert.equal(productJson.fields.polling_rate, undefined, 'published field removed from product.json');
      const keyDoc = readKeyFinder({ productId, productRoot: root });
      assert.equal(keyDoc.selected.keys.polling_rate, undefined, 'keyFinder selected key cleared');
      assert.equal(keyDoc.runs.length, 1, 'keyFinder run history is preserved on unpublish');
      assert.ok(keyDoc.runs[0].response.discovery_log, 'URL/query history remains with preserved run');
    }

    const event = broadcasts.find((entry) => entry.payload?.event === 'key-finder-unpublished');
    assert.ok(event, 'expected key-finder-unpublished data-change event');
    assert.deepEqual(event.payload.entities.productIds, productIds);
    assert.deepEqual(event.payload.entities.fieldKeys, ['polling_rate']);
  });
});

test('field-row delete all wipes candidates and keyFinder primary run history for every active product', async () => {
  await withProductRoot(async (root) => {
    const productIds = ['mouse-001', 'mouse-002'];
    for (const productId of productIds) {
      writeProductJson(root, productId);
    }
    seedKeyFinderDoc(root, 'mouse-001', 'polling_rate', [primaryRun(1, 'polling_rate')]);
    seedKeyFinderDoc(root, 'mouse-002', 'polling_rate', [passengerRun(2, 'sensor_model', 'polling_rate')]);

    const specDb = makeFieldRowSpecDb({ productIds });
    const broadcasts = [];
    const { calls, context } = makeItemRouteHarness({
      getSpecDb: () => specDb,
      productRoot: root,
      broadcastWs: (type, payload) => broadcasts.push({ type, payload }),
    });

    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'field-row', 'polling_rate'],
      method: 'DELETE',
      req: {},
      res: {},
      context,
    });

    assert.equal(calls.responses[0]?.status, 200);
    assert.equal(calls.responses[0]?.body?.status, 'deleted');
    assert.equal(calls.responses[0]?.body?.field, 'polling_rate');
    assert.equal(calls.responses[0]?.body?.product_count, 2);
    assert.deepEqual(specDb._test.deleteAllCandidates.map((call) => call.productId), productIds);
    assert.deepEqual(specDb._test.deleteFinderRuns, [
      { moduleType: 'keyFinder', productId: 'mouse-001', runNumber: 1 },
    ]);

    const productOne = readProductJson(root, 'mouse-001');
    assert.equal(productOne.fields.polling_rate, undefined, 'published field removed');
    assert.equal(productOne.candidates.polling_rate, undefined, 'candidate history removed from product.json');
    const docOne = readKeyFinder({ productId: 'mouse-001', productRoot: root });
    assert.equal(docOne.runs.length, 0, 'primary run deleted with URL/query history');

    const docTwo = readKeyFinder({ productId: 'mouse-002', productRoot: root });
    assert.equal(docTwo.runs.length, 1, 'passenger-only run remains because its history belongs to another primary key');
    assert.equal(docTwo.runs[0].selected.keys.polling_rate, undefined, 'passenger selected value scrubbed');
    assert.equal(docTwo.runs[0].response.results.polling_rate, undefined, 'passenger response result scrubbed');

    const event = broadcasts.find((entry) => entry.payload?.event === 'key-finder-field-deleted');
    assert.ok(event, 'expected key-finder-field-deleted data-change event');
    assert.deepEqual(event.payload.entities.productIds, productIds);
    assert.deepEqual(event.payload.entities.fieldKeys, ['polling_rate']);
    assert.deepEqual(event.payload.meta.deleted_runs_by_product, { 'mouse-001': [1], 'mouse-002': [] });
  });
});

test('field-row actions reject variant-owned keys before mutation', async () => {
  await withProductRoot(async (root) => {
    writeProductJson(root, 'mouse-001', 'release_date');
    const specDb = makeFieldRowSpecDb({ productIds: ['mouse-001'] });
    const { calls, context } = makeItemRouteHarness({
      getSpecDb: () => specDb,
      productRoot: root,
    });

    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'field-row', 'release_date'],
      method: 'DELETE',
      req: {},
      res: {},
      context,
    });

    assert.equal(calls.responses[0]?.status, 400);
    assert.equal(calls.responses[0]?.body?.error, 'variant_field_row_action_not_allowed');
    assert.equal(specDb._test.deleteAllCandidates.length, 0);
  });
});

test('field-row actions 409 when any active product has the key in flight and do not partially mutate', async () => {
  await withProductRoot(async (root) => {
    const productIds = ['mouse-001', 'mouse-002'];
    for (const productId of productIds) {
      writeProductJson(root, productId);
      seedKeyFinderDoc(root, productId, 'polling_rate', [primaryRun(1, 'polling_rate')]);
    }
    keyFinderRegistry.register('mouse-002', 'polling_rate', 'primary');
    const specDb = makeFieldRowSpecDb({ productIds });
    const { calls, context } = makeItemRouteHarness({
      getSpecDb: () => specDb,
      productRoot: root,
    });

    await handleReviewItemMutationRoute({
      parts: ['review', 'mouse', 'field-row', 'polling_rate'],
      method: 'DELETE',
      req: {},
      res: {},
      context,
    });

    assert.equal(calls.responses[0]?.status, 409);
    assert.equal(calls.responses[0]?.body?.error, 'key_busy');
    assert.equal(specDb._test.deleteAllCandidates.length, 0);
    assert.ok(readKeyFinder({ productId: 'mouse-001', productRoot: root }).selected.keys.polling_rate);
  });
});
