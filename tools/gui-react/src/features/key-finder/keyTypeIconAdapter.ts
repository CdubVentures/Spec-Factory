// WHY: Adapter from a keyFinder summary row (or its derived KeyEntry) to the
// shape deriveKeyTypeIcons / deriveOwningComponent expect. The keyFinder
// payload doesn't ship the raw rule object — it carries targeted lineage
// signals (component_run_kind, component_parent_key, belongs_to_component).
// Synthesize a rule-shaped object so the shared icon predicate runs unchanged
// across every keyFinder consumer (KeyRow, KeyTierPopover, future surfaces).

import type { ComponentRunKind } from './types.ts';

/**
 * Structural shape both KeyFinderSummaryRow and KeyEntry satisfy. Lets the
 * adapter operate on either without forcing a runtime cast.
 */
export interface KeyFinderRowLike {
  readonly field_key: string;
  readonly variant_dependent: boolean;
  readonly product_image_dependent: boolean;
  readonly component_run_kind?: ComponentRunKind;
  readonly component_parent_key?: string;
  readonly belongs_to_component?: string;
}

export interface KeyTypeIconInput {
  readonly rule: Record<string, unknown>;
  readonly fieldKey: string;
  readonly belongsToComponent: string;
}

export function buildKeyTypeIconInput(row: KeyFinderRowLike): KeyTypeIconInput {
  const rule: Record<string, unknown> = {
    variant_dependent: row.variant_dependent,
    product_image_dependent: row.product_image_dependent,
  };
  if (row.component_run_kind === 'component') {
    rule.enum = { source: `component_db.${row.field_key}` };
  } else if (
    row.component_run_kind === 'component_brand'
    || row.component_run_kind === 'component_link'
  ) {
    rule.component_identity_projection = {
      component_type: row.component_parent_key || '',
      facet: row.component_run_kind === 'component_brand' ? 'brand' : 'link',
    };
  }
  return {
    rule,
    fieldKey: row.field_key,
    belongsToComponent: row.belongs_to_component || '',
  };
}
