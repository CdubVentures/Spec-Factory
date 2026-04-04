import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFieldRulesForSeed,
  CATEGORY,
  FIELD_RULES_FIELDS,
  PRODUCTS,
  withSeededSpecDbFixture,
} from './helpers/reviewEcosystemHarness.js';

test('DB SEED - SpecDb table verification', async (t) => {
  await withSeededSpecDbFixture(async ({ db, config, seedResult }) => {
    const fieldRules = buildFieldRulesForSeed();

    await t.test('DB-01: all 7 tables have non-zero counts', () => {
      const counts = seedResult.counts;
      for (const table of ['component_values', 'component_identity', 'component_aliases', 'list_values', 'item_field_state', 'item_component_links', 'item_list_links']) {
        assert.ok(counts[table] > 0, `${table} should have rows, got ${counts[table]}`);
      }
    });

    await t.test('DB-02: component_identity covers all 4 types (sensor, switch, encoder, material)', () => {
      for (const type of ['sensor', 'switch', 'encoder', 'material']) {
        const rows = db.getAllComponentIdentities(type);
        assert.ok(rows.length > 0, `component_identity should have ${type} entries`);
      }
      assert.equal(db.getAllComponentIdentities('sensor').length, 5);
      assert.equal(db.getAllComponentIdentities('switch').length, 5);
      assert.equal(db.getAllComponentIdentities('encoder').length, 2);
      assert.equal(db.getAllComponentIdentities('material').length, 2);
    });

    await t.test('DB-03: component_aliases includes canonical names and explicit aliases', () => {
      const foundSensor = db.findComponentByAlias('sensor', '3950');
      assert.ok(foundSensor, 'Should find PAW3950 by alias "3950"');
      assert.equal(foundSensor.canonical_name, 'PAW3950');

      const foundSwitch = db.findComponentByAlias('switch', 'GM8');
      assert.ok(foundSwitch, 'Should find Kailh GM 8.0 by alias "GM8"');
      assert.equal(foundSwitch.canonical_name, 'Kailh GM 8.0');

      const foundMaterial = db.findComponentByAlias('material', 'Teflon');
      assert.ok(foundMaterial, 'Should find PTFE by alias "Teflon"');
      assert.equal(foundMaterial.canonical_name, 'PTFE');
    });

    await t.test('DB-04: component_values stores properties for each component', () => {
      const sensorValues = db.getComponentValues('sensor', 'PAW3950');
      const propertyKeys = sensorValues.map((row) => row.property_key).sort();
      assert.deepEqual(propertyKeys, ['acceleration', 'dpi_max', 'ips']);
      const dpiRow = sensorValues.find((row) => row.property_key === 'dpi_max');
      assert.equal(dpiRow.value, '35000');

      const switchValues = db.getComponentValues('switch', 'Kailh GM 8.0');
      assert.ok(switchValues.length >= 2);
    });

    await t.test('DB-05: list_values populated from known_values and manual_enum_values', () => {
      const connectionValues = db.getListValues('connection');
      assert.ok(connectionValues.length >= 4, `connection should have >= 4 values, got ${connectionValues.length}`);
      const cableValues = db.getListValues('cable_type');
      assert.ok(cableValues.length >= 4, `cable_type should have >= 4 values, got ${cableValues.length}`);
      const coatingValues = db.getListValues('coating');
      assert.ok(coatingValues.length >= 4, `coating should have >= 4 values, got ${coatingValues.length}`);

      const braidedValue = db.getListValueByFieldAndValue('cable_type', 'Braided');
      assert.ok(braidedValue, 'cable_type should include manual value "Braided"');
      const softTouchValue = db.getListValueByFieldAndValue('coating', 'Soft-touch');
      assert.ok(softTouchValue, 'coating should include manual value "Soft-touch"');
    });

    await t.test('DB-07: item_field_state covers all product x field combinations', () => {
      const fieldCount = Object.keys(FIELD_RULES_FIELDS).length;
      for (const productId of Object.keys(PRODUCTS)) {
        const states = db.getItemFieldState(productId);
        assert.equal(states.length, fieldCount, `${productId} should have ${fieldCount} field states, got ${states.length}`);
      }
      assert.equal(seedResult.counts.item_field_state, 5 * fieldCount);
    });

    await t.test('DB-08: item_component_links connects products to correct components', () => {
      const razerLinks = db.getItemComponentLinks('mouse-razer-viper-v3-pro');
      const razerSensor = razerLinks.find((row) => row.field_key === 'sensor');
      assert.ok(razerSensor, 'Razer should have sensor link');
      assert.equal(razerSensor.component_name, 'PAW3950');

      const pulsarLinks = db.getItemComponentLinks('mouse-pulsar-x2-v3');
      const pulsarSensor = pulsarLinks.find((row) => row.field_key === 'sensor');
      assert.ok(pulsarSensor, 'Pulsar should have sensor link');
      assert.equal(pulsarSensor.component_name, 'PAW3950');

      const pulsarMaterial = pulsarLinks.find((row) => row.field_key === 'shell_material');
      assert.ok(pulsarMaterial, 'Pulsar should have shell_material link');
      assert.equal(pulsarMaterial.component_name, 'PTFE');

      const endgameLinks = db.getItemComponentLinks('mouse-endgame-gear-op1we');
      const endgameMaterial = endgameLinks.find((row) => row.field_key === 'shell_material');
      assert.ok(endgameMaterial, 'Endgame should have shell_material link');
      assert.equal(endgameMaterial.component_name, 'Carbon Fiber');

      assert.ok(seedResult.counts.item_component_links >= 14, `Should have >= 14 component links, got ${seedResult.counts.item_component_links}`);
    });

    await t.test('DB-09: item_list_links connects products to list values for list fields', () => {
      const razerLists = db.getItemListLinks('mouse-razer-viper-v3-pro');
      const razerCoating = razerLists.find((row) => row.field_key === 'coating');
      assert.ok(razerCoating, 'Razer should have coating list link');

      const logitechLists = db.getItemListLinks('mouse-logitech-g502-x');
      const logitechCoating = logitechLists.find((row) => row.field_key === 'coating');
      assert.ok(logitechCoating, 'Logitech should have coating list link');

      assert.ok(seedResult.counts.item_list_links >= 4, `Should have >= 4 list links, got ${seedResult.counts.item_list_links}`);
    });

    await t.test('DB-11: idempotent re-seed produces same counts', async () => {
      const countsBefore = db.counts();
      const { seedSpecDb } = await import('../../../db/seed.js');
      await seedSpecDb({ db, config, category: CATEGORY, fieldRules, logger: null });
      const countsAfter = db.counts();
      assert.deepEqual(countsAfter, countsBefore);
    });

  });
});
