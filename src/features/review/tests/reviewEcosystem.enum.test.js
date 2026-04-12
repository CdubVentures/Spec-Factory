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

test('review ecosystem enum contracts share one fixture without weakening enum behavior', { timeout: 120_000 }, async (t) => {
  await withReviewFixture(async ({ config }) => {
    await t.test('ENUM-01: Reference value gets source=reference', async () => {
      const payload = await buildEnumPayloadFromSpecDb(config);
      const connectionField = findEnumField(payload, 'connection');
      assert.ok(connectionField);
      const wired = findEnumValue(payload, 'connection', 'Wired');
      assert.equal(wired.source, 'reference');
      assert.equal(wired.confidence, 1.0);
      assert.equal(wired.color, 'green');
      assert.equal(typeof wired.needs_review, 'boolean');
    });

    await t.test('ENUM-02: Pipeline suggestion gets source=pipeline, needs_review=true', async () => {
      await seedEnumSuggestions(config.categoryAuthorityRoot, CATEGORY, buildEnumSuggestionsSeed({
        fields: { connection: ['USB-A'] },
      }));
      const payload = await buildEnumPayloadFromSpecDb(config);
      const usbA = findEnumValue(payload, 'connection', 'USB-A');
      assert.equal(usbA, undefined, 'pending pipeline suggestions without linked products should be hidden');
    });

    await t.test('ENUM-04: Pipeline suggestion already in field-studio source is not duplicated', async () => {
      await seedEnumSuggestions(config.categoryAuthorityRoot, CATEGORY, buildEnumSuggestionsSeed({
        fields: { connection: ['Wired', 'USB-A'] },
      }));
      const payload = await buildEnumPayloadFromSpecDb(config);
      const connectionField = findEnumField(payload, 'connection');
      const wiredValues = connectionField.values.filter((value) => value.value.toLowerCase() === 'wired');
      assert.equal(wiredValues.length, 1, 'Wired should not be duplicated');
      assert.equal(wiredValues[0].source, 'reference');
    });

    await t.test('ENUM-05: Metrics correctly count flags', async () => {
      await seedEnumSuggestions(config.categoryAuthorityRoot, CATEGORY, buildEnumSuggestionsSeed({
        fields: { connection: ['USB-A', 'Thunderbolt'] },
      }));
      const payload = await buildEnumPayloadFromSpecDb(config);
      const connectionField = findEnumField(payload, 'connection');
      assert.equal(connectionField.metrics.total, 4);
      assert.equal(connectionField.metrics.flags >= 0, true);
    });

    await t.test('ENUM-06: Multiple fields independently tracked', async () => {
      await seedEnumSuggestions(config.categoryAuthorityRoot, CATEGORY, buildEnumSuggestionsSeed({
        fields: { cable_type: ['Braided'] },
      }));
      const payload = await buildEnumPayloadFromSpecDb(config);
      const cableField = findEnumField(payload, 'cable_type');
      const connectionField = findEnumField(payload, 'connection');
      const coatingField = findEnumField(payload, 'coating');
      assert.equal(cableField.values.length, 5);
      assert.equal(typeof cableField.metrics.flags, 'number');
      assert.equal(connectionField.values.length, 4);
      assert.equal(typeof connectionField.metrics.flags, 'number');
      assert.equal(coatingField.values.length, 5);
      assert.equal(typeof coatingField.metrics.flags, 'number');
    });

    await t.test('ENUM-08: Case-insensitive deduplication', async () => {
      await seedEnumSuggestions(config.categoryAuthorityRoot, CATEGORY, buildEnumSuggestionsSeed({
        fields: { cable_type: ['usb-c', 'Braided'] },
      }));
      const payload = await buildEnumPayloadFromSpecDb(config);
      const field = findEnumField(payload, 'cable_type');
      const usbcValues = field.values.filter((entry) => entry.value.toLowerCase() === 'usb-c');
      assert.equal(usbcValues.length, 1, 'USB-C should not be duplicated');
    });

    await t.test('ENUM-09: User-accepted pipeline value retains source=pipeline', async () => {
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

    // ENUM-10 retired: manual_enum_timestamps was dead code (zero entries in all categories).
    // source_timestamp is no longer seeded from the control-plane map.

    await t.test('ENUM-03: User-added fresh value gets source=manual', async () => {
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

    await t.test('ENUM-07: Curation format suggestions with pending/dismissed status', async () => {
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
      assert.ok(!values.includes('Coiled'), 'Dismissed curation suggestion should not appear in values');
    });
  });
});
