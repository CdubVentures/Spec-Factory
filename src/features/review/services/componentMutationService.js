import { COMPONENT_IDENTITY_PROPERTY_KEYS } from '../contracts/componentReviewShapes.js';

export function validateComponentPropertyCandidate({
  candidateRow,
  candidateId,
  property,
  resolvedValue,
  isMeaningfulValue,
  normalizeLower,
  valueMismatchMessage,
}) {
  if (String(candidateRow?.field_key || '').trim() !== String(property || '').trim()) {
    return {
      error: 'candidate_context_mismatch',
      message: `candidate_id '${candidateId}' does not belong to component property '${property}'.`,
    };
  }
  const candidateValueToken = String(candidateRow?.value ?? '').trim();
  const resolvedValueToken = String(resolvedValue ?? '').trim();
  if (
    isMeaningfulValue(candidateValueToken)
    && isMeaningfulValue(resolvedValueToken)
    && normalizeLower(candidateValueToken) !== normalizeLower(resolvedValueToken)
  ) {
    return {
      error: 'candidate_value_mismatch',
      message: valueMismatchMessage,
    };
  }
  return null;
}

export function applyComponentSharedAcceptLane({
  runtimeSpecDb,
  applySharedLaneState,
  category,
  propertyKey,
  componentIdentifier,
  componentValueId = null,
  componentIdentityId = null,
  selectedCandidateId = null,
  selectedValue,
  nowIso,
  candidateRow = null,
}) {
  const sharedConfidence = 1.0;
  return applySharedLaneState({
    specDb: runtimeSpecDb,
    category,
    targetKind: 'component_key',
    fieldKey: String(propertyKey),
    componentIdentifier,
    propertyKey: String(propertyKey),
    componentValueId: componentValueId ?? null,
    componentIdentityId: componentIdentityId ?? null,
    selectedCandidateId: selectedCandidateId || null,
    selectedValue: String(selectedValue ?? ''),
    confidenceScore: sharedConfidence,
    laneAction: 'accept',
    nowIso,
  });
}

export function runComponentIdentityUpdateTx({
  runtimeSpecDb,
  buildComponentIdentifier,
  componentType,
  currentName,
  currentMaker,
  nextName,
  nextMaker,
  componentIdentityId,
  selectedSource,
}) {
  const oldComponentIdentifier = buildComponentIdentifier(componentType, currentName, currentMaker);
  const newComponentIdentifier = buildComponentIdentifier(componentType, nextName, nextMaker);
  const tx = runtimeSpecDb.db.transaction(() => {
    const collisionTarget = runtimeSpecDb.getComponentIdentityCollision(componentType, nextName, nextMaker, componentIdentityId);

    if (collisionTarget) {
      runtimeSpecDb.mergeComponentIdentities({
        sourceId: componentIdentityId,
        targetId: collisionTarget.id,
      });
      return { merged: true, survivingId: collisionTarget.id };
    }

    runtimeSpecDb.updateComponentIdentityFields(componentIdentityId, { name: nextName, maker: nextMaker, source: selectedSource });
    runtimeSpecDb.updateComponentValuesByIdentity(componentType, currentName, currentMaker, nextName, nextMaker);
    runtimeSpecDb.updateItemComponentLinksByIdentity(componentType, currentName, currentMaker, nextName, nextMaker);
    if (oldComponentIdentifier !== newComponentIdentifier) {
      runtimeSpecDb.updateKeyReviewComponentIdentifier(oldComponentIdentifier, newComponentIdentifier);
    }
    return { merged: false };
  });
  const result = tx();
  return {
    oldComponentIdentifier,
    newComponentIdentifier,
    merged: result?.merged || false,
    survivingId: result?.survivingId || null,
  };
}

const _identityKeySet = new Set(COMPONENT_IDENTITY_PROPERTY_KEYS);
export function isIdentityPropertyKey(propertyKey) {
  const key = String(propertyKey || '').trim();
  return _identityKeySet.has(key);
}

export function normalizeStringEntries(value) {
  return (Array.isArray(value) ? value : [value])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}

export function parseJsonArray(value) {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export async function cascadeComponentMutation({
  cascadeComponentChange,
  storage,
  outputRoot,
  category,
  loadQueueState,
  saveQueueState,
  runtimeSpecDb,
  componentType,
  componentName,
  componentMaker,
  changedProperty,
  newValue,
  variancePolicy = null,
  constraints = [],
}) {
  await cascadeComponentChange({
    storage,
    outputRoot,
    category,
    componentType,
    componentName,
    componentMaker,
    changedProperty,
    newValue,
    variancePolicy,
    constraints,
    loadQueueState,
    saveQueueState,
    specDb: runtimeSpecDb,
  });
}

export function respondMissingComponentIdentityId({
  respond,
  componentIdentityId,
  message = 'componentIdentityId is required for component identity mutations.',
}) {
  if (componentIdentityId) return false;
  return respond(400, {
    error: 'component_identity_id_required',
    message,
  });
}

export function buildComponentMutationContextArgs({
  runtimeSpecDb,
  category,
  body,
}) {
  const requestedProperty = String(body?.property || body?.propertyKey || '').trim();
  const isIdentityProperty = isIdentityPropertyKey(requestedProperty);
  return [runtimeSpecDb, category, body, {
    requireComponentValueId: !isIdentityProperty,
    requireComponentIdentityId: isIdentityProperty,
  }];
}

export function resolveComponentIdentityMutationPlan({
  property,
  value,
  componentType,
  name,
  componentMaker,
}) {
  if (property !== '__name' && property !== '__maker') {
    return null;
  }
  const nextValue = String(value || '').trim();
  if (!nextValue || nextValue.length < 2) {
    return {
      errorPayload: {
        error: property === '__name'
          ? 'name must be at least 2 characters'
          : 'maker must be at least 2 characters',
      },
    };
  }
  if (property === '__name') {
    return {
      nextName: nextValue,
      nextMaker: componentMaker,
      selectedValue: nextValue,
      changedProperty: componentType,
      cascadeComponentName: nextValue,
      cascadeComponentMaker: componentMaker,
      requiresNameRemap: true,
    };
  }
  return {
    nextName: name,
    nextMaker: nextValue,
    selectedValue: nextValue,
    changedProperty: `${componentType}_brand`,
    cascadeComponentName: name,
    cascadeComponentMaker: nextValue,
    requiresNameRemap: false,
  };
}

// --- Extracted SQL wrappers (previously inline in route handler) ---

export function clearComponentValueAcceptedCandidate({ runtimeSpecDb, componentValueId }) {
  runtimeSpecDb.clearComponentValueAcceptedCandidate(componentValueId);
}

export function replaceComponentUserAliases({ runtimeSpecDb, componentIdentityId, aliases, componentType, name, componentMaker }) {
  runtimeSpecDb.deleteComponentAliasesBySource(componentIdentityId, 'user');
  for (const alias of aliases) {
    runtimeSpecDb.insertAlias(componentIdentityId, alias, 'user');
  }
  runtimeSpecDb.updateAliasesOverridden(componentType, name, componentMaker, aliases.length > 0);
}

export function updateComponentLinks({ runtimeSpecDb, componentIdentityId, links }) {
  runtimeSpecDb.updateComponentLinks(componentIdentityId, links);
}

export function updateComponentReviewStatus({ runtimeSpecDb, componentIdentityId, reviewStatus }) {
  runtimeSpecDb.updateComponentReviewStatusById(componentIdentityId, reviewStatus);
}

export function updateComponentValueNeedsReview({ runtimeSpecDb, componentSlotId, needsReview }) {
  runtimeSpecDb.updateComponentValueNeedsReview(componentSlotId, needsReview);
}
