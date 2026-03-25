import { LLM_ROUTE_BOOLEAN_KEYS } from '../specDbSchema.js';
import { toBoolInt, toBand, makeRouteKey, baseLlmRoute, buildDefaultLlmRoutes } from '../specDbHelpers.js';

/**
 * LLM Route Matrix + Source Capture store — extracted from SpecDb.
 * Owns: llm_route_matrix, source_registry, source_artifacts, source_assertions, source_evidence_refs tables.
 *
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object }} deps
 */
export function createLlmRouteSourceStore({ db, category, stmts }) {
  function _normalizeLlmRouteRow(row, idx = 0) {
    const scope = ['field', 'component', 'list'].includes(String(row?.scope || '').toLowerCase())
      ? String(row.scope).toLowerCase()
      : 'field';
    const effort = Math.max(1, Math.min(10, Number.parseInt(String(row?.effort ?? 3), 10) || 3));
    const defaults = baseLlmRoute({
      category,
      scope,
      required_level: String(row?.required_level || 'expected').toLowerCase(),
      difficulty: String(row?.difficulty || 'medium').toLowerCase(),
      availability: String(row?.availability || 'expected').toLowerCase(),
      effort,
      model_ladder_today: String(row?.model_ladder_today || 'gpt-5-low -> gpt-5-medium'),
      single_source_data: row?.single_source_data,
      all_source_data: row?.all_source_data,
      enable_websearch: row?.enable_websearch,
      all_sources_confidence_repatch: row?.all_sources_confidence_repatch,
      max_tokens: row?.max_tokens ?? 4096,
      scalar_linked_send: String(row?.scalar_linked_send || 'scalar value + prime sources'),
      component_values_send: String(row?.component_values_send || 'component values + prime sources'),
      list_values_send: String(row?.list_values_send || 'list values prime sources'),
      llm_output_min_evidence_refs_required: row?.llm_output_min_evidence_refs_required ?? 1,
      insufficient_evidence_action: String(row?.insufficient_evidence_action || 'threshold_unmet'),
      route_key: String(row?.route_key || makeRouteKey(
        scope,
        String(row?.required_level || 'expected').toLowerCase(),
        String(row?.difficulty || 'medium').toLowerCase(),
        String(row?.availability || 'expected').toLowerCase(),
        String(row?.effort_band || toBand(effort)),
        idx + 1
      ))
    });
    const normalized = {
      ...defaults,
      route_key: String(defaults.route_key).trim() || makeRouteKey(scope, defaults.required_level, defaults.difficulty, defaults.availability, defaults.effort_band, idx + 1),
      effort_band: String(row?.effort_band || toBand(effort)),
      max_tokens: Math.max(256, Math.min(65536, Number.parseInt(String(row?.max_tokens ?? defaults.max_tokens), 10) || defaults.max_tokens)),
      llm_output_min_evidence_refs_required: Math.max(1, Math.min(5, Number.parseInt(String(row?.llm_output_min_evidence_refs_required ?? defaults.llm_output_min_evidence_refs_required), 10) || defaults.llm_output_min_evidence_refs_required))
    };

    for (const key of LLM_ROUTE_BOOLEAN_KEYS) {
      normalized[key] = toBoolInt(row?.[key], defaults[key]);
    }
    return normalized;
  }

  function _hydrateLlmRouteRow(row) {
    const out = { ...row };
    for (const key of LLM_ROUTE_BOOLEAN_KEYS) {
      out[key] = Number(row[key]) === 1;
    }
    return out;
  }

  function ensureDefaultLlmRouteMatrix() {
    const countRow = db
      .prepare('SELECT COUNT(*) as c FROM llm_route_matrix WHERE category = ?')
      .get(category);
    if ((countRow?.c || 0) > 0) return;
    const defaults = buildDefaultLlmRoutes(category);
    const tx = db.transaction((rows) => {
      for (const [idx, row] of rows.entries()) {
        stmts._upsertLlmRoute.run(_normalizeLlmRouteRow(row, idx));
      }
    });
    tx(defaults);
  }

  function getLlmRouteMatrix(scope) {
    ensureDefaultLlmRouteMatrix();
    const scopeToken = String(scope || '').trim().toLowerCase();
    const rows = scopeToken
      ? db
          .prepare('SELECT * FROM llm_route_matrix WHERE category = ? AND scope = ? ORDER BY id ASC')
          .all(category, scopeToken)
      : db
          .prepare('SELECT * FROM llm_route_matrix WHERE category = ? ORDER BY id ASC')
          .all(category);
    return rows.map((row) => _hydrateLlmRouteRow(row));
  }

  function saveLlmRouteMatrix(rows = []) {
    const list = Array.isArray(rows) ? rows : [];
    const tx = db.transaction((items) => {
      db.prepare('DELETE FROM llm_route_matrix WHERE category = ?').run(category);
      for (const [idx, row] of items.entries()) {
        stmts._upsertLlmRoute.run(_normalizeLlmRouteRow(row, idx));
      }
    });
    tx(list);
    return getLlmRouteMatrix();
  }

  function resetLlmRouteMatrixToDefaults() {
    db.prepare('DELETE FROM llm_route_matrix WHERE category = ?').run(category);
    ensureDefaultLlmRouteMatrix();
    return getLlmRouteMatrix();
  }

  // --- Source Capture ---

  function upsertSourceRegistry({ sourceId, category: cat, itemIdentifier, productId, runId, sourceUrl, sourceHost, sourceRootDomain, sourceTier, sourceMethod, crawlStatus, httpStatus, fetchedAt }) {
    stmts._upsertSourceRegistry.run({
      source_id: sourceId,
      category: cat || category,
      item_identifier: itemIdentifier || '',
      product_id: productId ?? null,
      run_id: runId ?? null,
      source_url: sourceUrl || '',
      source_host: sourceHost ?? null,
      source_root_domain: sourceRootDomain ?? null,
      source_tier: sourceTier ?? null,
      source_method: sourceMethod ?? null,
      crawl_status: crawlStatus || 'fetched',
      http_status: httpStatus ?? null,
      fetched_at: fetchedAt ?? null
    });
  }

  function insertSourceArtifact({ sourceId, artifactType, localPath, contentHash, mimeType, sizeBytes }) {
    stmts._insertSourceArtifact.run({
      source_id: sourceId,
      artifact_type: artifactType,
      local_path: localPath,
      content_hash: contentHash ?? null,
      mime_type: mimeType ?? null,
      size_bytes: sizeBytes ?? null
    });
  }

  function upsertSourceAssertion({
    assertionId, sourceId, fieldKey, contextKind, contextRef,
    itemFieldStateId, componentValueId, listValueId, enumListId,
    valueRaw, valueNormalized, unit, candidateId, extractionMethod
  }) {
    stmts._upsertSourceAssertion.run({
      assertion_id: assertionId,
      source_id: sourceId,
      field_key: fieldKey,
      context_kind: contextKind || 'scalar',
      context_ref: contextRef ?? null,
      item_field_state_id: itemFieldStateId ?? null,
      component_value_id: componentValueId ?? null,
      list_value_id: listValueId ?? null,
      enum_list_id: enumListId ?? null,
      value_raw: valueRaw ?? null,
      value_normalized: valueNormalized ?? null,
      unit: unit ?? null,
      candidate_id: candidateId ?? null,
      extraction_method: extractionMethod ?? null
    });
  }

  function insertSourceEvidenceRef({ assertionId, evidenceUrl, snippetId, quote, method, tier, retrievedAt }) {
    stmts._insertSourceEvidenceRef.run({
      assertion_id: assertionId,
      evidence_url: evidenceUrl ?? null,
      snippet_id: snippetId ?? null,
      quote: quote ?? null,
      method: method ?? null,
      tier: tier ?? null,
      retrieved_at: retrievedAt ?? null
    });
  }

  function getSourcesForItem(itemIdentifier) {
    return db
      .prepare('SELECT * FROM source_registry WHERE category = ? AND item_identifier = ? ORDER BY source_tier ASC, source_host')
      .all(category, itemIdentifier);
  }

  function getAssertionsForSource(sourceId) {
    return db
      .prepare('SELECT * FROM source_assertions WHERE source_id = ? ORDER BY field_key')
      .all(sourceId);
  }

  function hasSourceEvidenceRef(assertionId) {
    return db.prepare('SELECT 1 FROM source_evidence_refs WHERE assertion_id = ? LIMIT 1').get(assertionId) || null;
  }

  return {
    ensureDefaultLlmRouteMatrix,
    getLlmRouteMatrix,
    saveLlmRouteMatrix,
    resetLlmRouteMatrixToDefaults,
    upsertSourceRegistry,
    insertSourceArtifact,
    upsertSourceAssertion,
    insertSourceEvidenceRef,
    getSourcesForItem,
    getAssertionsForSource,
    hasSourceEvidenceRef,
  };
}
