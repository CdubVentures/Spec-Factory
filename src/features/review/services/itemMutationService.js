import {
  resolveSpecDbOrError,
  routeMatches,
} from '../api/routeSharedHelpers.js';
import {
  getFinderModuleForField,
  isVariantDependentField,
} from '../../../core/finder/finderModuleRegistry.js';
import { parseList } from '../../publisher/validation/normalizers.js';

export function resolveItemFieldMutationRequest({
  getSpecDb,
  resolveGridFieldStateForMutation,
  category,
  body,
  missingSlotMessage,
}) {
  const specDb = getSpecDb(category);
  const fieldStateCtx = resolveGridFieldStateForMutation(specDb, category, body);
  if (fieldStateCtx?.error) {
    return {
      error: {
        status: 400,
        payload: { error: fieldStateCtx.error, message: fieldStateCtx.errorMessage },
      },
    };
  }
  const fieldStateRow = fieldStateCtx?.row;
  const productId = String(fieldStateRow?.product_id || '').trim();
  const field = String(fieldStateRow?.field_key || '').trim();
  if (!productId || !field) {
    return {
      error: {
        status: 400,
        payload: {
          error: 'product_and_field_required',
          message: missingSlotMessage,
        },
      },
    };
  }
  return {
    error: null,
    specDb,
    productId,
    field,
  };
}

// WHY: Override variantId contract lives here so the validator is testable
// in isolation and the route handler stays a thin adapter. Called for both
// candidate-override and manual-override; rejected cases are 400.
export function validateOverrideVariantContract({ fieldKey, variantId, specDb }) {
  const mod = getFinderModuleForField(fieldKey);
  if (mod?.moduleClass === 'variantGenerator') {
    return {
      error: {
        status: 400,
        payload: {
          error: 'override_not_allowed',
          message: `${fieldKey} is a variant generator — CEF is authoritative. Override via CEF inputs instead.`,
        },
      },
    };
  }
  const isVariantDep = isVariantDependentField(fieldKey, specDb);
  const hasVariantId = typeof variantId === 'string' && variantId.length > 0;
  if (isVariantDep && !hasVariantId) {
    return {
      error: {
        status: 400,
        payload: {
          error: 'variant_id_required',
          message: `${fieldKey} is variant-dependent — variantId is required.`,
        },
      },
    };
  }
  if (!isVariantDep && hasVariantId) {
    return {
      error: {
        status: 400,
        payload: {
          error: 'variant_id_not_allowed',
          message: `${fieldKey} is not variant-dependent — variantId must be omitted.`,
        },
      },
    };
  }
  return { error: null };
}

// WHY: For list-shaped fields (contract.list_rules.item_union === 'set_union'),
// GUI submits a comma-separated string; server splits into array before
// submitCandidate validates shape. Scalars and already-array values pass
// through unchanged. Winner_only list rules are single-value — do not split.
export function normalizeOverrideValue({ value, fieldRule }) {
  const itemUnion = fieldRule?.contract?.list_rules?.item_union;
  if (itemUnion !== 'set_union') return value;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;
  return parseList(value);
}

// WHY: Clear-published scope validator — exactly one of (variantId, allVariants)
// when the field is variant-dependent; neither when it's scalar.
export function validateClearPublishedScope({ fieldKey, variantId, allVariants, specDb }) {
  const isVariantDep = isVariantDependentField(fieldKey, specDb);
  const hasVariantId = typeof variantId === 'string' && variantId.length > 0;
  const hasAllVariants = allVariants === true;
  if (hasVariantId && hasAllVariants) {
    return {
      error: {
        status: 400,
        payload: {
          error: 'variant_clear_scope_conflict',
          message: 'variantId and allVariants are mutually exclusive.',
        },
      },
    };
  }
  if (!isVariantDep && hasVariantId) {
    return {
      error: {
        status: 400,
        payload: {
          error: 'variant_id_not_allowed',
          message: `${fieldKey} is not variant-dependent — variantId must be omitted.`,
        },
      },
    };
  }
  if (!isVariantDep && hasAllVariants) {
    return {
      error: {
        status: 400,
        payload: {
          error: 'all_variants_not_allowed',
          message: `${fieldKey} is not variant-dependent — allVariants must be omitted.`,
        },
      },
    };
  }
  if (isVariantDep && !hasVariantId && !hasAllVariants) {
    return {
      error: {
        status: 400,
        payload: {
          error: 'variant_clear_scope_required',
          message: `${fieldKey} is variant-dependent — provide variantId or allVariants:true.`,
        },
      },
    };
  }
  return { error: null };
}

export function buildManualOverrideEvidence({ mode, value, body }) {
  if (mode === 'manual-override') {
    return {
      url: String(body?.evidenceUrl || 'gui://manual-entry'),
      quote: String(body?.evidenceQuote || `Manually set to "${String(value)}" via GUI`),
      source_id: null,
      retrieved_at: new Date().toISOString(),
    };
  }
  return {
    url: 'gui://manual-entry',
    quote: `Manually set to "${String(value)}" via GUI`,
  };
}

export function resolveItemOverrideMode(parts, method) {
  if (routeMatches({ parts, method, scope: 'review', action: 'override' })) {
    return 'override';
  }
  if (routeMatches({ parts, method, scope: 'review', action: 'manual-override' })) {
    return 'manual-override';
  }
  return null;
}
