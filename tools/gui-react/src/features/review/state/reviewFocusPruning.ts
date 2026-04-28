import type { FieldState } from '../../../types/review.ts';

export interface ReviewActiveCell {
  readonly productId: string;
  readonly field: string;
}

export interface ReviewFocusProduct {
  readonly product_id: string;
  readonly fields: Readonly<Record<string, FieldState>>;
}

export type ReviewFocusPruneReason = 'product-deleted' | 'field-deleted';

export interface ReviewFocusPruneNotice {
  readonly title: string;
  readonly message: string;
}

export interface ReviewFocusPruneResult {
  readonly shouldClose: boolean;
  readonly reason?: ReviewFocusPruneReason;
  readonly notice?: ReviewFocusPruneNotice;
}

export interface ReviewFocusPruneInput {
  readonly activeCell: ReviewActiveCell | null;
  readonly products: readonly ReviewFocusProduct[];
  readonly fieldLabel: string;
}

function fieldLabelOrKey(activeCell: ReviewActiveCell, fieldLabel: string): string {
  const label = fieldLabel.trim();
  return label || activeCell.field;
}

export function resolveReviewFocusPrune(input: ReviewFocusPruneInput): ReviewFocusPruneResult {
  const { activeCell, products } = input;
  if (!activeCell) return { shouldClose: false };

  const activeProduct = products.find((product) => product.product_id === activeCell.productId);
  if (!activeProduct) {
    return {
      shouldClose: true,
      reason: 'product-deleted',
      notice: {
        title: 'Review drawer closed',
        message: 'The selected product was deleted.',
      },
    };
  }

  if (Object.prototype.hasOwnProperty.call(activeProduct.fields, activeCell.field)) {
    return { shouldClose: false };
  }

  return {
    shouldClose: true,
    reason: 'field-deleted',
    notice: {
      title: 'Review drawer closed',
      message: `${fieldLabelOrKey(activeCell, input.fieldLabel)} was deleted for the selected product.`,
    },
  };
}
