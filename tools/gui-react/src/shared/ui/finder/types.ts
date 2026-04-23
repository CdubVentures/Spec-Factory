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
    | 'variant' | 'variant-all'
    | 'key-unresolve' | 'key-delete'
    | 'key-unresolve-group' | 'key-delete-group'
    | 'key-unresolve-all' | 'key-delete-all'
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
  /** field_key for single-key operations (key-unresolve, key-delete). */
  readonly fieldKey?: string;
  /** field_keys for bulk key operations (group / all variants). */
  readonly fieldKeys?: readonly string[];
}
