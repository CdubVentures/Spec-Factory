import type { DeleteTarget } from '../../../shared/ui/finder/types.ts';
import { isVariantGeneratorField } from './overrideFormState.ts';

export type ReviewFieldRowActionKind = 'unpublish-all' | 'delete-all';
export type ReviewProductHeaderActionKind = 'unpublish-non-variant-keys' | 'delete-non-variant-keys';

export interface ReviewFieldRowAction {
  readonly kind: ReviewFieldRowActionKind;
  readonly label: string;
}

export interface ReviewProductHeaderAction {
  readonly kind: ReviewProductHeaderActionKind;
  readonly label: string;
}

export interface ReviewFieldRowActionStateInput {
  readonly fieldKey: string;
  readonly variantDependent?: boolean;
}

export interface ReviewProductHeaderActionRow {
  readonly key: string;
  readonly field_rule?: {
    readonly variant_dependent?: boolean;
  };
}

export interface ReviewFieldRowActionState {
  readonly variantIconVisible: boolean;
  readonly actions: readonly ReviewFieldRowAction[];
}

export interface ReviewProductHeaderActionStateInput {
  readonly rows: readonly ReviewProductHeaderActionRow[];
}

export interface ReviewProductHeaderActionState {
  readonly fieldKeys: readonly string[];
  readonly fieldCount: number;
  readonly actions: readonly ReviewProductHeaderAction[];
}

export interface ReviewFieldRowDeleteTargetInput {
  readonly action: ReviewFieldRowActionKind;
  readonly fieldKey: string;
  readonly productCount: number;
}

export interface ReviewProductHeaderDeleteTargetInput {
  readonly action: ReviewProductHeaderActionKind;
  readonly productId: string;
  readonly productLabel: string;
  readonly fieldCount: number;
}

const SCALAR_ROW_ACTIONS: readonly ReviewFieldRowAction[] = Object.freeze([
  { kind: 'unpublish-all', label: 'Unpublish all' },
  { kind: 'delete-all', label: 'Delete all' },
]);

const PRODUCT_HEADER_ACTIONS: readonly ReviewProductHeaderAction[] = Object.freeze([
  { kind: 'unpublish-non-variant-keys', label: 'Unpublish keys' },
  { kind: 'delete-non-variant-keys', label: 'Delete key data' },
]);

export function isVariantOwnedReviewField(input: ReviewFieldRowActionStateInput): boolean {
  return input.variantDependent === true || isVariantGeneratorField(input.fieldKey);
}

export function deriveReviewFieldRowActionState(input: ReviewFieldRowActionStateInput): ReviewFieldRowActionState {
  const variantOwned = isVariantOwnedReviewField(input);
  return {
    variantIconVisible: variantOwned,
    actions: variantOwned ? [] : SCALAR_ROW_ACTIONS,
  };
}

export function deriveReviewProductHeaderActionState(input: ReviewProductHeaderActionStateInput): ReviewProductHeaderActionState {
  const fieldKeys = input.rows
    .filter((row) => !isVariantOwnedReviewField({
      fieldKey: row.key,
      variantDependent: row.field_rule?.variant_dependent === true,
    }))
    .map((row) => row.key);
  return {
    fieldKeys,
    fieldCount: fieldKeys.length,
    actions: fieldKeys.length > 0 ? PRODUCT_HEADER_ACTIONS : [],
  };
}

export function buildReviewFieldRowDeleteTarget(input: ReviewFieldRowDeleteTargetInput): DeleteTarget {
  return {
    kind: input.action === 'unpublish-all' ? 'field-row-unpublish' : 'field-row-delete',
    fieldKey: input.fieldKey,
    count: input.productCount,
  };
}

export function buildReviewProductHeaderDeleteTarget(input: ReviewProductHeaderDeleteTargetInput): DeleteTarget {
  return {
    kind: input.action === 'unpublish-non-variant-keys' ? 'product-nonvariant-unpublish' : 'product-nonvariant-delete',
    productId: input.productId,
    label: input.productLabel,
    count: input.fieldCount,
  };
}
