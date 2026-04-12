/**
 * Item Links store — extracted from SpecDb.
 * Owns: item_component_links, item_list_links tables.
 *
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object, expandListLinkValues: Function, getListValueByFieldAndValue: Function }} deps
 */
export function createItemStateStore({ db, category, stmts, expandListLinkValues, getListValueByFieldAndValue }) {
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

  function updateItemComponentLinksByIdentity(componentType, oldName, oldMaker, newName, newMaker) {
    db.prepare(`
      UPDATE item_component_links
      SET component_name = ?, component_maker = ?, updated_at = datetime('now')
      WHERE category = ? AND component_type = ? AND component_name = ? AND component_maker = ?
    `).run(newName, newMaker, category, componentType, oldName, oldMaker);
  }

  return {
    upsertItemComponentLink,
    upsertItemListLink,
    removeItemListLinksForField,
    syncItemListLinkForFieldValue,
    getItemComponentLinks,
    getItemListLinks,
    getProductsForComponent,
    getProductsByListValueId,
    getProductsForListValue,
    removeListLinks,
    updateItemComponentLinksByIdentity,
  };
}
