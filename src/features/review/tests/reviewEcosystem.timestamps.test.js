import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildComponentReviewPayloads,
  buildEnumSuggestionsSeed,
  buildKnownValueFieldMap,
  buildWorkbookMapSeed,
  buildEnumPayloadFromSpecDb,
  buildProductReviewPayload,
  CATEGORY,
  findComponentItem,
  findEnumField,
  findEnumValue,
  KNOWN_VALUE_ENUMS,
  seedEnumSuggestions,
  seedKnownValues,
  seedWorkbookMap,
  withSeededSpecDbFixture,
} from './helpers/reviewEcosystemHarness.js';

test('review ecosystem timestamp contracts share one fixture without weakening timestamp behavior', { timeout: 120_000 }, async (t) => {
  await withSeededSpecDbFixture(async ({ storage, config, db }) => {
    await t.test('TS-01: Product candidate_selection override includes source_timestamp', async () => {
      const payload = await buildProductReviewPayload({ storage, config, category: CATEGORY, productId: 'mouse-logitech-g502-x' });
      assert.equal(payload.fields.dpi.source_timestamp, '2026-02-15T11:00:00.000Z');
    });

    await t.test('TS-02: Product manual override uses set_at as source_timestamp', async () => {
      const payload = await buildProductReviewPayload({ storage, config, category: CATEGORY, productId: 'mouse-razer-viper-v3-pro' });
      assert.equal(payload.fields.weight.source_timestamp, '2026-02-15T10:00:00.000Z');
      assert.equal(payload.fields.weight.source, 'user');
    });

    await t.test('TS-03: Product field without override has no source_timestamp', async () => {
      const payload = await buildProductReviewPayload({ storage, config, category: CATEGORY, productId: 'mouse-pulsar-x2-v3' });
      assert.equal(payload.fields.weight.source_timestamp, undefined);
      assert.equal(payload.fields.sensor.source_timestamp, undefined);
    });

    await t.test('TS-04: Component property override includes source_timestamp', async () => {
      const propertyTimestamp = '2026-02-15 16:00:00';
      // WHY: Seed override via specDb (SQL) instead of legacy filesystem overrides
      db.upsertComponentValue({
        componentType: 'sensor', componentName: 'PAW3950', componentMaker: '',
        propertyKey: 'dpi_max', value: '40000', confidence: 1.0,
        variancePolicy: null, source: 'user', acceptedCandidateId: null,
        needsReview: false, overridden: true, constraints: [],
      });
      db.db.prepare(
        `UPDATE component_values SET updated_at = ? WHERE category = ? AND component_type = ? AND component_name = ? AND property_key = ?`
      ).run(propertyTimestamp, CATEGORY, 'sensor', 'PAW3950', 'dpi_max');
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor', specDb: db });
      const item = findComponentItem(payload, 'PAW3950');
      assert.equal(item.properties.dpi_max.source_timestamp, propertyTimestamp);
      assert.equal(item.properties.dpi_max.source, 'user');
      assert.equal(item.properties.ips.source_timestamp, null);
    });

    await t.test('TS-05: Component name override includes source_timestamp', async () => {
      const nameTimestamp = '2026-02-15 17:00:00';
      // WHY: Seed identity override via specDb — source='user' makes name overridden
      db.upsertComponentIdentity({
        componentType: 'sensor', canonicalName: 'PAW-3389', maker: '',
        links: null, source: 'user',
      });
      db.db.prepare(
        `UPDATE component_identity SET updated_at = ? WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?`
      ).run(nameTimestamp, CATEGORY, 'sensor', 'PAW-3389', '');
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor', specDb: db });
      const item = findComponentItem(payload, 'PAW-3389');
      assert.equal(item.name_tracked.source_timestamp, nameTimestamp);
      assert.equal(item.name_tracked.source, 'user');
    });

    await t.test('TS-06: Component override without per-property timestamp falls back to updated_at', async () => {
      const rowTimestamp = '2026-02-15 18:00:00';
      db.upsertComponentValue({
        componentType: 'switch', componentName: 'Razer Optical Gen-3', componentMaker: '',
        propertyKey: 'actuation_force', value: '42', confidence: 1.0,
        variancePolicy: null, source: 'user', acceptedCandidateId: null,
        needsReview: false, overridden: true, constraints: [],
      });
      db.db.prepare(
        `UPDATE component_values SET updated_at = ? WHERE category = ? AND component_type = ? AND component_name = ? AND property_key = ?`
      ).run(rowTimestamp, CATEGORY, 'switch', 'Razer Optical Gen-3', 'actuation_force');
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'switch', specDb: db });
      const item = findComponentItem(payload, 'Razer Optical Gen-3');
      assert.equal(item.properties.actuation_force.source_timestamp, rowTimestamp);
      assert.equal(item.properties.actuation_force.source, 'user');
    });

    await t.test('TS-07: Multiple component properties each have independent timestamps', async () => {
      const ts1 = '2026-02-15 19:00:00';
      const ts2 = '2026-02-15 19:05:00';
      db.upsertComponentValue({
        componentType: 'sensor', componentName: 'PMW3395', componentMaker: '',
        propertyKey: 'dpi_max', value: '30000', confidence: 1.0,
        variancePolicy: null, source: 'user', acceptedCandidateId: null,
        needsReview: false, overridden: true, constraints: [],
      });
      db.upsertComponentValue({
        componentType: 'sensor', componentName: 'PMW3395', componentMaker: '',
        propertyKey: 'ips', value: '700', confidence: 1.0,
        variancePolicy: null, source: 'user', acceptedCandidateId: null,
        needsReview: false, overridden: true, constraints: [],
      });
      db.db.prepare(
        `UPDATE component_values SET updated_at = ? WHERE category = ? AND component_type = ? AND component_name = ? AND property_key = ?`
      ).run(ts1, CATEGORY, 'sensor', 'PMW3395', 'dpi_max');
      db.db.prepare(
        `UPDATE component_values SET updated_at = ? WHERE category = ? AND component_type = ? AND component_name = ? AND property_key = ?`
      ).run(ts2, CATEGORY, 'sensor', 'PMW3395', 'ips');
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor', specDb: db });
      const item = findComponentItem(payload, 'PMW3395');
      assert.equal(item.properties.dpi_max.source_timestamp, ts1);
      assert.equal(item.properties.ips.source_timestamp, ts2);
      assert.equal(item.properties.acceleration.source_timestamp, null);
    });

    await t.test('TS-08: Component links override includes source_timestamp', async () => {
      const linksTimestamp = '2026-02-15 20:00:00';
      // WHY: Update existing PAW3950 identity to user-overridden with custom links
      db.upsertComponentIdentity({
        componentType: 'sensor', canonicalName: 'PAW3950', maker: '',
        links: ['https://new-spec.com/paw3950'], source: 'user',
      });
      db.db.prepare(
        `UPDATE component_identity SET updated_at = ? WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?`
      ).run(linksTimestamp, CATEGORY, 'sensor', 'PAW3950', '');
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor', specDb: db });
      const item = findComponentItem(payload, 'PAW3950');
      assert.equal(item.links.length, 1);
      assert.equal(item.links[0], 'https://new-spec.com/paw3950');
      assert.equal(item.links_tracked[0].source, 'user');
      assert.equal(item.links_tracked[0].source_timestamp, linksTimestamp);
    });

    await t.test('TS-09: Pipeline enum suggestion has no source_timestamp', async () => {
      await seedEnumSuggestions(
        config.categoryAuthorityRoot,
        CATEGORY,
        buildEnumSuggestionsSeed({ fields: { cable_type: ['Braided'] } }),
      );
      const payload = await buildEnumPayloadFromSpecDb(config);
      const braided = findEnumValue(payload, 'cable_type', 'Braided');
      assert.equal(braided.source, 'manual');
      assert.equal(braided.source_timestamp, null);
      assert.equal(typeof braided.needs_review, 'boolean');
    });

    await t.test('TS-10: Multiple enum fields have independent timestamps', async () => {
      const ts1 = '2026-02-15T21:00:00.000Z';
      const ts2 = '2026-02-15T21:30:00.000Z';
      await seedKnownValues(
        config.categoryAuthorityRoot,
        CATEGORY,
        buildKnownValueFieldMap({
          connection: [...KNOWN_VALUE_ENUMS.connection.values, 'USB-A'],
          cable_type: [...KNOWN_VALUE_ENUMS.cable_type.values, 'Braided'],
        }),
      );
      const workbookSeed = buildWorkbookMapSeed({
        manualEnumValues: { connection: ['USB-A'], cable_type: ['Braided'] },
        manualEnumTimestamps: { 'connection::usb-a': ts1, 'cable_type::braided': ts2 },
      });
      await seedWorkbookMap(
        config.categoryAuthorityRoot,
        CATEGORY,
        workbookSeed.manualEnumValues,
        workbookSeed.manualEnumTimestamps,
      );
      const payload = await buildEnumPayloadFromSpecDb(config);
      const connectionField = findEnumField(payload, 'connection');
      const usbA = findEnumValue(payload, 'connection', 'USB-A');
      const braided = findEnumValue(payload, 'cable_type', 'Braided');
      assert.equal(usbA.source_timestamp, ts1);
      assert.equal(braided.source_timestamp, ts2);
      const wired = connectionField.values.find((entry) => entry.value === 'Wired');
      assert.equal(wired.source_timestamp, null);
    });
  }, 'review-ts-');
});
