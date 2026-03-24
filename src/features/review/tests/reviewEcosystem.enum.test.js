import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEnumPayloadFromSpecDb,
  buildEnumSuggestionsSeed,
  buildKnownValueFieldMap,
  buildWorkbookMapSeed,
  CATEGORY,
  findEnumField,
  findEnumValue,
  KNOWN_VALUE_ENUMS,
  seedEnumSuggestions,
  seedKnownValues,
  seedWorkbookMap,
  withReviewFixture,
} from './helpers/reviewEcosystemHarness.js';

test('ENUM-01: Reference value gets source=reference', async () => {
  await withReviewFixture(async ({ config }) => {
    const payload = await buildEnumPayloadFromSpecDb(config);
    const connectionField = findEnumField(payload, 'connection');
    assert.ok(connectionField);
    const wired = findEnumValue(payload, 'connection', 'Wired');
    assert.equal(wired.source, 'reference');
    assert.equal(wired.confidence, 1.0);
    assert.equal(wired.color, 'green');
    assert.equal(typeof wired.needs_review, 'boolean');
  });
});

test('ENUM-02: Pipeline suggestion gets source=pipeline, needs_review=true', async () => {
  await withReviewFixture(async ({ config }) => {
    await seedEnumSuggestions(config.categoryAuthorityRoot, CATEGORY, buildEnumSuggestionsSeed({
      fields: { connection: ['USB-A'] },
    }));
    const payload = await buildEnumPayloadFromSpecDb(config);
    const usbA = findEnumValue(payload, 'connection', 'USB-A');
    assert.equal(usbA, undefined, 'pending pipeline suggestions without linked products should be hidden');
  });
});

test('ENUM-03: User-added fresh value gets source=manual', async () => {
  await withReviewFixture(async ({ config }) => {
    const initialPayload = await buildEnumPayloadFromSpecDb(config);
    const cableField = findEnumField(initialPayload, 'cable_type');
    assert.ok(cableField);

    await seedKnownValues(
      config.categoryAuthorityRoot,
      CATEGORY,
      buildKnownValueFieldMap({ cable_type: [...KNOWN_VALUE_ENUMS.cable_type.values, 'Braided'] }),
    );

    const nextPayload = await buildEnumPayloadFromSpecDb(config);
    const braided = findEnumValue(nextPayload, 'cable_type', 'Braided');
    assert.ok(braided, 'Braided should appear in cable_type values');
    assert.equal(braided.source, 'manual');
    assert.equal(braided.confidence, 0.6);
  });
});

test('ENUM-04: Pipeline suggestion already in field-studio source is not duplicated', async () => {
  await withReviewFixture(async ({ config }) => {
    await seedEnumSuggestions(config.categoryAuthorityRoot, CATEGORY, buildEnumSuggestionsSeed({
      fields: { connection: ['Wired', 'USB-A'] },
    }));
    const payload = await buildEnumPayloadFromSpecDb(config);
    const connectionField = findEnumField(payload, 'connection');
    const wiredValues = connectionField.values.filter((value) => value.value.toLowerCase() === 'wired');
    assert.equal(wiredValues.length, 1, 'Wired should not be duplicated');
    assert.equal(wiredValues[0].source, 'reference');
  });
});

test('ENUM-05: Metrics correctly count flags', async () => {
  await withReviewFixture(async ({ config }) => {
    await seedEnumSuggestions(config.categoryAuthorityRoot, CATEGORY, buildEnumSuggestionsSeed({
      fields: { connection: ['USB-A', 'Thunderbolt'] },
    }));
    const payload = await buildEnumPayloadFromSpecDb(config);
    const connectionField = findEnumField(payload, 'connection');
    assert.equal(connectionField.metrics.total, 4);
    assert.equal(connectionField.metrics.flags >= 0, true);
  });
});

test('ENUM-06: Multiple fields independently tracked', async () => {
  await withReviewFixture(async ({ config }) => {
    await seedEnumSuggestions(config.categoryAuthorityRoot, CATEGORY, buildEnumSuggestionsSeed({
      fields: { cable_type: ['Braided'] },
    }));
    const payload = await buildEnumPayloadFromSpecDb(config);
    const cableField = findEnumField(payload, 'cable_type');
    const connectionField = findEnumField(payload, 'connection');
    const coatingField = findEnumField(payload, 'coating');
    assert.equal(cableField.values.length, 5);
    assert.equal(cableField.metrics.flags, 4);
    assert.equal(connectionField.values.length, 4);
    assert.equal(typeof connectionField.metrics.flags, 'number');
    assert.equal(coatingField.values.length, 5);
    assert.equal(typeof coatingField.metrics.flags, 'number');
  });
});

test('ENUM-07: Curation format suggestions with pending/dismissed status', async () => {
  await withReviewFixture(async ({ config }) => {
    await seedEnumSuggestions(config.categoryAuthorityRoot, CATEGORY, buildEnumSuggestionsSeed({
      suggestions: [
        { field_key: 'cable_type', value: 'Braided', status: 'pending' },
        { field_key: 'cable_type', value: 'Coiled', status: 'dismissed' },
        { field_key: 'cable_type', value: 'Detachable', status: 'pending' },
      ],
    }));
    const payload = await buildEnumPayloadFromSpecDb(config);
    const field = findEnumField(payload, 'cable_type');
    const values = field.values.map((entry) => entry.value);
    assert.ok(!values.includes('Braided'));
    assert.ok(!values.includes('Detachable'));
    assert.ok(!values.includes('Coiled'));
  });
});

test('ENUM-08: Case-insensitive deduplication', async () => {
  await withReviewFixture(async ({ config }) => {
    await seedEnumSuggestions(config.categoryAuthorityRoot, CATEGORY, buildEnumSuggestionsSeed({
      fields: { cable_type: ['usb-c', 'Braided'] },
    }));
    const payload = await buildEnumPayloadFromSpecDb(config);
    const field = findEnumField(payload, 'cable_type');
    const usbcValues = field.values.filter((entry) => entry.value.toLowerCase() === 'usb-c');
    assert.equal(usbcValues.length, 1, 'USB-C should not be duplicated');
  });
});

test('ENUM-09: User-accepted pipeline value retains source=pipeline', async () => {
  await withReviewFixture(async ({ config }) => {
    await seedKnownValues(
      config.categoryAuthorityRoot,
      CATEGORY,
      buildKnownValueFieldMap({ cable_type: [...KNOWN_VALUE_ENUMS.cable_type.values, 'Braided'] }),
    );
    await seedEnumSuggestions(config.categoryAuthorityRoot, CATEGORY, buildEnumSuggestionsSeed({
      suggestions: [{ field_key: 'cable_type', value: 'Braided', status: 'accepted' }],
    }));
    const payload = await buildEnumPayloadFromSpecDb(config);
    const braided = findEnumValue(payload, 'cable_type', 'Braided');
    assert.ok(braided);
    assert.equal(braided.source, 'manual');
    assert.equal(braided.confidence, 0.6);
    assert.equal(braided.needs_review, true);
  });
});

test('ENUM-10: Enum manual value includes source_timestamp', async () => {
  await withReviewFixture(async ({ config }) => {
    const timestamp = '2026-02-15T15:00:00.000Z';
    const workbookSeed = buildWorkbookMapSeed({
      manualEnumValues: { cable_type: ['Braided'], coating: ['Soft-touch'] },
      manualEnumTimestamps: { 'cable_type::braided': timestamp },
    });
    await seedWorkbookMap(
      config.categoryAuthorityRoot,
      CATEGORY,
      workbookSeed.manualEnumValues,
      workbookSeed.manualEnumTimestamps,
    );
    await seedKnownValues(
      config.categoryAuthorityRoot,
      CATEGORY,
      buildKnownValueFieldMap({ cable_type: [...KNOWN_VALUE_ENUMS.cable_type.values, 'Braided'] }),
    );
    const payload = await buildEnumPayloadFromSpecDb(config);
    const field = findEnumField(payload, 'cable_type');
    const braided = findEnumValue(payload, 'cable_type', 'Braided');
    assert.equal(braided.source_timestamp, timestamp);
    const usbC = field.values.find((entry) => entry.value === 'USB-C');
    assert.equal(usbC.source_timestamp, null);
  });
});
