import {
  resolveSpecDbOrError,
  routeMatches,
} from '../api/routeSharedHelpers.js';

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
