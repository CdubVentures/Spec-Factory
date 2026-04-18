import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCandidateRow,
  buildFieldState,
  buildFieldStateScenario,
  buildProductReviewPayload,
  CATEGORY,
  withSeededSpecDbFixture,
} from './helpers/reviewEcosystemHarness.js';

test('GRID-06: buildFieldState with multiple candidates includes evidence', () => {
  const fieldState = buildFieldState(
    buildFieldStateScenario({ productId: 'mouse-zowie-ec2-c', field: 'weight' }),
  );
  assert.equal(fieldState.source, 'zowie.benq.com');
  assert.equal(fieldState.method, 'dom');
  assert.equal(fieldState.tier, 1);
  assert.equal(fieldState.candidate_count, 3);
  assert.equal(fieldState.candidates.length, 3);
  assert.equal(fieldState.candidates[0].source, 'zowie.benq.com');
  assert.equal(fieldState.candidates[1].source, 'rtings.com');
  assert.equal(fieldState.candidates[2].source, 'reddit.com');
});

test('GRID-07: Confidence maps to color via confidence dot only', () => {
  const stateA = buildFieldState(buildFieldStateScenario({
    field: 'weight',
    candidates: { weight: [buildCandidateRow({ candidate_id: 'c1' })] },
    normalizedFields: { weight: '59' },
    provenance: { weight: { value: '59', confidence: 0.7 } },
    summary: { fields_below_pass_target: ['weight'] },
  }));
  assert.equal(stateA.selected.color, 'yellow');

  const stateB = buildFieldState(buildFieldStateScenario({
    field: 'weight',
    candidates: { weight: [buildCandidateRow({ candidate_id: 'c1' })] },
    normalizedFields: { weight: '59' },
    provenance: { weight: { value: '59', confidence: 0.7 } },
  }));
  assert.equal(stateB.selected.color, 'yellow');
});

test('review ecosystem grid contracts share one fixture without weakening field-state behavior', { timeout: 120_000 }, async (t) => {
  await withSeededSpecDbFixture(async ({ storage, config, db }) => {
    await t.test('GRID-01: Pipeline value with multiple candidates shows top source', async () => {
      const payload = await buildProductReviewPayload({ storage, config, category: CATEGORY, specDb: db, productId: 'mouse-zowie-ec2-c' });
      assert.equal(payload.fields.weight.selected.value, '73');
      assert.equal(payload.fields.weight.source, 'zowie.benq.com');
      assert.equal(payload.fields.weight.method, 'dom');
      assert.equal(payload.fields.weight.candidate_count, 3);
    });

    await t.test('GRID-02: Manual override sets source=user, overridden=true', async () => {
      const payload = await buildProductReviewPayload({ storage, config, category: CATEGORY, specDb: db, productId: 'mouse-razer-viper-v3-pro' });
      assert.equal(payload.fields.weight.selected.value, '48');
      assert.equal(payload.fields.weight.selected.confidence, 1.0);
      assert.equal(payload.fields.weight.overridden, true);
      assert.equal(payload.fields.weight.source, 'user');
      assert.equal(payload.fields.weight.method, 'manual_override');
      assert.equal(payload.fields.weight.selected.status, 'ok');
    });

    await t.test('GRID-03: Candidate acceptance does NOT set overridden=true', async () => {
      const payload = await buildProductReviewPayload({ storage, config, category: CATEGORY, specDb: db, productId: 'mouse-logitech-g502-x' });
      assert.equal(payload.fields.dpi.selected.value, '25600');
      assert.equal(payload.fields.dpi.overridden, false);
      assert.equal(payload.fields.dpi.source, 'logitech.com');
      const resolvedCandidate = payload.fields.dpi.candidates.find((c) => c.status === 'resolved');
      assert.ok(resolvedCandidate, 'resolved candidate should exist');
      assert.equal(resolvedCandidate.evidence.url, 'https://logitech.com/g502x');
      assert.equal(resolvedCandidate.evidence.quote, 'Max DPI: 25,600');
    });

    await t.test('GRID-04: Missing-value fields are omitted from sparse payload (frontend derives gray from layout)', async () => {
      // WHY: Fields with no value, no candidates, no variant_values, and no override
      // carry zero information — the frontend grid renders gray empty cells for
      // them by falling through to layout.rows when fields[key] is absent. This
      // keeps the products-index payload linear in real data rather than in
      // layout × products (critical at thousands-of-products scale).
      const payload = await buildProductReviewPayload({ storage, config, category: CATEGORY, specDb: db, productId: 'mouse-zowie-ec2-c' });
      assert.equal(payload.fields.encoder, undefined, 'encoder has no signal on zowie — must be absent from sparse fields map');
      assert.equal(typeof payload.metrics.missing, 'number');
      assert.ok(payload.metrics.missing >= 1, 'encoder still counted as missing for coverage math');
    });

    await t.test('GRID-05: Multiple fields maintain independent sources across products', async () => {
      const razer = await buildProductReviewPayload({ storage, config, category: CATEGORY, specDb: db, productId: 'mouse-razer-viper-v3-pro' });
      assert.equal(razer.fields.weight.source, 'user');
      assert.equal(razer.fields.weight.overridden, true);
      assert.equal(razer.fields.sensor.source, 'razer.com');
      assert.equal(razer.fields.sensor.overridden, false);

      const pulsar = await buildProductReviewPayload({ storage, config, category: CATEGORY, specDb: db, productId: 'mouse-pulsar-x2-v3' });
      assert.equal(pulsar.fields.sensor.source, 'pulsar.gg');
      assert.equal(pulsar.fields.weight.source, 'pulsar.gg');
    });

    await t.test('GRID-08: includeCandidates=false still reports count and source', async () => {
      const payload = await buildProductReviewPayload({
        storage,
        config,
        category: CATEGORY,
        specDb: db,
        productId: 'mouse-zowie-ec2-c',
        includeCandidates: false,
      });
      assert.equal(payload.fields.weight.candidates.length, 0);
      assert.equal(payload.fields.weight.candidate_count, 3);
      assert.equal(payload.fields.weight.source, 'zowie.benq.com');
    });

    await t.test('GRID-09: Override evidence URL and quote flow into resolved candidate', async () => {
      const payload = await buildProductReviewPayload({ storage, config, category: CATEGORY, specDb: db, productId: 'mouse-zowie-ec2-c' });
      assert.equal(payload.fields.sensor.source, 'zowie.benq.com');
      const resolvedCandidate = payload.fields.sensor.candidates.find((c) => c.status === 'resolved');
      assert.ok(resolvedCandidate, 'resolved candidate should exist');
      assert.equal(resolvedCandidate.evidence.url, 'https://zowie.benq.com/ec2-c');
      assert.equal(resolvedCandidate.evidence.quote, 'Sensor: PMW 3360');
    });

    await t.test('GRID-10: Source timestamp from field_candidates updated_at', async () => {
      const razer = await buildProductReviewPayload({ storage, config, category: CATEGORY, specDb: db, productId: 'mouse-razer-viper-v3-pro' });
      assert.ok(razer.fields.weight.source_timestamp, 'manual override resolved candidate should have a source_timestamp');

      const pulsar = await buildProductReviewPayload({ storage, config, category: CATEGORY, specDb: db, productId: 'mouse-pulsar-x2-v3' });
      assert.ok(pulsar.fields.weight.source_timestamp, 'resolved candidate should have a source_timestamp');
    });
  });
});
