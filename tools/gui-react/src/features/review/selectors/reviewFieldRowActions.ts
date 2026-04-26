import type { DeleteTarget } from '../../../shared/ui/finder/types.ts';
import { isVariantGeneratorField } from './overrideFormState.ts';

export type ReviewFieldRowActionKind = 'unpublish-all' | 'delete-all';

export interface ReviewFieldRowAction {
  readonly kind: ReviewFieldRowActionKind;
  readonly label: string;
}

export interface ReviewFieldRowActionStateInput {
  readonly fieldKey: string;
  readonly variantDependent?: boolean;
}

export interface ReviewFieldRowActionState {
  readonly variantIconVisible: boolean;
  readonly actions: readonly ReviewFieldRowAction[];
}

export interface ReviewFieldRowDeleteTargetInput {
  readonly action: ReviewFieldRowActionKind;
  readonly fieldKey: string;
  readonly productCount: number;
}

const SCALAR_ROW_ACTIONS: readonly ReviewFieldRowAction[] = Object.freeze([
  { kind: 'unpublish-all', label: 'Unpublish all' },
  { kind: 'delete-all', label: 'Delete all' },
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

export function buildReviewFieldRowDeleteTarget(input: ReviewFieldRowDeleteTargetInput): DeleteTarget {
  return {
    kind: input.action === 'unpublish-all' ? 'field-row-unpublish' : 'field-row-delete',
    fieldKey: input.fieldKey,
    count: input.productCount,
  };
}
