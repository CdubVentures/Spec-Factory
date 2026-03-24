import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildEnumReviewPayloads,
  cleanupTempSpecDb,
  createTempSpecDb,
  getEnumSlot,
  makeCategoryAuthorityConfig,
} from '../../../../../test/helpers/componentReviewHarness.js';

test('enum payload keeps pending when AI shared lane is pending even if user accepted', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const productId = 'mouse-test-enum-pending';
    specDb.upsertListValue({
      fieldKey: 'connection',
      value: 'Bluetooth',
      normalizedValue: 'bluetooth',
      source: 'pipeline',
      enumPolicy: 'closed',
      acceptedCandidateId: 'cand_bt',
      needsReview: true,
      overridden: false,
      sourceTimestamp: '2026-02-18T00:00:00.000Z',
    });
    specDb.upsertKeyReviewState({
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'connection',
      enumValueNorm: 'bluetooth',
      ...getEnumSlot(specDb, 'connection', 'Bluetooth'),
      selectedValue: 'Bluetooth',
      selectedCandidateId: 'cand_bt',
      confidenceScore: 0.6,
      aiConfirmSharedStatus: 'pending',
      userAcceptSharedStatus: 'accepted',
    });
    specDb.upsertItemFieldState({
      productId,
      fieldKey: 'connection',
      value: 'Bluetooth',
      confidence: 0.6,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: true,
      aiReviewComplete: false,
    });
    specDb.syncItemListLinkForFieldValue({
      productId,
      fieldKey: 'connection',
      value: 'Bluetooth',
    });

    const payload = await buildEnumReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      specDb,
    });
    const field = payload.fields.find((entry) => entry.field === 'connection');
    const value = field?.values.find((entry) => entry.value === 'Bluetooth');
    assert.ok(value, 'expected connection=Bluetooth entry');
    assert.equal(Boolean(value?.needs_review), true);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('enum payload synthesizes backing candidate when selected non-manual value has no candidate row', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const productId = 'mouse-test-enum-synth';
    specDb.upsertListValue({
      fieldKey: 'connection',
      value: 'Bluetooth',
      normalizedValue: 'bluetooth',
      source: 'pipeline',
      enumPolicy: 'closed',
      acceptedCandidateId: 'enum_missing_candidate',
      needsReview: true,
      overridden: false,
      sourceTimestamp: '2026-02-18T00:00:00.000Z',
    });
    specDb.upsertItemFieldState({
      productId,
      fieldKey: 'connection',
      value: 'Bluetooth',
      confidence: 0.6,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: true,
      aiReviewComplete: false,
    });
    specDb.syncItemListLinkForFieldValue({
      productId,
      fieldKey: 'connection',
      value: 'Bluetooth',
    });

    const payload = await buildEnumReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      specDb,
    });
    const field = payload.fields.find((entry) => entry.field === 'connection');
    const value = field?.values.find((entry) => entry.value === 'Bluetooth');
    assert.ok(value, 'expected connection=Bluetooth entry');
    assert.equal(
      value.candidates.some((candidate) => String(candidate?.value || '').toLowerCase() === 'bluetooth'),
      true,
    );
    assert.equal(value.candidates.length >= 1, true);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('enum payload hides pending pipeline values without linked products', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const linkedProductId = 'mouse-test-enum-linked';
    specDb.upsertListValue({
      fieldKey: 'connection',
      value: 'Bluetooth',
      normalizedValue: 'bluetooth',
      source: 'pipeline',
      enumPolicy: 'closed',
      acceptedCandidateId: null,
      needsReview: true,
      overridden: false,
      sourceTimestamp: '2026-02-18T00:00:00.000Z',
    });
    specDb.upsertListValue({
      fieldKey: 'connection',
      value: 'Wireless',
      normalizedValue: 'wireless',
      source: 'pipeline',
      enumPolicy: 'closed',
      acceptedCandidateId: null,
      needsReview: true,
      overridden: false,
      sourceTimestamp: '2026-02-18T00:00:00.000Z',
    });
    specDb.upsertItemFieldState({
      productId: linkedProductId,
      fieldKey: 'connection',
      value: 'Bluetooth',
      confidence: 0.6,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: true,
      aiReviewComplete: false,
    });
    specDb.syncItemListLinkForFieldValue({
      productId: linkedProductId,
      fieldKey: 'connection',
      value: 'Bluetooth',
    });

    const payload = await buildEnumReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      specDb,
    });
    const field = payload.fields.find((entry) => entry.field === 'connection');
    const values = (field?.values || []).map((entry) => String(entry?.value || ''));
    assert.equal(values.includes('Bluetooth'), true);
    assert.equal(values.includes('Wireless'), false);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('enum payload requires SpecDb authority when building review payloads', async () => {
  await assert.rejects(
    () => buildEnumReviewPayloads({
      config: {},
      category: CATEGORY,
    }),
    (err) => {
      assert.equal(err?.code, 'specdb_not_ready');
      assert.equal(String(err?.message || '').includes(CATEGORY), true);
      return true;
    },
  );
});

test('edge case - enum values with different casing are stored as distinct rows', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertListValue({
      fieldKey: 'connection',
      value: '2.4GHz',
      normalizedValue: '2.4ghz',
      source: 'known_values',
      needsReview: false,
      overridden: false,
    });

    specDb.upsertListValue({
      fieldKey: 'connection',
      value: '2.4ghz',
      normalizedValue: '2.4ghz',
      source: 'pipeline',
      needsReview: true,
      overridden: false,
    });

    const allValues = specDb.getListValues('connection');
    assert.strictEqual(allValues.length, 2, 'both casing variants should be stored as separate list_values rows');

    const normalizedValues = allValues.map((value) => value.normalized_value);
    assert.deepStrictEqual(
      normalizedValues,
      ['2.4ghz', '2.4ghz'],
      'both rows should share the same normalized_value',
    );

    const distinctValues = new Set(allValues.map((value) => value.value));
    assert.strictEqual(distinctValues.size, 2, 'the display values should remain distinct');
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});
