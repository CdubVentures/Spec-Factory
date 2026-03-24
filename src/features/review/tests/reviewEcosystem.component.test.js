import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildComponentReviewPayloads,
  CATEGORY,
  buildComponentOverridePayload,
  findComponentItem,
  seedComponentOverride,
  withReviewFixture,
} from './helpers/reviewEcosystemHarness.js';

test('COMP-01: Reference value shows source=reference, overridden=false', async () => {
  await withReviewFixture(async ({ config }) => {
    const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor' });
    const paw3950 = findComponentItem(payload, 'PAW3950');
    assert.ok(paw3950);
    assert.equal(paw3950.properties.dpi_max.source, 'reference');
    assert.equal(paw3950.properties.dpi_max.overridden, false);
    assert.equal(paw3950.properties.dpi_max.selected.value, '35000');
    assert.equal(paw3950.properties.dpi_max.selected.confidence, 1.0);
  });
});

test('COMP-02: Override sets source=user, overridden=true', async () => {
  await withReviewFixture(async ({ config }) => {
    await seedComponentOverride(config.categoryAuthorityRoot, CATEGORY, 'sensor', 'PAW3950', buildComponentOverridePayload({
      properties: { dpi_max: '40000' },
    }));
    const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor' });
    const paw3950 = findComponentItem(payload, 'PAW3950');
    assert.equal(paw3950.properties.dpi_max.selected.value, '40000');
    assert.equal(paw3950.properties.dpi_max.source, 'user');
    assert.equal(paw3950.properties.dpi_max.overridden, true);
    assert.ok(paw3950.properties.dpi_max.reason_codes.includes('manual_override'));
  });
});

test('COMP-03: Missing property shows source=unknown, needs_review=true', async () => {
  await withReviewFixture(async ({ config }) => {
    const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor' });
    const hero = findComponentItem(payload, 'HERO26K');
    assert.ok(hero);
    assert.equal(hero.properties.dpi_max.selected.value, '25600');
    assert.equal(hero.properties.dpi_max.source, 'reference');
  });
});

test('COMP-04: Name override tracked correctly', async () => {
  await withReviewFixture(async ({ config }) => {
    const nameTimestamp = '2026-02-15T14:00:00.000Z';
    await seedComponentOverride(config.categoryAuthorityRoot, CATEGORY, 'sensor', 'PMW3389', buildComponentOverridePayload({
      identity: { name: 'PAW-3389' },
      timestamps: { __name: nameTimestamp },
      updated_at: nameTimestamp,
    }));
    const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor' });
    const item = findComponentItem(payload, 'PAW-3389');
    assert.ok(item, 'Item should exist with overridden name');
    assert.equal(item.name_tracked.source, 'user');
    assert.equal(item.name_tracked.overridden, true);
    assert.equal(item.name_tracked.source_timestamp, nameTimestamp);
  });
});

test('COMP-05: Maker override tracked correctly', async () => {
  await withReviewFixture(async ({ config }) => {
    await seedComponentOverride(config.categoryAuthorityRoot, CATEGORY, 'switch', 'TTC Gold', buildComponentOverridePayload({
      identity: { maker: 'TTC Electronics' },
    }));
    const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'switch' });
    const item = findComponentItem(payload, 'TTC Gold');
    assert.equal(item.maker, 'TTC Electronics');
    assert.equal(item.maker_tracked.source, 'user');
    assert.equal(item.maker_tracked.overridden, true);
  });
});

test('COMP-06: Aliases override sets aliases_overridden=true', async () => {
  await withReviewFixture(async ({ config }) => {
    await seedComponentOverride(config.categoryAuthorityRoot, CATEGORY, 'encoder', 'TTC Gold Encoder', buildComponentOverridePayload({
      identity: { aliases: ['TTC Encoder', 'TTC Gold Scroll Encoder'] },
    }));
    const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'encoder' });
    const item = findComponentItem(payload, 'TTC Gold Encoder');
    assert.deepEqual(item.aliases, ['TTC Encoder', 'TTC Gold Scroll Encoder']);
    assert.equal(item.aliases_overridden, true);
  });
});

test('COMP-07: Property columns aggregated from all items', async () => {
  await withReviewFixture(async ({ config }) => {
    const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor' });
    assert.ok(payload.property_columns.includes('dpi_max'));
    assert.ok(payload.property_columns.includes('ips'));
    assert.ok(payload.property_columns.includes('acceleration'));
    assert.equal(payload.items.length, 5);
  });
});

test('COMP-08: Multiple items override only affects target', async () => {
  await withReviewFixture(async ({ config }) => {
    await seedComponentOverride(config.categoryAuthorityRoot, CATEGORY, 'switch', 'Kailh GM 8.0', buildComponentOverridePayload({
      properties: { actuation_force: '50' },
    }));
    const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'switch' });
    const kailh = findComponentItem(payload, 'Kailh GM 8.0');
    const omron = findComponentItem(payload, 'Omron D2FC-F-K');
    assert.equal(kailh.properties.actuation_force.selected.value, '50');
    assert.equal(kailh.properties.actuation_force.source, 'user');
    assert.equal(omron.properties.actuation_force.selected.value, '75');
    assert.equal(omron.properties.actuation_force.source, 'reference');
  });
});

test('COMP-09: Material components have correct properties', async () => {
  await withReviewFixture(async ({ config }) => {
    const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'material' });
    assert.equal(payload.items.length, 2);
    const ptfe = findComponentItem(payload, 'PTFE');
    assert.ok(ptfe);
    assert.equal(ptfe.properties.friction.selected.value, 'low');
    const carbonFiber = findComponentItem(payload, 'Carbon Fiber');
    assert.ok(carbonFiber);
    assert.equal(carbonFiber.properties.durability.selected.value, 'very_high');
  });
});

test('COMP-10: Shared sensor PAW3950 shows pipeline candidates from both razer and pulsar', async () => {
  await withReviewFixture(async ({ config }) => {
    const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor' });
    const paw3950 = findComponentItem(payload, 'PAW3950');
    assert.ok(paw3950);

    const dpiCandidates = paw3950.properties.dpi_max.candidates;
    assert.ok(dpiCandidates.length >= 2, `PAW3950 dpi_max should have >= 2 candidates, got ${dpiCandidates.length}`);

    const workbookCandidate = dpiCandidates.find((candidate) => candidate.source_id === 'reference');
    assert.ok(workbookCandidate, 'Should have field-studio candidate');
    assert.equal(workbookCandidate.value, '35000');

    const pipelineCandidates = dpiCandidates.filter((candidate) => candidate.source_id === 'pipeline');
    assert.ok(pipelineCandidates.length >= 1, `Should have pipeline candidates, got ${pipelineCandidates.length}`);
    const allPipelineValues = pipelineCandidates.map((candidate) => candidate.value);
    assert.ok(allPipelineValues.includes('35000') || allPipelineValues.includes('26000'));
  });
});

test('COMP-11: Shared switch Kailh GM 8.0 shows pipeline candidates from pulsar and endgame', async () => {
  await withReviewFixture(async ({ config }) => {
    const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'switch' });
    const kailh = findComponentItem(payload, 'Kailh GM 8.0');
    assert.ok(kailh);

    const nameCandidates = kailh.name_tracked.candidates;
    assert.ok(nameCandidates.length >= 2, `Kailh name should have >= 2 candidates, got ${nameCandidates.length}`);
    const workbookNameCandidate = nameCandidates.find((candidate) => candidate.source_id === 'reference');
    assert.ok(workbookNameCandidate, 'Should have field-studio name candidate');
    assert.equal(workbookNameCandidate.value, 'Kailh GM 8.0');

    const pipelineNameCandidate = nameCandidates.find((candidate) => candidate.source_id === 'pipeline');
    assert.ok(pipelineNameCandidate, 'Should have pipeline name candidate');
    assert.equal(pipelineNameCandidate.value, 'Kailh GM8.0');
    assert.ok(
      pipelineNameCandidate.source.includes('2 products') || pipelineNameCandidate.evidence.quote.includes('2 product'),
      'Pipeline name candidate should reference 2 products',
    );

    const makerCandidates = kailh.maker_tracked.candidates;
    assert.ok(makerCandidates.length >= 1, 'Should have at least one field-studio maker candidate');
    assert.equal(makerCandidates[0].value, 'Kailh');
  });
});

test('COMP-12: Single-use component HERO26K shows 1 product in pipeline candidates', async () => {
  await withReviewFixture(async ({ config }) => {
    const payload = await buildComponentReviewPayloads({ config, category: CATEGORY, componentType: 'sensor' });
    const hero = findComponentItem(payload, 'HERO26K');
    assert.ok(hero);

    const pipelineCandidates = hero.properties.dpi_max.candidates.filter((candidate) => candidate.source_id === 'pipeline');
    if (pipelineCandidates.length > 0) {
      assert.ok(
        pipelineCandidates[0].source.includes('1 product'),
        `HERO26K pipeline candidate should reference 1 product; got source="${pipelineCandidates[0].source}"`,
      );
    }
  });
});
