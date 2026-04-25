import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert/strict';
import { buildIndexLabLinkAction } from '../indexLabLinkAction.ts';

describe('buildIndexLabLinkAction', () => {
  it('builds the picker payload from row identity (productId/brand/base_model)', () => {
    const action = buildIndexLabLinkAction({
      category: 'mouse',
      productId: 'mm731-black',
      brand: 'Cooler Master',
      baseModel: 'MM731',
      tabId: 'productImageFinder',
    });
    deepStrictEqual(action.picker, {
      pickerBrand: 'Cooler Master',
      pickerModel: 'MM731',
      pickerProductId: 'mm731-black',
      pickerRunId: '',
    });
  });

  it('uses base_model (not row.model) so IndexingPage picker keys line up', () => {
    const action = buildIndexLabLinkAction({
      category: 'mouse',
      productId: 'p1',
      brand: 'B',
      baseModel: 'BASE-1',
      tabId: 'colorEditionFinder',
    });
    strictEqual(action.picker.pickerModel, 'BASE-1');
  });

  it('keys the tab store entry by productId+category and uses the requested tab id', () => {
    const action = buildIndexLabLinkAction({
      category: 'kb',
      productId: 'pid-9',
      brand: 'B',
      baseModel: 'BM',
      tabId: 'keyFinder',
    });
    strictEqual(action.tabKey, 'indexing:tab:active:pid-9:kb');
    strictEqual(action.tabId, 'keyFinder');
  });

  it('always navigates to /indexing', () => {
    const action = buildIndexLabLinkAction({
      category: 'mouse',
      productId: 'p',
      brand: 'b',
      baseModel: 'bm',
      tabId: 'releaseDateFinder',
    });
    strictEqual(action.target, '/indexing');
  });

  it('clears pickerRunId on every click so a stale run does not preselect', () => {
    const action = buildIndexLabLinkAction({
      category: 'mouse',
      productId: 'p',
      brand: 'b',
      baseModel: 'bm',
      tabId: 'skuFinder',
    });
    strictEqual(action.picker.pickerRunId, '');
  });
});
