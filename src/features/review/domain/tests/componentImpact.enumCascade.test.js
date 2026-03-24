import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cascadeEnumChange,
  cleanupHarness,
  createHarness,
  loadQueueState,
  saveQueueState,
  upsertQueueRow,
} from './helpers/componentImpactHarness.js';

test('cascadeEnumChange honors preAffectedProductIds for rename cascades', async () => {
  const harness = await createHarness();
  try {
    upsertQueueRow(harness.specDb, 'mouse-e', 'complete');
    upsertQueueRow(harness.specDb, 'mouse-f', 'complete');

    harness.specDb.upsertItemFieldState({
      productId: 'mouse-e',
      fieldKey: 'connection',
      value: 'Wireless',
      confidence: 1,
      source: 'known_values',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });
    harness.specDb.upsertItemFieldState({
      productId: 'mouse-f',
      fieldKey: 'connection',
      value: 'Wireless',
      confidence: 1,
      source: 'known_values',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });

    const result = await cascadeEnumChange({
      storage: harness.storage,
      outputRoot: harness.outputRoot,
      category: harness.category,
      field: 'connection',
      action: 'rename',
      value: '2.4ghz',
      newValue: 'Wireless',
      preAffectedProductIds: ['mouse-e', 'mouse-f'],
      loadQueueState,
      saveQueueState,
      specDb: harness.specDb,
    });

    assert.equal(result.cascaded, 2);

    const queueE = harness.specDb.getQueueProduct('mouse-e');
    const queueF = harness.specDb.getQueueProduct('mouse-f');
    assert.equal(queueE?.status, 'stale');
    assert.equal(queueF?.status, 'stale');
    assert.equal(queueE?.dirty_flags?.some((flag) => flag.reason === 'enum_renamed'), true);
    assert.equal(queueF?.dirty_flags?.some((flag) => flag.reason === 'enum_renamed'), true);
  } finally {
    await cleanupHarness(harness);
  }
});

test('enum list value ID helpers rename and delete through slot identifiers while preserving links', async () => {
  const harness = await createHarness();
  try {
    harness.specDb.upsertListValue({
      fieldKey: 'connection',
      value: '2.4GHz',
      normalizedValue: '2.4ghz',
      source: 'known_values',
      enumPolicy: null,
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      sourceTimestamp: new Date().toISOString(),
    });

    harness.specDb.upsertItemFieldState({
      productId: 'mouse-link-id-test',
      fieldKey: 'connection',
      value: '2.4GHz',
      confidence: 1,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });

    harness.specDb.syncItemListLinkForFieldValue({
      productId: 'mouse-link-id-test',
      fieldKey: 'connection',
      value: '2.4GHz',
    });

    const oldRow = harness.specDb.getListValueByFieldAndValue('connection', '2.4GHz');
    assert.equal(Boolean(oldRow?.id), true);

    const affected = harness.specDb.renameListValueById(oldRow.id, 'Wireless', new Date().toISOString());
    assert.equal(affected.includes('mouse-link-id-test'), true);

    const fieldState = harness.specDb.getItemFieldState('mouse-link-id-test')
      .find((row) => row.field_key === 'connection');
    assert.equal(fieldState?.value, 'Wireless');

    const renamedRow = harness.specDb.getListValueByFieldAndValue('connection', 'Wireless');
    assert.equal(Boolean(renamedRow?.id), true);

    const linksAfterRename = harness.specDb.getItemListLinks('mouse-link-id-test');
    assert.equal(linksAfterRename.length, 1);
    assert.equal(linksAfterRename[0]?.list_value_id, renamedRow.id);

    harness.specDb.deleteListValueById(renamedRow.id);
    const linksAfterDelete = harness.specDb.getItemListLinks('mouse-link-id-test');
    assert.equal(linksAfterDelete.length, 0);
  } finally {
    await cleanupHarness(harness);
  }
});
