// WHY: Tab ids must match the IndexingPage tab keys used by Overview deep-links
// (previously OverviewLinksCell). Keeping a closed enum prevents typos and lets
// callers be type-checked when they pass a tab.
export type IndexLabLinkTabId =
  | 'colorEditionFinder'
  | 'productImageFinder'
  | 'releaseDateFinder'
  | 'skuFinder'
  | 'keyFinder';

export interface IndexLabLinkAction {
  readonly picker: {
    readonly pickerBrand: string;
    readonly pickerModel: string;
    readonly pickerProductId: string;
    readonly pickerRunId: string;
  };
  readonly tabKey: string;
  readonly tabId: IndexLabLinkTabId;
  readonly target: '/indexing';
}

/**
 * Pure shape used by both the React component and tests. Mirrors what the
 * legacy OverviewLinksCell.open() did imperatively, so deep-link payloads stay
 * identical: writes pickerBrand/pickerModel/pickerProductId (clearing
 * pickerRunId) and sets the per-product tab id, then navigates to /indexing.
 */
export function buildIndexLabLinkAction(args: {
  readonly category: string;
  readonly productId: string;
  readonly brand: string;
  readonly baseModel: string;
  readonly tabId: IndexLabLinkTabId;
}): IndexLabLinkAction {
  return {
    picker: {
      pickerBrand: args.brand,
      // WHY: IndexingPage's drill-down Model column is indexed by base_model
      // (see deriveFilteredCatalog.ts). Writing row.model would mismatch and
      // the picker's self-healing effect would clobber pickerProductId.
      pickerModel: args.baseModel,
      pickerProductId: args.productId,
      pickerRunId: '',
    },
    tabKey: `indexing:tab:active:${args.productId}:${args.category}`,
    tabId: args.tabId,
    target: '/indexing',
  };
}
