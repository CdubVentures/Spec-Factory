import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

interface CarouselScoringState {
  readonly scoredViews: readonly string[];
  readonly optionalViews: readonly string[];
  readonly extraTarget: number;
  readonly usesViewBudget: boolean;
}

interface CarouselModelModule {
  readonly resolveCarouselScoringState: (input: {
    readonly scoredValue: string;
    readonly optionalValue: string;
    readonly extraTargetValue: string;
    readonly viewBudgetValue: string;
    readonly category: string;
  }) => CarouselScoringState;
  readonly buildCarouselViewTogglePayload: (input: {
    readonly state: CarouselScoringState;
    readonly view: string;
    readonly column: 'scored' | 'optional';
  }) => Record<string, string>;
  readonly buildCarouselExtraTargetPayload: (value: string) => Record<string, string>;
}

let model: CarouselModelModule;

before(async () => {
  model = await loadBundledModule(
    'tools/gui-react/src/features/pipeline-settings/components/widgets/carouselScoringModel.ts',
    { prefix: 'carousel-scoring-model-' },
  ) as CarouselModelModule;
});

describe('carousel scoring model', () => {
  it('uses viewBudget as the scored carousel views when the scored setting is empty', () => {
    const state = model.resolveCarouselScoringState({
      scoredValue: '',
      optionalValue: '["right","front"]',
      extraTargetValue: '3',
      viewBudgetValue: '["top","left","angle","sangle","bottom"]',
      category: 'mouse',
    });

    assert.deepEqual(state.scoredViews, ['top', 'left', 'angle', 'sangle', 'bottom']);
    assert.deepEqual(state.optionalViews, ['right', 'front']);
    assert.equal(state.usesViewBudget, true);
  });

  it('filters optional placeholders that are already scored targets', () => {
    const state = model.resolveCarouselScoringState({
      scoredValue: '["top","left"]',
      optionalValue: '["left","right","unknown"]',
      extraTargetValue: '3',
      viewBudgetValue: '',
      category: 'mouse',
    });

    assert.deepEqual(state.scoredViews, ['top', 'left']);
    assert.deepEqual(state.optionalViews, ['right']);
    assert.equal(state.usesViewBudget, false);
  });

  it('target toggles preserve canonical order', () => {
    const payload = model.buildCarouselViewTogglePayload({
      state: {
        scoredViews: ['top', 'left'],
        optionalViews: ['right', 'angle'],
        extraTarget: 3,
        usesViewBudget: false,
      },
      view: 'front',
      column: 'scored',
    });

    assert.deepEqual(payload, {
      carouselScoredViews: '["top","left","front"]',
      carouselOptionalViews: '["right","angle"]',
    });
  });

  it('does not let a placeholder view be checked as a target in the same state', () => {
    const payload = model.buildCarouselViewTogglePayload({
      state: {
        scoredViews: ['top', 'left'],
        optionalViews: ['right', 'angle'],
        extraTarget: 3,
        usesViewBudget: false,
      },
      view: 'right',
      column: 'scored',
    });

    assert.deepEqual(payload, {
      carouselScoredViews: '["top","left"]',
      carouselOptionalViews: '["right","angle"]',
    });
  });

  it('does not let the last scored target be unchecked', () => {
    const payload = model.buildCarouselViewTogglePayload({
      state: {
        scoredViews: ['top'],
        optionalViews: [],
        extraTarget: 3,
        usesViewBudget: false,
      },
      view: 'top',
      column: 'scored',
    });

    assert.equal(payload.carouselScoredViews, '["top"]');
  });

  it('clamps the additional image target to the supported range', () => {
    assert.deepEqual(model.buildCarouselExtraTargetPayload('-1'), { carouselExtraTarget: '0' });
    assert.deepEqual(model.buildCarouselExtraTargetPayload('99'), { carouselExtraTarget: '20' });
    assert.deepEqual(model.buildCarouselExtraTargetPayload('bad'), { carouselExtraTarget: '3' });
  });
});
