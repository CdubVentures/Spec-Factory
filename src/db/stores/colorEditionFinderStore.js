/**
 * Color & Edition Finder SQL store.
 *
 * Queryable summary + cooldown gating for the Color & Edition Finder.
 * Full per-discovery detail lives in per-product JSON files.
 * This table is rebuildable from those JSON files on specDb loss.
 */

function safeParse(str, fallback) {
  try { return JSON.parse(str); }
  catch { return fallback; }
}

function hydrateRow(row) {
  if (!row) return null;
  return {
    ...row,
    colors: safeParse(row.colors, []),
    editions: safeParse(row.editions, []),
  };
}

export function createColorEditionFinderStore({ db, category, stmts }) {
  function upsert(row) {
    stmts._upsertColorEditionFinder.run({
      category: String(row.category || category || ''),
      product_id: String(row.product_id || ''),
      colors: JSON.stringify(Array.isArray(row.colors) ? row.colors : []),
      editions: JSON.stringify(Array.isArray(row.editions) ? row.editions : []),
      default_color: String(row.default_color || ''),
      cooldown_until: String(row.cooldown_until || ''),
      latest_ran_at: String(row.latest_ran_at || ''),
      run_count: Number(row.run_count) || 0,
    });
  }

  function get(productId) {
    const row = stmts._getColorEditionFinder.get(
      String(category),
      String(productId || ''),
    );
    return hydrateRow(row);
  }

  function listByCategory(cat) {
    const rows = stmts._listColorEditionFinderByCategory.all(String(cat || category));
    return rows.map(hydrateRow);
  }

  function getIfOnCooldown(productId) {
    const now = new Date().toISOString();
    const row = stmts._getColorEditionFinderOnCooldown.get(
      String(category),
      String(productId || ''),
      now,
    );
    return hydrateRow(row);
  }

  return { upsert, get, listByCategory, getIfOnCooldown };
}
