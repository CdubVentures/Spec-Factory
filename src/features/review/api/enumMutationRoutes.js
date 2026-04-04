import {
  createRouteResponder,
  firstFiniteNumber,
  prepareMutationContextRequest,
  respondIfError,
  routeMatches,
  runHandledRouteChain,
  sendDataChangeResponse,
} from './routeSharedHelpers.js';

import {
  validateEnumCandidate,
  applyEnumSharedLaneState,
  applyEnumSharedLaneWithResolvedConfidence,
  upsertEnumListValueAndFetch,
  resolveEnumPreAffectedProductIds,
  resolveEnumRequiredCandidate,
} from '../services/enumMutationService.js';

// Re-export for characterization tests and any external consumers
export {
  validateEnumCandidate,
  applyEnumSharedLaneState,
  applyEnumSharedLaneWithResolvedConfidence,
  upsertEnumListValueAndFetch,
  resolveEnumPreAffectedProductIds,
  resolveEnumRequiredCandidate,
};

async function handleEnumOverrideEndpoint({
  parts,
  method,
  req,
  res,
  context,
}) {
  const {
    readJsonBody,
    jsonRes,
    getSpecDbReady,
    resolveEnumMutationContext,
    isMeaningfulValue,
    normalizeLower,
    applySharedLaneState,
    specDbCache,
    storage,
    outputRoot,
    cascadeEnumChange,
    loadQueueState,
    saveQueueState,
    isReviewFieldPathEnabled,
    broadcastWs,
  } = context || {};
  const respond = createRouteResponder(jsonRes, res);

  // Enum value override (add/remove/accept/confirm) - SQL-first runtime path
  if (routeMatches({ parts, method, scope: 'review-components', action: 'enum-override' })) {
    const preparedMutation = await prepareMutationContextRequest({
      parts,
      req,
      readJsonBody,
      getSpecDbReady,
      resolveContext: resolveEnumMutationContext,
      resolveContextArgs: ({ runtimeSpecDb, category, body }) => {
        const action = String(body?.action || '').trim().toLowerCase() || 'add';
        return [runtimeSpecDb, category, body, {
          requireEnumListId: action === 'add',
          requireListValueId: action === 'remove' || action === 'accept' || action === 'confirm',
        }];
      },
    });
    if (respondIfError(respond, preparedMutation.error)) {
      return true;
    }
    const {
      category,
      body,
      runtimeSpecDb,
      context: enumCtx,
    } = preparedMutation;
    const action = String(body?.action || '').trim().toLowerCase() || 'add'; // 'add' | 'remove' | 'accept' | 'confirm'
    const { candidateId, candidateSource } = body;
    const field = String(enumCtx?.field || '').trim();
    const value = String(enumCtx?.value || '').trim();
    const listValueId = enumCtx?.listValueId ?? null;
    if (!field) return respond(400, { error: 'field required' });
    if (!value) return respond(400, { error: 'value required' });
    if (typeof isReviewFieldPathEnabled === 'function') {
      const enabled = await isReviewFieldPathEnabled({
        category,
        fieldKey: field,
        fieldPath: 'enum.source',
      });
      if (!enabled) {
        return respond(403, {
          error: 'review_consumer_disabled',
          message: `Review consumer disabled for enum.source on field '${field}'.`,
          field,
          field_path: 'enum.source',
        });
      }
    }

    // SQL-first runtime path (known_values writes removed from write path)
    try {
      const normalized = String(value).trim().toLowerCase();
      const nowIso = new Date().toISOString();
      const requestedCandidateId = String(candidateId || '').trim() || null;
      let requestedCandidateRow = null;
      const candidateRequiredError = resolveEnumRequiredCandidate({
        action,
        requestedCandidateId,
        requestedCandidateRow,
      });
      if (candidateRequiredError) {
        return respond(candidateRequiredError.status, candidateRequiredError.payload);
      }
      let acceptedCandidateId = requestedCandidateRow ? requestedCandidateId : null;
      const sourceToken = String(candidateSource || '').trim().toLowerCase();
      const priorValue = String(enumCtx?.oldValue || '').trim();
      const normalizedPrior = priorValue.toLowerCase();
      let cascadeAction = null;
      let cascadeValue = value;
      let cascadeNewValue = null;
      let cascadePreAffectedProductIds = [];

      if (action === 'remove') {
        cascadePreAffectedProductIds = resolveEnumPreAffectedProductIds(runtimeSpecDb, listValueId);
        runtimeSpecDb.deleteListValueById(listValueId);
        cascadeAction = 'remove';
        cascadeValue = value;
      } else if (action === 'accept') {
        const resolvedValue = value;
        if (!isMeaningfulValue(resolvedValue)) {
          return respond(400, {
            error: 'unknown_value_not_actionable',
            message: 'Cannot accept unknown/empty enum values.',
          });
        }
        const normalizedResolved = resolvedValue.toLowerCase();
        const isRenameAccept = Boolean(priorValue) && normalizedPrior !== normalizedResolved;
        if (acceptedCandidateId && requestedCandidateRow) {
          const candidateValidationError = validateEnumCandidate({
            candidateRow: requestedCandidateRow,
            candidateId: acceptedCandidateId,
            field,
            resolvedValue,
            isMeaningfulValue,
          normalizeLower,
          valueMismatchMessage: `candidate_id '${acceptedCandidateId}' value does not match enum value '${resolvedValue}'.`,
          allowValueMismatch: isRenameAccept,
        });
          if (candidateValidationError) {
            return respond(400, candidateValidationError);
          }
        }
        const oldLv = isRenameAccept
          ? runtimeSpecDb.getListValueById(listValueId)
          : null;
        if (isRenameAccept && oldLv) {
          cascadePreAffectedProductIds = oldLv?.id
            ? (runtimeSpecDb.renameListValueById(oldLv.id, resolvedValue, nowIso) || [])
            : (runtimeSpecDb.renameListValue(field, priorValue, resolvedValue, nowIso) || []);
          cascadeAction = 'rename';
          cascadeValue = priorValue;
          cascadeNewValue = resolvedValue;
        }
        const existingLv = runtimeSpecDb.getListValueByFieldAndValue(field, resolvedValue);
        const existingState = runtimeSpecDb.getKeyReviewState({
          category,
          targetKind: 'enum_key',
          fieldKey: field,
          enumValueNorm: normalizedResolved,
          listValueId: existingLv?.id ?? null,
        });
        const priorState = isRenameAccept
          ? runtimeSpecDb.getKeyReviewState({
            category,
            targetKind: 'enum_key',
            fieldKey: field,
            enumValueNorm: normalizedPrior,
            listValueId: oldLv?.id ?? null,
          })
          : null;
        const existingStateStatus = String(existingState?.ai_confirm_shared_status || '').trim().toLowerCase();
        const priorStateStatus = String(priorState?.ai_confirm_shared_status || '').trim().toLowerCase();
        const keepNeedsReview = existingStateStatus === 'pending'
          || priorStateStatus === 'pending'
          || Boolean(existingLv?.needs_review)
          || Boolean(oldLv?.needs_review);
        const selectedSource = String(
          existingLv?.source
          || oldLv?.source
          || 'pipeline'
        );
        const resolvedCandidateId = acceptedCandidateId;
        const resolvedLv = upsertEnumListValueAndFetch({
          runtimeSpecDb,
          field,
          value: resolvedValue,
          normalizedValue: normalized,
          upsertValues: {
            source: selectedSource,
            overridden: false,
            needsReview: keepNeedsReview,
            sourceTimestamp: nowIso,
            acceptedCandidateId: resolvedCandidateId,
          },
        });
        applyEnumSharedLaneWithResolvedConfidence({
          runtimeSpecDb,
          applySharedLaneState,
          category,
          field,
          normalizedValue: normalized,
          listValueRow: resolvedLv,
          selectedCandidateId: resolvedCandidateId,
          selectedValue: resolvedValue,
          laneAction: 'accept',
          nowIso,
        });
      } else if (action === 'confirm') {
        const resolvedValue = value;
        if (!isMeaningfulValue(resolvedValue)) {
          return respond(400, {
            error: 'unknown_value_not_actionable',
            message: 'Cannot confirm unknown/empty enum values.',
          });
        }
        if (requestedCandidateRow) {
          const candidateValidationError = validateEnumCandidate({
            candidateRow: requestedCandidateRow,
            candidateId: requestedCandidateId,
            field,
            resolvedValue,
            isMeaningfulValue,
            normalizeLower,
            valueMismatchMessage: `candidate_id '${requestedCandidateId}' value does not match enum value '${resolvedValue}'.`,
          });
          if (candidateValidationError) {
            return respond(400, candidateValidationError);
          }
        }
        let existingLv = runtimeSpecDb.getListValueByFieldAndValue(field, resolvedValue);
        if (!existingLv) {
          existingLv = upsertEnumListValueAndFetch({
            runtimeSpecDb,
            field,
            value: resolvedValue,
            normalizedValue: normalized,
            upsertValues: {
              source: 'pipeline',
              enumPolicy: null,
              overridden: false,
              needsReview: false,
              sourceTimestamp: nowIso,
              acceptedCandidateId: null,
            },
          });
        } else {
          existingLv = upsertEnumListValueAndFetch({
            runtimeSpecDb,
            field,
            value: resolvedValue,
            normalizedValue: normalized,
            upsertValues: {
              source: existingLv.source || 'pipeline',
              enumPolicy: existingLv.enum_policy ?? null,
              overridden: Boolean(existingLv.overridden),
              needsReview: false,
              sourceTimestamp: nowIso,
              acceptedCandidateId: null,
            },
          });
        }
        const resolvedCandidateId = requestedCandidateId;
        const pendingCandidateIds = [];
        const confirmStatusOverride = pendingCandidateIds.length > 0 ? 'pending' : 'confirmed';
        existingLv = upsertEnumListValueAndFetch({
          runtimeSpecDb,
          field,
          value: resolvedValue,
          normalizedValue: normalized,
          upsertValues: {
            source: existingLv?.source || 'pipeline',
            enumPolicy: existingLv?.enum_policy ?? null,
            overridden: Boolean(existingLv?.overridden),
            needsReview: confirmStatusOverride === 'pending',
            sourceTimestamp: nowIso,
            acceptedCandidateId: resolvedCandidateId,
          },
        });
        applyEnumSharedLaneWithResolvedConfidence({
          runtimeSpecDb,
          applySharedLaneState,
          category,
          field,
          normalizedValue: normalized,
          listValueRow: existingLv,
          selectedCandidateId: resolvedCandidateId,
          selectedValue: resolvedValue,
          laneAction: 'confirm',
          nowIso,
          confirmStatusOverride,
        });
      } else {
        const resolvedValue = value;
        const manualLv = upsertEnumListValueAndFetch({
          runtimeSpecDb,
          field,
          value: resolvedValue,
          normalizedValue: normalized,
          upsertValues: {
            source: 'manual',
            overridden: true,
            needsReview: false,
            sourceTimestamp: nowIso,
            acceptedCandidateId: null,
          },
        });
        applyEnumSharedLaneWithResolvedConfidence({
          runtimeSpecDb,
          applySharedLaneState,
          category,
          field,
          normalizedValue: normalized,
          listValueRow: manualLv,
          selectedCandidateId: null,
          selectedValue: resolvedValue,
          laneAction: 'accept',
          nowIso,
          fallbackConfidence: 1.0,
        });
      }

      specDbCache.delete(category);

      if (cascadeAction) {
        await cascadeEnumChange({
          storage,
          outputRoot: outputRoot,
          category,
          field,
          action: cascadeAction,
          value: cascadeValue,
          newValue: cascadeNewValue,
          preAffectedProductIds: cascadePreAffectedProductIds,
          loadQueueState,
          saveQueueState,
          specDb: runtimeSpecDb,
        });
      }
      return sendDataChangeResponse({
        jsonRes,
        res,
        broadcastWs,
        eventType: 'enum-override',
        category,
        payload: { field, action: action || 'add', persisted: 'specdb' },
        broadcastExtra: { field, action: action || 'add' },
      });
    } catch (sqlErr) {
      return respond(500, {
        error: 'enum_override_specdb_write_failed',
        message: sqlErr?.message || 'SpecDb write failed',
      });
    }

  }

  return false;
}

async function handleEnumRenameEndpoint({
  parts,
  method,
  req,
  res,
  context,
}) {
  const {
    readJsonBody,
    jsonRes,
    getSpecDbReady,
    resolveEnumMutationContext,
    specDbCache,
    storage,
    outputRoot,
    cascadeEnumChange,
    loadQueueState,
    saveQueueState,
    isReviewFieldPathEnabled,
    broadcastWs,
  } = context || {};
  const respond = createRouteResponder(jsonRes, res);

  // Atomic enum rename (remove old + add new in one transaction)
  if (routeMatches({ parts, method, scope: 'review-components', action: 'enum-rename' })) {
    const category = parts[1];
    const body = await readJsonBody(req);
    const newValueRaw = body?.newValue ?? body?.new_value;
    if (!newValueRaw) return respond(400, { error: 'newValue required' });
    const trimmedNew = String(newValueRaw).trim();
    if (!trimmedNew) return respond(400, { error: 'newValue cannot be empty' });
    const preparedMutation = await prepareMutationContextRequest({
      parts,
      req,
      body,
      readJsonBody,
      getSpecDbReady,
      resolveContext: resolveEnumMutationContext,
      resolveContextArgs: ({ runtimeSpecDb, category: resolvedCategory, body: requestBody }) => ([
        runtimeSpecDb,
        resolvedCategory,
        requestBody,
        { requireListValueId: true },
      ]),
    });
    if (respondIfError(respond, preparedMutation.error)) {
      return true;
    }
    const {
      runtimeSpecDb,
      context: enumCtx,
    } = preparedMutation;
    const field = String(enumCtx?.field || '').trim();
    const oldValue = String(enumCtx?.oldValue || '').trim();
    const listValueId = enumCtx?.listValueId ?? null;
    if (!field || !oldValue) {
      return respond(400, { error: 'field and oldValue (or listValueId) required' });
    }
    if (typeof isReviewFieldPathEnabled === 'function') {
      const enabled = await isReviewFieldPathEnabled({
        category,
        fieldKey: field,
        fieldPath: 'enum.source',
      });
      if (!enabled) {
        return respond(403, {
          error: 'review_consumer_disabled',
          message: `Review consumer disabled for enum.source on field '${field}'.`,
          field,
          field_path: 'enum.source',
        });
      }
    }
    if (oldValue.toLowerCase() === trimmedNew.toLowerCase()) {
      return respond(200, { ok: true, field, changed: false });
    }

    // SQL-first runtime path (known_values writes removed from write path)
    try {
      const affectedProductIds = runtimeSpecDb.renameListValueById(
        listValueId,
        trimmedNew,
        new Date().toISOString()
      ) || [];
      specDbCache.delete(category);

      await cascadeEnumChange({
        storage,
        outputRoot: outputRoot,
        category,
        field,
        action: 'rename',
        value: oldValue,
        newValue: trimmedNew,
        preAffectedProductIds: affectedProductIds,
        loadQueueState,
        saveQueueState,
        specDb: runtimeSpecDb,
      });

      return sendDataChangeResponse({
        jsonRes,
        res,
        broadcastWs,
        eventType: 'enum-rename',
        category,
        payload: { field, oldValue, newValue: trimmedNew, changed: true, persisted: 'specdb' },
        broadcastExtra: { field },
      });
    } catch (sqlErr) {
      return respond(500, {
        error: 'enum_rename_specdb_write_failed',
        message: sqlErr?.message || 'SpecDb write failed',
      });
    }

  }



  return false;
}

export async function handleReviewEnumMutationRoute({
  parts,
  method,
  req,
  res,
  context,
}) {
  if (!Array.isArray(parts) || parts[0] !== 'review-components' || !parts[1]) {
    return false;
  }
  return runHandledRouteChain({
    handlers: [
      handleEnumOverrideEndpoint,
      handleEnumRenameEndpoint,
    ],
    args: { parts, method, req, res, context },
  });
}
