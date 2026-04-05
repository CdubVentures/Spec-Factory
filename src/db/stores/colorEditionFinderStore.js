/**
 * Color & Edition Finder SQL store.
 *
 * Summary table (color_edition_finder) + per-run history (color_edition_finder_runs).
 * Both are SQL projections rebuildable from per-product JSON files (durable memory).
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

function hydrateRunRow(row) {
  if (!row) return null;
  return {
    ...row,
    fallback_used: Boolean(row.fallback_used),
    selected: safeParse(row.selected_json, {}),
    prompt: safeParse(row.prompt_json, {}),
    response: safeParse(row.response_json, {}),
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

  function remove(productId) {
    return stmts._deleteColorEditionFinder.run(
      String(category),
      String(productId || ''),
    );
  }

  // --- Runs ---

  function insertRun(row) {
    stmts._insertColorEditionFinderRun.run({
      category: String(row.category || category || ''),
      product_id: String(row.product_id || ''),
      run_number: Number(row.run_number) || 0,
      ran_at: String(row.ran_at || ''),
      model: String(row.model || 'unknown'),
      fallback_used: row.fallback_used ? 1 : 0,
      cooldown_until: String(row.cooldown_until || ''),
      selected_json: JSON.stringify(row.selected || {}),
      prompt_json: JSON.stringify(row.prompt || {}),
      response_json: JSON.stringify(row.response || {}),
    });
  }

  function listRuns(productId) {
    const rows = stmts._listColorEditionFinderRuns.all(
      String(category),
      String(productId || ''),
    );
    return rows.map(hydrateRunRow);
  }

  function getLatestRun(productId) {
    const row = stmts._getLatestColorEditionFinderRun.get(
      String(category),
      String(productId || ''),
    );
    return hydrateRunRow(row);
  }

  function removeRun(productId, runNumber) {
    return stmts._deleteColorEditionFinderRunByNumber.run(
      String(category),
      String(productId || ''),
      Number(runNumber),
    );
  }

  function removeAllRuns(productId) {
    return stmts._deleteAllColorEditionFinderRuns.run(
      String(category),
      String(productId || ''),
    );
  }

  return {
    upsert, get, listByCategory, getIfOnCooldown, remove,
    insertRun, listRuns, getLatestRun, removeRun, removeAllRuns,
  };
}
