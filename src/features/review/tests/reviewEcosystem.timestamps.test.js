import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildComponentReviewPayloads,
  buildComponentOverridePayload,
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
  seedComponentOverride,
  seedEnumSuggestions,
  seedKnownValues,
  seedWorkbookMap,
  withReviewFixture,
} from './helpers/reviewEcosystemHarness.js';

test('review ecosystem timestamp contracts share one fixture without weakening timestamp behavior', { timeout: 120_000 }, async (t) => {
  await withReviewFixture(async ({ storage, config }) => {
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
      const propertyTimestamp = '2026-02-15T16:00:00.000Z';
      await seedComponentOverride(config.categoryAuthorityRoot, CATEGORY, 'sensor', 'PAW3950', buildComponentOverridePayload({
        properties: { dpi_max: '40000' },
        timestamps: { dpi_max: propertyTimestamp },
        updated_at: propertyTimestamp,
      }));
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor' });
      const item = findComponentItem(payload, 'PAW3950');
      assert.equal(item.properties.dpi_max.source_timestamp, propertyTimestamp);
      assert.equal(item.properties.dpi_max.source, 'user');
      assert.equal(item.properties.ips.source_timestamp, null);
    });

    await t.test('TS-05: Component name override includes source_timestamp', async () => {
      const nameTimestamp = '2026-02-15T17:00:00.000Z';
      await seedComponentOverride(config.categoryAuthorityRoot, CATEGORY, 'sensor', 'PMW3389', buildComponentOverridePayload({
        identity: { name: 'PAW-3389' },
        timestamps: { __name: nameTimestamp },
        updated_at: nameTimestamp,
      }));
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor' });
      const item = findComponentItem(payload, 'PAW-3389');
      assert.equal(item.name_tracked.source_timestamp, nameTimestamp);
      assert.equal(item.maker_tracked.source_timestamp, null);
    });

    await t.test('TS-06: Component override without per-property timestamp falls back to updated_at', async () => {
      const fileTimestamp = '2026-02-15T18:00:00.000Z';
      await seedComponentOverride(config.categoryAuthorityRoot, CATEGORY, 'switch', 'Razer Optical Gen-3', buildComponentOverridePayload({
        properties: { actuation_force: '42' },
        updated_at: fileTimestamp,
      }));
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'switch' });
      const item = findComponentItem(payload, 'Razer Optical Gen-3');
      assert.equal(item.properties.actuation_force.source_timestamp, fileTimestamp);
      assert.equal(item.properties.actuation_force.source, 'user');
    });

    await t.test('TS-07: Multiple component properties each have independent timestamps', async () => {
      const ts1 = '2026-02-15T19:00:00.000Z';
      const ts2 = '2026-02-15T19:05:00.000Z';
      await seedComponentOverride(config.categoryAuthorityRoot, CATEGORY, 'sensor', 'PMW3395', buildComponentOverridePayload({
        properties: { dpi_max: '30000', ips: '700' },
        timestamps: { dpi_max: ts1, ips: ts2 },
        updated_at: ts2,
      }));
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor' });
      const item = findComponentItem(payload, 'PMW3395');
      assert.equal(item.properties.dpi_max.source_timestamp, ts1);
      assert.equal(item.properties.ips.source_timestamp, ts2);
      assert.equal(item.properties.acceleration.source_timestamp, null);
    });

    await t.test('TS-08: Component links override includes source_timestamp', async () => {
      const linksTimestamp = '2026-02-15T20:00:00.000Z';
      await seedComponentOverride(config.categoryAuthorityRoot, CATEGORY, 'sensor', 'PAW3950', buildComponentOverridePayload({
        identity: { links: ['https://new-spec.com/paw3950'] },
        timestamps: { __links: linksTimestamp },
        updated_at: linksTimestamp,
      }));
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor' });
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
