/**
 * Field History store — persistent per-field search history for crash recovery.
 * Owns: field_history table.
 *
 * @param {{ category: string, stmts: object }} deps
 */
export function createFieldHistoryStore({ category, stmts }) {
  function upsertFieldHistory({ product_id, field_key, round, run_id, history_json }) {
    stmts._upsertFieldHistory.run({
      category,
      product_id,
      field_key,
      round: round ?? 0,
      run_id: run_id || '',
      history_json: typeof history_json === 'string' ? history_json : JSON.stringify(history_json || {}),
    });
  }

  function getFieldHistories(productId) {
    const rows = stmts._getFieldHistories.all({ category, product_id: productId });
    const result = {};
    for (const row of rows) {
      try {
        result[row.field_key] = JSON.parse(row.history_json);
      } catch {
        result[row.field_key] = {};
      }
    }
    return result;
  }

  function deleteFieldHistories(productId) {
    stmts._deleteFieldHistories.run({ category, product_id: productId });
  }

  return { upsertFieldHistory, getFieldHistories, deleteFieldHistories };
}
