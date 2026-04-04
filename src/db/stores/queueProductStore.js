import { PRODUCT_RUN_BOOLEAN_KEYS } from '../specDbSchema.js';
import { hydrateRow, hydrateRows } from '../specDbHelpers.js';

/**
 * Queue, Product, Run, Audit, Curation, Component Review, Stale-marking store.
 * Extracted from SpecDb.
 *
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object }} deps
 */
export function createQueueProductStore({ db, category, stmts }) {
  // --- Queue ---

  function upsertQueueProduct(row) {
    stmts._upsertQueueProduct.run({
      category: row.category || category,
      product_id: row.product_id || '',
      s3key: row.s3key ?? '',
      status: row.status || 'pending',
      priority: row.priority ?? 3,
      attempts_total: row.attempts_total ?? 0,
      retry_count: row.retry_count ?? 0,
      max_attempts: row.max_attempts ?? 3,
      next_retry_at: row.next_retry_at ?? null,
      last_run_id: row.last_run_id ?? null,
      cost_usd_total: row.cost_usd_total ?? 0,
      rounds_completed: row.rounds_completed ?? 0,
      next_action_hint: row.next_action_hint ?? null,
      last_urls_attempted: row.last_urls_attempted ? JSON.stringify(row.last_urls_attempted) : null,
      last_error: row.last_error ?? null,
      last_started_at: row.last_started_at ?? null,
      last_completed_at: row.last_completed_at ?? null,
      dirty_flags: row.dirty_flags ? JSON.stringify(row.dirty_flags) : null,
      last_summary: row.last_summary ? JSON.stringify(row.last_summary) : null
    });
  }

  function getQueueProduct(productId) {
    const row = db
      .prepare('SELECT * FROM product_queue WHERE category = ? AND product_id = ?')
      .get(category, productId);
    if (!row) return null;
    if (row.last_urls_attempted) try { row.last_urls_attempted = JSON.parse(row.last_urls_attempted); } catch { /* leave as string */ }
    if (row.dirty_flags) try { row.dirty_flags = JSON.parse(row.dirty_flags); } catch { /* leave as string */ }
    if (row.last_summary) try { row.last_summary = JSON.parse(row.last_summary); } catch { /* leave as string */ }
    return row;
  }

  function getAllQueueProducts(statusFilter) {
    const sql = statusFilter
      ? 'SELECT * FROM product_queue WHERE category = ? AND status = ? ORDER BY priority ASC, updated_at ASC'
      : 'SELECT * FROM product_queue WHERE category = ? ORDER BY priority ASC, updated_at ASC';
    const rows = statusFilter
      ? db.prepare(sql).all(category, statusFilter)
      : db.prepare(sql).all(category);
    for (const row of rows) {
      if (row.last_urls_attempted) try { row.last_urls_attempted = JSON.parse(row.last_urls_attempted); } catch { /* */ }
      if (row.dirty_flags) try { row.dirty_flags = JSON.parse(row.dirty_flags); } catch { /* */ }
      if (row.last_summary) try { row.last_summary = JSON.parse(row.last_summary); } catch { /* */ }
    }
    return rows;
  }

  function updateQueueStatus(productId, status, extra = {}) {
    const sets = ['status = ?', "updated_at = datetime('now')"];
    const params = [status];
    for (const [key, val] of Object.entries(extra)) {
      sets.push(`${key} = ?`);
      params.push(typeof val === 'object' ? JSON.stringify(val) : val);
    }
    params.push(category, productId);
    db.prepare(`UPDATE product_queue SET ${sets.join(', ')} WHERE category = ? AND product_id = ?`).run(...params);
  }

  function clearQueueByStatus(status) {
    return db
      .prepare('DELETE FROM product_queue WHERE category = ? AND status = ?')
      .run(category, status);
  }

  function deleteQueueProduct(productId) {
    return db
      .prepare('DELETE FROM product_queue WHERE category = ? AND product_id = ?')
      .run(category, productId);
  }

  function getQueueStats() {
    return db.prepare(`
      SELECT status, COUNT(*) as count, SUM(cost_usd_total) as total_cost
      FROM product_queue WHERE category = ?
      GROUP BY status
    `).all(category);
  }

  function updateQueueProductPatch(productId, patch) {
    const existing = getQueueProduct(productId);
    if (!existing) return null;
    const merged = { ...existing, ...patch };
    upsertQueueProduct({
      ...merged,
      category,
      last_urls_attempted: Array.isArray(merged.last_urls_attempted) ? merged.last_urls_attempted : [],
      last_summary: merged.last_summary || null,
      dirty_flags: merged.dirty_flags || null
    });
    return merged;
  }

  function selectNextQueueProductSql() {
    const rows = db.prepare(`
      SELECT * FROM product_queue
      WHERE category = ?
        AND status NOT IN ('complete', 'blocked', 'paused', 'skipped', 'in_progress', 'needs_manual', 'exhausted', 'failed')
        AND (next_retry_at IS NULL OR next_retry_at = '' OR next_retry_at <= datetime('now'))
      ORDER BY priority ASC, attempts_total ASC, updated_at ASC
      LIMIT 50
    `).all(category);

    for (const row of rows) {
      if (row.last_urls_attempted) try { row.last_urls_attempted = JSON.parse(row.last_urls_attempted); } catch { row.last_urls_attempted = []; }
      if (row.dirty_flags) try { row.dirty_flags = JSON.parse(row.dirty_flags); } catch { row.dirty_flags = null; }
      if (row.last_summary) try { row.last_summary = JSON.parse(row.last_summary); } catch { row.last_summary = null; }
    }
    return rows.length > 0 ? rows[0] : null;
  }

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

  // --- Staleness marking ---

  function markProductsStale(productIds, dirtyFlag) {
    if (!productIds.length) return;
    const tx = db.transaction(() => {
      for (const pid of productIds) {
        const existing = db.prepare(
          'SELECT dirty_flags FROM product_queue WHERE category = ? AND product_id = ?'
        ).get(category, pid);
        let flags = [];
        if (existing?.dirty_flags) {
          try { flags = JSON.parse(existing.dirty_flags); } catch { flags = []; }
        }
        if (!flags.includes(dirtyFlag)) flags.push(dirtyFlag);
        if (existing) {
          db.prepare(
            `UPDATE product_queue SET dirty_flags = ?, status = CASE WHEN status IN ('complete','exhausted') THEN 'queued' ELSE status END, updated_at = datetime('now') WHERE category = ? AND product_id = ?`
          ).run(JSON.stringify(flags), category, pid);
        }
      }
    });
    tx();
  }

  function markProductsStaleDetailed(productIds, dirtyFlagObj) {
    if (!productIds.length) return;
    const tx = db.transaction(() => {
      for (const pid of productIds) {
        const existing = db.prepare(
          'SELECT dirty_flags, status, priority FROM product_queue WHERE category = ? AND product_id = ?'
        ).get(category, pid);
        if (!existing) continue;
        let flags = [];
        if (existing.dirty_flags) {
          try { flags = JSON.parse(existing.dirty_flags); } catch { flags = []; }
        }
        flags.push(dirtyFlagObj);
        const newPriority = Math.min(existing.priority || 99, dirtyFlagObj.priority || 3);
        db.prepare(
          `UPDATE product_queue SET dirty_flags = ?, status = 'stale', priority = ?, updated_at = datetime('now') WHERE category = ? AND product_id = ? AND status IN ('complete','stale','pending','exhausted')`
        ).run(JSON.stringify(flags), newPriority, category, pid);
      }
    });
    tx();
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
    upsertQueueProduct,
    getQueueProduct,
    getAllQueueProducts,
    updateQueueStatus,
    clearQueueByStatus,
    deleteQueueProduct,
    getQueueStats,
    updateQueueProductPatch,
    selectNextQueueProductSql,
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
    markProductsStale,
    markProductsStaleDetailed,
    upsertCurationSuggestion,
    getCurationSuggestions,
    updateCurationSuggestionStatus,
    upsertComponentReviewItem,
    getComponentReviewItems,
    updateComponentReviewQueueMatchedComponent,
    updateComponentReviewQueueMatchedComponentByName,
  };
}
