/**
 * Field Candidate SQL store.
 *
 * SQL projection of product.json candidates[]. One row per unique
 * (category, product_id, field_key, value). Sources accumulate as JSON.
 * Rebuildable from product.json (Phase A5).
 */

import { fingerprintValue } from '../valueFingerprint.js';

function safeParse(str, fallback) {
  try { return JSON.parse(str); }
  catch { return fallback; }
}

function computeFingerprint(rawValue) {
  if (rawValue === null || rawValue === undefined) return '';
  let parsed = rawValue;
  if (typeof rawValue === 'string' && rawValue.length > 0 && (rawValue[0] === '[' || rawValue[0] === '{')) {
    try { parsed = JSON.parse(rawValue); } catch { parsed = rawValue; }
  }
  return fingerprintValue(parsed);
}

function hydrateRow(row) {
  if (!row) return null;
  return {
    ...row,
    validation_json: safeParse(row.validation_json, {}),
    metadata_json: safeParse(row.metadata_json, {}),
  };
}

/**
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object }} deps
 */
export function createFieldCandidateStore({ db, category, stmts }) {

  // WHY: Legacy upsert — kept for backward compat (candidateReseed old-format, finderRoutes legacy).
  // Callers may still pass sourceCount/sourcesJson — these are ignored (columns dropped in Phase 8).
  // variant_id is threaded through so that upserts targeting a variant-scoped row land on that row
  // (ON CONFLICT keys on variant_id_key); without it, the upsert silently inserts a phantom
  // NULL-variant row instead of updating the intended variant-scoped row.
  function upsert({ productId, fieldKey, value, unit, confidence, sourceId, sourceType, model, validationJson, metadataJson, status, variantId }) {
    stmts._upsertFieldCandidate.run({
      category,
      product_id: String(productId || ''),
      field_key: String(fieldKey || ''),
      value: value ?? null,
      unit: unit ?? null,
      confidence: confidence ?? 0,
      source_id: String(sourceId || `legacy-${productId || ''}-${fieldKey || ''}-${Date.now()}`),
      source_type: String(sourceType || ''),
      model: String(model || ''),
      validation_json: JSON.stringify(validationJson ?? {}),
      metadata_json: JSON.stringify(metadataJson ?? {}),
      status: status || 'candidate',
      variant_id: variantId ?? null,
      value_fingerprint: computeFingerprint(value),
    });
  }

  function get(productId, fieldKey, value) {
    return hydrateRow(
      stmts._getFieldCandidate.get(category, String(productId || ''), String(fieldKey || ''), value ?? null)
    );
  }

  function getByProductAndField(productId, fieldKey, variantId) {
    const rows = stmts._getFieldCandidatesByProductAndField
      .all(category, String(productId || ''), String(fieldKey || ''))
      .map(hydrateRow);
    // WHY: variantId === undefined means caller wants all rows (variant-blind).
    // variantId === null means caller wants only variant-less rows (scalar path).
    // variantId === 'v_xxx' means caller wants only that variant's rows.
    if (variantId === undefined) return rows;
    return rows.filter((r) => (r.variant_id ?? null) === (variantId ?? null));
  }

  function getAllByProduct(productId) {
    return stmts._getAllFieldCandidatesByProduct
      .all(category, String(productId || ''))
      .map(hydrateRow);
  }

  function getAllByCategory() {
    return db.prepare(
      'SELECT * FROM field_candidates WHERE category = ? ORDER BY product_id, field_key, confidence DESC'
    ).all(category).map(hydrateRow);
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

  function markResolved(productId, fieldKey, value, variantId) {
    // WHY: variantId === undefined → legacy variant-blind update (scalar fields).
    // variantId === null → scope to rows with NULL variant_id only.
    // variantId === 'v_xxx' → scope to that variant only.
    if (variantId === undefined) {
      db.prepare(
        `UPDATE field_candidates SET status = 'resolved', updated_at = datetime('now')
         WHERE category = ? AND product_id = ? AND field_key = ? AND value = ?`
      ).run(category, String(productId || ''), String(fieldKey || ''), value ?? null);
      return;
    }
    const vidClause = variantId === null ? 'variant_id IS NULL' : 'variant_id = ?';
    const params = variantId === null
      ? [category, String(productId || ''), String(fieldKey || ''), value ?? null]
      : [category, String(productId || ''), String(fieldKey || ''), value ?? null, variantId];
    db.prepare(
      `UPDATE field_candidates SET status = 'resolved', updated_at = datetime('now')
       WHERE category = ? AND product_id = ? AND field_key = ? AND value = ? AND ${vidClause}`
    ).run(...params);
  }

  function demoteResolved(productId, fieldKey, variantId) {
    if (variantId === undefined) {
      db.prepare(
        `UPDATE field_candidates SET status = 'candidate', updated_at = datetime('now')
         WHERE category = ? AND product_id = ? AND field_key = ? AND status = 'resolved'`
      ).run(category, String(productId || ''), String(fieldKey || ''));
      return;
    }
    const vidClause = variantId === null ? 'variant_id IS NULL' : 'variant_id = ?';
    const params = variantId === null
      ? [category, String(productId || ''), String(fieldKey || '')]
      : [category, String(productId || ''), String(fieldKey || ''), variantId];
    db.prepare(
      `UPDATE field_candidates SET status = 'candidate', updated_at = datetime('now')
       WHERE category = ? AND product_id = ? AND field_key = ? AND status = 'resolved' AND ${vidClause}`
    ).run(...params);
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

  // WHY: keyPassengerBuilder uses this for the §6.2 "good enough" exclusion —
  // drop peers whose top candidate already meets a confidence + evidence
  // threshold, even when the candidate isn't published yet. Single SELECT with
  // a subquery returning substantive evidence count (matches the publisher's
  // min_evidence_refs gate, which excludes identity_only refs).
  function getTopCandidate(productId, fieldKey) {
    const row = db.prepare(
      `SELECT c.*, (
         SELECT COUNT(*) FROM field_candidate_evidence
         WHERE candidate_id = c.id
           AND (evidence_kind IS NULL OR evidence_kind != 'identity_only')
       ) AS evidence_count
       FROM field_candidates c
       WHERE c.category = ? AND c.product_id = ? AND c.field_key = ?
       ORDER BY c.confidence DESC LIMIT 1`
    ).get(category, String(productId || ''), String(fieldKey || ''));
    if (!row) return null;
    return { ...hydrateRow(row), evidence_count: Number(row.evidence_count || 0) };
  }

  function getTopCandidatesByProduct(productId) {
    return db.prepare(
      `SELECT c.*, (
         SELECT COUNT(*) FROM field_candidate_evidence
         WHERE candidate_id = c.id
           AND (evidence_kind IS NULL OR evidence_kind != 'identity_only')
       ) AS evidence_count
       FROM field_candidates c
       WHERE c.category = ? AND c.product_id = ?
         AND c.id = (
           SELECT c2.id FROM field_candidates c2
           WHERE c2.category = c.category
             AND c2.product_id = c.product_id
             AND c2.field_key = c.field_key
           ORDER BY c2.confidence DESC LIMIT 1
         )
       ORDER BY c.field_key ASC`
    )
      .all(category, String(productId || ''))
      .map((row) => ({ ...hydrateRow(row), evidence_count: Number(row.evidence_count || 0) }));
  }

  function getDistinctProducts() {
    return db.prepare(
      'SELECT DISTINCT product_id FROM field_candidates WHERE category = ?'
    ).all(category).map(r => r.product_id);
  }

  // --- Source-centric methods ---

  // WHY: Idempotent insert — check-before-insert instead of ON CONFLICT because
  // the UNIQUE(source_id) constraint can't be added until Phase 8 data migration.
  // Also catches old UNIQUE(value) violations during transition (same value, different source).
  function insert({ productId, fieldKey, sourceId, sourceType, value, unit, confidence, model, validationJson, metadataJson, status, variantId, submittedAt }) {
    const sid = String(sourceId || '');
    const vid = variantId ?? null;
    if (sid) {
      const existing = getBySourceId(productId, fieldKey, sid);
      // WHY: Skip duplicate only when variant_id matches (or both null).
      // Different variant_id = different candidate even with same source_id.
      if (existing && existing.variant_id === vid) return;
    }
    try {
      stmts._insertFieldCandidate.run({
        category,
        product_id: String(productId || ''),
        field_key: String(fieldKey || ''),
        source_id: sid,
        source_type: String(sourceType || ''),
        value: value ?? null,
        unit: unit ?? null,
        confidence: confidence ?? 0,
        model: String(model || ''),
        validation_json: JSON.stringify(validationJson ?? {}),
        metadata_json: JSON.stringify(metadataJson ?? {}),
        status: status || 'candidate',
        variant_id: vid,
        value_fingerprint: computeFingerprint(value),
        submitted_at: submittedAt ?? null,
      });
    } catch (e) {
      // WHY: During transition, old UNIQUE(value) constraint may fire when same value
      // is submitted from a different source. This is expected until Phase 8 migration
      // removes the value-based constraint. Silently skip — the value is already tracked.
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return;
      throw e;
    }
  }

  function getBySourceId(productId, fieldKey, sourceId) {
    return hydrateRow(
      stmts._getFieldCandidateBySourceId.get(category, String(productId || ''), String(fieldKey || ''), String(sourceId || ''))
    );
  }

  function getBySourceIdAndVariant(productId, fieldKey, sourceId, variantId) {
    return hydrateRow(
      stmts._getFieldCandidateBySourceIdAndVariant.get(
        category,
        String(productId || ''),
        String(fieldKey || ''),
        String(sourceId || ''),
        variantId ?? null,
      )
    );
  }

  function deleteBySourceId(productId, fieldKey, sourceId) {
    stmts._deleteFieldCandidateBySourceId.run(
      category, String(productId || ''), String(fieldKey || ''), String(sourceId || '')
    );
  }

  function deleteBySourceType(productId, fieldKey, sourceType) {
    stmts._deleteFieldCandidatesBySourceType.run(
      category, String(productId || ''), String(fieldKey || ''), String(sourceType || '')
    );
  }

  function getByValue(productId, fieldKey, value) {
    return stmts._getFieldCandidatesByValue
      .all(category, String(productId || ''), String(fieldKey || ''), value ?? null)
      .map(hydrateRow);
  }

  function countBySourceId(productId, sourceId) {
    return stmts._countFieldCandidatesBySourceId.get(
      category, String(productId || ''), String(sourceId || '')
    )?.total ?? 0;
  }

  function markResolvedByValue(productId, fieldKey, value) {
    db.prepare(
      `UPDATE field_candidates SET status = 'resolved', updated_at = datetime('now')
       WHERE category = ? AND product_id = ? AND field_key = ? AND value = ?`
    ).run(category, String(productId || ''), String(fieldKey || ''), value ?? null);
  }

  // WHY: Feature source cascade — when a variant is deleted, all candidates
  // anchored to that variant_id must go (price, SKU, release date, etc.).
  function deleteByVariantId(productId, variantId) {
    db.prepare(
      'DELETE FROM field_candidates WHERE category = ? AND product_id = ? AND variant_id = ?'
    ).run(category, String(productId || ''), String(variantId || ''));
  }

  // WHY: Per-field variant wipe — used by the GenericScalarFinderPanel's
  // per-variant "Del" action. Deletes every row for one (product, field,
  // variant) triplet; field_candidate_evidence cascades via FK.
  function deleteByProductFieldVariant(productId, fieldKey, variantId) {
    db.prepare(
      'DELETE FROM field_candidates WHERE category = ? AND product_id = ? AND field_key = ? AND variant_id = ?'
    ).run(category, String(productId || ''), String(fieldKey || ''), String(variantId || ''));
  }

  // WHY: UnPub action — zero the row's confidence so the panel no longer
  // renders the "resolved"-looking confidence pill on a demoted candidate.
  // The row itself survives (preserves the LLM's value for re-run / review),
  // but every publisher-stamped scoring signal gets wiped. Evidence rows
  // are deleted separately by the caller via deleteFieldCandidateEvidenceByCandidateId.
  function resetConfidence(id) {
    db.prepare(
      `UPDATE field_candidates SET confidence = 0, updated_at = datetime('now') WHERE id = ?`,
    ).run(id);
  }

  function updateMetadata(id, metadataJson) {
    db.prepare(
      `UPDATE field_candidates SET metadata_json = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(JSON.stringify(metadataJson ?? {}), Number(id));
  }

  // WHY: Variant deletion needs to update candidate values (splice items from
  // JSON arrays) without changing source_id or other columns.
  function updateValue(productId, fieldKey, sourceId, newValue) {
    db.prepare(
      `UPDATE field_candidates SET value = ?, value_fingerprint = ?, updated_at = datetime('now')
       WHERE category = ? AND product_id = ? AND field_key = ? AND source_id = ?`
    ).run(newValue, computeFingerprint(newValue), category, String(productId || ''), String(fieldKey || ''), String(sourceId || ''));
  }

  return {
    upsert, get, getByProductAndField, getAllByProduct, getAllByCategory, deleteByProduct, deleteByProductAndField, deleteByProductFieldValue, getPaginated, count, stats, markResolved, demoteResolved, getResolved, getTopCandidate, getTopCandidatesByProduct, getDistinctProducts,
    insert, getBySourceId, getBySourceIdAndVariant, deleteBySourceId, deleteBySourceType, getByValue, markResolvedByValue, countBySourceId, updateValue, deleteByVariantId, deleteByProductFieldVariant, resetConfidence, updateMetadata,
  };
}
