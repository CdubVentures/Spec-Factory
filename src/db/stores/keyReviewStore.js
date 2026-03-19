import { toPositiveInteger } from '../specDbHelpers.js';

/**
 * Key Review store — extracted from SpecDb.
 * Owns: key_review_state, key_review_runs, key_review_run_sources, key_review_audit tables.
 *
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object }} deps
 */
export function createKeyReviewStore({ db, category, stmts }) {
  function backfillKeyReviewSlotIds() {
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE key_review_state
        SET item_field_state_id = (
          SELECT ifs.id
          FROM item_field_state ifs
          WHERE ifs.category = key_review_state.category
            AND ifs.product_id = key_review_state.item_identifier
            AND ifs.field_key = key_review_state.field_key
          LIMIT 1
        ),
        updated_at = datetime('now')
        WHERE target_kind = 'grid_key'
          AND item_field_state_id IS NULL
      `).run();

      db.prepare(`
        UPDATE key_review_state
        SET component_value_id = (
          SELECT cv.id
          FROM component_values cv
          WHERE cv.category = key_review_state.category
            AND cv.property_key = key_review_state.property_key
            AND (
              cv.component_type || '::' || cv.component_name || '::' || COALESCE(cv.component_maker, '')
            ) = key_review_state.component_identifier
          LIMIT 1
        ),
        updated_at = datetime('now')
        WHERE target_kind = 'component_key'
          AND component_value_id IS NULL
          AND COALESCE(property_key, '') NOT IN ('__name', '__maker', '__links', '__aliases')
      `).run();

      db.prepare(`
        UPDATE key_review_state
        SET component_identity_id = (
          SELECT cv.component_identity_id
          FROM component_values cv
          WHERE cv.id = key_review_state.component_value_id
          LIMIT 1
        ),
        updated_at = datetime('now')
        WHERE target_kind = 'component_key'
          AND component_identity_id IS NULL
          AND component_value_id IS NOT NULL
      `).run();

      db.prepare(`
        UPDATE key_review_state
        SET component_identity_id = (
          SELECT ci.id
          FROM component_identity ci
          WHERE ci.category = key_review_state.category
            AND (
              ci.component_type || '::' || ci.canonical_name || '::' || COALESCE(ci.maker, '')
            ) = key_review_state.component_identifier
          LIMIT 1
        ),
        updated_at = datetime('now')
        WHERE target_kind = 'component_key'
          AND component_identity_id IS NULL
      `).run();

      db.prepare(`
        UPDATE key_review_state
        SET list_value_id = (
          SELECT lv.id
          FROM list_values lv
          WHERE lv.category = key_review_state.category
            AND lv.field_key = key_review_state.field_key
            AND (
              (key_review_state.enum_value_norm IS NOT NULL AND lv.normalized_value = key_review_state.enum_value_norm)
              OR (key_review_state.enum_value_norm IS NULL AND lv.normalized_value = LOWER(TRIM(COALESCE(key_review_state.selected_value, ''))))
            )
          LIMIT 1
        ),
        updated_at = datetime('now')
        WHERE target_kind = 'enum_key'
          AND list_value_id IS NULL
      `).run();

      db.prepare(`
        UPDATE key_review_state
        SET enum_list_id = (
          SELECT lv.list_id
          FROM list_values lv
          WHERE lv.id = key_review_state.list_value_id
          LIMIT 1
        ),
        updated_at = datetime('now')
        WHERE target_kind = 'enum_key'
          AND list_value_id IS NOT NULL
          AND enum_list_id IS NULL
      `).run();

      db.prepare(`
        UPDATE key_review_state
        SET enum_list_id = (
          SELECT el.id
          FROM enum_lists el
          WHERE el.category = key_review_state.category
            AND el.field_key = key_review_state.field_key
          LIMIT 1
        ),
        updated_at = datetime('now')
        WHERE target_kind = 'enum_key'
          AND enum_list_id IS NULL
      `).run();
    });
    tx();
  }

  function deleteKeyReviewStateRowsByIds(stateIds = []) {
    const ids = Array.isArray(stateIds)
      ? stateIds
        .map((value) => Number.parseInt(String(value), 10))
        .filter((value) => Number.isFinite(value) && value > 0)
      : [];
    if (ids.length === 0) return 0;
    const tx = db.transaction((rows) => {
      for (const id of rows) {
        db.prepare(`
          DELETE FROM key_review_run_sources
          WHERE key_review_run_id IN (
            SELECT run_id
            FROM key_review_runs
            WHERE key_review_state_id = ?
          )
        `).run(id);
        db.prepare('DELETE FROM key_review_runs WHERE key_review_state_id = ?').run(id);
        db.prepare('DELETE FROM key_review_audit WHERE key_review_state_id = ?').run(id);
        db.prepare('DELETE FROM key_review_state WHERE id = ?').run(id);
      }
    });
    tx(ids);
    return ids.length;
  }

  function upsertKeyReviewState(row) {
    const targetKind = row.targetKind || row.target_kind;
    const cat = row.category || category;
    const itemFieldStateId = toPositiveInteger(row.itemFieldStateId ?? row.item_field_state_id);
    const componentValueId = toPositiveInteger(row.componentValueId ?? row.component_value_id);
    const componentIdentityId = toPositiveInteger(row.componentIdentityId ?? row.component_identity_id);
    const listValueId = toPositiveInteger(row.listValueId ?? row.list_value_id);
    const enumListId = toPositiveInteger(row.enumListId ?? row.enum_list_id);
    const propertyKey = String(row.propertyKey ?? row.property_key ?? '').trim() || null;

    let existing = null;
    if (targetKind === 'grid_key') {
      if (!itemFieldStateId) {
        throw new Error('itemFieldStateId is required for grid key review state upsert.');
      }
      existing = db.prepare(
        "SELECT id FROM key_review_state WHERE category = ? AND target_kind = 'grid_key' AND item_field_state_id = ?"
      ).get(cat, itemFieldStateId);
    } else if (targetKind === 'enum_key') {
      if (!listValueId) {
        throw new Error('listValueId is required for enum key review state upsert.');
      }
      existing = db.prepare(
        "SELECT id FROM key_review_state WHERE category = ? AND target_kind = 'enum_key' AND list_value_id = ?"
      ).get(cat, listValueId);
    } else if (targetKind === 'component_key') {
      if (componentValueId) {
        existing = db.prepare(
          "SELECT id FROM key_review_state WHERE category = ? AND target_kind = 'component_key' AND component_value_id = ?"
        ).get(cat, componentValueId);
      } else if (componentIdentityId && propertyKey) {
        existing = db.prepare(
          "SELECT id FROM key_review_state WHERE category = ? AND target_kind = 'component_key' AND component_identity_id = ? AND property_key = ?"
        ).get(cat, componentIdentityId, propertyKey);
      } else {
        throw new Error('componentValueId or (componentIdentityId + propertyKey) is required for component key review state upsert.');
      }
    } else {
      throw new Error(`Unsupported key review targetKind '${targetKind}'.`);
    }

    const params = {
      category: cat,
      target_kind: targetKind,
      item_identifier: row.itemIdentifier ?? row.item_identifier ?? null,
      field_key: row.fieldKey || row.field_key || '',
      enum_value_norm: row.enumValueNorm ?? row.enum_value_norm ?? null,
      component_identifier: row.componentIdentifier ?? row.component_identifier ?? null,
      property_key: propertyKey,
      item_field_state_id: itemFieldStateId,
      component_value_id: componentValueId,
      component_identity_id: componentIdentityId,
      list_value_id: listValueId,
      enum_list_id: enumListId,
      required_level: row.requiredLevel ?? row.required_level ?? null,
      availability: row.availability ?? null,
      difficulty: row.difficulty ?? null,
      effort: row.effort ?? null,
      ai_mode: row.aiMode ?? row.ai_mode ?? null,
      parse_template: row.parseTemplate ?? row.parse_template ?? null,
      evidence_policy: row.evidencePolicy ?? row.evidence_policy ?? null,
      min_evidence_refs_effective: row.minEvidenceRefsEffective ?? row.min_evidence_refs_effective ?? 1,
      min_distinct_sources_required: row.minDistinctSourcesRequired ?? row.min_distinct_sources_required ?? 1,
      send_mode: row.sendMode ?? row.send_mode ?? null,
      component_send_mode: row.componentSendMode ?? row.component_send_mode ?? null,
      list_send_mode: row.listSendMode ?? row.list_send_mode ?? null,
      selected_value: row.selectedValue ?? row.selected_value ?? null,
      selected_candidate_id: row.selectedCandidateId ?? row.selected_candidate_id ?? null,
      confidence_score: row.confidenceScore ?? row.confidence_score ?? 0,
      confidence_level: row.confidenceLevel ?? row.confidence_level ?? null,
      flagged_at: row.flaggedAt ?? row.flagged_at ?? null,
      resolved_at: row.resolvedAt ?? row.resolved_at ?? null,
      ai_confirm_primary_status: row.aiConfirmPrimaryStatus ?? row.ai_confirm_primary_status ?? null,
      ai_confirm_primary_confidence: row.aiConfirmPrimaryConfidence ?? row.ai_confirm_primary_confidence ?? null,
      ai_confirm_primary_at: row.aiConfirmPrimaryAt ?? row.ai_confirm_primary_at ?? null,
      ai_confirm_primary_interrupted: row.aiConfirmPrimaryInterrupted ?? row.ai_confirm_primary_interrupted ?? 0,
      ai_confirm_primary_error: row.aiConfirmPrimaryError ?? row.ai_confirm_primary_error ?? null,
      ai_confirm_shared_status: row.aiConfirmSharedStatus ?? row.ai_confirm_shared_status ?? null,
      ai_confirm_shared_confidence: row.aiConfirmSharedConfidence ?? row.ai_confirm_shared_confidence ?? null,
      ai_confirm_shared_at: row.aiConfirmSharedAt ?? row.ai_confirm_shared_at ?? null,
      ai_confirm_shared_interrupted: row.aiConfirmSharedInterrupted ?? row.ai_confirm_shared_interrupted ?? 0,
      ai_confirm_shared_error: row.aiConfirmSharedError ?? row.ai_confirm_shared_error ?? null,
      user_accept_primary_status: row.userAcceptPrimaryStatus ?? row.user_accept_primary_status ?? null,
      user_accept_primary_at: row.userAcceptPrimaryAt ?? row.user_accept_primary_at ?? null,
      user_accept_primary_by: row.userAcceptPrimaryBy ?? row.user_accept_primary_by ?? null,
      user_accept_shared_status: row.userAcceptSharedStatus ?? row.user_accept_shared_status ?? null,
      user_accept_shared_at: row.userAcceptSharedAt ?? row.user_accept_shared_at ?? null,
      user_accept_shared_by: row.userAcceptSharedBy ?? row.user_accept_shared_by ?? null,
      user_override_ai_primary: row.userOverrideAiPrimary ?? row.user_override_ai_primary ?? 0,
      user_override_ai_primary_at: row.userOverrideAiPrimaryAt ?? row.user_override_ai_primary_at ?? null,
      user_override_ai_primary_reason: row.userOverrideAiPrimaryReason ?? row.user_override_ai_primary_reason ?? null,
      user_override_ai_shared: row.userOverrideAiShared ?? row.user_override_ai_shared ?? 0,
      user_override_ai_shared_at: row.userOverrideAiSharedAt ?? row.user_override_ai_shared_at ?? null,
      user_override_ai_shared_reason: row.userOverrideAiSharedReason ?? row.user_override_ai_shared_reason ?? null,
    };

    if (existing) {
      db.prepare(`
        UPDATE key_review_state SET
          item_field_state_id = COALESCE(@item_field_state_id, item_field_state_id),
          component_value_id = COALESCE(@component_value_id, component_value_id),
          component_identity_id = COALESCE(@component_identity_id, component_identity_id),
          list_value_id = COALESCE(@list_value_id, list_value_id),
          enum_list_id = COALESCE(@enum_list_id, enum_list_id),
          required_level = @required_level, availability = @availability, difficulty = @difficulty,
          effort = @effort, ai_mode = @ai_mode, parse_template = @parse_template,
          evidence_policy = @evidence_policy, min_evidence_refs_effective = @min_evidence_refs_effective,
          min_distinct_sources_required = @min_distinct_sources_required,
          send_mode = @send_mode, component_send_mode = @component_send_mode, list_send_mode = @list_send_mode,
          selected_value = @selected_value, selected_candidate_id = @selected_candidate_id,
          confidence_score = @confidence_score, confidence_level = @confidence_level,
          flagged_at = @flagged_at, resolved_at = @resolved_at,
          ai_confirm_primary_status = @ai_confirm_primary_status,
          ai_confirm_primary_confidence = @ai_confirm_primary_confidence,
          ai_confirm_primary_at = @ai_confirm_primary_at,
          ai_confirm_primary_interrupted = @ai_confirm_primary_interrupted,
          ai_confirm_primary_error = @ai_confirm_primary_error,
          ai_confirm_shared_status = @ai_confirm_shared_status,
          ai_confirm_shared_confidence = @ai_confirm_shared_confidence,
          ai_confirm_shared_at = @ai_confirm_shared_at,
          ai_confirm_shared_interrupted = @ai_confirm_shared_interrupted,
          ai_confirm_shared_error = @ai_confirm_shared_error,
          user_accept_primary_status = @user_accept_primary_status,
          user_accept_primary_at = @user_accept_primary_at,
          user_accept_primary_by = @user_accept_primary_by,
          user_accept_shared_status = @user_accept_shared_status,
          user_accept_shared_at = @user_accept_shared_at,
          user_accept_shared_by = @user_accept_shared_by,
          user_override_ai_primary = @user_override_ai_primary,
          user_override_ai_primary_at = @user_override_ai_primary_at,
          user_override_ai_primary_reason = @user_override_ai_primary_reason,
          user_override_ai_shared = @user_override_ai_shared,
          user_override_ai_shared_at = @user_override_ai_shared_at,
          user_override_ai_shared_reason = @user_override_ai_shared_reason,
          updated_at = datetime('now')
        WHERE id = @id
      `).run({ ...params, id: existing.id });
      return existing.id;
    } else {
      const info = stmts._insertKeyReviewState.run(params);
      return info.lastInsertRowid;
    }
  }

  function getKeyReviewState({
    category: cat,
    targetKind,
    propertyKey,
    itemFieldStateId,
    componentValueId,
    componentIdentityId,
    listValueId,
  }) {
    const c = cat || category;
    if (targetKind === 'grid_key') {
      const slotId = toPositiveInteger(itemFieldStateId);
      if (!slotId) return null;
      return db.prepare(
        "SELECT * FROM key_review_state WHERE category = ? AND target_kind = 'grid_key' AND item_field_state_id = ?"
      ).get(c, slotId) || null;
    } else if (targetKind === 'enum_key') {
      const slotId = toPositiveInteger(listValueId);
      if (!slotId) return null;
      return db.prepare(
        "SELECT * FROM key_review_state WHERE category = ? AND target_kind = 'enum_key' AND list_value_id = ?"
      ).get(c, slotId) || null;
    } else if (targetKind === 'component_key') {
      const valueSlotId = toPositiveInteger(componentValueId);
      if (valueSlotId) {
        return db.prepare(
          "SELECT * FROM key_review_state WHERE category = ? AND target_kind = 'component_key' AND component_value_id = ?"
        ).get(c, valueSlotId) || null;
      }
      const identitySlotId = toPositiveInteger(componentIdentityId);
      const normalizedPropertyKey = String(propertyKey || '').trim();
      if (!identitySlotId || !normalizedPropertyKey) return null;
      return db.prepare(
        "SELECT * FROM key_review_state WHERE category = ? AND target_kind = 'component_key' AND component_identity_id = ? AND property_key = ?"
      ).get(c, identitySlotId, normalizedPropertyKey) || null;
    }
    return null;
  }

  function getKeyReviewStatesForItem(itemIdentifier) {
    return db.prepare(
      "SELECT * FROM key_review_state WHERE category = ? AND target_kind = 'grid_key' AND item_identifier = ? ORDER BY field_key"
    ).all(category, itemIdentifier);
  }

  function getKeyReviewStatesForField(fieldKey, targetKind) {
    if (targetKind) {
      return db.prepare(
        'SELECT * FROM key_review_state WHERE category = ? AND target_kind = ? AND field_key = ? ORDER BY item_identifier, enum_value_norm'
      ).all(category, targetKind, fieldKey);
    }
    return db.prepare(
      'SELECT * FROM key_review_state WHERE category = ? AND field_key = ? ORDER BY target_kind, item_identifier, enum_value_norm'
    ).all(category, fieldKey);
  }

  function getKeyReviewStatesForComponent(componentIdentifier) {
    return db.prepare(
      "SELECT * FROM key_review_state WHERE category = ? AND target_kind = 'component_key' AND component_identifier = ? ORDER BY property_key"
    ).all(category, componentIdentifier);
  }

  function getKeyReviewStatesForEnum(fieldKey) {
    return db.prepare(
      "SELECT * FROM key_review_state WHERE category = ? AND target_kind = 'enum_key' AND field_key = ? ORDER BY enum_value_norm"
    ).all(category, fieldKey);
  }

  function updateKeyReviewAiConfirm({ id, lane, status, confidence, at, error }) {
    const col = lane === 'shared' ? 'shared' : 'primary';
    db.prepare(`
      UPDATE key_review_state SET
        ai_confirm_${col}_status = ?,
        ai_confirm_${col}_confidence = ?,
        ai_confirm_${col}_at = ?,
        ai_confirm_${col}_error = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(status, confidence ?? null, at ?? new Date().toISOString(), error ?? null, id);
  }

  function updateKeyReviewUserAccept({ id, lane, status, at, by }) {
    const col = lane === 'shared' ? 'shared' : 'primary';
    db.prepare(`
      UPDATE key_review_state SET
        user_accept_${col}_status = ?,
        user_accept_${col}_at = ?,
        user_accept_${col}_by = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(status, at ?? new Date().toISOString(), by ?? null, id);
  }

  function updateKeyReviewOverrideAi({ id, lane, reason }) {
    const col = lane === 'shared' ? 'shared' : 'primary';
    db.prepare(`
      UPDATE key_review_state SET
        user_override_ai_${col} = 1,
        user_override_ai_${col}_at = datetime('now'),
        user_override_ai_${col}_reason = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(reason ?? null, id);
  }

  function insertKeyReviewRun({ keyReviewStateId, stage, status, provider, modelUsed, promptHash, responseSchemaVersion, inputTokens, outputTokens, latencyMs, costUsd, error, startedAt, finishedAt }) {
    const info = stmts._insertKeyReviewRun.run({
      key_review_state_id: keyReviewStateId,
      stage: stage || 'extract',
      status: status || 'pending',
      provider: provider ?? null,
      model_used: modelUsed ?? null,
      prompt_hash: promptHash ?? null,
      response_schema_version: responseSchemaVersion ?? null,
      input_tokens: inputTokens ?? null,
      output_tokens: outputTokens ?? null,
      latency_ms: latencyMs ?? null,
      cost_usd: costUsd ?? null,
      error: error ?? null,
      started_at: startedAt ?? null,
      finished_at: finishedAt ?? null
    });
    return info.lastInsertRowid;
  }

  function insertKeyReviewRunSource({ keyReviewRunId, assertionId, packetRole, position }) {
    stmts._insertKeyReviewRunSource.run({
      key_review_run_id: keyReviewRunId,
      assertion_id: assertionId,
      packet_role: packetRole ?? null,
      position: position ?? null
    });
  }

  function insertKeyReviewAudit({ keyReviewStateId, eventType, actorType, actorId, oldValue, newValue, reason }) {
    stmts._insertKeyReviewAudit.run({
      key_review_state_id: keyReviewStateId,
      event_type: eventType,
      actor_type: actorType || 'system',
      actor_id: actorId ?? null,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
      reason: reason ?? null
    });
  }

  /**
   * Clear slot/state candidate pointers that no longer map to a valid candidate row.
   * This protects UI lane actions from stale IDs after reseed/reset cycles.
   */
  function pruneOrphanCandidateReferences() {
    const result = {
      itemFieldStateCleared: 0,
      componentValueCleared: 0,
      listValueCleared: 0,
      keyReviewStateCleared: 0,
    };

    const tx = db.transaction(() => {
      result.itemFieldStateCleared = db.prepare(`
        UPDATE item_field_state
        SET accepted_candidate_id = NULL,
            updated_at = datetime('now')
        WHERE category = ?
          AND accepted_candidate_id IS NOT NULL
          AND TRIM(accepted_candidate_id) <> ''
          AND NOT EXISTS (
            SELECT 1
            FROM candidates c
            WHERE c.category = item_field_state.category
              AND c.candidate_id = item_field_state.accepted_candidate_id
              AND c.product_id = item_field_state.product_id
              AND c.field_key = item_field_state.field_key
          )
      `).run(category).changes;

      result.componentValueCleared = db.prepare(`
        UPDATE component_values
        SET accepted_candidate_id = NULL,
            updated_at = datetime('now')
        WHERE category = ?
          AND accepted_candidate_id IS NOT NULL
          AND TRIM(accepted_candidate_id) <> ''
          AND NOT EXISTS (
            SELECT 1
            FROM candidates c
            WHERE c.category = component_values.category
              AND c.candidate_id = component_values.accepted_candidate_id
              AND c.field_key = component_values.property_key
          )
      `).run(category).changes;

      result.listValueCleared = db.prepare(`
        UPDATE list_values
        SET accepted_candidate_id = NULL,
            updated_at = datetime('now')
        WHERE category = ?
          AND accepted_candidate_id IS NOT NULL
          AND TRIM(accepted_candidate_id) <> ''
          AND NOT EXISTS (
            SELECT 1
            FROM candidates c
            WHERE c.category = list_values.category
              AND c.candidate_id = list_values.accepted_candidate_id
              AND c.field_key = list_values.field_key
          )
      `).run(category).changes;

      result.keyReviewStateCleared = db.prepare(`
        UPDATE key_review_state
        SET selected_candidate_id = NULL,
            updated_at = datetime('now')
        WHERE category = ?
          AND selected_candidate_id IS NOT NULL
          AND TRIM(selected_candidate_id) <> ''
          AND (
            NOT EXISTS (
              SELECT 1
              FROM candidates c
              WHERE c.category = key_review_state.category
                AND c.candidate_id = key_review_state.selected_candidate_id
            )
            OR (
              target_kind = 'grid_key'
              AND (
                key_review_state.item_field_state_id IS NULL
                OR NOT EXISTS (
                SELECT 1
                FROM candidates c
                WHERE c.category = key_review_state.category
                  AND c.candidate_id = key_review_state.selected_candidate_id
                  AND EXISTS (
                    SELECT 1
                    FROM item_field_state ifs
                    WHERE ifs.id = key_review_state.item_field_state_id
                      AND ifs.category = key_review_state.category
                      AND c.product_id = ifs.product_id
                      AND c.field_key = ifs.field_key
                  )
              )
              )
            )
            OR (
              target_kind = 'enum_key'
              AND (
                key_review_state.list_value_id IS NULL
                OR NOT EXISTS (
                SELECT 1
                FROM candidates c
                WHERE c.category = key_review_state.category
                  AND c.candidate_id = key_review_state.selected_candidate_id
                  AND EXISTS (
                    SELECT 1
                    FROM list_values lv
                    WHERE lv.id = key_review_state.list_value_id
                      AND lv.category = key_review_state.category
                      AND c.field_key = lv.field_key
                  )
              )
              )
            )
            OR (
              target_kind = 'component_key'
              AND property_key NOT IN ('__name', '__maker', '__links', '__aliases')
              AND (
                key_review_state.component_value_id IS NULL
                OR NOT EXISTS (
                SELECT 1
                FROM candidates c
                WHERE c.category = key_review_state.category
                  AND c.candidate_id = key_review_state.selected_candidate_id
                  AND EXISTS (
                    SELECT 1
                    FROM component_values cv
                    WHERE cv.id = key_review_state.component_value_id
                      AND cv.category = key_review_state.category
                      AND c.field_key = cv.property_key
                  )
              )
              )
            )
            OR (
              target_kind = 'component_key'
              AND property_key IN ('__name', '__maker', '__links', '__aliases')
              AND key_review_state.component_identity_id IS NULL
            )
          )
      `).run(category).changes;
    });
    tx();
    return result;
  }

  function getKeyReviewStateById(id) {
    const parsed = Number(id);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return db.prepare('SELECT * FROM key_review_state WHERE id = ?').get(parsed) || null;
  }

  function updateKeyReviewSelectedCandidate({ id, selectedCandidateId, selectedValue, confidenceScore }) {
    db.prepare(`
      UPDATE key_review_state
      SET selected_candidate_id = ?,
          selected_value = ?,
          confidence_score = COALESCE(?, confidence_score),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(selectedCandidateId, selectedValue, confidenceScore, id);
  }

  return {
    backfillKeyReviewSlotIds,
    deleteKeyReviewStateRowsByIds,
    upsertKeyReviewState,
    getKeyReviewState,
    getKeyReviewStateById,
    updateKeyReviewSelectedCandidate,
    getKeyReviewStatesForItem,
    getKeyReviewStatesForField,
    getKeyReviewStatesForComponent,
    getKeyReviewStatesForEnum,
    updateKeyReviewAiConfirm,
    updateKeyReviewUserAccept,
    updateKeyReviewOverrideAi,
    insertKeyReviewRun,
    insertKeyReviewRunSource,
    insertKeyReviewAudit,
    pruneOrphanCandidateReferences,
  };
}
