import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { handleReviewComponentMutationRoute } from '../componentMutationRoutes.js';
import { cascadeComponentChange } from '../../domain/componentImpact.js';
import { resolveComponentMutationContext } from '../mutationResolvers.js';
import { buildComponentIdentifier } from '../../../../utils/componentIdentifier.js';
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

function generatedComponentDbPath(categoryAuthorityRoot, componentTypeFile) {
  return path.join(categoryAuthorityRoot, CATEGORY, '_generated', 'component_db', `${componentTypeFile}.json`);
}

function writeGeneratedComponentDb(categoryAuthorityRoot, componentType, componentTypeFile, items) {
  const filePath = generatedComponentDbPath(categoryAuthorityRoot, componentTypeFile);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      version: 1,
      category: CATEGORY,
      component_type: componentType,
      generated_at: '2026-04-28T00:00:00.000Z',
      items,
    }, null, 2),
  );
  return filePath;
}

function readGeneratedComponentDb(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('component identity override updates published name and brand on linked products only', async (t) => {
  const { tempRoot, specDb } = await createTempSpecDb();
  t.after(async () => cleanupTempSpecDb(tempRoot, specDb));

  const productRoot = path.join(tempRoot, 'products');
  const outputRoot = path.join(tempRoot, 'out');
  const categoryAuthorityRoot = path.join(tempRoot, 'category_authority');
  const identity = specDb.upsertComponentIdentity({
    componentType: 'sensor',
    canonicalName: 'PAW3950',
    maker: 'PixArt',
    links: [],
    source: 'component_db',
  });

  for (const productId of ['mouse-a', 'mouse-b']) {
    specDb.upsertItemComponentLink({
      productId,
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'published_identity',
      matchScore: 1,
    });
    writeProductJson(productRoot, productId, {
      sensor: { value: 'PAW3950', source: 'pipeline' },
      sensor_brand: { value: 'PixArt', source: 'pipeline' },
      dpi: { value: '30000', source: 'pipeline' },
    });
  }
  writeProductJson(productRoot, 'mouse-unlinked', {
    sensor: { value: 'PAW3950', source: 'pipeline' },
    sensor_brand: { value: 'PixArt', source: 'pipeline' },
  });

  const calls = { responses: [], broadcasts: [], cacheDeletes: [] };
  const context = {
    readJsonBody: async () => ({}),
    jsonRes: jsonRes(calls),
    getSpecDbReady: async () => specDb,
    resolveComponentMutationContext,
    isMeaningfulValue: (value) => value != null && String(value).trim() !== '',
    buildComponentIdentifier,
    cascadeComponentChange,
    config: { categoryAuthorityRoot },
    outputRoot,
    storage: { productRoot },
    specDbCache: { delete: (category) => calls.cacheDeletes.push(category) },
    broadcastWs: (channel, payload) => calls.broadcasts.push({ channel, payload }),
  };

  const renameName = await handleReviewComponentMutationRoute({
    parts: ['review-components', CATEGORY, 'component-override'],
    method: 'POST',
    req: {
      body: {
        property: '__name',
        value: 'AimPoint Pro',
        componentIdentityId: identity.id,
      },
    },
    res: {},
    context: {
      ...context,
      readJsonBody: async () => ({
        property: '__name',
        value: 'AimPoint Pro',
        componentIdentityId: identity.id,
      }),
    },
  });

  const renameMaker = await handleReviewComponentMutationRoute({
    parts: ['review-components', CATEGORY, 'component-override'],
    method: 'POST',
    req: {},
    res: {},
    context: {
      ...context,
      readJsonBody: async () => ({
        property: '__maker',
        value: 'Asus',
        componentIdentityId: identity.id,
      }),
    },
  });

  assert.notEqual(renameName, false);
  assert.notEqual(renameMaker, false);
  assert.equal(calls.responses[0]?.status, 200);
  assert.equal(calls.responses[1]?.status, 200);
  assert.equal(specDb.getComponentIdentityById(identity.id)?.canonical_name, 'AimPoint Pro');
  assert.equal(specDb.getComponentIdentityById(identity.id)?.maker, 'Asus');

  for (const productId of ['mouse-a', 'mouse-b']) {
    const productJson = readProductJson(productRoot, productId);
    assert.equal(productJson.fields.sensor.value, 'AimPoint Pro');
    assert.equal(productJson.fields.sensor_brand.value, 'Asus');
    assert.deepEqual(productJson.fields.dpi, { value: '30000', source: 'pipeline' });
    const links = specDb.getItemComponentLinks(productId);
    assert.equal(links[0]?.component_name, 'AimPoint Pro');
    assert.equal(links[0]?.component_maker, 'Asus');
  }

  const unlinked = readProductJson(productRoot, 'mouse-unlinked');
  assert.equal(unlinked.fields.sensor.value, 'PAW3950');
  assert.equal(unlinked.fields.sensor_brand.value, 'PixArt');

  const overridePath = path.join(categoryAuthorityRoot, CATEGORY, '_overrides', 'overrides.json');
  const overrides = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
  assert.equal(overrides.components.sensor['paw3950::pixart'].previous.canonical_name, 'PAW3950');
  assert.equal(overrides.components.sensor['paw3950::pixart'].previous.maker, 'PixArt');
  assert.equal(overrides.components.sensor['paw3950::pixart'].current.canonical_name, 'AimPoint Pro');
  assert.equal(overrides.components.sensor['paw3950::pixart'].current.maker, 'Asus');
  assert.equal(fs.existsSync(path.join(categoryAuthorityRoot, CATEGORY, '_overrides', 'components')), false);
});

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

test('component row delete does not mutate generated component db source files', async (t) => {
  const { tempRoot, specDb } = await createTempSpecDb();
  t.after(async () => cleanupTempSpecDb(tempRoot, specDb));

  const categoryAuthorityRoot = path.join(tempRoot, 'category_authority');
  const productRoot = path.join(tempRoot, 'products');
  const localOutputRoot = path.join(tempRoot, 'out');
  fs.mkdirSync(localOutputRoot, { recursive: true });
  const componentDbFile = writeGeneratedComponentDb(categoryAuthorityRoot, 'sensor', 'sensors', [
    {
      name: 'PAW3950',
      maker: 'PixArt',
      aliases: ['PMW3950'],
      links: ['https://pixart.example/paw3950'],
      properties: { dpi: 30000 },
    },
    {
      name: 'HERO 2',
      maker: 'Logitech',
      aliases: ['HERO2'],
      links: ['https://logitech.example/hero-2'],
      properties: { dpi: 44000 },
    },
  ]);
  const config = { categoryAuthorityRoot, localOutputRoot };

  const identity = specDb.upsertComponentIdentity({
    componentType: 'sensor',
    canonicalName: 'PAW3950',
    maker: 'PixArt',
    links: ['https://pixart.example/paw3950'],
    source: 'component_db',
  });

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
      config,
      storage: { productRoot },
      specDbCache: { delete: (category) => calls.cacheDeletes.push(category) },
      broadcastWs: (channel, payload) => calls.broadcasts.push({ channel, payload }),
    },
  });

  assert.notEqual(handled, false);
  assert.equal(calls.responses[0]?.status, 200);

  const afterDeletePayload = readGeneratedComponentDb(componentDbFile);
  assert.deepEqual(
    afterDeletePayload.items.map((item) => `${item.name}::${item.maker}`),
    ['PAW3950::PixArt', 'HERO 2::Logitech'],
  );
});

test('component type delete removes every identity row while preserving non-identity attribute publications', async (t) => {
  const { tempRoot, specDb } = await createTempSpecDb();
  t.after(async () => cleanupTempSpecDb(tempRoot, specDb));

  const productRoot = path.join(tempRoot, 'products');
  const categoryAuthorityRoot = path.join(tempRoot, 'category_authority');
  const sensorComponentDbFile = writeGeneratedComponentDb(categoryAuthorityRoot, 'sensor', 'sensors', [
    {
      name: 'PAW3950',
      maker: 'PixArt',
      aliases: ['PMW3950'],
      links: ['https://pixart.example/paw3950'],
      properties: { dpi: 30000 },
    },
    {
      name: 'HERO 2',
      maker: 'Logitech',
      aliases: ['HERO2'],
      links: ['https://logitech.example/hero-2'],
      properties: { dpi: 44000 },
    },
  ]);
  const switchComponentDbFile = writeGeneratedComponentDb(categoryAuthorityRoot, 'switch', 'switches', [
    {
      name: 'Optical Gen 3',
      maker: 'Razer',
      aliases: [],
      links: [],
      properties: {},
    },
  ]);
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
      config: { categoryAuthorityRoot },
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

  assert.deepEqual(
    readGeneratedComponentDb(sensorComponentDbFile).items.map((item) => `${item.name}::${item.maker}`),
    ['PAW3950::PixArt', 'HERO 2::Logitech'],
  );
  assert.deepEqual(
    readGeneratedComponentDb(switchComponentDbFile).items.map((item) => `${item.name}::${item.maker}`),
    ['Optical Gen 3::Razer'],
  );
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
