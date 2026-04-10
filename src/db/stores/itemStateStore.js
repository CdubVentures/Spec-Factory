import { ITEM_FIELD_STATE_BOOLEAN_KEYS } from '../specDbSchema.js';
import { hydrateRow, hydrateRows } from '../specDbHelpers.js';

/**
 * Item State & Links store — extracted from SpecDb.
 * Owns: item_field_state, item_component_links, item_list_links tables.
 *
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object, expandListLinkValues: Function, getListValueByFieldAndValue: Function }} deps
 */
export function createItemStateStore({ db, category, stmts, expandListLinkValues, getListValueByFieldAndValue }) {
  function upsertItemFieldState({
    productId, fieldKey, value, unit, confidence, source, acceptedCandidateId,
    overridden, needsAiReview, aiReviewComplete,
    overrideSource, overrideValue, overrideReason, overrideProvenance,
    overriddenBy, overriddenAt
  }) {
    stmts._upsertItemFieldState.run({
      category,
      product_id: productId,
      field_key: fieldKey,
      value: value ?? null,
      unit: unit ?? null,
      confidence: confidence ?? 0,
      source: source || 'pipeline',
      accepted_candidate_id: acceptedCandidateId ?? null,
      overridden: overridden ? 1 : 0,
      needs_ai_review: needsAiReview ? 1 : 0,
      ai_review_complete: aiReviewComplete ? 1 : 0,
      override_source: overrideSource ?? null,
      override_value: overrideValue ?? null,
      override_reason: overrideReason ?? null,
      override_provenance: overrideProvenance ? JSON.stringify(overrideProvenance) : null,
      overridden_by: overriddenBy ?? null,
      overridden_at: overriddenAt ?? null
    });
  }

  function getItemFieldState(productId) {
    return hydrateRows(ITEM_FIELD_STATE_BOOLEAN_KEYS, db
      .prepare('SELECT * FROM item_field_state WHERE category = ? AND product_id = ?')
      .all(category, productId));
  }

  function getItemFieldStateById(itemFieldStateId) {
    const id = Number(itemFieldStateId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return hydrateRow(ITEM_FIELD_STATE_BOOLEAN_KEYS, db
      .prepare('SELECT * FROM item_field_state WHERE category = ? AND id = ?')
      .get(category, id)) || null;
  }

  function upsertItemComponentLink({ productId, fieldKey, componentType, componentName, componentMaker, matchType, matchScore }) {
    stmts._upsertItemComponentLink.run({
      category,
      product_id: productId,
      field_key: fieldKey,
      component_type: componentType,
      component_name: componentName,
      component_maker: componentMaker || '',
      match_type: matchType ?? null,
      match_score: matchScore ?? null
    });
  }

  function upsertItemListLink({ productId, fieldKey, listValueId }) {
    stmts._upsertItemListLink.run({
      category,
      product_id: productId,
      field_key: fieldKey,
      list_value_id: listValueId
    });
  }

  function removeItemListLinksForField(productId, fieldKey) {
    db
      .prepare('DELETE FROM item_list_links WHERE category = ? AND product_id = ? AND field_key = ?')
      .run(category, productId, fieldKey);
  }

  function syncItemListLinkForFieldValue({ productId, fieldKey, value }) {
    const pid = String(productId || '').trim();
    const key = String(fieldKey || '').trim();
    if (!pid || !key) return null;

    let linkedRow = null;
    const tx = db.transaction(() => {
      removeItemListLinksForField(pid, key);

      const valueTokens = expandListLinkValues(value);
      if (!valueTokens.length) return;

      const linkedIds = new Set();
      for (const token of valueTokens) {
        const listRow = getListValueByFieldAndValue(key, token);
        if (!listRow?.id) continue;
        if (linkedIds.has(listRow.id)) continue;
        linkedIds.add(listRow.id);
        upsertItemListLink({
          productId: pid,
          fieldKey: key,
          listValueId: listRow.id,
        });
        if (!linkedRow) linkedRow = listRow;
      }
    });
    tx();
    return linkedRow;
  }

  function getItemComponentLinks(productId) {
    return db
      .prepare('SELECT * FROM item_component_links WHERE category = ? AND product_id = ?')
      .all(category, productId);
  }

  function getItemListLinks(productId) {
    return db
      .prepare('SELECT * FROM item_list_links WHERE category = ? AND product_id = ?')
      .all(category, productId);
  }

  function getProductsForComponent(componentType, componentName, componentMaker) {
    return db
      .prepare(`
        SELECT DISTINCT product_id, field_key, match_type, match_score
        FROM item_component_links
        WHERE category = ? AND component_type = ? AND component_name = ? AND component_maker = ?
        ORDER BY product_id
      `)
      .all(category, componentType, componentName, componentMaker || '');
  }

  function getProductsByListValueId(listValueId) {
    const id = Number(listValueId);
    if (!Number.isFinite(id) || id <= 0) return [];
    return db
      .prepare(`
        SELECT DISTINCT product_id, field_key
        FROM item_list_links
        WHERE category = ? AND list_value_id = ?
        ORDER BY product_id
      `)
      .all(category, id);
  }

  function getProductsForListValue(fieldKey, value) {
    return db
      .prepare(`
        SELECT DISTINCT ill.product_id, ill.field_key
        FROM item_list_links ill
        INNER JOIN list_values lv ON lv.id = ill.list_value_id
        WHERE lv.category = ? AND lv.field_key = ? AND lv.value = ?
        ORDER BY ill.product_id
      `)
      .all(category, fieldKey, value);
  }

  function getProductsForFieldValue(fieldKey, value) {
    return db
      .prepare(`
        SELECT DISTINCT product_id, field_key
        FROM item_field_state
        WHERE category = ?
          AND field_key = ?
          AND value IS NOT NULL
          AND LOWER(TRIM(value)) = LOWER(TRIM(?))
        ORDER BY product_id
      `)
      .all(category, fieldKey, value);
  }

  function getProductsByFieldValue(fieldKey, value) {
    return db
      .prepare(`
        SELECT DISTINCT product_id
        FROM item_field_state
        WHERE category = ?
          AND field_key = ?
          AND value IS NOT NULL
          AND LOWER(TRIM(value)) = LOWER(TRIM(?))
      `)
      .all(category, fieldKey, value)
      .map(r => r.product_id);
  }

  function getItemFieldStateForProducts(productIds, fieldKeys) {
    if (!productIds.length || !fieldKeys.length) return [];
    const pidPlaceholders = productIds.map(() => '?').join(',');
    const fkPlaceholders = fieldKeys.map(() => '?').join(',');
    return hydrateRows(ITEM_FIELD_STATE_BOOLEAN_KEYS, db
      .prepare(`
        SELECT * FROM item_field_state
        WHERE category = ? AND product_id IN (${pidPlaceholders}) AND field_key IN (${fkPlaceholders})
      `)
      .all(category, ...productIds, ...fieldKeys));
  }

  function getDistinctItemFieldValues(fieldKey) {
    return db
      .prepare(`
        SELECT value, COUNT(DISTINCT product_id) as product_count
        FROM item_field_state
        WHERE category = ?
          AND field_key = ?
          AND value IS NOT NULL
          AND LOWER(TRIM(value)) NOT IN ('', 'unk', 'n/a', 'na')
        GROUP BY value
        ORDER BY product_count DESC, value ASC
      `)
      .all(category, fieldKey);
  }

  function renameFieldValueInItems(fieldKey, oldValue, newValue) {
    const affected = db
      .prepare('SELECT DISTINCT product_id FROM item_field_state WHERE category = ? AND field_key = ? AND LOWER(TRIM(value)) = LOWER(TRIM(?))')
      .all(category, fieldKey, oldValue)
      .map(r => r.product_id);
    if (affected.length > 0) {
      db
        .prepare('UPDATE item_field_state SET value = ?, updated_at = datetime(\'now\') WHERE category = ? AND field_key = ? AND LOWER(TRIM(value)) = LOWER(TRIM(?))')
        .run(newValue, category, fieldKey, oldValue);
    }
    return affected;
  }

  function removeFieldValueFromItems(fieldKey, value) {
    const affected = db
      .prepare('SELECT DISTINCT product_id FROM item_field_state WHERE category = ? AND field_key = ? AND LOWER(TRIM(value)) = LOWER(TRIM(?))')
      .all(category, fieldKey, value)
      .map(r => r.product_id);
    if (affected.length > 0) {
      db
        .prepare('UPDATE item_field_state SET value = NULL, needs_ai_review = 1, updated_at = datetime(\'now\') WHERE category = ? AND field_key = ? AND LOWER(TRIM(value)) = LOWER(TRIM(?))')
        .run(category, fieldKey, value);
    }
    return affected;
  }

  function removeListLinks(fieldKey, value) {
    const row = db
      .prepare('SELECT id FROM list_values WHERE category = ? AND field_key = ? AND value = ?')
      .get(category, fieldKey, value);
    if (row) {
      db
        .prepare('DELETE FROM item_list_links WHERE category = ? AND field_key = ? AND list_value_id = ?')
        .run(category, fieldKey, row.id);
    }
  }

  function getItemFieldStateByProductAndField(productId, fieldKey) {
    const pid = String(productId || '').trim();
    const fk = String(fieldKey || '').trim();
    if (!pid || !fk) return null;
    return hydrateRow(ITEM_FIELD_STATE_BOOLEAN_KEYS, db.prepare(
      'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ? LIMIT 1'
    ).get(category, pid, fk)) || null;
  }

  function markItemFieldStateReviewComplete(productId, fieldKey) {
    const pid = String(productId || '').trim();
    const fk = String(fieldKey || '').trim();
    if (!pid || !fk) return;
    db.prepare(`
      UPDATE item_field_state
      SET needs_ai_review = 0,
          ai_review_complete = 1,
          updated_at = datetime('now')
      WHERE category = ? AND product_id = ? AND field_key = ?
    `).run(category, pid, fk);
  }

  function updateItemComponentLinksByIdentity(componentType, oldName, oldMaker, newName, newMaker) {
    db.prepare(`
      UPDATE item_component_links
      SET component_name = ?, component_maker = ?, updated_at = datetime('now')
      WHERE category = ? AND component_type = ? AND component_name = ? AND component_maker = ?
    `).run(newName, newMaker, category, componentType, oldName, oldMaker);
  }

  function getItemFieldStateIdByProductAndField(productId, fieldKey) {
    const row = db.prepare(
      'SELECT id FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ? LIMIT 1'
    ).get(category, productId, fieldKey);
    return row?.id ?? null;
  }

  function setItemFieldNeedsAiReview(itemFieldStateId) {
    db.prepare(`
      UPDATE item_field_state
      SET needs_ai_review = 1, ai_review_complete = 0, updated_at = datetime('now')
      WHERE category = ? AND id = ?
    `).run(category, itemFieldStateId);
  }

  function upsertProductReviewState({ productId, reviewStatus, reviewStartedAt, reviewedBy, reviewedAt }) {
    db.prepare(`
      INSERT INTO product_review_state (category, product_id, review_status, review_started_at, reviewed_by, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(category, product_id) DO UPDATE SET
        review_status = excluded.review_status,
        review_started_at = COALESCE(excluded.review_started_at, review_started_at),
        reviewed_by = COALESCE(excluded.reviewed_by, reviewed_by),
        reviewed_at = COALESCE(excluded.reviewed_at, reviewed_at),
        updated_at = datetime('now')
    `).run(category, productId, reviewStatus || 'pending', reviewStartedAt || null, reviewedBy || null, reviewedAt || null);
  }

  function getProductReviewState(productId) {
    return db.prepare('SELECT * FROM product_review_state WHERE category = ? AND product_id = ?').get(category, productId) || null;
  }

  function listApprovedProductIds() {
    return db.prepare("SELECT product_id FROM product_review_state WHERE category = ? AND review_status = 'approved' ORDER BY product_id")
      .all(category)
      .map(r => r.product_id);
  }

  function getOverriddenFieldsForProduct(productId) {
    return db.prepare('SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND overridden = 1')
      .all(category, productId);
  }

  return {
    upsertItemFieldState,
    getItemFieldState,
    getItemFieldStateById,
    getItemFieldStateByProductAndField,
    markItemFieldStateReviewComplete,
    upsertItemComponentLink,
    upsertItemListLink,
    removeItemListLinksForField,
    syncItemListLinkForFieldValue,
    getItemComponentLinks,
    getItemListLinks,
    getProductsForComponent,
    getProductsByListValueId,
    getProductsForListValue,
    getProductsForFieldValue,
    getProductsByFieldValue,
    getItemFieldStateForProducts,
    getDistinctItemFieldValues,
    renameFieldValueInItems,
    removeFieldValueFromItems,
    removeListLinks,
    updateItemComponentLinksByIdentity,
    getItemFieldStateIdByProductAndField,
    setItemFieldNeedsAiReview,
    upsertProductReviewState,
    getProductReviewState,
    listApprovedProductIds,
    getOverriddenFieldsForProduct,
  };
}
