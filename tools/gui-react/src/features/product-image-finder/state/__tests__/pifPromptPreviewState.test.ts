import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPifHeaderPromptPreviewState,
  createPifPriorityViewPreviewState,
  createPifIndividualViewPreviewState,
  createPifStandaloneHeroPreviewState,
  createPifLoopViewPreviewState,
  createPifLoopHeroPreviewState,
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

  it('priority-view preview body has mode=view, no view focus', () => {
    const state = createPifPriorityViewPreviewState('color:black');
    assert.deepEqual(createPifPromptPreviewBody(state), {
      variant_key: 'color:black',
      mode: 'view',
    });
  });

  it('individual-view preview body carries the view focus', () => {
    const state = createPifIndividualViewPreviewState('color:black', 'top');
    assert.deepEqual(createPifPromptPreviewBody(state), {
      variant_key: 'color:black',
      mode: 'view',
      view: 'top',
    });
  });

  it('standalone hero preview body has mode=hero', () => {
    const state = createPifStandaloneHeroPreviewState('color:black');
    assert.deepEqual(createPifPromptPreviewBody(state), {
      variant_key: 'color:black',
      mode: 'hero',
    });
  });

  it('loop-view preview body has mode=loop-view', () => {
    const state = createPifLoopViewPreviewState('color:black');
    assert.deepEqual(createPifPromptPreviewBody(state), {
      variant_key: 'color:black',
      mode: 'loop-view',
    });
  });

  it('loop-hero preview body has mode=loop-hero', () => {
    const state = createPifLoopHeroPreviewState('color:black');
    assert.deepEqual(createPifPromptPreviewBody(state), {
      variant_key: 'color:black',
      mode: 'loop-hero',
    });
  });

  it('returns empty body when state is null', () => {
    assert.deepEqual(createPifPromptPreviewBody(null), {});
  });
});
