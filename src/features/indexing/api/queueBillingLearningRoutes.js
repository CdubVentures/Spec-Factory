import { buildBillingModelCostCatalog } from './builders/billingModelCostCatalogBuilder.js';
import { syncLabRegistryIntoConfig } from '../../../core/llm/labModelDiscovery.js';
import { mergeDefaultApiModelsIntoRegistry } from '../../../core/llm/providerRegistryDefaults.js';
import { buildRegistryLookup } from '../../../core/llm/routeResolver.js';
import { runtimeSettingDefault } from '../../../core/config/configNormalizers.js';

function parseProviderRegistry(registryJson) {
  try {
    const parsed = JSON.parse(registryJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function existingProviderDefaultsJson(registryJson) {
  const existingIds = new Set(parseProviderRegistry(registryJson).map((provider) => String(provider?.id || '').trim()));
  const defaults = parseProviderRegistry(runtimeSettingDefault('llmProviderRegistryJson'))
    .filter((provider) => existingIds.has(String(provider?.id || '').trim()));
  return JSON.stringify(defaults);
}

function refreshDefaultApiModelsIntoConfig(config) {
  const mergedRegistryJson = mergeDefaultApiModelsIntoRegistry(
    config.llmProviderRegistryJson,
    existingProviderDefaultsJson(config.llmProviderRegistryJson),
  );
  if (mergedRegistryJson === config.llmProviderRegistryJson) return;
  config.llmProviderRegistryJson = mergedRegistryJson;
  config._registryLookup = buildRegistryLookup(config.llmProviderRegistryJson);
}

export function registerQueueBillingLearningRoutes(ctx) {
  const {
    jsonRes,
    toInt,
    config,
    storage,
    OUTPUT_ROOT,
    path,
    getSpecDb,
    appDb,
    safeReadJson,
    safeStat,
    listFiles,
    syncLabRegistryIntoConfig: syncLabRegistryIntoConfigFn = syncLabRegistryIntoConfig,
  } = ctx;

  function objToSortedArray(obj) {
    return Object.entries(obj || {})
      .map(([key, val]) => ({ key, ...val }))
      .sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0));
  }

  return async function handleQueueBillingLearningRoutes(parts, params, method, req, res) {
    // ── Global billing endpoints ──

    if (parts[0] === 'billing' && parts[1] === 'global' && method === 'GET') {
      if (!appDb) return jsonRes(res, 503, { error: 'billing not available' });

      // WHY: Shared filter extraction — all global endpoints accept the same filters
      // so the entire billing dashboard updates when the user picks a filter.
      const category = String(params.get('category') || '').trim();
      const model = String(params.get('model') || '').trim();
      const reason = String(params.get('reason') || '').trim();
      const access = String(params.get('access') || '').trim();
      const billingFilters = { category, model, reason, access };

      if (parts[2] === 'dashboard') {
        // WHY: Bundle endpoint — collapses 9 page-load queries into one. Computes
        // current filtered + prior filtered + current unfiltered rollups + daily
        // in a single response. unfiltered.* drives FilterBar chip counts and
        // must NOT have filters applied.
        const month = String(params.get('month') || '').trim() || new Date().toISOString().slice(0, 7);
        const priorMonth = String(params.get('prior_month') || '').trim() || (() => {
          const [y, m] = month.split('-').map((n) => Number.parseInt(n, 10));
          const d = new Date(y, m - 2, 1);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        })();
        const months = toInt(params.get('months'), 1);
        const days = Math.max(1, months * 31);

        // WHY: Skip wasted bucket queries — dashboard never reads by_day or
        // by_product. Saves 6 SQL queries per request (3 calls × 2 wasted buckets).
        const FILTERED_BUCKETS = new Set(['by_model', 'by_reason', 'by_category']);
        // Prior only needs bucket counts for models_used / categories_used.
        const PRIOR_BUCKETS = new Set(['by_model', 'by_category']);
        const filteredRollup = appDb.getBillingRollup(month, category, billingFilters, { buckets: FILTERED_BUCKETS });
        const priorRollup = appDb.getBillingRollup(priorMonth, category, billingFilters, { buckets: PRIOR_BUCKETS });
        const noFilters = { category: '', model: '', reason: '', access: '' };
        const unfilteredRollup = appDb.getBillingRollup(month, '', noFilters, { buckets: FILTERED_BUCKETS });
        const daily = appDb.getGlobalDaily({ days, ...billingFilters });

        function asSummary(monthLabel, rollup) {
          return {
            month: monthLabel,
            totals: rollup.totals,
            models_used: Object.keys(rollup.by_model).length,
            categories_used: Object.keys(rollup.by_category).length,
          };
        }

        return jsonRes(res, 200, {
          month,
          prior_month: priorMonth,
          filtered: {
            summary: asSummary(month, filteredRollup),
            prior_summary: asSummary(priorMonth, priorRollup),
            by_model: objToSortedArray(filteredRollup.by_model),
            by_reason: objToSortedArray(filteredRollup.by_reason),
            by_category: objToSortedArray(filteredRollup.by_category),
            daily,
          },
          unfiltered: {
            by_model: objToSortedArray(unfilteredRollup.by_model),
            by_reason: objToSortedArray(unfilteredRollup.by_reason),
            by_category: objToSortedArray(unfilteredRollup.by_category),
          },
        });
      }

      if (parts[2] === 'entries') {
        const limit = toInt(params.get('limit'), 100);
        const offset = toInt(params.get('offset'), 0);
        const data = appDb.getGlobalEntries({ limit, offset, ...billingFilters });
        return jsonRes(res, 200, { ...data, limit, offset });
      }

      if (parts[2] === 'model-costs') {
        const month = String(params.get('month') || '').trim() || new Date().toISOString().slice(0, 7);
        try {
          refreshDefaultApiModelsIntoConfig(config);
          await syncLabRegistryIntoConfigFn(config);
        } catch { /* non-fatal: use current provider registry projection */ }
        const rollup = appDb.getBillingRollup(month, category, billingFilters);
        return jsonRes(res, 200, buildBillingModelCostCatalog({ config, rollup, month }));
      }
    }

    // ── Per-category billing (existing) ──

    if (parts[0] === 'billing' && parts[1] && parts[2] === 'monthly' && method === 'GET') {
      const category = parts[1];
      const month = new Date().toISOString().slice(0, 7);
      if (appDb) {
        try {
          const data = appDb.getBillingRollup(month, category);
          return jsonRes(res, 200, data || { totals: {} });
        } catch { /* fall through */ }
      }
      return jsonRes(res, 200, { totals: {} });
    }

    // Learning artifacts
    if (parts[0] === 'learning' && parts[1] && parts[2] === 'artifacts' && method === 'GET') {
      const category = parts[1];
      const learningDir = path.join(OUTPUT_ROOT, '_learning', category);
      const files = await listFiles(learningDir);
      const artifacts = [];
      for (const f of files) {
        const st = await safeStat(path.join(learningDir, f));
        artifacts.push({ name: f, path: path.join(learningDir, f), size: st?.size || 0, updated: st?.mtime?.toISOString() || '' });
      }
      return jsonRes(res, 200, artifacts);
    }

    return false;
  };
}
