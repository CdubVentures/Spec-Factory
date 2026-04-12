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
    normalizeLower,
    buildComponentIdentifier,
    cascadeComponentChange,
    outputRoot,
    storage,
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
      let acceptedCandidateId = requestedCandidateId;
      const sourceToken = String(candidateSource || '').trim().toLowerCase();
      const resolveSelectionSource = () => {
        if (!requestedCandidateId) return 'user';
        const candidateLooksUser = sourceToken.includes('manual') || sourceToken.includes('user');
        if (candidateLooksUser) return 'user';
        return 'pipeline';
      };
      const selectedSource = resolveSelectionSource();
      const cascadeBase = {
        cascadeComponentChange,
        storage,
        outputRoot,
        category,
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
          const keepNeedsReview = acceptedCandidateId ? Boolean(existingProperty?.needs_review) : false;
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
    resolveComponentMutationContext,
    isMeaningfulValue,
    normalizeLower,
    buildComponentIdentifier,
    specDbCache,
    broadcastWs,
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
      const resolvedValue = String(
        (property === '__name' ? name : null)
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
      const stateValue = resolvedValue;
      if (!isMeaningfulValue(stateValue)) {
        return respond(400, {
          error: 'confirm_value_required',
          message: 'No resolved value to confirm for this component property',
        });
      }
      const resolvedCandidateId = requestedCandidateId;
      const resolvedConfidence = firstFiniteNumber([
        existingState?.confidence_score,
        propertyRow?.confidence,
        body?.candidateConfidence,
      ], 1.0);
      const nowIso = new Date().toISOString();
      const componentSlotId = componentCtx?.componentValueId ?? propertyRow?.id ?? null;
      const pendingCandidateIds = [];
      const confirmStatusOverride = pendingCandidateIds.length > 0 ? 'pending' : 'confirmed';
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
        payload: {},
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
