import { readColorEdition } from './colorEditionStore.js';

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function sortRuns(runs) {
  return [...(Array.isArray(runs) ? runs : [])]
    .sort((a, b) => (Number(a?.run_number) || 0) - (Number(b?.run_number) || 0));
}

function normalizeSqlRun(row) {
  const {
    category,
    product_id,
    selected_json,
    prompt_json,
    response_json,
    ...run
  } = row || {};
  void category;
  void product_id;
  void selected_json;
  void prompt_json;
  void response_json;
  return {
    ...run,
    fallback_used: Boolean(run.fallback_used),
    thinking: Boolean(run.thinking),
    web_search: Boolean(run.web_search),
    selected: cloneJson(row?.selected || {}),
    prompt: cloneJson(row?.prompt || {}),
    response: cloneJson(row?.response || {}),
  };
}

function parseArray(value) {
  if (Array.isArray(value)) return cloneJson(value);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasSqlRuntimeState(finderStore, productId) {
  const summary = typeof finderStore?.get === 'function' ? finderStore.get(productId) : null;
  const runs = typeof finderStore?.listRuns === 'function' ? finderStore.listRuns(productId) : [];
  return { summary, runs: sortRuns(runs).map(normalizeSqlRun), available: Boolean(summary) || runs.length > 0 };
}

function normalizeSqlVariant(row) {
  return {
    variant_id: row.variant_id,
    variant_key: row.variant_key,
    variant_type: row.variant_type,
    variant_label: row.variant_label || '',
    color_atoms: Array.isArray(row.color_atoms) ? cloneJson(row.color_atoms) : [],
    edition_slug: row.edition_slug ?? null,
    edition_display_name: row.edition_display_name ?? null,
    created_at: row.created_at || '',
    ...(row.updated_at ? { updated_at: row.updated_at } : {}),
  };
}

function readSqlVariantRegistry(variantStore, productId) {
  const rows = typeof variantStore?.listByProduct === 'function'
    ? variantStore.listByProduct(productId)
    : [];
  return Array.isArray(rows) ? rows.map(normalizeSqlVariant) : [];
}

export function readColorEditionSqlFirst({ finderStore, variantStore, productId, productRoot }) {
  const jsonDoc = readColorEdition({ productId, productRoot });
  const sql = hasSqlRuntimeState(finderStore, productId);
  const sqlVariantRegistry = readSqlVariantRegistry(variantStore, productId);
  const variantRegistry = sqlVariantRegistry.length > 0
    ? sqlVariantRegistry
    : (jsonDoc?.variant_registry || []);

  if (!sql.available) {
    return sqlVariantRegistry.length > 0
      ? {
        ...(jsonDoc || {}),
        product_id: jsonDoc?.product_id || productId,
        category: jsonDoc?.category || '',
        variant_registry: variantRegistry,
      }
      : jsonDoc;
  }

  const maxRunNumber = sql.runs.length
    ? Math.max(...sql.runs.map((run) => Number(run?.run_number) || 0))
    : 0;
  const lastSqlRun = sql.runs[sql.runs.length - 1] || null;
  const summaryColors = parseArray(sql.summary?.colors);

  return {
    ...(jsonDoc || {}),
    product_id: jsonDoc?.product_id || productId,
    category: jsonDoc?.category || sql.summary?.category || '',
    selected: {
      colors: summaryColors.length > 0 ? summaryColors : (jsonDoc?.selected?.colors || []),
      editions: jsonDoc?.selected?.editions || {},
      default_color: sql.summary?.default_color || jsonDoc?.selected?.default_color || '',
    },
    runs: sql.runs,
    run_count: sql.runs.length,
    next_run_number: Math.max(jsonDoc?.next_run_number || 0, maxRunNumber + 1, 1),
    last_ran_at: lastSqlRun?.ran_at || sql.summary?.latest_ran_at || jsonDoc?.last_ran_at || '',
    variant_registry: variantRegistry,
  };
}
