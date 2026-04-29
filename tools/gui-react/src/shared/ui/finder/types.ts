export interface KpiCard {
  readonly label: string;
  readonly value: string;
  readonly tone: string;
}

export interface RunDiscoveryLog {
  readonly confirmedCount: number;
  readonly addedNewCount: number;
  readonly rejectedCount: number;
  readonly urlsCheckedCount: number;
  readonly queriesRunCount: number;
  readonly confirmedFromKnown: readonly string[];
  readonly addedNew: readonly string[];
  readonly rejectedFromKnown: readonly string[];
  readonly urlsChecked: readonly string[];
  readonly queriesRun: readonly string[];
}

export interface DeleteTarget {
  readonly kind:
    | 'run' | 'loop' | 'all'
    | 'image' | 'images-all' | 'images-variant'
    | 'eval' | 'eval-all' | 'eval-variant'
    | 'carousel-clear-variant' | 'carousel-clear-all'
    | 'variant' | 'variant-all'
    | 'key-unpublish' | 'key-delete'
    | 'key-unpublish-group' | 'key-delete-group'
    | 'key-unpublish-all' | 'key-delete-all'
    | 'field-row-unpublish' | 'field-row-delete'
    | 'product-nonvariant-unpublish' | 'product-nonvariant-delete'
    | 'component-row-delete' | 'component-type-delete'
    | 'field-variant-unpublish' | 'field-variant-delete'
    | 'field-all-variants-unpublish' | 'field-all-variants-delete';
  readonly runNumber?: number;
  readonly runNumbers?: readonly number[];
  readonly evalNumber?: number;
  readonly evalNumbers?: readonly number[];
  readonly count?: number;
  readonly label?: string;
  readonly filename?: string;
  readonly filenames?: readonly string[];
  readonly variantId?: string;
  readonly productId?: string;
  readonly variantKey?: string;
  /** field_key for single-key operations (key-unresolve, key-delete). */
  readonly fieldKey?: string;
  /** field_keys for bulk key operations (group / all variants). */
  readonly fieldKeys?: readonly string[];
}
