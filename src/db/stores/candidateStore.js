/**
 * Candidate & Review store — extracted from SpecDb.
 * Owns: candidates, candidate_reviews tables.
 *
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: { _insertCandidate: import('better-sqlite3').Statement, _upsertReview: import('better-sqlite3').Statement } }} deps
 */
export function createCandidateStore({ db, category, stmts }) {
  function insertCandidate(row) {
    const params = {
      candidate_id: row.candidate_id || '',
      category: row.category || category,
      product_id: row.product_id || '',
      field_key: row.field_key || '',
      value: row.value ?? null,
      normalized_value: row.normalized_value ?? null,
      score: row.score ?? 0,
      rank: row.rank ?? null,
      source_url: row.source_url ?? null,
      source_host: row.source_host ?? null,
      source_root_domain: row.source_root_domain ?? null,
      source_tier: row.source_tier ?? null,
      source_method: row.source_method ?? null,
      approved_domain: row.approved_domain ? 1 : 0,
      snippet_id: row.snippet_id ?? null,
      snippet_hash: row.snippet_hash ?? null,
      snippet_text: row.snippet_text ?? null,
      quote: row.quote ?? null,
      quote_span_start: row.quote_span_start ?? null,
      quote_span_end: row.quote_span_end ?? null,
      evidence_url: row.evidence_url ?? null,
      evidence_retrieved_at: row.evidence_retrieved_at ?? null,
      is_component_field: row.is_component_field ? 1 : 0,
      component_type: row.component_type ?? null,
      is_list_field: row.is_list_field ? 1 : 0,
      llm_extract_model: row.llm_extract_model ?? null,
      extracted_at: row.extracted_at || new Date().toISOString(),
      run_id: row.run_id ?? null
    };
    stmts._insertCandidate.run(params);
    return params;
  }

  function insertCandidatesBatch(rows) {
    const tx = db.transaction((items) => {
      for (const row of items) {
        insertCandidate(row);
      }
    });
    tx(rows);
  }

  function getCandidatesForField(productId, fieldKey) {
    return db
      .prepare('SELECT * FROM candidates WHERE product_id = ? AND field_key = ? ORDER BY score DESC, rank ASC')
      .all(productId, fieldKey);
  }

  function getCandidatesForProduct(productId) {
    const rows = db
      .prepare('SELECT * FROM candidates WHERE product_id = ? ORDER BY field_key, score DESC, rank ASC')
      .all(productId);
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.field_key]) grouped[row.field_key] = [];
      grouped[row.field_key].push(row);
    }
    return grouped;
  }

  function getCandidateById(candidateId) {
    const key = String(candidateId || '').trim();
    if (!key) return null;
    return db
      .prepare('SELECT * FROM candidates WHERE candidate_id = ?')
      .get(key) || null;
  }

  function upsertReview({ candidateId, contextType, contextId, humanAccepted, humanAcceptedAt, aiReviewStatus, aiConfidence, aiReason, aiReviewedAt, aiReviewModel, humanOverrideAi, humanOverrideAiAt }) {
    stmts._upsertReview.run({
      candidate_id: candidateId,
      context_type: contextType,
      context_id: contextId,
      human_accepted: humanAccepted ? 1 : 0,
      human_accepted_at: humanAcceptedAt ?? null,
      ai_review_status: aiReviewStatus || 'not_run',
      ai_confidence: aiConfidence ?? null,
      ai_reason: aiReason ?? null,
      ai_reviewed_at: aiReviewedAt ?? null,
      ai_review_model: aiReviewModel ?? null,
      human_override_ai: humanOverrideAi ? 1 : 0,
      human_override_ai_at: humanOverrideAiAt ?? null
    });
  }

  function getReviewsForCandidate(candidateId) {
    const key = String(candidateId || '').trim();
    if (!key) return [];
    return db
      .prepare('SELECT * FROM candidate_reviews WHERE candidate_id = ?')
      .all(key);
  }

  function getReviewsForContext(contextType, contextId) {
    return db
      .prepare('SELECT * FROM candidate_reviews WHERE context_type = ? AND context_id = ?')
      .all(contextType, contextId);
  }

  function getCandidatesForComponentProperty(componentType, componentName, componentMaker, fieldKey) {
    return db
      .prepare(`
        SELECT c.*
        FROM candidates c
        INNER JOIN item_component_links icl
          ON icl.product_id = c.product_id AND icl.category = c.category
        WHERE icl.category = ?
          AND icl.component_type = ?
          AND icl.component_name = ?
          AND icl.component_maker = ?
          AND c.field_key = ?
        ORDER BY c.score DESC, c.rank ASC, c.product_id
      `)
      .all(category, componentType, componentName, componentMaker || '', fieldKey);
  }

  function getCandidatesByListValue(fieldKey, listValueId) {
    return db
      .prepare(`
        SELECT c.*
        FROM candidates c
        INNER JOIN item_list_links ill
          ON ill.product_id = c.product_id AND ill.field_key = c.field_key
        WHERE ill.list_value_id = ? AND c.field_key = ? AND c.category = ?
        ORDER BY c.score DESC, c.rank ASC, c.product_id
      `)
      .all(listValueId, fieldKey, category);
  }

  function getCandidatesForFieldValue(fieldKey, value) {
    return db
      .prepare(`
        SELECT *
        FROM candidates
        WHERE category = ?
          AND field_key = ?
          AND value IS NOT NULL
          AND LOWER(TRIM(value)) = LOWER(TRIM(?))
        ORDER BY score DESC, rank ASC, product_id
      `)
      .all(category, fieldKey, value);
  }

  return {
    insertCandidate,
    insertCandidatesBatch,
    getCandidatesForField,
    getCandidatesForProduct,
    getCandidateById,
    upsertReview,
    getReviewsForCandidate,
    getReviewsForContext,
    getCandidatesForComponentProperty,
    getCandidatesByListValue,
    getCandidatesForFieldValue,
  };
}
