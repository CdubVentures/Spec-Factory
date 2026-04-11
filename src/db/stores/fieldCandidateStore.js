/**
 * Field Candidate SQL store.
 *
 * SQL projection of product.json candidates[]. One row per unique
 * (category, product_id, field_key, value). Sources accumulate as JSON.
 * Rebuildable from product.json (Phase A5).
 */

function safeParse(str, fallback) {
  try { return JSON.parse(str); }
  catch { return fallback; }
}

function hydrateRow(row) {
  if (!row) return null;
  return {
    ...row,
    sources_json: safeParse(row.sources_json, []),
    validation_json: safeParse(row.validation_json, {}),
    metadata_json: safeParse(row.metadata_json, {}),
  };
}

/**
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object }} deps
 */
export function createFieldCandidateStore({ db, category, stmts }) {

  function upsert({ productId, fieldKey, value, unit, confidence, sourceCount, sourcesJson, validationJson, metadataJson, status }) {
    stmts._upsertFieldCandidate.run({
      category,
      product_id: String(productId || ''),
      field_key: String(fieldKey || ''),
      value: value ?? null,
      unit: unit ?? null,
      confidence: confidence ?? 0,
      source_count: sourceCount ?? 1,
      sources_json: JSON.stringify(Array.isArray(sourcesJson) ? sourcesJson : []),
      validation_json: JSON.stringify(validationJson ?? {}),
      metadata_json: JSON.stringify(metadataJson ?? {}),
      status: status || 'candidate',
    });
  }

  function get(productId, fieldKey, value) {
    return hydrateRow(
      stmts._getFieldCandidate.get(category, String(productId || ''), String(fieldKey || ''), value ?? null)
    );
  }

  function getByProductAndField(productId, fieldKey) {
    return stmts._getFieldCandidatesByProductAndField
      .all(category, String(productId || ''), String(fieldKey || ''))
      .map(hydrateRow);
  }

  function getAllByProduct(productId) {
    return stmts._getAllFieldCandidatesByProduct
      .all(category, String(productId || ''))
      .map(hydrateRow);
  }

  function deleteByProduct(productId) {
    stmts._deleteFieldCandidatesByProduct.run(category, String(productId || ''));
  }

  function deleteByProductAndField(productId, fieldKey) {
    stmts._deleteFieldCandidatesByProductAndField.run(category, String(productId || ''), String(fieldKey || ''));
  }

  function deleteByProductFieldValue(productId, fieldKey, value) {
    db.prepare(
      'DELETE FROM field_candidates WHERE category = ? AND product_id = ? AND field_key = ? AND value = ?'
    ).run(category, String(productId || ''), String(fieldKey || ''), value ?? null);
  }

  function getPaginated({ limit = 100, offset = 0 } = {}) {
    return stmts._getFieldCandidatesPaginated
      .all(category, limit, offset)
      .map(hydrateRow);
  }

  function count() {
    return stmts._countFieldCandidates.get(category)?.total ?? 0;
  }

  function stats() {
    const row = stmts._getFieldCandidatesStats.get(category);
    return {
      total: row?.total ?? 0,
      resolved: row?.resolved ?? 0,
      pending: row?.pending ?? 0,
      repaired: row?.repaired ?? 0,
      products: row?.products ?? 0,
    };
  }

  function markResolved(productId, fieldKey, value) {
    db.prepare(
      `UPDATE field_candidates SET status = 'resolved', updated_at = datetime('now')
       WHERE category = ? AND product_id = ? AND field_key = ? AND value = ?`
    ).run(category, String(productId || ''), String(fieldKey || ''), value ?? null);
  }

  function demoteResolved(productId, fieldKey) {
    db.prepare(
      `UPDATE field_candidates SET status = 'candidate', updated_at = datetime('now')
       WHERE category = ? AND product_id = ? AND field_key = ? AND status = 'resolved'`
    ).run(category, String(productId || ''), String(fieldKey || ''));
  }

  function getResolved(productId, fieldKey) {
    return hydrateRow(
      db.prepare(
        `SELECT * FROM field_candidates
         WHERE category = ? AND product_id = ? AND field_key = ? AND status = 'resolved'
         ORDER BY confidence DESC LIMIT 1`
      ).get(category, String(productId || ''), String(fieldKey || ''))
    );
  }

  function getDistinctProducts() {
    return db.prepare(
      'SELECT DISTINCT product_id FROM field_candidates WHERE category = ?'
    ).all(category).map(r => r.product_id);
  }

  return { upsert, get, getByProductAndField, getAllByProduct, deleteByProduct, deleteByProductAndField, deleteByProductFieldValue, getPaginated, count, stats, markResolved, demoteResolved, getResolved, getDistinctProducts };
}
