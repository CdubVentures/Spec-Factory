import {
  jsonResIfError,
  routeMatches,
  runHandledRouteChain,
  sendDataChangeResponse,
} from './routeSharedHelpers.js';

import {
  resolveGridLaneStateForMutation,
  resolveGridLaneCandidate,
  resolvePrimaryConfirmItemFieldStateId,
  updateKeyReviewSelectedCandidate,
  resolveItemLaneCandidateMutationRequest,
  setItemFieldNeedsAiReview,
  applyPrimaryItemConfirmLane,
  applyLaneCandidateSelection,
  applyLaneDecisionStatusAndAudit,
  resolveItemFieldMutationRequest,
  applyItemManualOverrideAndSync,
  buildManualOverrideEvidence,
  resolveItemOverrideMode,
} from '../services/itemMutationService.js';

// Re-export for characterization tests and any external consumers
export {
  resolveGridLaneStateForMutation,
  resolveGridLaneCandidate,
  resolvePrimaryConfirmItemFieldStateId,
  updateKeyReviewSelectedCandidate,
  resolveItemLaneCandidateMutationRequest,
  setItemFieldNeedsAiReview,
  applyPrimaryItemConfirmLane,
  applyLaneCandidateSelection,
  applyLaneDecisionStatusAndAudit,
  resolveItemFieldMutationRequest,
  applyItemManualOverrideAndSync,
  buildManualOverrideEvidence,
  resolveItemOverrideMode,
};

async function handleReviewItemOverrideMutationEndpoint({
  parts,
  method,
  req,
  res,
  context,
}) {
  const {
    storage,
    config,
    readJsonBody,
    jsonRes,
    getSpecDb,
    resolveGridFieldStateForMutation,
    setOverrideFromCandidate,
    setManualOverride,
    syncPrimaryLaneAcceptFromItemSelection,
    broadcastWs,
  } = context || {};
  const category = parts[1];
  const mode = resolveItemOverrideMode(parts, method);
  if (!mode) return false;

  const body = await readJsonBody(req);
  const { candidateId, value, reason, reviewer } = body;
  if (mode === 'manual-override' && (value === undefined || String(value).trim() === '')) {
    jsonRes(res, 400, { error: 'value_required', message: 'manual-override requires value' });
    return true;
  }
  const fieldRequest = resolveItemFieldMutationRequest({
    getSpecDb,
    resolveGridFieldStateForMutation,
    category,
    body,
    missingSlotMessage: mode === 'manual-override'
      ? 'Valid itemFieldStateId is required for manual override.'
      : 'Valid itemFieldStateId is required for review override.',
  });
  if (jsonResIfError({ jsonRes, res, error: fieldRequest.error })) return true;
  const { specDb, productId, field } = fieldRequest;

  try {
    const normalizedCandidateId = String(candidateId || '').trim();
    if (mode === 'override' && normalizedCandidateId) {
      const result = await setOverrideFromCandidate({
        storage,
        config,
        category,
        productId,
        field,
        candidateId: normalizedCandidateId,
        candidateValue: value ?? body?.candidateValue ?? body?.candidate_value ?? null,
        candidateScore: body?.candidateConfidence ?? body?.candidate_confidence ?? null,
        candidateSource: body?.candidateSource ?? body?.candidate_source ?? '',
        candidateMethod: body?.candidateMethod ?? body?.candidate_method ?? '',
        candidateTier: body?.candidateTier ?? body?.candidate_tier ?? null,
        candidateEvidence: body?.candidateEvidence ?? body?.candidate_evidence ?? null,
        reviewer,
        reason,
        specDb,
      });
      if (specDb) {
        syncPrimaryLaneAcceptFromItemSelection({
          specDb,
          category,
          productId,
          fieldKey: field,
          selectedCandidateId: result?.candidate_id || normalizedCandidateId,
          selectedValue: result?.value ?? body?.candidateValue ?? body?.candidate_value ?? value ?? null,
          confidenceScore: body?.candidateConfidence ?? body?.candidate_confidence ?? null,
          reason: `User accepted primary lane via item override${normalizedCandidateId ? ` (${normalizedCandidateId})` : ''}`,
        });
      }
      return sendDataChangeResponse({
        jsonRes,
        res,
        broadcastWs,
        eventType: 'review-override',
        category,
        broadcastExtra: { productId, field },
        payload: { result },
      });
    }
    if (value === undefined || String(value).trim() === '') {
      jsonRes(res, 400, { error: 'invalid_override_request', message: 'Provide candidateId or value.' });
      return true;
    }

    const manualEvidence = buildManualOverrideEvidence({ mode, value, body });
    const result = await applyItemManualOverrideAndSync({
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
      evidence: manualEvidence,
      syncReason: mode === 'manual-override'
        ? 'User manually set item value via manual-override endpoint'
        : 'User manually set item value via review override',
    });
    return sendDataChangeResponse({
      jsonRes,
      res,
      broadcastWs,
      eventType: 'review-manual-override',
      category,
      broadcastExtra: { productId, field },
      payload: { result },
    });
  } catch (err) {
    jsonRes(res, 500, {
      error: mode === 'manual-override' ? 'manual_override_failed' : 'override_failed',
      message: err.message,
    });
    return true;
  }
}

async function handleItemKeyReviewDecisionEndpoint({
  parts,
  method,
  req,
  res,
  context,
  action,
  decision,
  candidateRequiredMessage,
  unknownValueMessage,
  failureErrorCode,
}) {
  const {
    readJsonBody,
    jsonRes,
    getSpecDb,
    resolveKeyReviewForLaneMutation,
    getPendingItemPrimaryCandidateIds,
    markPrimaryLaneReviewedInItemState,
    syncItemFieldStateFromPrimaryLaneAccept,
    isMeaningfulValue,
    propagateSharedLaneDecision,
    broadcastWs,
  } = context || {};
  const category = parts[1];

  if (!routeMatches({ parts, method, scope: 'review', action })) {
    return false;
  }

  try {
    const laneRequest = await resolveItemLaneCandidateMutationRequest({
      req,
      category,
      readJsonBody,
      getSpecDb,
      resolveKeyReviewForLaneMutation,
      candidateRequiredMessage,
    });
    if (jsonResIfError({ jsonRes, res, error: laneRequest.error })) return true;
    const {
      body,
      lane,
      candidateId,
      specDb,
      stateCtx,
      stateRow,
      candidateRow,
      persistedCandidateId,
    } = laneRequest;

    if (decision === 'confirm' && lane === 'primary') {
      const stateProductId = String(stateRow.item_identifier || '').trim();
      const stateFieldKey = String(stateRow.field_key || '').trim();
      const stateItemFieldStateId = resolvePrimaryConfirmItemFieldStateId({
        stateRow,
        stateCtx,
        body,
      });
      if (!Number.isFinite(stateItemFieldStateId) || stateItemFieldStateId <= 0) {
        jsonRes(res, 400, {
          error: 'item_field_state_id_required',
          message: 'Valid itemFieldStateId is required for candidate-scoped item confirm.',
        });
        return true;
      }
      const { pendingCandidateIds, updated } = applyPrimaryItemConfirmLane({
        specDb,
        category,
        stateRow,
        stateProductId,
        stateFieldKey,
        stateItemFieldStateId,
        persistedCandidateId,
        candidateScore: candidateRow?.score,
        candidateConfidence: body?.candidateConfidence,
        getPendingItemPrimaryCandidateIds,
        markPrimaryLaneReviewedInItemState,
      });
      return sendDataChangeResponse({
        jsonRes,
        res,
        broadcastWs,
        eventType: action,
        category,
        broadcastExtra: { id: stateRow.id, lane },
        payload: {
          keyReviewState: updated,
          pendingPrimaryCandidateIds: pendingCandidateIds,
          confirmedCandidateId: persistedCandidateId,
        },
      });
    }

    const selection = applyLaneCandidateSelection({
      specDb,
      stateRow,
      candidateId,
      candidateRow,
      isMeaningfulValue,
      unknownValueMessage,
    });
    if (jsonResIfError({ jsonRes, res, error: selection.error })) return true;
    const { updated } = applyLaneDecisionStatusAndAudit({
      specDb,
      stateRow,
      lane,
      decision,
      candidateId: decision === 'accept' ? candidateId : null,
    });
    if (decision === 'accept') {
      if (lane === 'primary') {
        syncItemFieldStateFromPrimaryLaneAccept(specDb, category, updated);
      }
      if (lane === 'shared') {
        await propagateSharedLaneDecision({
          category,
          specDb,
          keyReviewState: updated,
          laneAction: 'accept',
          candidateValue: selection.selectedValue,
        });
      }
    }
    return sendDataChangeResponse({
      jsonRes,
      res,
      broadcastWs,
      eventType: action,
      category,
      broadcastExtra: { id: stateRow.id, lane },
      payload: { keyReviewState: updated },
    });
  } catch (err) {
    jsonRes(res, 500, { error: failureErrorCode, message: err.message });
    return true;
  }
}

async function handleReviewItemKeyReviewConfirmEndpoint(args) {
  return handleItemKeyReviewDecisionEndpoint({
    ...args,
    action: 'key-review-confirm',
    decision: 'confirm',
    candidateRequiredMessage: 'candidateId is required for candidate-scoped AI confirm.',
    unknownValueMessage: 'Cannot confirm AI review for unknown/empty selected values.',
    failureErrorCode: 'confirm_failed',
  });
}

async function handleReviewItemKeyReviewAcceptEndpoint(args) {
  return handleItemKeyReviewDecisionEndpoint({
    ...args,
    action: 'key-review-accept',
    decision: 'accept',
    candidateRequiredMessage: 'candidateId is required for candidate-scoped accept.',
    unknownValueMessage: 'Cannot accept unknown/empty selected values.',
    failureErrorCode: 'accept_failed',
  });
}

export async function handleReviewItemMutationRoute({
  parts,
  method,
  req,
  res,
  context,
}) {
  if (!Array.isArray(parts) || parts[0] !== 'review' || !parts[1]) {
    return false;
  }
  return runHandledRouteChain({
    handlers: [
      handleReviewItemOverrideMutationEndpoint,
      handleReviewItemKeyReviewConfirmEndpoint,
      handleReviewItemKeyReviewAcceptEndpoint,
    ],
    args: { parts, method, req, res, context },
  });
}
