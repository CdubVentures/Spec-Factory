import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentIdentifier,
  buildComponentReviewPayloads,
  createComponentRowHarness,
  getComponentIdentityId,
  linkProductToComponent,
  upsertComponentLane,
} from './helpers/componentReviewRowHarness.js';

test('component payload hydrates __name/__maker accepted_candidate_id from key_review_state', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  upsertComponentLane(specDb, {
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    propertyKey: 'dpi_max',
    value: '35000',
  });
  linkProductToComponent(specDb, {
    productId: 'mouse-test-paw3950',
    fieldKey: 'sensor',
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
  });

  const componentIdentifier = buildComponentIdentifier('sensor', 'PAW3950', 'PixArt');
  const componentIdentityId = getComponentIdentityId(specDb, 'sensor', 'PAW3950', 'PixArt');
  assert.ok(componentIdentityId, 'expected component identity slot id');
  specDb.upsertKeyReviewState({
    category: CATEGORY,
    targetKind: 'component_key',
    fieldKey: '__name',
    componentIdentifier,
    propertyKey: '__name',
    componentIdentityId,
    selectedValue: 'PAW3950',
    selectedCandidateId: 'cand_name',
    confidenceScore: 1,
    aiConfirmSharedStatus: 'confirmed',
    userAcceptSharedStatus: 'accepted',
  });
  specDb.upsertKeyReviewState({
    category: CATEGORY,
    targetKind: 'component_key',
    fieldKey: '__maker',
    componentIdentifier,
    propertyKey: '__maker',
    componentIdentityId,
    selectedValue: 'PixArt',
    selectedCandidateId: 'cand_maker',
    confidenceScore: 1,
    aiConfirmSharedStatus: 'confirmed',
    userAcceptSharedStatus: 'accepted',
  });

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType: 'sensor',
    specDb,
  });
  const row = payload.items.find((item) => item.name === 'PAW3950' && item.maker === 'PixArt');

  assert.ok(row, 'expected PAW3950/PixArt row');
  assert.equal(row.name_tracked.accepted_candidate_id, 'cand_name');
  assert.equal(row.maker_tracked.accepted_candidate_id, 'cand_maker');
});

test('component payload keeps a single row per exact component name+maker identity', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  const componentType = 'switch';
  const componentName = 'Omron D2FC-F-7N';
  const componentMaker = 'Omron';

  upsertComponentLane(specDb, {
    componentType,
    componentName,
    componentMaker,
    propertyKey: 'actuation_force',
    value: '55',
  });
  specDb.upsertComponentIdentity({
    componentType,
    canonicalName: componentName,
    maker: componentMaker,
    links: [],
    source: 'pipeline',
  });
  linkProductToComponent(specDb, {
    productId: 'mouse-dup-row-a',
    fieldKey: 'switch',
    componentType,
    componentName,
    componentMaker,
  });
  linkProductToComponent(specDb, {
    productId: 'mouse-dup-row-b',
    fieldKey: 'switch',
    componentType,
    componentName,
    componentMaker,
  });

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType,
    specDb,
  });
  const rows = (payload.items || []).filter(
    (item) => item.name === componentName && item.maker === componentMaker,
  );

  assert.equal(rows.length, 1);
  assert.equal((rows[0]?.linked_products || []).length, 2);
});
