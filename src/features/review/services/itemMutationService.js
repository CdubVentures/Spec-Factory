import {
  firstFiniteNumber,
  resolveSpecDbOrError,
  routeMatches,
} from '../api/routeSharedHelpers.js';

export function resolveGridLaneStateForMutation({
  specDb,
  category,
  body,
  resolveKeyReviewForLaneMutation,
}) {
  const stateCtx = resolveKeyReviewForLaneMutation(specDb, category, body);
  if (stateCtx?.error) {
    return {
      stateCtx: null,
      stateRow: null,
      error: {
        status: 400,
        payload: { error: stateCtx.error, message: stateCtx.errorMessage },
      },
    };
  }
  const stateRow = stateCtx?.stateRow;
  if (!stateRow) {
    return {
      stateCtx,
      stateRow: null,
      error: {
        status: 404,
        payload: {
          error: 'key_review_state_not_found',
          message: 'Provide id or itemFieldStateId.',
        },
      },
    };
  }
  if (String(stateRow.target_kind || '') !== 'grid_key') {
    return {
      stateCtx,
      stateRow,
      error: {
        status: 400,
        payload: {
          error: 'lane_context_mismatch',
          message: 'Review lane endpoint only supports grid_key context. Use component/enum lane endpoints for shared review.',
        },
      },
    };
  }
  return { stateCtx, stateRow, error: null };
}

export function resolveGridLaneCandidate({
  specDb,
  candidateId,
  stateRow,
}) {
  const candidateRow = specDb.getCandidateById(candidateId);
  if (!candidateRow) {
    return {
      candidateRow: null,
      persistedCandidateId: null,
      error: {
        status: 404,
        payload: {
          error: 'candidate_not_found',
          message: `candidate_id '${candidateId}' was not found.`,
        },
      },
    };
  }
  if (
    String(candidateRow.product_id || '') !== String(stateRow.item_identifier || '')
    || String(candidateRow.field_key || '') !== String(stateRow.field_key || '')
  ) {
    return {
      candidateRow: null,
      persistedCandidateId: null,
      error: {
        status: 400,
        payload: {
          error: 'candidate_context_mismatch',
          message: `candidate_id '${candidateId}' does not belong to ${stateRow.item_identifier}/${stateRow.field_key}`,
        },
      },
    };
  }
  return {
    candidateRow,
    persistedCandidateId: String(candidateRow.candidate_id || candidateId).trim(),
    error: null,
  };
}

export function resolvePrimaryConfirmItemFieldStateId({
  stateRow,
  stateCtx,
  body,
}) {
  return Number.parseInt(String(
    stateRow.item_field_state_id
    ?? stateCtx?.fieldStateRow?.id
    ?? body?.itemFieldStateId
    ?? body?.item_field_state_id
    ?? '',
  ), 10);
}

export function updateKeyReviewSelectedCandidate({
  specDb,
  stateId,
  candidateId,
  selectedValue,
  selectedScore,
}) {
  specDb.db.prepare(`
    UPDATE key_review_state
    SET selected_candidate_id = ?,
        selected_value = ?,
        confidence_score = COALESCE(?, confidence_score),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    candidateId,
    selectedValue,
    selectedScore,
    stateId
  );
}

export async function resolveItemLaneCandidateMutationRequest({
  req,
  category,
  readJsonBody,
  getSpecDb,
  resolveKeyReviewForLaneMutation,
  candidateRequiredMessage,
}) {
  const body = await readJsonBody(req);
  const lane = String(body?.lane || '').trim().toLowerCase();
  const candidateId = String(body?.candidateId || body?.candidate_id || '').trim();
  if (!['primary', 'shared'].includes(lane)) {
    return {
      error: { status: 400, payload: { error: 'lane (primary|shared) required' } },
    };
  }
  const specDbResolution = resolveSpecDbOrError({ getSpecDb, category });
  if (specDbResolution.error) {
    return { error: specDbResolution.error };
  }
  const specDb = specDbResolution.specDb;

  const stateResolution = resolveGridLaneStateForMutation({
    specDb,
    category,
    body,
    resolveKeyReviewForLaneMutation,
  });
  if (stateResolution.error) {
    return { error: stateResolution.error };
  }
  const { stateCtx, stateRow } = stateResolution;

  if (!candidateId) {
    return {
      error: {
        status: 400,
        payload: {
          error: 'candidate_id_required',
          message: candidateRequiredMessage,
        },
      },
    };
  }
  const candidateResolution = resolveGridLaneCandidate({
    specDb,
    candidateId,
    stateRow,
  });
  if (candidateResolution.error) {
    return { error: candidateResolution.error };
  }

  return {
    error: null,
    body,
    lane,
    candidateId,
    specDb,
    stateCtx,
    stateRow,
    candidateRow: candidateResolution.candidateRow,
    persistedCandidateId: candidateResolution.persistedCandidateId,
  };
}

export function setItemFieldNeedsAiReview(specDb, category, itemFieldStateId) {
  try {
    specDb.db.prepare(`
      UPDATE item_field_state
      SET needs_ai_review = 1,
          ai_review_complete = 0,
          updated_at = datetime('now')
      WHERE category = ? AND id = ?
    `).run(category, itemFieldStateId);
  } catch { /* best-effort */ }
}

export function applyPrimaryItemConfirmLane({
  specDb,
  category,
  stateRow,
  stateProductId,
  stateFieldKey,
  stateItemFieldStateId,
  persistedCandidateId,
  candidateScore,
  candidateConfidence,
  getPendingItemPrimaryCandidateIds,
  markPrimaryLaneReviewedInItemState,
}) {
  const now = new Date().toISOString();
  specDb.upsertReview({
    candidateId: persistedCandidateId,
    contextType: 'item',
    contextId: String(stateItemFieldStateId),
    humanAccepted: false,
    humanAcceptedAt: null,
    aiReviewStatus: 'accepted',
    aiConfidence: firstFiniteNumber([
      candidateConfidence,
      candidateScore,
    ], 1.0),
    aiReason: 'primary_confirm',
    aiReviewedAt: now,
    aiReviewModel: null,
    humanOverrideAi: false,
    humanOverrideAiAt: null,
  });
  const pendingCandidateIds = getPendingItemPrimaryCandidateIds(specDb, {
    productId: stateProductId,
    fieldKey: stateFieldKey,
    itemFieldStateId: stateItemFieldStateId,
  });
  const nextPrimaryStatus = pendingCandidateIds.length > 0 ? 'pending' : 'confirmed';
  specDb.updateKeyReviewAiConfirm({
    id: stateRow.id,
    lane: 'primary',
    status: nextPrimaryStatus,
    confidence: nextPrimaryStatus === 'confirmed' ? 1.0 : null,
    at: now,
  });
  if (nextPrimaryStatus === 'confirmed') {
    const refreshedState = specDb.db.prepare('SELECT * FROM key_review_state WHERE id = ?').get(stateRow.id) || stateRow;
    markPrimaryLaneReviewedInItemState(specDb, category, refreshedState);
  } else {
    setItemFieldNeedsAiReview(specDb, category, stateItemFieldStateId);
  }
  const updated = specDb.db.prepare('SELECT * FROM key_review_state WHERE id = ?').get(stateRow.id);
  return {
    now,
    pendingCandidateIds,
    nextPrimaryStatus,
    updated,
  };
}

export function applyLaneCandidateSelection({
  specDb,
  stateRow,
  candidateId,
  candidateRow,
  isMeaningfulValue,
  unknownValueMessage,
}) {
  const selectedValue = candidateRow.value ?? null;
  const selectedScore = firstFiniteNumber([candidateRow?.score], null);
  updateKeyReviewSelectedCandidate({
    specDb,
    stateId: stateRow.id,
    candidateId,
    selectedValue,
    selectedScore,
  });
  if (!isMeaningfulValue(selectedValue)) {
    return {
      error: {
        status: 400,
        payload: {
          error: 'unknown_value_not_actionable',
          message: unknownValueMessage,
        },
      },
    };
  }
  return {
    error: null,
    selectedValue,
    selectedScore,
  };
}

export function applyLaneDecisionStatusAndAudit({
  specDb,
  stateRow,
  lane,
  decision,
  candidateId = null,
}) {
  const now = new Date().toISOString();
  if (decision === 'confirm') {
    specDb.updateKeyReviewAiConfirm({ id: stateRow.id, lane, status: 'confirmed', confidence: 1.0, at: now });
    specDb.insertKeyReviewAudit({
      keyReviewStateId: stateRow.id,
      eventType: 'ai_confirm',
      actorType: 'user',
      actorId: null,
      oldValue: lane === 'shared'
        ? (stateRow.ai_confirm_shared_status || 'pending')
        : (stateRow.ai_confirm_primary_status || 'pending'),
      newValue: 'confirmed',
      reason: `User confirmed ${lane} lane via GUI`,
    });
  } else {
    specDb.updateKeyReviewUserAccept({ id: stateRow.id, lane, status: 'accepted', at: now });
    specDb.insertKeyReviewAudit({
      keyReviewStateId: stateRow.id,
      eventType: 'user_accept',
      actorType: 'user',
      actorId: null,
      oldValue: null,
      newValue: 'accepted',
      reason: `User accepted ${lane} lane via GUI${candidateId ? ` for candidate ${candidateId}` : ''}`,
    });
  }
  const updated = specDb.db.prepare('SELECT * FROM key_review_state WHERE id = ?').get(stateRow.id);
  return {
    now,
    updated,
  };
}

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
          error: 'item_field_state_id_required',
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

export async function applyItemManualOverrideAndSync({
  storage,
  config,
  setManualOverride,
  syncPrimaryLaneAcceptFromItemSelection,
  specDb,
  category,
  productId,
  field,
  value,
  reviewer,
  reason,
  evidence,
  syncReason,
}) {
  const result = await setManualOverride({
    storage,
    config,
    category,
    productId,
    field,
    value: String(value),
    reviewer,
    reason,
    evidence,
    specDb,
  });
  if (specDb) {
    syncPrimaryLaneAcceptFromItemSelection({
      specDb,
      category,
      productId,
      fieldKey: field,
      selectedCandidateId: null,
      selectedValue: result?.value ?? value ?? null,
      confidenceScore: 1.0,
      reason: syncReason,
    });
  }
  return result;
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
