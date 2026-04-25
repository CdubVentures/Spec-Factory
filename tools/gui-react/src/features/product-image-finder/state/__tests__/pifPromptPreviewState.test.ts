import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPifHeaderPromptPreviewState,
  createPifLoopPromptPreviewState,
  createPifPromptPreviewBody,
} from '../pifPromptPreviewState.ts';
import type { VariantInfo } from '../../types.ts';

function variant(key: string, label = key): VariantInfo {
  return {
    key,
    label,
    type: 'color',
    variant_id: `id-${key}`,
  };
}

describe('PIF prompt preview request state', () => {
  it('resolves the panel header preview to the first variant priority-view prompt', () => {
    const state = createPifHeaderPromptPreviewState([
      variant('color:black', 'Black'),
      variant('color:white', 'White'),
    ]);

    assert.deepEqual(createPifPromptPreviewBody(state), {
      variant_key: 'color:black',
      mode: 'view',
    });
  });

  it('returns null for the panel header when no variant can scope the preview', () => {
    assert.equal(createPifHeaderPromptPreviewState([]), null);
  });

  it('builds overview loop preview requests with mode loop', () => {
    const state = createPifLoopPromptPreviewState('color:black');

    assert.deepEqual(createPifPromptPreviewBody(state), {
      variant_key: 'color:black',
      mode: 'loop',
    });
  });
});
