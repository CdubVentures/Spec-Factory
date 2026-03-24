import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCandidateRow,
  buildFieldState,
  buildFieldStateScenario,
  buildProductReviewPayload,
  CATEGORY,
  withReviewFixture,
} from './helpers/reviewEcosystemHarness.js';

test('GRID-01: Pipeline value with multiple candidates shows top source', async () => {
  await withReviewFixture(async ({ storage, config }) => {
    const payload = await buildProductReviewPayload({ storage, config, category: CATEGORY, productId: 'mouse-zowie-ec2-c' });
    assert.equal(payload.fields.weight.selected.value, '73');
    assert.equal(payload.fields.weight.source, 'zowie.benq.com');
    assert.equal(payload.fields.weight.method, 'dom');
    assert.equal(payload.fields.weight.tier, 1);
    assert.equal(payload.fields.weight.candidate_count, 3);
  });
});

test('GRID-02: Manual override sets source=user, overridden=true', async () => {
  await withReviewFixture(async ({ storage, config }) => {
    const payload = await buildProductReviewPayload({ storage, config, category: CATEGORY, productId: 'mouse-razer-viper-v3-pro' });
    assert.equal(payload.fields.weight.selected.value, '48');
    assert.equal(payload.fields.weight.selected.confidence, 1.0);
    assert.equal(payload.fields.weight.overridden, true);
    assert.equal(payload.fields.weight.source, 'user');
    assert.equal(payload.fields.weight.method, 'manual_override');
    assert.equal(payload.fields.weight.needs_review, false);
  });
});

test('GRID-03: Candidate acceptance does NOT set overridden=true', async () => {
  await withReviewFixture(async ({ storage, config }) => {
    const payload = await buildProductReviewPayload({ storage, config, category: CATEGORY, productId: 'mouse-logitech-g502-x' });
    assert.equal(payload.fields.dpi.selected.value, '25600');
    assert.equal(payload.fields.dpi.overridden, false);
    assert.equal(payload.fields.dpi.source, 'logitech.com');
    assert.equal(payload.fields.dpi.evidence_url, 'https://logitech.com/g502x');
    assert.equal(payload.fields.dpi.evidence_quote, 'Max DPI: 25,600');
  });
});

test('GRID-04: Missing value shows gray color and strips visual treatment codes', async () => {
  await withReviewFixture(async ({ storage, config }) => {
    const payload = await buildProductReviewPayload({ storage, config, category: CATEGORY, productId: 'mouse-zowie-ec2-c' });
    assert.equal(payload.fields.encoder.selected.value, 'unk');
    assert.equal(payload.fields.encoder.selected.color, 'gray');
    assert.equal(payload.fields.encoder.reason_codes.includes('missing_value'), false);
  });
});

test('GRID-05: Multiple fields maintain independent sources across products', async () => {
  await withReviewFixture(async ({ storage, config }) => {
    const razer = await buildProductReviewPayload({ storage, config, category: CATEGORY, productId: 'mouse-razer-viper-v3-pro' });
    assert.equal(razer.fields.weight.source, 'user');
    assert.equal(razer.fields.weight.overridden, true);
    assert.equal(razer.fields.sensor.source, 'razer.com');
    assert.equal(razer.fields.sensor.overridden, undefined);

    const pulsar = await buildProductReviewPayload({ storage, config, category: CATEGORY, productId: 'mouse-pulsar-x2-v3' });
    assert.equal(pulsar.fields.sensor.source, 'pulsar.gg');
    assert.equal(pulsar.fields.weight.source, 'pulsar.gg');
  });
});

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
  assert.equal(stateA.reason_codes.includes('below_pass_target'), false);

  const stateB = buildFieldState(buildFieldStateScenario({
    field: 'weight',
    candidates: { weight: [buildCandidateRow({ candidate_id: 'c1' })] },
    normalizedFields: { weight: '59' },
    provenance: { weight: { value: '59', confidence: 0.7 } },
  }));
  assert.equal(stateB.selected.color, 'yellow');
});

test('GRID-08: includeCandidates=false still reports count and source', async () => {
  await withReviewFixture(async ({ storage, config }) => {
    const payload = await buildProductReviewPayload({
      storage,
      config,
      category: CATEGORY,
      productId: 'mouse-zowie-ec2-c',
      includeCandidates: false,
    });
    assert.equal(payload.fields.weight.candidates.length, 0);
    assert.equal(payload.fields.weight.candidate_count, 3);
    assert.equal(payload.fields.weight.source, 'zowie.benq.com');
  });
});

test('GRID-09: Override evidence URL and quote flow into field state', async () => {
  await withReviewFixture(async ({ storage, config }) => {
    const payload = await buildProductReviewPayload({ storage, config, category: CATEGORY, productId: 'mouse-zowie-ec2-c' });
    assert.equal(payload.fields.sensor.evidence_url, 'https://zowie.benq.com/ec2-c');
    assert.equal(payload.fields.sensor.evidence_quote, 'Sensor: PMW 3360');
    assert.equal(payload.fields.sensor.source, 'zowie.benq.com');
  });
});

test('GRID-10: Source timestamp from override flows into field state', async () => {
  await withReviewFixture(async ({ storage, config }) => {
    const razer = await buildProductReviewPayload({ storage, config, category: CATEGORY, productId: 'mouse-razer-viper-v3-pro' });
    assert.equal(razer.fields.weight.source_timestamp, '2026-02-15T10:00:00.000Z');

    const pulsar = await buildProductReviewPayload({ storage, config, category: CATEGORY, productId: 'mouse-pulsar-x2-v3' });
    assert.equal(pulsar.fields.weight.source_timestamp, undefined);
  });
});
