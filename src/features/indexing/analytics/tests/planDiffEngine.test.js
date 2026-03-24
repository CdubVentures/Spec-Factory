import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFieldMapFromPacket, diffRunPlans } from '../planDiffEngine.js';

// ── helpers ─────────────────────────────────────────────────
function makeSummary(runId, fields = {}) {
  return { run_id: runId, fields };
}

function field(value, host, tier, confidence, found = true) {
  return { value, host, tier, confidence, found };
}

// ── diffRunPlans tests ──────────────────────────────────────
test('planDiffEngine — both runs empty → all neither', () => {
  const result = diffRunPlans({
    run1Summary: makeSummary('r1', {}),
    run2Summary: makeSummary('r2', {}),
  });
  assert.equal(result.run1_id, 'r1');
  assert.equal(result.run2_id, 'r2');
  assert.equal(result.fields.length, 0);
  assert.equal(result.run1_wins, 0);
  assert.equal(result.run2_wins, 0);
  assert.equal(result.ties, 0);
  assert.equal(result.neither, 0);
});

test('planDiffEngine — only run1 found field → run1 wins', () => {
  const result = diffRunPlans({
    run1Summary: makeSummary('r1', { weight: field('100g', 'amazon.com', 3, 0.9) }),
    run2Summary: makeSummary('r2', { weight: field(null, null, null, 0, false) }),
  });
  const f = result.fields.find((d) => d.field === 'weight');
  assert.ok(f);
  assert.equal(f.winner, 'run1');
  assert.ok(f.reason.includes('run1'));
  assert.equal(result.run1_wins, 1);
});

test('planDiffEngine — only run2 found field → run2 wins', () => {
  const result = diffRunPlans({
    run1Summary: makeSummary('r1', { dpi: field(null, null, null, 0, false) }),
    run2Summary: makeSummary('r2', { dpi: field('16000', 'razer.com', 1, 0.95) }),
  });
  const f = result.fields.find((d) => d.field === 'dpi');
  assert.equal(f.winner, 'run2');
  assert.equal(result.run2_wins, 1);
});

test('planDiffEngine — both found, run1 lower tier → run1 wins', () => {
  const result = diffRunPlans({
    run1Summary: makeSummary('r1', { sensor: field('PAW3950', 'razer.com', 1, 0.8) }),
    run2Summary: makeSummary('r2', { sensor: field('PAW3950', 'amazon.com', 3, 0.9) }),
  });
  const f = result.fields.find((d) => d.field === 'sensor');
  assert.equal(f.winner, 'run1');
  assert.ok(f.reason.toLowerCase().includes('tier'));
});

test('planDiffEngine — both found, run2 lower tier → run2 wins', () => {
  const result = diffRunPlans({
    run1Summary: makeSummary('r1', { sensor: field('PAW3950', 'amazon.com', 4, 0.9) }),
    run2Summary: makeSummary('r2', { sensor: field('PAW3950', 'razer.com', 2, 0.7) }),
  });
  const f = result.fields.find((d) => d.field === 'sensor');
  assert.equal(f.winner, 'run2');
});

test('planDiffEngine — same tier, run1 higher confidence → run1 wins', () => {
  const result = diffRunPlans({
    run1Summary: makeSummary('r1', { weight: field('80g', 'a.com', 2, 0.95) }),
    run2Summary: makeSummary('r2', { weight: field('80g', 'b.com', 2, 0.70) }),
  });
  const f = result.fields.find((d) => d.field === 'weight');
  assert.equal(f.winner, 'run1');
  assert.ok(f.reason.toLowerCase().includes('confidence'));
});

test('planDiffEngine — same tier same confidence → tie', () => {
  const result = diffRunPlans({
    run1Summary: makeSummary('r1', { weight: field('80g', 'a.com', 2, 0.9) }),
    run2Summary: makeSummary('r2', { weight: field('80g', 'b.com', 2, 0.9) }),
  });
  const f = result.fields.find((d) => d.field === 'weight');
  assert.equal(f.winner, 'tie');
  assert.equal(result.ties, 1);
});

test('planDiffEngine — null tier treated as 99 → other wins', () => {
  const result = diffRunPlans({
    run1Summary: makeSummary('r1', { dpi: field('16000', 'a.com', null, 0.9) }),
    run2Summary: makeSummary('r2', { dpi: field('16000', 'b.com', 2, 0.5) }),
  });
  const f = result.fields.find((d) => d.field === 'dpi');
  assert.equal(f.winner, 'run2');
});

test('planDiffEngine — summary counts match diffs array', () => {
  const result = diffRunPlans({
    run1Summary: makeSummary('r1', {
      a: field('v', 'h', 1, 0.9),
      b: field(null, null, null, 0, false),
      c: field('v', 'h', 2, 0.8),
      d: field(null, null, null, 0, false),
    }),
    run2Summary: makeSummary('r2', {
      a: field('v', 'h', 2, 0.9),
      b: field('v', 'h', 1, 0.9),
      c: field('v', 'h', 2, 0.8),
      d: field(null, null, null, 0, false),
    }),
  });
  assert.equal(result.fields.length, 4);
  assert.equal(
    result.run1_wins + result.run2_wins + result.ties + result.neither,
    result.fields.length,
  );
});

test('planDiffEngine — fields from both runs unioned', () => {
  const result = diffRunPlans({
    run1Summary: makeSummary('r1', { only_in_r1: field('v', 'h', 1, 0.9) }),
    run2Summary: makeSummary('r2', { only_in_r2: field('v', 'h', 2, 0.8) }),
  });
  const fieldNames = result.fields.map((f) => f.field).sort();
  assert.deepEqual(fieldNames, ['only_in_r1', 'only_in_r2']);
  // only_in_r1: run1 found, run2 not found → run1 wins
  assert.equal(result.fields.find((f) => f.field === 'only_in_r1').winner, 'run1');
  // only_in_r2: run2 found, run1 not found → run2 wins
  assert.equal(result.fields.find((f) => f.field === 'only_in_r2').winner, 'run2');
});

// ── buildFieldMapFromPacket tests ───────────────────────────
test('planDiffEngine — buildFieldMapFromPacket extracts fields from packet', () => {
  const packet = {
    field_source_index: {
      weight: { host: 'razer.com', tier: 1, confidence: 0.95 },
      sensor: { host: 'amazon.com', tier: 3, confidence: 0.7 },
    },
    sql_projection: {
      candidate_rows: [
        { field_key: 'weight', value: '80g' },
        { field_key: 'sensor', value: 'PAW3950' },
      ],
    },
  };
  const map = buildFieldMapFromPacket(packet);
  assert.equal(map.weight.value, '80g');
  assert.equal(map.weight.host, 'razer.com');
  assert.equal(map.weight.tier, 1);
  assert.equal(map.weight.confidence, 0.95);
  assert.equal(map.weight.found, true);
  assert.equal(map.sensor.value, 'PAW3950');
});
