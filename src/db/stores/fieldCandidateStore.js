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
  };
}

/**
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object }} deps
 */
export function createFieldCandidateStore({ db, category, stmts }) {

  function upsert({ productId, fieldKey, value, confidence, sourceCount, sourcesJson, validationJson }) {
    stmts._upsertFieldCandidate.run({
      category,
      product_id: String(productId || ''),
      field_key: String(fieldKey || ''),
      value: value ?? null,
      confidence: confidence ?? 0,
      source_count: sourceCount ?? 1,
      sources_json: JSON.stringify(Array.isArray(sourcesJson) ? sourcesJson : []),
      validation_json: JSON.stringify(validationJson ?? {}),
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

  return { upsert, get, getByProductAndField, getAllByProduct, deleteByProduct, deleteByProductAndField };
}
