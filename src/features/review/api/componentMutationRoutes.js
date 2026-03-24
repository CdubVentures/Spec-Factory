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
  validateComponentPropertyCandidate,
  applyComponentSharedAcceptLane,
  runComponentIdentityUpdateTx,
  isIdentityPropertyKey,
  normalizeStringEntries,
  parseJsonArray,
  cascadeComponentMutation,
  respondMissingComponentIdentityId,
  buildComponentMutationContextArgs,
  resolveComponentIdentityMutationPlan,
  clearComponentValueAcceptedCandidate,
  replaceComponentUserAliases,
  updateComponentLinks,
  updateComponentReviewStatus,
  updateComponentValueNeedsReview,
} from '../services/componentMutationService.js';

// Re-export for characterization tests and any external consumers
export {
  validateComponentPropertyCandidate,
  applyComponentSharedAcceptLane,
  runComponentIdentityUpdateTx,
  isIdentityPropertyKey,
  normalizeStringEntries,
  parseJsonArray,
  cascadeComponentMutation,
  respondMissingComponentIdentityId,
  buildComponentMutationContextArgs,
  resolveComponentIdentityMutationPlan,
  clearComponentValueAcceptedCandidate,
  replaceComponentUserAliases,
  updateComponentLinks,
  updateComponentReviewStatus,
  updateComponentValueNeedsReview,
};

async function handleComponentOverrideEndpoint({
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
    resolveComponentMutationContext,
    isMeaningfulValue,
    candidateLooksReference,
    normalizeLower,
    buildComponentIdentifier,
    applySharedLaneState,
    cascadeComponentChange,
    outputRoot,
    storage,
    loadQueueState,
    saveQueueState,
    remapPendingComponentReviewItemsForNameChange,
    specDbCache,
    broadcastWs,
  } = context || {};
  const respond = createRouteResponder(jsonRes, res);

  // Component property override
  if (routeMatches({ parts, method, scope: 'review-components', action: 'component-override' })) {
    const preparedMutation = await prepareMutationContextRequest({
      parts,
      req,
      readJsonBody,
      getSpecDbReady,
      resolveContext: resolveComponentMutationContext,
      resolveContextArgs: buildComponentMutationContextArgs,
    });
    if (respondIfError(respond, preparedMutation.error)) {
      return true;
    }
    const {
      category,
      body,
      runtimeSpecDb,
      context: componentCtx,
    } = preparedMutation;
    const { review_status, candidateId, candidateSource } = body;
    const value = body?.value;
    const componentType = String(componentCtx?.componentType || '').trim();
    const name = String(componentCtx?.componentName || '').trim();
    const componentMaker = String(componentCtx?.componentMaker || '').trim();
    const property = String(componentCtx?.property || body?.property || body?.propertyKey || '').trim();
    const componentIdentityId = componentCtx?.componentIdentityId ?? null;
    if (!componentType || !name) {
      return respond(400, {
        error: 'component_context_required',
        message: 'Provide required component slot identifiers.',
      });
    }

    // SQL-first runtime path (legacy JSON override files removed from the write path)
    try {
      const nowIso = new Date().toISOString();
      const requestedCandidateId = String(candidateId || '').trim() || null;
      let acceptedCandidateRow = requestedCandidateId
        ? runtimeSpecDb.getCandidateById(requestedCandidateId)
        : null;
      let acceptedCandidateId = acceptedCandidateRow ? requestedCandidateId : null;
      const sourceToken = String(candidateSource || '').trim().toLowerCase();
      const resolveSelectionSource = () => {
        if (!requestedCandidateId) return 'user';
        const isReferenceCandidate = candidateLooksReference(requestedCandidateId, sourceToken);
        const candidateLooksUser = sourceToken.includes('manual') || sourceToken.includes('user');
        if (isReferenceCandidate) return 'component_db';
        if (candidateLooksUser) return 'user';
        return 'pipeline';
      };
      const selectedSource = resolveSelectionSource();
      const cascadeBase = {
        cascadeComponentChange,
        storage,
        outputRoot,
        category,
        loadQueueState,
        saveQueueState,
        runtimeSpecDb,
      };

      if (property && value !== undefined) {
        const isIdentity = isIdentityPropertyKey(property);
        const valueToken = String(value ?? '').trim();
        if (requestedCandidateId && !isMeaningfulValue(valueToken)) {
          return respond(400, {
            error: 'unknown_value_not_actionable',
            message: 'Candidate accept cannot persist unknown/empty values.',
          });
        }
        if (!isIdentity && requestedCandidateId && !acceptedCandidateRow) {
          return respond(404, {
            error: 'candidate_not_found',
            message: `candidate_id '${requestedCandidateId}' was not found.`,
          });
        }
        if (acceptedCandidateId && acceptedCandidateRow && !isIdentity) {
          const candidateValidationError = validateComponentPropertyCandidate({
            candidateRow: acceptedCandidateRow,
            candidateId: acceptedCandidateId,
            property,
            resolvedValue: valueToken,
            isMeaningfulValue,
            normalizeLower,
            valueMismatchMessage: `candidate_id '${acceptedCandidateId}' value does not match requested property value.`,
          });
          if (candidateValidationError) {
            return respond(400, candidateValidationError);
          }
        }

        if (!isIdentity) {
          const existingProperty = (
            componentCtx?.componentValueRow
            && String(componentCtx.componentValueRow.property_key || '').trim() === String(property || '').trim()
          )
            ? componentCtx.componentValueRow
            : null;
          if (!existingProperty?.id) {
            return respond(400, {
              error: 'component_value_id_required',
              message: 'componentValueId is required for component property mutations.',
            });
          }
          const componentIdentifier = buildComponentIdentifier(componentType, name, componentMaker);
          const existingSharedLaneState = runtimeSpecDb.getKeyReviewState({
            category,
            targetKind: 'component_key',
            fieldKey: String(property),
            componentIdentifier,
            propertyKey: String(property),
            componentValueId: componentCtx?.componentValueId ?? existingProperty.id,
          });
          const existingSharedLaneStatus = String(existingSharedLaneState?.ai_confirm_shared_status || '').trim().toLowerCase();
          const keepNeedsReview = acceptedCandidateId
            ? (existingSharedLaneStatus === 'pending' || Boolean(existingProperty?.needs_review))
            : false;
          const parsedConstraints = parseJsonArray(existingProperty?.constraints);
          runtimeSpecDb.upsertComponentValue({
            componentType,
            componentName: name,
            componentMaker,
            propertyKey: property,
            value: String(value),
            confidence: 1.0,
            variancePolicy: existingProperty?.variance_policy ?? null,
            source: selectedSource,
            acceptedCandidateId: acceptedCandidateId || null,
            overridden: !acceptedCandidateId,
            needsReview: keepNeedsReview,
            constraints: parsedConstraints,
          });
          const componentSlotId = componentCtx?.componentValueId ?? existingProperty.id;

          applyComponentSharedAcceptLane({
            runtimeSpecDb,
            applySharedLaneState,
            category,
            propertyKey: String(property),
            componentIdentifier,
            componentValueId: componentCtx?.componentValueId ?? existingProperty.id,
            selectedCandidateId: acceptedCandidateId,
            selectedValue: String(value),
            nowIso,
            candidateRow: acceptedCandidateRow,
          });

          if (!acceptedCandidateId) {
            clearComponentValueAcceptedCandidate({ runtimeSpecDb, componentValueId: existingProperty.id });
          }

          await cascadeComponentMutation({
            ...cascadeBase,
            componentType,
            componentName: name,
            componentMaker,
            changedProperty: property,
            newValue: value,
            variancePolicy: existingProperty?.variance_policy ?? null,
            constraints: parsedConstraints,
          });
        } else if (property === '__aliases') {
          const aliases = normalizeStringEntries(value);
          if (respondMissingComponentIdentityId({ respond, componentIdentityId })) {
            return true;
          }
          if (componentIdentityId) {
            replaceComponentUserAliases({ runtimeSpecDb, componentIdentityId, aliases, componentType, name, componentMaker });
          }
        } else if (property === '__links') {
          const links = normalizeStringEntries(value);
          if (respondMissingComponentIdentityId({ respond, componentIdentityId })) {
            return true;
          }
          updateComponentLinks({ runtimeSpecDb, componentIdentityId, links });
        } else if (property === '__name' || property === '__maker') {
          const mutationPlan = resolveComponentIdentityMutationPlan({
            property,
            value,
            componentType,
            name,
            componentMaker,
          });
          if (mutationPlan?.errorPayload) {
            return respond(400, mutationPlan.errorPayload);
          }
          if (!mutationPlan) {
            return respond(400, {
              error: 'invalid_component_identity_property',
              message: `Unsupported component identity property '${property}'.`,
            });
          }
          if (respondMissingComponentIdentityId({ respond, componentIdentityId })) {
            return true;
          }
          const { newComponentIdentifier } = runComponentIdentityUpdateTx({
            runtimeSpecDb,
            buildComponentIdentifier,
            componentType,
            currentName: name,
            currentMaker: componentMaker,
            nextName: mutationPlan.nextName,
            nextMaker: mutationPlan.nextMaker,
            componentIdentityId,
            selectedSource,
          });
          if (mutationPlan.requiresNameRemap) {
            await remapPendingComponentReviewItemsForNameChange({
              category,
              componentType,
              oldName: name,
              newName: mutationPlan.nextName,
              specDb: runtimeSpecDb,
            });
          }
          applyComponentSharedAcceptLane({
            runtimeSpecDb,
            applySharedLaneState,
            category,
            propertyKey: property,
            componentIdentifier: newComponentIdentifier,
            componentIdentityId,
            selectedCandidateId: acceptedCandidateId || null,
            selectedValue: mutationPlan.selectedValue,
            nowIso,
          });
          await cascadeComponentMutation({
            ...cascadeBase,
            componentType,
            componentName: mutationPlan.cascadeComponentName,
            componentMaker: mutationPlan.cascadeComponentMaker,
            changedProperty: mutationPlan.changedProperty,
            newValue: mutationPlan.selectedValue,
            variancePolicy: 'authoritative',
            constraints: [],
          });
        }
      }

      if (review_status) {
        if (respondMissingComponentIdentityId({
          respond,
          componentIdentityId,
          message: 'componentIdentityId is required for review_status updates.',
        })) {
          return true;
        }
        updateComponentReviewStatus({ runtimeSpecDb, componentIdentityId, reviewStatus: review_status });
      }

      specDbCache.delete(category);
      return sendDataChangeResponse({
        jsonRes,
        res,
        broadcastWs,
        eventType: 'component-override',
        category,
        payload: { sql_only: true },
      });
    } catch (sqlErr) {
      return respond(500, {
        error: 'component_override_specdb_write_failed',
        message: sqlErr?.message || 'SpecDb write failed',
      });
    }

  }

  return false;
}

async function handleComponentKeyReviewConfirmEndpoint({
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
    syncSyntheticCandidatesFromComponentReview,
    resolveComponentMutationContext,
    isMeaningfulValue,
    normalizeLower,
    buildComponentIdentifier,
    applySharedLaneState,
    specDbCache,
    broadcastWs,
    getPendingComponentSharedCandidateIdsAsync,
  } = context || {};
  const respond = createRouteResponder(jsonRes, res);

  // Component shared-lane confirm without overriding value (context-only decision)
  if (routeMatches({ parts, method, scope: 'review-components', action: 'component-key-review-confirm' })) {
    const preparedMutation = await prepareMutationContextRequest({
      parts,
      req,
      readJsonBody,
      getSpecDbReady,
      resolveContext: resolveComponentMutationContext,
      resolveContextArgs: buildComponentMutationContextArgs,
      preSync: ({ category, specDb }) => syncSyntheticCandidatesFromComponentReview({ category, specDb }),
    });
    if (respondIfError(respond, preparedMutation.error)) {
      return true;
    }
    const {
      category,
      body,
      runtimeSpecDb,
      context: componentCtx,
    } = preparedMutation;
    const componentType = String(componentCtx?.componentType || '').trim();
    const name = String(componentCtx?.componentName || '').trim();
    const componentMaker = String(componentCtx?.componentMaker || '').trim();
    const property = String(componentCtx?.property || body?.property || '').trim();
    const componentIdentityId = componentCtx?.componentIdentityId ?? null;
    if (!componentType || !name || !property) {
      return respond(400, {
        error: 'component_context_required',
        message: 'component slot identifiers are required',
      });
    }

    try {
      let propertyRow = null;
      if (property !== '__name' && property !== '__maker') {
        propertyRow = componentCtx?.componentValueRow || null;
        if (!propertyRow?.id) {
          return respond(400, {
            error: 'component_value_id_required',
            message: 'componentValueId is required for component property mutations.',
          });
        }
      }

      const componentIdentifier = buildComponentIdentifier(componentType, name, componentMaker);
      const existingState = runtimeSpecDb.getKeyReviewState({
        category,
        targetKind: 'component_key',
        fieldKey: property,
        componentIdentifier,
        propertyKey: property,
        componentValueId: componentCtx?.componentValueId ?? propertyRow?.id ?? null,
        componentIdentityId: componentIdentityId ?? null,
      });
      const resolvedValue = String(
        existingState?.selected_value
        ?? (property === '__name' ? name : null)
        ?? (property === '__maker' ? componentMaker : null)
        ?? propertyRow?.value
        ?? ''
      ).trim();

      const requestedCandidateId = String(body?.candidateId || body?.candidate_id || '').trim() || null;
      if (!requestedCandidateId) {
        return respond(400, {
          error: 'candidate_id_required',
          message: 'candidateId is required for component AI confirm.',
        });
      }
      const requestedCandidateRow = runtimeSpecDb.getCandidateById(requestedCandidateId);
      if (!requestedCandidateRow) {
        return respond(404, {
          error: 'candidate_not_found',
          message: `candidate_id '${requestedCandidateId}' was not found.`,
        });
      }
      const stateValue = resolvedValue || String(requestedCandidateRow.value ?? '').trim();
      if (!isMeaningfulValue(stateValue)) {
        return respond(400, {
          error: 'confirm_value_required',
          message: 'No resolved value to confirm for this component property',
        });
      }
      if (property !== '__name' && property !== '__maker') {
        const candidateValidationError = validateComponentPropertyCandidate({
          candidateRow: requestedCandidateRow,
          candidateId: requestedCandidateId,
          property,
          resolvedValue: stateValue,
          isMeaningfulValue,
          normalizeLower,
          valueMismatchMessage: `candidate_id '${requestedCandidateId}' value does not match component property '${property}'.`,
        });
        if (candidateValidationError) {
          return respond(400, candidateValidationError);
        }
      }
      const resolvedCandidateId = requestedCandidateId;
      const resolvedConfidence = firstFiniteNumber([
        existingState?.confidence_score,
        propertyRow?.confidence,
        requestedCandidateRow?.score,
        body?.candidateConfidence,
      ], 1.0);
      const nowIso = new Date().toISOString();
      const componentSlotId = componentCtx?.componentValueId ?? propertyRow?.id ?? null;
      if (componentSlotId) {
        runtimeSpecDb.upsertReview({
          candidateId: requestedCandidateId,
          contextType: 'component',
          contextId: String(componentSlotId),
          humanAccepted: false,
          humanAcceptedAt: null,
          aiReviewStatus: 'accepted',
          aiConfidence: firstFiniteNumber([body?.candidateConfidence], 1.0),
          aiReason: 'shared_confirm',
          aiReviewedAt: nowIso,
          aiReviewModel: null,
          humanOverrideAi: false,
          humanOverrideAiAt: null,
        });
      }
      const pendingCandidateIds = await getPendingComponentSharedCandidateIdsAsync(runtimeSpecDb, {
        category,
        componentType,
        componentName: name,
        componentMaker,
        propertyKey: property,
        componentValueId: componentSlotId,
      });
      const confirmStatusOverride = pendingCandidateIds.length > 0 ? 'pending' : 'confirmed';
      const state = applySharedLaneState({
        specDb: runtimeSpecDb,
        category,
        targetKind: 'component_key',
        fieldKey: property,
        componentIdentifier,
        propertyKey: property,
        componentValueId: componentSlotId,
        componentIdentityId: componentIdentityId ?? null,
        selectedCandidateId: resolvedCandidateId,
        selectedValue: stateValue,
        confidenceScore: resolvedConfidence,
        laneAction: 'confirm',
        nowIso,
        confirmStatusOverride,
      });
      if (componentSlotId) {
        updateComponentValueNeedsReview({ runtimeSpecDb, componentSlotId, needsReview: confirmStatusOverride === 'pending' });
      }

      specDbCache.delete(category);
      return sendDataChangeResponse({
        jsonRes,
        res,
        broadcastWs,
        eventType: 'component-key-review-confirm',
        category,
        broadcastExtra: {
          componentType,
          name,
          property,
        },
        payload: { keyReviewState: state },
      });
    } catch (err) {
      return respond(500, {
        error: 'component_key_review_confirm_failed',
        message: err?.message || 'Component key review confirm failed',
      });
    }
  }

  return false;
}

export async function handleReviewComponentMutationRoute({
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
      handleComponentOverrideEndpoint,
      handleComponentKeyReviewConfirmEndpoint,
    ],
    args: { parts, method, req, res, context },
  });
}
