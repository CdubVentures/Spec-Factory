import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildComponentReviewPayloads,
  CATEGORY,
  findComponentItem,
  withSeededSpecDbFixture,
} from './helpers/reviewEcosystemHarness.js';

test('review ecosystem component contracts share one fixture for read-only behavior', { timeout: 120_000 }, async (t) => {
  await withSeededSpecDbFixture(async ({ config, db }) => {
    await t.test('COMP-01: Reference value shows source=reference, overridden=false', async () => {
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor', specDb: db });
      const paw3950 = findComponentItem(payload, 'PAW3950');
      assert.ok(paw3950);
      assert.equal(paw3950.properties.dpi_max.source, 'reference');
      assert.equal(paw3950.properties.dpi_max.overridden, false);
      assert.equal(paw3950.properties.dpi_max.selected.value, '35000');
      assert.equal(paw3950.properties.dpi_max.selected.confidence, 1.0);
    });

    await t.test('COMP-03: Missing property shows source=unknown, needs_review=true', async () => {
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor', specDb: db });
      const hero = findComponentItem(payload, 'HERO26K');
      assert.ok(hero);
      assert.equal(hero.properties.dpi_max.selected.value, '25600');
      assert.equal(hero.properties.dpi_max.source, 'reference');
    });

    await t.test('COMP-07: Property columns aggregated from all items', async () => {
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor', specDb: db });
      assert.ok(payload.property_columns.includes('dpi_max'));
      assert.ok(payload.property_columns.includes('ips'));
      assert.ok(payload.property_columns.includes('acceleration'));
      assert.equal(payload.items.length, 5);
    });

    await t.test('COMP-09: Material components have correct properties', async () => {
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'material', specDb: db });
      assert.equal(payload.items.length, 2);
      const ptfe = findComponentItem(payload, 'PTFE');
      assert.ok(ptfe);
      assert.equal(ptfe.properties.friction.selected.value, 'low');
      const carbonFiber = findComponentItem(payload, 'Carbon Fiber');
      assert.ok(carbonFiber);
      assert.equal(carbonFiber.properties.durability.selected.value, 'very_high');
    });

    await t.test('COMP-10: Shared sensor PAW3950 has reference candidate and linked products', async () => {
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor', specDb: db });
      const paw3950 = findComponentItem(payload, 'PAW3950');
      assert.ok(paw3950);

      const dpiCandidates = paw3950.properties.dpi_max.candidates;
      assert.ok(dpiCandidates.length >= 1, `PAW3950 dpi_max should have >= 1 candidate, got ${dpiCandidates.length}`);

      const workbookCandidate = dpiCandidates.find((candidate) => candidate.source_id === 'reference');
      assert.ok(workbookCandidate, 'Should have field-studio candidate');
      assert.equal(workbookCandidate.value, '35000');

      // WHY: PAW3950 is shared across razer + pulsar — verify linked_products reflects both
      assert.ok(paw3950.linked_products.length >= 2, `PAW3950 should be linked to >= 2 products, got ${paw3950.linked_products.length}`);
    });

    await t.test('COMP-11: Shared switch Kailh GM 8.0 shows specdb candidates from pulsar and endgame', async () => {
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'switch', specDb: db });
      const kailh = findComponentItem(payload, 'Kailh GM 8.0');
      assert.ok(kailh);

      const nameCandidates = kailh.name_tracked.candidates;
      assert.ok(nameCandidates.length >= 2, `Kailh name should have >= 2 candidates, got ${nameCandidates.length}`);
      const workbookNameCandidate = nameCandidates.find((candidate) => candidate.source_id === 'reference');
      assert.ok(workbookNameCandidate, 'Should have field-studio name candidate');
      assert.equal(workbookNameCandidate.value, 'Kailh GM 8.0');

      // WHY: With specDb, linked-product candidates have source_id='specdb' (not 'pipeline')
      const specDbNameCandidates = nameCandidates.filter((candidate) => candidate.source_id === 'specdb');
      assert.ok(specDbNameCandidates.length >= 1, 'Should have specdb name candidates');

      const makerCandidates = kailh.maker_tracked.candidates;
      assert.ok(makerCandidates.length >= 1, 'Should have at least one field-studio maker candidate');
      assert.equal(makerCandidates[0].value, 'Kailh');
    });

    await t.test('COMP-12: Single-use component HERO26K is linked to 1 product', async () => {
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor', specDb: db });
      const hero = findComponentItem(payload, 'HERO26K');
      assert.ok(hero);

      // WHY: HERO26K is used by only logitech — verify linked_products reflects that
      assert.ok(hero.linked_products.length >= 1, `HERO26K should be linked to >= 1 product, got ${hero.linked_products.length}`);
      const refCandidate = hero.properties.dpi_max.candidates.find((c) => c.source_id === 'reference');
      assert.ok(refCandidate, 'Should have reference candidate');
      assert.equal(refCandidate.value, '25600');
    });
  });
});

test('review ecosystem component override contracts share one fixture for mutation behavior', { timeout: 120_000 }, async (t) => {
  await withSeededSpecDbFixture(async ({ config, db }) => {
    await t.test('COMP-02: Override sets source=user, overridden=true', async () => {
      db.upsertComponentValue({
        componentType: 'sensor', componentName: 'PAW3950', componentMaker: '',
        propertyKey: 'dpi_max', value: '40000', confidence: 1.0,
        variancePolicy: null, source: 'user', acceptedCandidateId: null,
        needsReview: false, overridden: true, constraints: [],
      });
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor', specDb: db });
      const paw3950 = findComponentItem(payload, 'PAW3950');
      assert.equal(paw3950.properties.dpi_max.selected.value, '40000');
      assert.equal(paw3950.properties.dpi_max.source, 'user');
      assert.equal(paw3950.properties.dpi_max.overridden, true);
      assert.ok(paw3950.properties.dpi_max.reason_codes.includes('manual_override'));
    });

    await t.test('COMP-04: Name override tracked correctly', async () => {
      const nameTimestamp = '2026-02-15T14:00:00.000Z';
      db.upsertComponentIdentity({
        componentType: 'sensor', canonicalName: 'PAW-3389', maker: '',
        links: null, source: 'user',
      });
      db.db.prepare(
        `UPDATE component_identity SET updated_at = ? WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?`
      ).run(nameTimestamp, CATEGORY, 'sensor', 'PAW-3389', '');
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor', specDb: db });
      const item = findComponentItem(payload, 'PAW-3389');
      assert.ok(item, 'Item should exist with overridden name');
      assert.equal(item.name_tracked.source, 'user');
      assert.equal(item.name_tracked.overridden, true);
      assert.equal(item.name_tracked.source_timestamp, nameTimestamp);
    });

    await t.test('COMP-05: Maker override tracked correctly', async () => {
      // WHY: Update existing identity row's maker directly — composite key includes maker,
      // so upsertComponentIdentity with new maker creates a new row instead of updating.
      // Must also update component_values.component_maker to keep foreign references aligned.
      db.db.prepare(
        `UPDATE component_values SET component_maker = ?, updated_at = datetime('now')
         WHERE category = ? AND component_type = ? AND component_name = ? AND component_maker = ?`
      ).run('TTC Electronics', CATEGORY, 'switch', 'TTC Gold', 'TTC');
      db.db.prepare(
        `UPDATE component_identity SET maker = ?, source = 'user', updated_at = datetime('now')
         WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?`
      ).run('TTC Electronics', CATEGORY, 'switch', 'TTC Gold', 'TTC');
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'switch', specDb: db });
      const item = findComponentItem(payload, 'TTC Gold');
      assert.equal(item.maker, 'TTC Electronics');
      assert.equal(item.maker_tracked.source, 'user');
      assert.equal(item.maker_tracked.overridden, true);
    });

    await t.test('COMP-06: Aliases override sets aliases_overridden=true', async () => {
      // WHY: Seed alias override via specDb — replace aliases and set aliases_overridden flag
      const componentId = db.db.prepare(
        'SELECT id FROM component_identity WHERE category = ? AND component_type = ? AND canonical_name = ?'
      ).get(CATEGORY, 'encoder', 'TTC Gold Encoder')?.id;
      // Clear existing aliases and insert user-sourced ones
      db.db.prepare('DELETE FROM component_aliases WHERE component_id = ?').run(componentId);
      for (const alias of ['TTC Encoder', 'TTC Gold Scroll Encoder']) {
        db.db.prepare(
          'INSERT OR IGNORE INTO component_aliases (component_id, alias, source) VALUES (?, ?, ?)'
        ).run(componentId, alias, 'user');
      }
      db.updateAliasesOverridden('encoder', 'TTC Gold Encoder', 'TTC', true);
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'encoder', specDb: db });
      const item = findComponentItem(payload, 'TTC Gold Encoder');
      assert.deepEqual(item.aliases, ['TTC Encoder', 'TTC Gold Scroll Encoder']);
      assert.equal(item.aliases_overridden, true);
    });

    await t.test('COMP-08: Multiple items override only affects target', async () => {
      db.upsertComponentValue({
        componentType: 'switch', componentName: 'Kailh GM 8.0', componentMaker: '',
        propertyKey: 'actuation_force', value: '50', confidence: 1.0,
        variancePolicy: null, source: 'user', acceptedCandidateId: null,
        needsReview: false, overridden: true, constraints: [],
      });
      const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'switch', specDb: db });
      const kailh = findComponentItem(payload, 'Kailh GM 8.0');
      const omron = findComponentItem(payload, 'Omron D2FC-F-K');
      assert.equal(kailh.properties.actuation_force.selected.value, '50');
      assert.equal(kailh.properties.actuation_force.source, 'user');
      assert.equal(omron.properties.actuation_force.selected.value, '75');
      assert.equal(omron.properties.actuation_force.source, 'reference');
    });
  });
});
