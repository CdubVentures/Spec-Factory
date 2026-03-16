/**
 * Discovery Search Execution
 *
 * Extracted from searchDiscovery.js (Phase 4B of structural decomposition).
 * Contains the search execution loop: provider diagnostics, internal-first
 * branch, internet search branch, frontier cache, query index recording,
 * and plan-only fallback.
 */
import _p4aPath from 'node:path';
import _p4aFs from 'node:fs';
import { recordQueryResult as _p4aRecordQueryResult } from './queryIndex.js';
import { defaultIndexLabRoot as _p4aDefaultIndexLabRoot } from '../../../core/config/runtimeArtifactRoots.js';
import { runSearchProviders as _defaultRunSearchProviders } from '../search/searchProviders.js';
import { searchSourceCorpus as _defaultSearchSourceCorpus } from '../../../intel/sourceCorpus.js';
import {
  buildPlanOnlyResults,
  extractSiteHostFromQuery,
  buildQueryPlanFallbackResults,
} from './discoveryQueryPlan.js';
import { toArray } from './discoveryIdentity.js';
import { runWithConcurrency } from './discoveryHelpers.js';

/**
 * Execute the search queries phase of discovery.
 *
 * @param {object} ctx - Execution context
 * @returns {{ rawResults, searchAttempts, searchJournal, internalSatisfied, externalSearchReason }}
 */
export async function executeSearchQueries({
  // Infrastructure
  config, storage, logger, runtimeTraceWriter, frontierDb,
  // Job context
  categoryConfig, job, runId,
  // Query plan outputs
  queries, executionQueryLimit, queryConcurrency, resultsPerQuery, queryLimit,
  searchProfileCaps, missingFields, variables,
  // Lookup maps
  selectedQueryRowMap, profileQueryRowMap,
  // Provider state
  providerState,
  // Planning hints (derived)
  requiredOnlySearch,
  missingRequiredFields,
  // Test seams (optional DI overrides)
  _runSearchProvidersFn,
  _searchSourceCorpusFn,
}) {
  const runSearchProvidersFn = _runSearchProvidersFn || _defaultRunSearchProviders;
  const searchSourceCorpusFn = _searchSourceCorpusFn || _defaultSearchSourceCorpus;

  const resolveSelectedQueryRow = (query) =>
    selectedQueryRowMap?.get(String(query || '').trim().toLowerCase()) || null;
  const resolveProfileQueryRow = (query) =>
    profileQueryRowMap?.get(String(query || '').trim().toLowerCase()) || null;

  const rawResults = [];
  const searchAttempts = [];
  const searchJournal = [];

  const getCachedFrontierQueryResults = (query) => {
    const record = frontierDb?.getQueryRecord?.({
      productId: job.productId,
      query
    });
    const provider = String(record?.provider || '').trim() || 'frontier_cache';
    const results = toArray(record?.results)
      .filter((row) => row && typeof row === 'object' && String(row.url || '').trim())
      .map((row) => ({
        ...row,
        provider: String(row?.provider || '').trim() || provider
      }));
    return {
      provider,
      results
    };
  };

  const emitCachedQueryLifecycle = (query, cached) => {
    if (!logger?.info || !String(query || '').trim()) {
      return;
    }
    logger.info('discovery_query_started', {
      query,
      provider: cached?.provider || 'frontier_cache',
      cache_hit: true,
      reason_code: 'frontier_query_cache'
    });
    logger.info('discovery_query_completed', {
      query,
      provider: cached?.provider || 'frontier_cache',
      result_count: toArray(cached?.results).length,
      duration_ms: 0,
      cache_hit: true,
      reason_code: 'frontier_query_cache'
    });
  };

  const internalFirst = Boolean(config.discoveryInternalFirst);
  const internalMinResults = Math.max(1, Number(config.discoveryInternalMinResults || 1));
  let internalSatisfied = false;
  let externalSearchReason = null;

  logger?.info?.('search_provider_diagnostics', {
    provider: providerState.provider,
    internet_ready: providerState.internet_ready,
    active_providers: providerState.active_providers || [],
    fallback_reason: providerState.fallback_reason || null
  });

  if (internalFirst) {
    for (const query of queries.slice(0, executionQueryLimit)) {
      if (frontierDb?.shouldSkipQuery?.({ productId: job.productId, query })) {
        const cached = getCachedFrontierQueryResults(query);
        if (cached.results.length > 0) {
          emitCachedQueryLifecycle(query, cached);
          rawResults.push(...cached.results.map((row) => ({ ...row, query })));
          searchAttempts.push({
            query,
            provider: cached.provider,
            result_count: cached.results.length,
            reason_code: 'frontier_query_cache'
          });
          searchJournal.push({
            ts: new Date().toISOString(),
            query,
            provider: 'frontier',
            action: 'reuse',
            reason: 'query_cooldown_cached_results',
            result_count: cached.results.length
          });
          continue;
        }
      }
      const internalRows = await searchSourceCorpusFn({
        storage,
        config,
        category: categoryConfig.category,
        query,
        limit: resultsPerQuery,
        missingFields,
        fieldOrder: categoryConfig.fieldOrder || [],
        logger
      });
      rawResults.push(...internalRows.map((row) => ({ ...row, query })));
      frontierDb?.recordQuery?.({
        productId: job.productId,
        query,
        provider: 'internal',
        fields: missingFields,
        results: internalRows
      });
      searchAttempts.push({
        query,
        provider: 'internal',
        result_count: internalRows.length,
        reason_code: 'internal_corpus_lookup'
      });
      searchJournal.push({
        ts: new Date().toISOString(),
        query,
        provider: 'internal',
        result_count: internalRows.length
      });
    }

    const internalUrlCount = new Set(
      rawResults
        .filter((row) => String(row.provider || '').toLowerCase() === 'internal')
        .map((row) => String(row.url || '').trim())
        .filter(Boolean)
    ).size;
    const requiresRequiredCoverage = requiredOnlySearch || (missingRequiredFields || []).length > 0;
    internalSatisfied = requiresRequiredCoverage && internalUrlCount >= internalMinResults;

    if (requiresRequiredCoverage) {
      externalSearchReason = internalSatisfied
        ? 'internal_satisfied_skip_external'
        : 'required_fields_missing_internal_under_target';
    }
  }

  const canSearchInternet =
    providerState.provider !== 'none' && Boolean(providerState.internet_ready);

  if (canSearchInternet && !(internalFirst && internalSatisfied)) {
    const queryResults = await runWithConcurrency(
      queries.slice(0, executionQueryLimit),
      queryConcurrency,
      async (query) => {
        if (frontierDb?.shouldSkipQuery?.({ productId: job.productId, query })) {
          const cached = getCachedFrontierQueryResults(query);
          if (cached.results.length > 0) {
            emitCachedQueryLifecycle(query, cached);
            logger?.info?.('search_results_collected', {
              scope: 'frontier_cache',
              query,
              provider: cached.provider,
              dedupe_count: 0,
              results: cached.results.slice(0, 30).map((r, idx) => {
                const rawUrl = String(r?.url || '').trim();
                let domain = '';
                try { domain = new URL(rawUrl).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
                return {
                  title: String(r?.title || '').trim(),
                  url: rawUrl,
                  domain,
                  snippet: String(r?.snippet || '').trim().slice(0, 300),
                  rank: Number.parseInt(String(r?.rank || idx + 1), 10) || (idx + 1),
                  relevance_score: 0,
                  decision: '',
                  reason: 'frontier_query_cache',
                  provider: cached.provider,
                };
              })
            });
            return {
              providerResults: cached.results,
              attempt: {
                query,
                provider: cached.provider,
                result_count: cached.results.length,
                reason_code: 'frontier_query_cache'
              },
              journal: {
                ts: new Date().toISOString(),
                query,
                provider: 'frontier',
                action: 'reuse',
                reason: 'query_cooldown_cached_results',
                result_count: cached.results.length
              }
            };
          }
        }

        const startedAt = Date.now();
        logger?.info?.('discovery_query_started', {
          query,
          provider: config.searchProvider
        });
        let providerResults = await runSearchProvidersFn({
          config,
          query,
          limit: resultsPerQuery,
          logger
        });
        let reasonCode = 'internet_search';
        if (providerResults.length === 0) {
          const queryRow = resolveSelectedQueryRow(query) || resolveProfileQueryRow(query);
          const fallbackRows = buildQueryPlanFallbackResults({
            categoryConfig,
            query,
            queryRow,
            variables,
            maxResults: resultsPerQuery,
            deterministicAliasCap: searchProfileCaps.deterministicAliasCap,
          });
          if (fallbackRows.length > 0) {
            providerResults = fallbackRows;
            reasonCode = 'internet_search_zero_plan_fallback';
            logger?.info?.('discovery_query_plan_fallback', {
              query,
              fallback_count: fallbackRows.length,
              hinted_host: String(
                queryRow?.source_host ||
                queryRow?.domain_hint ||
                extractSiteHostFromQuery(query)
              ).trim(),
            });
          }
        }
        // Record discovery search query to NDJSON index
        try {
          const _dqDir = _p4aPath.join(_p4aDefaultIndexLabRoot(), job.category || categoryConfig.category || 'mouse');
          _p4aFs.mkdirSync(_dqDir, { recursive: true });
          _p4aRecordQueryResult({
            query,
            provider: config.searchProvider || '',
            result_count: providerResults.length,
            run_id: runId,
            category: job.category || categoryConfig.category || '',
            product_id: job.productId || '',
          }, _p4aPath.join(_dqDir, 'query-index.ndjson'));
        } catch { /* index recording must not crash the pipeline */ }
        const queryRecord = frontierDb?.recordQuery?.({
          productId: job.productId,
          query,
          provider: config.searchProvider,
          fields: missingFields,
          results: providerResults
        });
        if (runtimeTraceWriter && providerResults.length > 0) {
          const trace = await runtimeTraceWriter.writeJson({
            section: 'search',
            prefix: `query_${queryRecord?.query_hash || 'hash'}`,
            payload: {
              query,
              provider: config.searchProvider,
              result_count: providerResults.length,
              results: providerResults.slice(0, 20)
            },
            ringSize: 80
          });
          logger?.info?.('discovery_serp_written', {
            query,
            result_count: providerResults.length,
            trace_path: trace.trace_path
          });
        }
        const durationMs = Math.max(0, Date.now() - startedAt);
        logger?.info?.('discovery_query_completed', {
          query,
          provider: config.searchProvider,
          result_count: providerResults.length,
          duration_ms: durationMs
        });
        if (providerResults.length > 0) {
          const engines = [...new Set(providerResults.map((r) => r?.provider).filter(Boolean))];
          const resolvedProvider = engines.length === 1 ? engines[0] : engines.length > 1 ? engines.join('+') : config.searchProvider;
          logger?.info?.('search_results_collected', {
            query,
            provider: resolvedProvider,
            dedupe_count: 0,
            results: providerResults.slice(0, 30).map((r, idx) => {
              const rawUrl = String(r?.url || '').trim();
              let domain = '';
              try { domain = new URL(rawUrl).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
              return {
                title: String(r?.title || '').trim(),
                url: rawUrl,
                domain,
                snippet: String(r?.snippet || '').trim().slice(0, 300),
                rank: idx + 1,
                relevance_score: 0,
                decision: '',
                reason: '',
                provider: String(r?.provider || '').trim(),
              };
            })
          });
        }
        return {
          providerResults,
          attempt: {
            query,
            provider: config.searchProvider,
            result_count: providerResults.length,
            reason_code: reasonCode,
            duration_ms: durationMs
          },
          journal: {
            ts: new Date().toISOString(),
            query,
            provider: config.searchProvider,
            result_count: providerResults.length,
            reason_code: reasonCode,
            duration_ms: durationMs
          }
        };
      }
    );

    for (const row of queryResults) {
      if (!row) {
        continue;
      }
      rawResults.push(...(row.providerResults || []).map((result) => ({ ...result, query: row.attempt?.query || result.query })));
      if (row.attempt) {
        searchAttempts.push(row.attempt);
      }
      if (row.journal) {
        searchJournal.push(row.journal);
      }
    }
  } else if (rawResults.length === 0) {
    const planned = buildPlanOnlyResults({
      categoryConfig,
      queries,
      variables,
      maxQueries: Math.min(queryLimit, 12),
      deterministicAliasCap: searchProfileCaps.deterministicAliasCap,
    });
    rawResults.push(...planned);
    searchAttempts.push({
      query: '',
      provider: 'plan',
      result_count: planned.length,
      reason_code: 'plan_only_no_provider'
    });
    if (planned.length > 0) {
      const plannedByQuery = new Map();
      for (const row of planned) {
        const query = String(row?.query || queries[0] || 'plan_only').trim() || 'plan_only';
        if (!plannedByQuery.has(query)) {
          plannedByQuery.set(query, []);
        }
        plannedByQuery.get(query).push(row);
      }
      for (const [query, rows] of plannedByQuery.entries()) {
        logger?.info?.('discovery_query_started', {
          query,
          provider: 'plan'
        });
        logger?.info?.('discovery_query_completed', {
          query,
          provider: 'plan',
          result_count: rows.length,
          duration_ms: 0
        });
        logger?.info?.('search_results_collected', {
          query,
          provider: 'plan',
          dedupe_count: 0,
          results: rows.slice(0, 30).map((result, index) => {
            const rawUrl = String(result?.url || '').trim();
            let domain = '';
            try {
              domain = new URL(rawUrl).hostname.replace(/^www\./, '');
            } catch {
              domain = '';
            }
            return {
              title: String(result?.title || '').trim(),
              url: rawUrl,
              domain,
              snippet: String(result?.snippet || '').trim().slice(0, 300),
              rank: index + 1,
              relevance_score: 0,
              decision: '',
              reason: 'plan_only_no_provider',
              provider: 'plan'
            };
          })
        });
      }
    }
  }

  return {
    rawResults,
    searchAttempts,
    searchJournal,
    internalSatisfied,
    externalSearchReason,
  };
}
