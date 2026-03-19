function normalizeLower(value) {
  return String(value ?? '').trim().toLowerCase();
}

const UNKNOWN_LIKE_TOKENS = new Set(['', 'unk', 'unknown', 'n/a', 'na', 'null', 'undefined', '-']);

function isMeaningfulValue(value) {
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

  function syncItemFieldStateFromPrimaryLaneAccept(specDb, category, keyReviewState) {
    if (!specDb || !keyReviewState) return;
    if (keyReviewState.target_kind !== 'grid_key') return;
    const productId = String(keyReviewState.item_identifier || '').trim();
    const fieldKey = String(keyReviewState.field_key || '').trim();
    if (!productId || !fieldKey) return;

    const current = specDb.getItemFieldStateByProductAndField(productId, fieldKey) || null;
    const selectedCandidateId = String(keyReviewState.selected_candidate_id || '').trim() || null;
    const candidateRow = selectedCandidateId ? specDb.getCandidateById(selectedCandidateId) : null;
    const selectedValue = candidateRow?.value ?? keyReviewState.selected_value ?? current?.value ?? null;
    if (!isMeaningfulValue(selectedValue) && !current) return;

    const confidenceScore = Number.isFinite(Number(candidateRow?.score))
      ? Number(candidateRow.score)
      : (Number.isFinite(Number(keyReviewState.confidence_score))
        ? Number(keyReviewState.confidence_score)
        : Number(current?.confidence || 0));
    const aiStatus = String(keyReviewState?.ai_confirm_primary_status || '').trim().toLowerCase();
    const aiConfirmed = aiStatus === 'confirmed';
    const source = candidateRow
      ? 'pipeline'
      : (String(current?.source || '').trim() || 'pipeline');

    specDb.upsertItemFieldState({
      productId,
      fieldKey,
      value: selectedValue,
      confidence: confidenceScore,
      source,
      acceptedCandidateId: selectedCandidateId || current?.accepted_candidate_id || null,
      overridden: false,
      needsAiReview: !aiConfirmed,
      aiReviewComplete: aiConfirmed,
    });
    try {
      specDb.syncItemListLinkForFieldValue({
        productId,
        fieldKey,
        value: selectedValue,
      });
    } catch { /* best-effort list-link sync */ }
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

  function resetTestModeSharedReviewState(specDb, category) {
    if (!specDb || !category) return 0;
    const ids = specDb.db.prepare(`
      SELECT id
      FROM key_review_state
      WHERE category = ?
        AND target_kind IN ('component_key', 'enum_key')
    `).all(category).map((row) => row.id);
    return specDb.deleteKeyReviewStateRowsByIds(ids);
  }

  function purgeTestModeCategoryState(specDb, category) {
    const cat = String(category || '').trim();
    if (!specDb || !cat || !cat.startsWith('_test_')) {
      return {
        clearedKeyReview: 0,
        clearedSources: 0,
        clearedCandidates: 0,
        clearedFieldState: 0,
        clearedComponentData: 0,
        clearedEnumData: 0,
        clearedCatalogState: 0,
        clearedArtifacts: 0,
      };
    }

    let clearedKeyReview = 0;
    let clearedSources = 0;
    let clearedCandidates = 0;
    let clearedFieldState = 0;
    let clearedComponentData = 0;
    let clearedEnumData = 0;
    let clearedCatalogState = 0;
    let clearedArtifacts = 0;

    const tx = specDb.db.transaction(() => {
      const keyReviewIds = specDb.db.prepare(`
        SELECT id
        FROM key_review_state
        WHERE category = ?
      `).all(cat).map((row) => row.id);
      clearedKeyReview = specDb.deleteKeyReviewStateRowsByIds(keyReviewIds);

      const sourceIds = specDb.db.prepare(`
        SELECT source_id
        FROM source_registry
        WHERE category = ?
      `).all(cat).map((row) => String(row.source_id || '').trim()).filter(Boolean);

      if (sourceIds.length > 0) {
        const placeholders = sourceIds.map(() => '?').join(',');
        specDb.db.prepare(`
          DELETE FROM key_review_run_sources
          WHERE assertion_id IN (
            SELECT assertion_id
            FROM source_assertions
            WHERE source_id IN (${placeholders})
          )
        `).run(...sourceIds);
        specDb.db.prepare(`
          DELETE FROM source_evidence_refs
          WHERE assertion_id IN (
            SELECT assertion_id
            FROM source_assertions
            WHERE source_id IN (${placeholders})
          )
        `).run(...sourceIds);
        clearedSources += specDb.db.prepare(`
          DELETE FROM source_assertions
          WHERE source_id IN (${placeholders})
        `).run(...sourceIds).changes;
        specDb.db.prepare(`
          DELETE FROM source_artifacts
          WHERE source_id IN (${placeholders})
        `).run(...sourceIds);
        clearedSources += specDb.db.prepare(`
          DELETE FROM source_registry
          WHERE source_id IN (${placeholders})
        `).run(...sourceIds).changes;
      }

      specDb.db.prepare(`
        DELETE FROM candidate_reviews
        WHERE candidate_id IN (
          SELECT candidate_id
          FROM candidates
          WHERE category = ?
        )
      `).run(cat);

      specDb.db.prepare('DELETE FROM item_list_links WHERE category = ?').run(cat);
      specDb.db.prepare('DELETE FROM item_component_links WHERE category = ?').run(cat);
      clearedCandidates = specDb.db.prepare('DELETE FROM candidates WHERE category = ?').run(cat).changes;
      clearedFieldState = specDb.db.prepare('DELETE FROM item_field_state WHERE category = ?').run(cat).changes;

      specDb.db.prepare(`
        DELETE FROM component_aliases
        WHERE component_id IN (
          SELECT id
          FROM component_identity
          WHERE category = ?
        )
      `).run(cat);
      clearedComponentData += specDb.db.prepare('DELETE FROM component_values WHERE category = ?').run(cat).changes;
      clearedComponentData += specDb.db.prepare('DELETE FROM component_identity WHERE category = ?').run(cat).changes;
      clearedEnumData += specDb.db.prepare('DELETE FROM list_values WHERE category = ?').run(cat).changes;
      clearedEnumData += specDb.db.prepare('DELETE FROM enum_lists WHERE category = ?').run(cat).changes;

      clearedCatalogState += specDb.db.prepare('DELETE FROM products WHERE category = ?').run(cat).changes;
      clearedCatalogState += specDb.db.prepare('DELETE FROM product_queue WHERE category = ?').run(cat).changes;
      clearedCatalogState += specDb.db.prepare('DELETE FROM product_runs WHERE category = ?').run(cat).changes;
      clearedCatalogState += specDb.db.prepare('DELETE FROM curation_suggestions WHERE category = ?').run(cat).changes;
      clearedCatalogState += specDb.db.prepare('DELETE FROM component_review_queue WHERE category = ?').run(cat).changes;
      clearedCatalogState += specDb.db.prepare('DELETE FROM llm_route_matrix WHERE category = ?').run(cat).changes;

      clearedArtifacts += specDb.db.prepare('DELETE FROM artifacts WHERE category = ?').run(cat).changes;
      clearedArtifacts += specDb.db.prepare('DELETE FROM audit_log WHERE category = ?').run(cat).changes;
      // Phase 12+ auxiliary tables may not exist in every DB build.
      try { clearedArtifacts += specDb.db.prepare('DELETE FROM category_brain WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += specDb.db.prepare('DELETE FROM source_corpus WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += specDb.db.prepare('DELETE FROM runtime_events WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += specDb.db.prepare('DELETE FROM source_intel_domains WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += specDb.db.prepare('DELETE FROM source_intel_field_rewards WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += specDb.db.prepare('DELETE FROM source_intel_brands WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
      try { clearedArtifacts += specDb.db.prepare('DELETE FROM source_intel_paths WHERE category = ?').run(cat).changes; } catch { /* ignore */ }
    });
    tx();

    return {
      clearedKeyReview,
      clearedSources,
      clearedCandidates,
      clearedFieldState,
      clearedComponentData,
      clearedEnumData,
      clearedCatalogState,
      clearedArtifacts,
    };
  }

  function resetTestModeProductReviewState(specDb, category, productId) {
    const pid = String(productId || '').trim();
    if (!specDb || !category || !pid) return {
      clearedCandidates: 0,
      clearedKeyReview: 0,
      clearedFieldState: 0,
      clearedLinks: 0,
      clearedSources: 0,
    };

    const stateIds = specDb.db.prepare(`
      SELECT id
      FROM key_review_state
      WHERE category = ?
        AND target_kind = 'grid_key'
        AND item_identifier = ?
    `).all(category, pid).map((row) => row.id);
    const clearedKeyReview = specDb.deleteKeyReviewStateRowsByIds(stateIds);

    let deletedCandidates = 0;
    let deletedFieldState = 0;
    let deletedLinks = 0;
    let deletedSources = 0;
    const tx = specDb.db.transaction(() => {
      const itemFieldStateIds = specDb.db.prepare(`
        SELECT id
        FROM item_field_state
        WHERE category = ? AND product_id = ?
      `).all(category, pid).map((row) => row.id);
      const sourceIds = specDb.db.prepare(`
        SELECT source_id
        FROM source_registry
        WHERE category = ? AND product_id = ?
      `).all(category, pid).map((row) => row.source_id);

      if (itemFieldStateIds.length > 0) {
        const placeholders = itemFieldStateIds.map(() => '?').join(',');
        specDb.db.prepare(`
          DELETE FROM source_evidence_refs
          WHERE assertion_id IN (
            SELECT assertion_id
            FROM source_assertions
            WHERE item_field_state_id IN (${placeholders})
          )
        `).run(...itemFieldStateIds);
        deletedSources += specDb.db.prepare(`
          DELETE FROM source_assertions
          WHERE item_field_state_id IN (${placeholders})
        `).run(...itemFieldStateIds).changes;
      }

      if (sourceIds.length > 0) {
        const placeholders = sourceIds.map(() => '?').join(',');
        specDb.db.prepare(`
          DELETE FROM source_evidence_refs
          WHERE assertion_id IN (
            SELECT assertion_id
            FROM source_assertions
            WHERE source_id IN (${placeholders})
          )
        `).run(...sourceIds);
        deletedSources += specDb.db.prepare(`
          DELETE FROM source_assertions
          WHERE source_id IN (${placeholders})
        `).run(...sourceIds).changes;
        specDb.db.prepare(`
          DELETE FROM source_artifacts
          WHERE source_id IN (${placeholders})
        `).run(...sourceIds);
        deletedSources += specDb.db.prepare(`
          DELETE FROM source_registry
          WHERE source_id IN (${placeholders})
        `).run(...sourceIds).changes;
      }

      if (itemFieldStateIds.length > 0) {
        const placeholders = itemFieldStateIds.map(() => '?').join(',');
        specDb.db.prepare(`
          DELETE FROM candidate_reviews
          WHERE candidate_id IN (
            SELECT candidate_id
            FROM candidates
            WHERE item_field_state_id IN (${placeholders})
          )
        `).run(...itemFieldStateIds);
        deletedCandidates = specDb.db.prepare(`
          DELETE FROM candidates
          WHERE item_field_state_id IN (${placeholders})
        `).run(...itemFieldStateIds).changes;
      }

      deletedLinks = specDb.db.prepare(`
        DELETE FROM item_list_links
        WHERE category = ? AND product_id = ?
      `).run(category, pid).changes;
      deletedLinks += specDb.db.prepare(`
        DELETE FROM item_component_links
        WHERE category = ? AND product_id = ?
      `).run(category, pid).changes;
      deletedFieldState = specDb.db.prepare(`
        DELETE FROM item_field_state
        WHERE category = ? AND product_id = ?
      `).run(category, pid).changes;
    });
    tx();

    return {
      clearedCandidates: deletedCandidates,
      clearedKeyReview,
      clearedFieldState: deletedFieldState,
      clearedLinks: deletedLinks,
      clearedSources: deletedSources,
    };
  }

  return {
    ensureGridKeyReviewState,
    resolveKeyReviewForLaneMutation,
    markPrimaryLaneReviewedInItemState,
    syncItemFieldStateFromPrimaryLaneAccept,
    syncPrimaryLaneAcceptFromItemSelection,
    purgeTestModeCategoryState,
    resetTestModeSharedReviewState,
    resetTestModeProductReviewState,
  };
}
