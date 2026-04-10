function normalizeLower(value) {
  return String(value ?? '').trim().toLowerCase();
}

const UNKNOWN_LIKE_TOKENS = new Set(['', 'unknown', 'n/a', 'na', 'null', 'undefined', '-']);

function isMeaningfulValue(value) {
  if (value == null) return false;
  return !UNKNOWN_LIKE_TOKENS.has(normalizeLower(value));
}

export function createReviewGridStateRuntime({
  resolveExplicitPositiveId,
  resolveGridFieldStateForMutation,
} = {}) {
  if (typeof resolveExplicitPositiveId !== 'function') {
    throw new TypeError('resolveExplicitPositiveId must be a function');
  }
  if (typeof resolveGridFieldStateForMutation !== 'function') {
    throw new TypeError('resolveGridFieldStateForMutation must be a function');
  }

  function ensureGridKeyReviewState(
    specDb,
    category,
    productId,
    fieldKey,
    itemFieldStateId = null,
    seedItemFieldState = null,
  ) {
    if (!specDb || !productId || !fieldKey) return null;
    try {
      const existing = specDb.getKeyReviewState({
        category,
        targetKind: 'grid_key',
        itemIdentifier: productId,
        fieldKey,
        itemFieldStateId,
      });
      if (existing) return existing;

      const lookedUpItemFieldState = itemFieldStateId
        ? specDb.getItemFieldStateById(itemFieldStateId)
        : specDb.getItemFieldStateByProductAndField(productId, fieldKey);
      const ifs = lookedUpItemFieldState || seedItemFieldState || null;
      if (!ifs) return null;

      let aiConfirmPrimaryStatus = null;
      if (ifs.needs_ai_review && !ifs.ai_review_complete) aiConfirmPrimaryStatus = 'pending';
      else if (ifs.ai_review_complete) aiConfirmPrimaryStatus = 'confirmed';

      const userAcceptPrimaryStatus = ifs.overridden ? 'accepted' : null;

      const id = specDb.upsertKeyReviewState({
        category,
        targetKind: 'grid_key',
        itemIdentifier: productId,
        fieldKey,
        itemFieldStateId: ifs.id ?? itemFieldStateId ?? null,
        selectedValue: ifs.value ?? null,
        selectedCandidateId: ifs.accepted_candidate_id ?? null,
        confidenceScore: ifs.confidence ?? 0,
        aiConfirmPrimaryStatus,
        userAcceptPrimaryStatus,
      });
      return specDb.getKeyReviewStateById(id) || null;
    } catch {
      return null;
    }
  }

  function resolveKeyReviewForLaneMutation(specDb, category, body) {
    if (!specDb) {
      return {
        stateRow: null,
        error: 'specdb_not_ready',
        errorMessage: 'SpecDb is not available for this category.',
      };
    }
    const idReq = resolveExplicitPositiveId(body, ['id']);
    if (idReq.provided) {
      const byId = idReq.id ? specDb.getKeyReviewStateById(idReq.id) : null;
      if (byId) return { stateRow: byId, error: null };
      return {
        stateRow: null,
        error: 'key_review_state_id_not_found',
        errorMessage: `key_review_state id '${idReq.raw}' was not found.`,
      };
    }
    const fieldStateCtx = resolveGridFieldStateForMutation(specDb, category, body);
    if (fieldStateCtx?.error) {
      if (fieldStateCtx.error === 'item_field_state_id_required') {
        return {
          stateRow: null,
          error: 'id_or_item_field_state_id_required',
          errorMessage: 'Provide key_review_state id or itemFieldStateId for this lane mutation.',
        };
      }
      return {
        stateRow: null,
        error: fieldStateCtx.error,
        errorMessage: fieldStateCtx.errorMessage,
      };
    }
    const fieldStateRow = fieldStateCtx?.row;
    if (!fieldStateRow) return { stateRow: null, error: null };
    const productId = String(fieldStateRow.product_id || '').trim();
    const fieldKey = String(fieldStateRow.field_key || '').trim();
    if (!productId || !fieldKey) return { stateRow: null, error: null };
    return {
      stateRow: ensureGridKeyReviewState(
        specDb,
        category,
        productId,
        fieldKey,
        fieldStateRow.id,
        fieldStateRow,
      ),
      error: null,
    };
  }

  function markPrimaryLaneReviewedInItemState(specDb, category, keyReviewState) {
    if (!specDb || !keyReviewState) return;
    if (keyReviewState.target_kind !== 'grid_key') return;
    if (!keyReviewState.item_identifier || !keyReviewState.field_key) return;
    try {
      specDb.markItemFieldStateReviewComplete(keyReviewState.item_identifier, keyReviewState.field_key);
    } catch { /* best-effort sync */ }
  }

  // WHY: DB write removed — will route through publisher pipeline when review is re-wired.
  function syncItemFieldStateFromPrimaryLaneAccept(specDb, category, keyReviewState) {
    if (!specDb || !keyReviewState) return;
    if (keyReviewState.target_kind !== 'grid_key') return;
    const productId = String(keyReviewState.item_identifier || '').trim();
    const fieldKey = String(keyReviewState.field_key || '').trim();
    if (!productId || !fieldKey) return;
  }

  function syncPrimaryLaneAcceptFromItemSelection({
    specDb,
    category,
    productId,
    fieldKey,
    selectedCandidateId = null,
    selectedValue = null,
    confidenceScore = null,
    reason = null,
  }) {
    if (!specDb) return null;
    const state = ensureGridKeyReviewState(specDb, category, productId, fieldKey);
    if (!state) return null;

    const scoreValue = Number.isFinite(Number(confidenceScore))
      ? Number(confidenceScore)
      : null;
    specDb.updateKeyReviewSelectedCandidate({
      id: state.id,
      selectedCandidateId,
      selectedValue,
      confidenceScore: scoreValue,
    });

    const at = new Date().toISOString();
    specDb.updateKeyReviewUserAccept({ id: state.id, lane: 'primary', status: 'accepted', at });
    specDb.insertKeyReviewAudit({
      keyReviewStateId: state.id,
      eventType: 'user_accept',
      actorType: 'user',
      actorId: null,
      oldValue: state.user_accept_primary_status || null,
      newValue: 'accepted',
      reason: reason || 'User accepted item value via override',
    });

    return specDb.getKeyReviewStateById(state.id) || null;
  }

  return {
    ensureGridKeyReviewState,
    resolveKeyReviewForLaneMutation,
    markPrimaryLaneReviewedInItemState,
    syncItemFieldStateFromPrimaryLaneAccept,
    syncPrimaryLaneAcceptFromItemSelection,
  };
}
