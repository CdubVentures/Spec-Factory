/**
 * Eval State Dual-Write — contract tests for extractEvalState().
 *
 * Verifies the helper that builds the eval_state SQL blob from
 * doc.selected.images. This blob is dual-written alongside the
 * JSON SSOT so the GET handler can read from SQL, not JSON.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractEvalState } from '../imageEvaluator.js';

describe('extractEvalState', () => {
  it('returns {} when doc has no selected images', () => {
    assert.deepStrictEqual(extractEvalState({}), {});
    assert.deepStrictEqual(extractEvalState(null), {});
    assert.deepStrictEqual(extractEvalState(undefined), {});
    assert.deepStrictEqual(extractEvalState({ selected: {} }), {});
    assert.deepStrictEqual(extractEvalState({ selected: { images: [] } }), {});
  });

  it('extracts eval fields keyed by filename', () => {
    const doc = {
      selected: {
        images: [
          {
            filename: 'top-black.png',
            view: 'top',
            variant_key: 'color:black',
            eval_best: true,
            eval_flags: [],
            eval_reasoning: 'Sharpest image',
            eval_source: 'https://example.com/top-black.png',
          },
          {
            filename: 'bottom-black.png',
            view: 'bottom',
            variant_key: 'color:black',
            eval_best: false,
            eval_flags: ['watermark'],
            eval_reasoning: '',
            eval_source: 'https://example.com/bottom-black.png',
          },
        ],
      },
    };

    const state = extractEvalState(doc);
    assert.deepStrictEqual(state['top-black.png'], {
      eval_best: true,
      eval_flags: [],
      eval_reasoning: 'Sharpest image',
      eval_source: 'https://example.com/top-black.png',
    });
    assert.deepStrictEqual(state['bottom-black.png'], {
      eval_best: false,
      eval_flags: ['watermark'],
      eval_reasoning: '',
      eval_source: 'https://example.com/bottom-black.png',
    });
  });

  it('includes hero fields when present', () => {
    const doc = {
      selected: {
        images: [
          {
            filename: 'hero-black.png',
            view: 'hero',
            variant_key: 'color:black',
            hero: true,
            hero_rank: 1,
          },
        ],
      },
    };

    const state = extractEvalState(doc);
    assert.deepStrictEqual(state['hero-black.png'], {
      hero: true,
      hero_rank: 1,
    });
  });

  it('excludes images with no eval fields', () => {
    const doc = {
      selected: {
        images: [
          {
            filename: 'top-black.png',
            view: 'top',
            variant_key: 'color:black',
            eval_best: true,
            eval_reasoning: 'Good',
          },
          {
            filename: 'bottom-black.png',
            view: 'bottom',
            variant_key: 'color:black',
            // No eval fields at all
          },
        ],
      },
    };

    const state = extractEvalState(doc);
    assert.ok(state['top-black.png'], 'image with eval fields included');
    assert.strictEqual(state['bottom-black.png'], undefined, 'image without eval fields excluded');
  });

  it('omits undefined eval fields from individual entries', () => {
    const doc = {
      selected: {
        images: [
          {
            filename: 'top-black.png',
            view: 'top',
            variant_key: 'color:black',
            eval_best: true,
            // eval_flags, eval_reasoning, eval_source are undefined
          },
        ],
      },
    };

    const state = extractEvalState(doc);
    assert.deepStrictEqual(state['top-black.png'], { eval_best: true });
    assert.strictEqual('eval_flags' in state['top-black.png'], false);
  });
});
