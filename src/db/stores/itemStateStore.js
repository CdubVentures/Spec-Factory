/**
 * Item State & Links store — extracted from SpecDb.
 * Owns: item_field_state, item_component_links, item_list_links tables.
 *
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object, expandListLinkValues: Function, getListValueByFieldAndValue: Function }} deps
 */
export function createItemStateStore({ db, category, stmts, expandListLinkValues, getListValueByFieldAndValue }) {
  function upsertItemFieldState({ productId, fieldKey, value, confidence, source, acceptedCandidateId, overridden, needsAiReview, aiReviewComplete }) {
    stmts._upsertItemFieldState.run({
      category,
      product_id: productId,
      field_key: fieldKey,
      value: value ?? null,
      confidence: confidence ?? 0,
      source: source || 'pipeline',
      accepted_candidate_id: acceptedCandidateId ?? null,
      overridden: overridden ? 1 : 0,
      needs_ai_review: needsAiReview ? 1 : 0,
      ai_review_complete: aiReviewComplete ? 1 : 0
    });
  }

  function getItemFieldState(productId) {
    return db
      .prepare('SELECT * FROM item_field_state WHERE category = ? AND product_id = ?')
      .all(category, productId);
  }

  function getItemFieldStateById(itemFieldStateId) {
    const id = Number(itemFieldStateId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return db
      .prepare('SELECT * FROM item_field_state WHERE category = ? AND id = ?')
      .get(category, id) || null;
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
    return db
      .prepare(`
        SELECT * FROM item_field_state
        WHERE category = ? AND product_id IN (${pidPlaceholders}) AND field_key IN (${fkPlaceholders})
      `)
      .all(category, ...productIds, ...fieldKeys);
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
    return db.prepare(
      'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ? LIMIT 1'
    ).get(category, pid, fk) || null;
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
  };
}
