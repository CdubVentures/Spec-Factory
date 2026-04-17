import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runPerVariant } from '../runPerVariant.js';

function makeSpecDbStub(variants) {
  return {
    variants: {
      listActive: () => variants,
    },
  };
}

function makeVariantRow({ id, key, label = key, type = 'color' }) {
  return { variant_id: id, variant_key: key, variant_label: label, variant_type: type };
}

describe('runPerVariant', () => {
  it('rejects with no_cef_data when the generator has no variants', async () => {
    const specDb = makeSpecDbStub([]);
    const out = await runPerVariant({
      specDb,
      product: { product_id: 'p1', category: 'mouse' },
      produceForVariant: async () => { throw new Error('should not be called'); },
      staggerMs: 0,
    });

    assert.equal(out.rejected, true);
    assert.equal(out.rejections[0].reason_code, 'no_cef_data');
    assert.deepEqual(out.perVariantResults, []);
  });

  it('rejects with unknown_variant when variantKey filter matches nothing', async () => {
    const specDb = makeSpecDbStub([
      makeVariantRow({ id: 'v_1', key: 'color:black' }),
    ]);
    const out = await runPerVariant({
      specDb,
      product: { product_id: 'p1', category: 'mouse' },
      variantKey: 'color:purple',
      produceForVariant: async () => { throw new Error('should not be called'); },
      staggerMs: 0,
    });

    assert.equal(out.rejected, true);
    assert.equal(out.rejections[0].reason_code, 'unknown_variant');
    assert.equal(out.perVariantResults.length, 0);
  });

  it('calls produceForVariant once per variant and accumulates results', async () => {
    const specDb = makeSpecDbStub([
      makeVariantRow({ id: 'v_1', key: 'color:black', label: 'Black' }),
      makeVariantRow({ id: 'v_2', key: 'color:white', label: 'White' }),
      makeVariantRow({ id: 'v_3', key: 'edition:special', label: 'Special', type: 'edition' }),
    ]);
    const calls = [];
    const out = await runPerVariant({
      specDb,
      product: { product_id: 'p1', category: 'mouse' },
      staggerMs: 0,
      produceForVariant: async (variant, index, ctx) => {
        calls.push({ key: variant.key, index, total: ctx.total });
        return { value: `produced-${variant.key}` };
      },
    });

    assert.equal(out.rejected, false);
    assert.equal(out.variants.length, 3);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].total, 3);
    assert.deepEqual(calls.map((c) => c.key).sort(), ['color:black', 'color:white', 'edition:special']);
    assert.equal(out.perVariantResults.length, 3);
    for (const { variant, result, error } of out.perVariantResults) {
      assert.equal(error, null);
      assert.equal(result.value, `produced-${variant.key}`);
    }
  });

  it('filters to single variant when variantKey is provided', async () => {
    const specDb = makeSpecDbStub([
      makeVariantRow({ id: 'v_1', key: 'color:black' }),
      makeVariantRow({ id: 'v_2', key: 'color:white' }),
    ]);
    const calls = [];
    const out = await runPerVariant({
      specDb,
      product: { product_id: 'p1', category: 'mouse' },
      variantKey: 'color:black',
      staggerMs: 0,
      produceForVariant: async (variant) => { calls.push(variant.key); return null; },
    });

    assert.equal(out.rejected, false);
    assert.equal(out.variants.length, 1);
    assert.deepEqual(calls, ['color:black']);
  });

  it('captures errors from produceForVariant per-variant without aborting others', async () => {
    const specDb = makeSpecDbStub([
      makeVariantRow({ id: 'v_1', key: 'color:black' }),
      makeVariantRow({ id: 'v_2', key: 'color:white' }),
    ]);
    const out = await runPerVariant({
      specDb,
      product: { product_id: 'p1', category: 'mouse' },
      staggerMs: 0,
      produceForVariant: async (variant) => {
        if (variant.key === 'color:black') throw new Error('boom');
        return { ok: true };
      },
    });

    assert.equal(out.rejected, false);
    const byKey = Object.fromEntries(out.perVariantResults.map((r) => [r.variant.key, r]));
    assert.equal(byKey['color:black'].error, 'boom');
    assert.equal(byKey['color:black'].result, null);
    assert.equal(byKey['color:white'].error, null);
    assert.deepEqual(byKey['color:white'].result, { ok: true });
  });

  it('fires onStageAdvance + onVariantProgress per variant and a final done progress', async () => {
    const specDb = makeSpecDbStub([
      makeVariantRow({ id: 'v_1', key: 'color:black', label: 'Black' }),
      makeVariantRow({ id: 'v_2', key: 'edition:special', label: 'Special', type: 'edition' }),
    ]);
    const stages = [];
    const progress = [];
    await runPerVariant({
      specDb,
      product: { product_id: 'p1', category: 'mouse' },
      staggerMs: 0,
      onStageAdvance: (s) => stages.push(s),
      onVariantProgress: (completed, total, key) => progress.push({ completed, total, key }),
      produceForVariant: async () => ({ ok: true }),
    });

    assert.ok(stages.includes('Color: Black'));
    assert.ok(stages.includes('Ed: Special'));
    assert.equal(progress.length, 3);
    assert.deepEqual(progress[progress.length - 1], { completed: 2, total: 2, key: 'done' });
  });

  it('returns empty perVariantResults when produceForVariant returns undefined', async () => {
    const specDb = makeSpecDbStub([
      makeVariantRow({ id: 'v_1', key: 'color:black' }),
    ]);
    const out = await runPerVariant({
      specDb,
      product: { product_id: 'p1', category: 'mouse' },
      staggerMs: 0,
      produceForVariant: async () => undefined,
    });

    assert.equal(out.perVariantResults.length, 1);
    assert.equal(out.perVariantResults[0].result, null);
    assert.equal(out.perVariantResults[0].error, null);
  });
});
