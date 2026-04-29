import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { handleReviewComponentMutationRoute } from '../componentMutationRoutes.js';
import {
  CATEGORY,
  cleanupTempSpecDb,
  createTempSpecDb,
} from '../../tests/helpers/componentReviewHarness.js';

function jsonRes(calls) {
  return (_res, status, body) => {
    calls.responses.push({ status, body });
    return true;
  };
}

function writeProductJson(productRoot, productId, fields) {
  const productDir = path.join(productRoot, productId);
  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(
    path.join(productDir, 'product.json'),
    JSON.stringify({ product_id: productId, fields, candidates: {}, updated_at: 'before' }, null, 2),
  );
}

function readProductJson(productRoot, productId) {
  return JSON.parse(fs.readFileSync(path.join(productRoot, productId, 'product.json'), 'utf8'));
}

function insertResolvedCandidate(specDb, productId, fieldKey, value) {
  specDb.insertFieldCandidate({
    productId,
    fieldKey,
    sourceId: `${productId}-${fieldKey}`,
    sourceType: 'key_finder',
    value,
    confidence: 97,
    model: 'test-model',
    validationJson: {},
    metadataJson: {
      publish_result: { status: 'published' },
      evidence: { url: `https://example.test/${productId}/${fieldKey}`, quote: `${fieldKey}: ${value}` },
    },
    status: 'resolved',
  });
}

test('component row delete removes identity links while preserving non-identity attribute publications', async (t) => {
  const { tempRoot, specDb } = await createTempSpecDb();
  t.after(async () => cleanupTempSpecDb(tempRoot, specDb));

  const productRoot = path.join(tempRoot, 'products');
  const identity = specDb.upsertComponentIdentity({
    componentType: 'sensor',
    canonicalName: 'PAW3950',
    maker: 'PixArt',
    links: ['https://pixart.example/paw3950'],
    source: 'component_publisher',
  });
  specDb.insertAlias(identity.id, 'PMW3950', 'key_finder_component_alias');
  specDb.upsertComponentValue({
    componentIdentityId: identity.id,
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    propertyKey: 'dpi',
    value: '30000',
    confidence: 1,
    source: 'component_publisher',
    constraints: [],
  });

  for (const productId of ['mouse-a', 'mouse-b']) {
    specDb.upsertItemComponentLink({
      productId,
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'published_identity',
      matchScore: 0.97,
    });
    writeProductJson(productRoot, productId, {
      sensor: { value: 'PAW3950' },
      sensor_brand: { value: 'PixArt' },
      sensor_link: { value: 'https://pixart.example/paw3950' },
      dpi: { value: '30000' },
    });
    insertResolvedCandidate(specDb, productId, 'sensor', 'PAW3950');
    insertResolvedCandidate(specDb, productId, 'sensor_brand', 'PixArt');
    insertResolvedCandidate(specDb, productId, 'sensor_link', 'https://pixart.example/paw3950');
    insertResolvedCandidate(specDb, productId, 'dpi', '30000');
  }

  const calls = { responses: [], broadcasts: [], cacheDeletes: [] };
  const handled = await handleReviewComponentMutationRoute({
    parts: ['review-components', CATEGORY, 'components', 'sensor', 'identity', String(identity.id)],
    method: 'DELETE',
    req: {},
    res: {},
    context: {
      readJsonBody: async () => ({}),
      jsonRes: jsonRes(calls),
      getSpecDbReady: async () => specDb,
      storage: { productRoot },
      specDbCache: { delete: (category) => calls.cacheDeletes.push(category) },
      broadcastWs: (channel, payload) => calls.broadcasts.push({ channel, payload }),
    },
  });

  assert.notEqual(handled, false);
  assert.equal(calls.responses[0]?.status, 200);
  assert.equal(calls.responses[0]?.body?.ok, true);
  assert.equal(calls.responses[0]?.body?.status, 'deleted');
  assert.equal(calls.responses[0]?.body?.unlinked_products, 2);

  assert.equal(specDb.getComponentIdentityById(identity.id), null);
  assert.equal(
    specDb.db.prepare('SELECT COUNT(*) AS count FROM component_aliases WHERE component_id = ?').get(identity.id).count,
    0,
  );
  assert.equal(
    specDb.db.prepare('SELECT COUNT(*) AS count FROM component_values WHERE component_identity_id = ?').get(identity.id).count,
    0,
  );
  assert.equal(
    specDb.db.prepare('SELECT COUNT(*) AS count FROM item_component_links WHERE component_type = ? AND component_name = ? AND component_maker = ?').get('sensor', 'PAW3950', 'PixArt').count,
    0,
  );

  for (const productId of ['mouse-a', 'mouse-b']) {
    const productJson = readProductJson(productRoot, productId);
    assert.equal(productJson.fields.sensor, undefined);
    assert.equal(productJson.fields.sensor_brand, undefined);
    assert.equal(productJson.fields.sensor_link, undefined);
    assert.deepEqual(productJson.fields.dpi, { value: '30000' });
    assert.equal(specDb.getFieldCandidatesByProductAndField(productId, 'sensor')[0]?.status, 'candidate');
    assert.equal(specDb.getFieldCandidatesByProductAndField(productId, 'sensor_brand')[0]?.status, 'candidate');
    assert.equal(specDb.getFieldCandidatesByProductAndField(productId, 'sensor_link')[0]?.status, 'candidate');
    assert.equal(specDb.getFieldCandidatesByProductAndField(productId, 'dpi')[0]?.status, 'resolved');
  }

  assert.deepEqual(calls.cacheDeletes, [CATEGORY]);
  assert.ok(calls.broadcasts.some((entry) => entry?.payload?.event === 'component-row-deleted'));
});

test('component type delete removes every identity row while preserving non-identity attribute publications', async (t) => {
  const { tempRoot, specDb } = await createTempSpecDb();
  t.after(async () => cleanupTempSpecDb(tempRoot, specDb));

  const productRoot = path.join(tempRoot, 'products');
  const sensorA = specDb.upsertComponentIdentity({
    componentType: 'sensor',
    canonicalName: 'PAW3950',
    maker: 'PixArt',
    links: ['https://pixart.example/paw3950'],
    source: 'component_publisher',
  });
  const sensorB = specDb.upsertComponentIdentity({
    componentType: 'sensor',
    canonicalName: 'HERO 2',
    maker: 'Logitech',
    links: ['https://logitech.example/hero-2'],
    source: 'component_publisher',
  });
  const switchA = specDb.upsertComponentIdentity({
    componentType: 'switch',
    canonicalName: 'Optical Gen 3',
    maker: 'Razer',
    links: [],
    source: 'component_publisher',
  });

  specDb.insertAlias(sensorA.id, 'PMW3950', 'key_finder_component_alias');
  specDb.insertAlias(sensorB.id, 'HERO2', 'key_finder_component_alias');
  specDb.upsertComponentValue({
    componentIdentityId: sensorA.id,
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    propertyKey: 'dpi',
    value: '30000',
    confidence: 1,
    source: 'component_publisher',
    constraints: [],
  });
  specDb.upsertComponentValue({
    componentIdentityId: sensorB.id,
    componentType: 'sensor',
    componentName: 'HERO 2',
    componentMaker: 'Logitech',
    propertyKey: 'dpi',
    value: '44000',
    confidence: 1,
    source: 'component_publisher',
    constraints: [],
  });

  const productLinks = [
    { productId: 'mouse-a', identity: sensorA, name: 'PAW3950', maker: 'PixArt', dpi: '30000', link: 'https://pixart.example/paw3950' },
    { productId: 'mouse-b', identity: sensorB, name: 'HERO 2', maker: 'Logitech', dpi: '44000', link: 'https://logitech.example/hero-2' },
  ];

  for (const row of productLinks) {
    specDb.upsertItemComponentLink({
      productId: row.productId,
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: row.name,
      componentMaker: row.maker,
      matchType: 'published_identity',
      matchScore: 0.97,
    });
    writeProductJson(productRoot, row.productId, {
      sensor: { value: row.name },
      sensor_brand: { value: row.maker },
      sensor_link: { value: row.link },
      dpi: { value: row.dpi },
    });
    insertResolvedCandidate(specDb, row.productId, 'sensor', row.name);
    insertResolvedCandidate(specDb, row.productId, 'sensor_brand', row.maker);
    insertResolvedCandidate(specDb, row.productId, 'sensor_link', row.link);
    insertResolvedCandidate(specDb, row.productId, 'dpi', row.dpi);
  }

  specDb.upsertItemComponentLink({
    productId: 'mouse-c',
    fieldKey: 'switch',
    componentType: 'switch',
    componentName: 'Optical Gen 3',
    componentMaker: 'Razer',
    matchType: 'published_identity',
    matchScore: 0.97,
  });

  const calls = { responses: [], broadcasts: [], cacheDeletes: [] };
  const handled = await handleReviewComponentMutationRoute({
    parts: ['review-components', CATEGORY, 'components', 'sensor', 'identities'],
    method: 'DELETE',
    req: {},
    res: {},
    context: {
      readJsonBody: async () => ({}),
      jsonRes: jsonRes(calls),
      getSpecDbReady: async () => specDb,
      storage: { productRoot },
      specDbCache: { delete: (category) => calls.cacheDeletes.push(category) },
      broadcastWs: (channel, payload) => calls.broadcasts.push({ channel, payload }),
    },
  });

  assert.notEqual(handled, false);
  assert.equal(calls.responses[0]?.status, 200);
  assert.equal(calls.responses[0]?.body?.ok, true);
  assert.equal(calls.responses[0]?.body?.status, 'deleted');
  assert.equal(calls.responses[0]?.body?.deleted_identities, 2);
  assert.equal(calls.responses[0]?.body?.unlinked_products, 2);

  assert.deepEqual(specDb.getAllComponentIdentities('sensor'), []);
  assert.equal(specDb.getAllComponentIdentities('switch').length, 1);
  assert.equal(specDb.getComponentIdentityById(switchA.id)?.canonical_name, 'Optical Gen 3');
  assert.equal(
    specDb.db.prepare('SELECT COUNT(*) AS count FROM item_component_links WHERE category = ? AND component_type = ?').get(CATEGORY, 'sensor').count,
    0,
  );
  assert.equal(
    specDb.db.prepare('SELECT COUNT(*) AS count FROM item_component_links WHERE category = ? AND component_type = ?').get(CATEGORY, 'switch').count,
    1,
  );

  for (const row of productLinks) {
    const productJson = readProductJson(productRoot, row.productId);
    assert.equal(productJson.fields.sensor, undefined);
    assert.equal(productJson.fields.sensor_brand, undefined);
    assert.equal(productJson.fields.sensor_link, undefined);
    assert.deepEqual(productJson.fields.dpi, { value: row.dpi });
    assert.equal(specDb.getFieldCandidatesByProductAndField(row.productId, 'sensor')[0]?.status, 'candidate');
    assert.equal(specDb.getFieldCandidatesByProductAndField(row.productId, 'sensor_brand')[0]?.status, 'candidate');
    assert.equal(specDb.getFieldCandidatesByProductAndField(row.productId, 'sensor_link')[0]?.status, 'candidate');
    assert.equal(specDb.getFieldCandidatesByProductAndField(row.productId, 'dpi')[0]?.status, 'resolved');
  }

  assert.deepEqual(calls.cacheDeletes, [CATEGORY]);
  assert.ok(calls.broadcasts.some((entry) => entry?.payload?.event === 'component-rows-deleted'));
});
