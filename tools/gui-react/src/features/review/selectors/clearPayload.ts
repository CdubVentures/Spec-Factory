// Pure selector: builds the POST body for /clear-published from drawer state.
// Three scopes: variant-single, variant-all, scalar.

export interface BuildClearPayloadInput {
  productId: string;
  field: string;
  variantId?: string | null;
  allVariants?: boolean;
}

export interface ClearPayloadBody {
  productId: string;
  field: string;
  variantId?: string;
  allVariants?: boolean;
}

export function buildClearPayload(input: BuildClearPayloadInput): ClearPayloadBody {
  const hasVariantId = typeof input.variantId === 'string' && input.variantId.length > 0;
  const hasAllVariants = input.allVariants === true;
  if (hasVariantId && hasAllVariants) {
    throw new Error('buildClearPayload: variantId and allVariants are mutually exclusive');
  }
  const body: ClearPayloadBody = { productId: input.productId, field: input.field };
  if (hasVariantId) body.variantId = input.variantId as string;
  if (hasAllVariants) body.allVariants = true;
  return body;
}
