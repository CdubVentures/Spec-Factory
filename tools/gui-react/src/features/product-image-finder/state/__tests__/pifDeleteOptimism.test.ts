import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyPifCarouselClearServerState } from '../pifDeleteOptimism.ts';
import type { ProductImageFinderResult } from '../../types.ts';

function makePifResult(): ProductImageFinderResult {
  return {
    product_id: 'mouse-001',
    category: 'mouse',
    images: [
      { view: 'top', filename: 'top-black.png', variant_key: 'color:black' },
      { view: 'top', filename: 'top-white.png', variant_key: 'color:white' },
    ],
    image_count: 2,
    run_count: 1,
    last_ran_at: '2026-04-27T00:00:00.000Z',
    selected: {
      images: [
        {
          view: 'top',
          filename: 'top-black.png',
          url: '',
          source_page: '',
          alt_text: '',
          bytes: 1,
          width: 1,
          height: 1,
          quality_pass: true,
          variant_key: 'color:black',
          variant_label: 'Black',
          variant_type: 'color',
          downloaded_at: '',
          eval_best: true,
          eval_reasoning: 'stale black',
        },
        {
          view: 'top',
          filename: 'top-white.png',
          url: '',
          source_page: '',
          alt_text: '',
          bytes: 1,
          width: 1,
          height: 1,
          quality_pass: true,
          variant_key: 'color:white',
          variant_label: 'White',
          variant_type: 'color',
          downloaded_at: '',
          eval_best: true,
          eval_reasoning: 'keep white',
        },
      ],
    },
    runs: [],
    carousel_slots: {
      'color:black': { top: 'top-black.png' },
      'color:white': { top: 'stale-white.png' },
    },
  };
}

describe('applyPifCarouselClearServerState', () => {
  it('uses server-normalized slots and clears eval fields only for the selected variant', () => {
    const next = applyPifCarouselClearServerState(
      makePifResult(),
      {
        carousel_slots: {
          'color:white': { top: 'server-white.png' },
        },
      },
      { variantKey: 'color:black' },
    );

    assert.deepEqual(next?.carousel_slots, {
      'color:white': { top: 'server-white.png' },
    });
    assert.equal(next?.selected.images[0].eval_best, undefined);
    assert.equal(next?.selected.images[0].eval_reasoning, undefined);
    assert.equal(next?.selected.images[1].eval_best, true);
    assert.equal(next?.selected.images[1].eval_reasoning, 'keep white');
  });
});
