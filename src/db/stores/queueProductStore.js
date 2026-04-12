/**
 * Product store.
 * Extracted from SpecDb.
 *
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object }} deps
 */
export function createQueueProductStore({ db, category, stmts }) {
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

  return {
    upsertProduct,
    getProduct,
    getAllProducts,
    deleteProduct,
  };
}
