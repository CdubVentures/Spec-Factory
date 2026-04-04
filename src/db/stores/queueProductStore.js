import { PRODUCT_RUN_BOOLEAN_KEYS } from '../specDbSchema.js';
import { hydrateRow, hydrateRows } from '../specDbHelpers.js';

/**
 * Product, Run, Curation, Component Review store.
 * Extracted from SpecDb.
 *
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object }} deps
 */
export function createQueueProductStore({ db, category, stmts }) {
  // --- Product Runs ---

  function upsertProductRun(row) {
    if (row.is_latest) {
      db.prepare(`UPDATE product_runs SET is_latest = 0 WHERE category = ? AND product_id = ? AND is_latest = 1`)
        .run(category, row.product_id);
    }
    stmts._upsertProductRun.run({
      category,
      product_id: row.product_id || '',
      run_id: row.run_id || '',
      is_latest: row.is_latest ? 1 : 0,
      summary_json: typeof row.summary === 'object' ? JSON.stringify(row.summary) : (row.summary_json ?? null),
      validated: row.validated ? 1 : 0,
      confidence: row.confidence ?? 0,
      cost_usd_run: row.cost_usd_run ?? 0,
      sources_attempted: row.sources_attempted ?? 0,
      run_at: row.run_at || new Date().toISOString()
    });
  }

  function getLatestProductRun(productId) {
    const row = hydrateRow(PRODUCT_RUN_BOOLEAN_KEYS, db
      .prepare('SELECT * FROM product_runs WHERE category = ? AND product_id = ? AND is_latest = 1')
      .get(category, productId));
    if (row?.summary_json) try { row.summary = JSON.parse(row.summary_json); } catch { /* */ }
    return row || null;
  }

  function getProductRuns(productId) {
    return hydrateRows(PRODUCT_RUN_BOOLEAN_KEYS, db
      .prepare('SELECT * FROM product_runs WHERE category = ? AND product_id = ? ORDER BY run_at DESC')
      .all(category, productId));
  }

  // --- Run Storage Location ---

  function updateRunStorageLocation({ productId, runId, storageState, localPath, s3Key, sizeBytes, relocatedAt }) {
    stmts._updateRunStorageLocation.run({
      category,
      product_id: productId || '',
      run_id: runId || '',
      storage_state: storageState || 'live',
      local_path: localPath || '',
      s3_key: s3Key || '',
      size_bytes: sizeBytes ?? 0,
      relocated_at: relocatedAt || '',
    });
  }

  function getRunStorageLocation({ productId, runId }) {
    return stmts._getRunStorageLocation.get(category, productId || '', runId || '') || null;
  }

  function listRunsByStorageState(storageState) {
    return hydrateRows(PRODUCT_RUN_BOOLEAN_KEYS,
      stmts._listRunsByStorageState.all(category, storageState || 'live'));
  }

  function countRunsByStorageState() {
    return stmts._countRunsByStorageState.all(category);
  }

  // --- Products ---

  function upsertProduct(row) {
    stmts._upsertProduct.run({
      category: row.category || category,
      product_id: row.product_id || '',
      brand: row.brand ?? '',
      model: row.model ?? '',
      base_model: row.base_model ?? '',
      variant: row.variant ?? '',
      status: row.status || 'active',
      seed_urls: Array.isArray(row.seed_urls) ? JSON.stringify(row.seed_urls) : (row.seed_urls ?? null),
      identifier: row.identifier ?? null,
      brand_identifier: row.brand_identifier ?? '',
    });
  }

  function getProduct(productId) {
    return db
      .prepare('SELECT * FROM products WHERE category = ? AND product_id = ?')
      .get(category, productId) || null;
  }

  function getAllProducts(statusFilter) {
    const sql = statusFilter
      ? 'SELECT * FROM products WHERE category = ? AND status = ? ORDER BY product_id'
      : 'SELECT * FROM products WHERE category = ? ORDER BY product_id';
    return statusFilter
      ? db.prepare(sql).all(category, statusFilter)
      : db.prepare(sql).all(category);
  }

  function deleteProduct(productId) {
    return db
      .prepare('DELETE FROM products WHERE category = ? AND product_id = ?')
      .run(category, productId);
  }

  // --- Curation Suggestions ---

  function upsertCurationSuggestion(row) {
    db.prepare(`
      INSERT INTO curation_suggestions (
        suggestion_id, category, suggestion_type, field_key, component_type,
        value, normalized_value, status, source, product_id, run_id,
        first_seen_at, last_seen_at
      ) VALUES (
        @suggestion_id, @category, @suggestion_type, @field_key, @component_type,
        @value, @normalized_value, @status, @source, @product_id, @run_id,
        @first_seen_at, @last_seen_at
      )
      ON CONFLICT(category, suggestion_type, field_key, value) DO UPDATE SET
        normalized_value = COALESCE(excluded.normalized_value, normalized_value),
        last_seen_at = excluded.last_seen_at,
        product_id = COALESCE(excluded.product_id, product_id),
        run_id = COALESCE(excluded.run_id, run_id),
        updated_at = datetime('now')
    `).run({
      suggestion_id: row.suggestion_id || '',
      category: row.category || category,
      suggestion_type: row.suggestion_type || 'enum_value',
      field_key: row.field_key ?? null,
      component_type: row.component_type ?? null,
      value: row.value || '',
      normalized_value: row.normalized_value ?? null,
      status: row.status || 'pending',
      source: row.source ?? null,
      product_id: row.product_id ?? null,
      run_id: row.run_id ?? null,
      first_seen_at: row.first_seen_at || new Date().toISOString(),
      last_seen_at: row.last_seen_at || new Date().toISOString()
    });
  }

  function getCurationSuggestions(suggestionType, statusFilter) {
    const sql = statusFilter
      ? 'SELECT * FROM curation_suggestions WHERE category = ? AND suggestion_type = ? AND status = ? ORDER BY field_key, value'
      : 'SELECT * FROM curation_suggestions WHERE category = ? AND suggestion_type = ? ORDER BY field_key, value';
    return statusFilter
      ? db.prepare(sql).all(category, suggestionType, statusFilter)
      : db.prepare(sql).all(category, suggestionType);
  }

  function updateCurationSuggestionStatus(suggestionType, fieldKey, value, status, extra = {}) {
    const sets = ['status = ?', "updated_at = datetime('now')"];
    const params = [status];
    if (extra.reviewed_by) { sets.push('reviewed_by = ?'); params.push(extra.reviewed_by); }
    if (extra.reviewed_at) { sets.push('reviewed_at = ?'); params.push(extra.reviewed_at); }
    if (extra.review_note) { sets.push('review_note = ?'); params.push(extra.review_note); }
    params.push(category, suggestionType, fieldKey || '', value || '');
    db.prepare(`UPDATE curation_suggestions SET ${sets.join(', ')} WHERE category = ? AND suggestion_type = ? AND field_key = ? AND value = ?`).run(...params);
  }

  // --- Component Review Queue ---

  function upsertComponentReviewItem(row) {
    db.prepare(`
      INSERT INTO component_review_queue (
        review_id, category, component_type, field_key, raw_query, matched_component,
        match_type, name_score, property_score, combined_score,
        alternatives, product_id, run_id, status,
        product_attributes, reasoning_note
      ) VALUES (
        @review_id, @category, @component_type, @field_key, @raw_query, @matched_component,
        @match_type, @name_score, @property_score, @combined_score,
        @alternatives, @product_id, @run_id, @status,
        @product_attributes, @reasoning_note
      )
      ON CONFLICT(review_id) DO UPDATE SET
        name_score = COALESCE(excluded.name_score, name_score),
        property_score = COALESCE(excluded.property_score, property_score),
        combined_score = COALESCE(excluded.combined_score, combined_score),
        updated_at = datetime('now')
    `).run({
      review_id: row.review_id || '',
      category: row.category || category,
      component_type: row.component_type || '',
      field_key: row.field_key ?? null,
      raw_query: row.raw_query || '',
      matched_component: row.matched_component ?? null,
      match_type: row.match_type || 'fuzzy_flagged',
      name_score: row.name_score ?? 0,
      property_score: row.property_score ?? 0,
      combined_score: row.combined_score ?? 0,
      alternatives: Array.isArray(row.alternatives) ? JSON.stringify(row.alternatives) : (row.alternatives ?? null),
      product_id: row.product_id ?? null,
      run_id: row.run_id ?? null,
      status: row.status || 'pending_ai',
      product_attributes: row.product_attributes && typeof row.product_attributes === 'object' ? JSON.stringify(row.product_attributes) : (row.product_attributes ?? null),
      reasoning_note: row.reasoning_note ?? null
    });
  }

  function getComponentReviewItems(componentType, statusFilter) {
    const sql = statusFilter
      ? 'SELECT * FROM component_review_queue WHERE category = ? AND component_type = ? AND status = ? ORDER BY combined_score DESC'
      : 'SELECT * FROM component_review_queue WHERE category = ? AND component_type = ? ORDER BY combined_score DESC';
    const rows = statusFilter
      ? db.prepare(sql).all(category, componentType, statusFilter)
      : db.prepare(sql).all(category, componentType);
    for (const row of rows) {
      if (row.alternatives) try { row.alternatives = JSON.parse(row.alternatives); } catch { /* */ }
      if (row.product_attributes) try { row.product_attributes = JSON.parse(row.product_attributes); } catch { /* */ }
    }
    return rows;
  }

  function updateComponentReviewQueueMatchedComponent(category, reviewId, newValue) {
    db.prepare(
      `UPDATE component_review_queue SET matched_component = ?, updated_at = datetime('now') WHERE category = ? AND review_id = ?`
    ).run(newValue, category, reviewId);
  }

  function updateComponentReviewQueueMatchedComponentByName(category, componentType, oldName, newValue) {
    db.prepare(
      `UPDATE component_review_queue
       SET matched_component = ?, updated_at = datetime('now')
       WHERE category = ? AND component_type = ? AND status = 'pending_ai'
         AND (
           LOWER(TRIM(COALESCE(matched_component, ''))) = LOWER(TRIM(?))
           OR (
             (matched_component IS NULL OR TRIM(matched_component) = '')
             AND LOWER(TRIM(COALESCE(raw_query, ''))) = LOWER(TRIM(?))
           )
         )`
    ).run(newValue, category, componentType, oldName, oldName);
  }

  return {
    upsertProductRun,
    getLatestProductRun,
    getProductRuns,
    updateRunStorageLocation,
    getRunStorageLocation,
    listRunsByStorageState,
    countRunsByStorageState,
    upsertProduct,
    getProduct,
    getAllProducts,
    deleteProduct,
    upsertCurationSuggestion,
    getCurationSuggestions,
    updateCurationSuggestionStatus,
    upsertComponentReviewItem,
    getComponentReviewItems,
    updateComponentReviewQueueMatchedComponent,
    updateComponentReviewQueueMatchedComponentByName,
  };
}
