import {
  resolveCandidateConfidence,
} from '../../../api/reviewRouteSharedHelpers.js';

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
  const { confidence: sharedConfidence } = resolveCandidateConfidence({
    specDb: runtimeSpecDb,
    candidateId: selectedCandidateId,
    candidateRow,
    fallbackConfidence: 1.0,
  });
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
    const collisionTarget = runtimeSpecDb.db.prepare(`
      SELECT id FROM component_identity
      WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ? AND id != ?
      LIMIT 1
    `).get(runtimeSpecDb.category, componentType, nextName, nextMaker, componentIdentityId);

    if (collisionTarget) {
      runtimeSpecDb.mergeComponentIdentities({
        sourceId: componentIdentityId,
        targetId: collisionTarget.id,
      });
      return { merged: true, survivingId: collisionTarget.id };
    }

    runtimeSpecDb.db.prepare(`
      UPDATE component_identity
      SET canonical_name = ?, maker = ?, source = ?, updated_at = datetime('now')
      WHERE category = ? AND id = ?
    `).run(nextName, nextMaker, selectedSource, runtimeSpecDb.category, componentIdentityId);
    runtimeSpecDb.db.prepare(`
      UPDATE component_values
      SET component_name = ?, component_maker = ?, updated_at = datetime('now')
      WHERE category = ? AND component_type = ? AND component_name = ? AND component_maker = ?
    `).run(nextName, nextMaker, runtimeSpecDb.category, componentType, currentName, currentMaker);
    runtimeSpecDb.db.prepare(`
      UPDATE item_component_links
      SET component_name = ?, component_maker = ?, updated_at = datetime('now')
      WHERE category = ? AND component_type = ? AND component_name = ? AND component_maker = ?
    `).run(nextName, nextMaker, runtimeSpecDb.category, componentType, currentName, currentMaker);
    if (oldComponentIdentifier !== newComponentIdentifier) {
      runtimeSpecDb.db.prepare(`
        UPDATE key_review_state
        SET component_identifier = ?, updated_at = datetime('now')
        WHERE category = ? AND target_kind = 'component_key' AND component_identifier = ?
      `).run(newComponentIdentifier, runtimeSpecDb.category, oldComponentIdentifier);
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

export function isIdentityPropertyKey(propertyKey) {
  const key = String(propertyKey || '').trim();
  return key === '__name' || key === '__maker' || key === '__links' || key === '__aliases';
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
