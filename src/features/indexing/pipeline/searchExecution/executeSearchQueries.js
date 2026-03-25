/**
 * Discovery Search Execution
 *
 * Search execution loop: provider diagnostics, internal-first branch,
 * internet search branch, frontier cache, query index recording,
 * and plan-only fallback.
 */
import path from 'node:path';
import fs from 'node:fs';
import { recordQueryResult } from '../shared/queryIndex.js';
import { defaultIndexLabRoot } from '../../../../core/config/runtimeArtifactRoots.js';
import { runSearchProviders as _defaultRunSearchProviders } from './searchProviders.js';
import { searchSourceCorpus as _defaultSearchSourceCorpus } from '../../../../intel/sourceCorpus.js';
import { configValue } from '../../../../shared/settingsAccessor.js';
import {
  buildPlanOnlyResults,
  extractSiteHostFromQuery,
} from '../shared/queryPlan.js';
import { toArray } from '../shared/discoveryIdentity.js';
import { runWithConcurrency } from '../shared/helpers.js';
import { normalizeHost } from '../shared/hostParser.js';

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
  queries, executionQueryLimit, queryLimit,
  missingFields, variables,
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
      reason_code: 'frontier_query_cache',
      is_fallback: false,
    });
    logger.info('discovery_query_completed', {
      query,
      provider: cached?.provider || 'frontier_cache',
      result_count: toArray(cached?.results).length,
      duration_ms: 0,
      cache_hit: true,
      reason_code: 'frontier_query_cache',
      is_fallback: false,
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
      const internalRows = await searchSourceCorpusFn({
        storage,
        config,
        category: categoryConfig.category,
        query,
        missingFields,
        fieldOrder: categoryConfig.fieldOrder || [],
        logger
      });
      rawResults.push(...internalRows.map((row) => ({ ...row, query })));
      const internalSelectedRow = resolveSelectedQueryRow(query);
      frontierDb?.recordQuery?.({
        productId: job.productId,
        query,
        provider: 'internal',
        fields: missingFields,
        results: internalRows,
        tier: internalSelectedRow?.tier || null,
        group_key: internalSelectedRow?.group_key || null,
        normalized_key: internalSelectedRow?.normalized_key || null,
        hint_source: internalSelectedRow?.hint_source || null,
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

    logger?.info?.('internal_search_satisfaction', {
      internal_url_count: internalUrlCount,
      internal_min_results: internalMinResults,
      requires_required_coverage: requiresRequiredCoverage,
      missing_required_field_count: (missingRequiredFields || []).length,
      satisfied: internalSatisfied,
    });

    if (requiresRequiredCoverage) {
      externalSearchReason = internalSatisfied
        ? 'internal_satisfied_skip_external'
        : 'required_fields_missing_internal_under_target';
    }
  }

  const canSearchInternet =
    providerState.provider !== 'none' && Boolean(providerState.internet_ready);

  if (canSearchInternet && !(internalFirst && internalSatisfied)) {
    // WHY: Strict sequential execution — search-b must not start until search-a finishes.
    const queryResults = await runWithConcurrency(
      queries.slice(0, executionQueryLimit),
      1,
      async (query) => {
        const startedAt = Date.now();
        logger?.info?.('discovery_query_started', {
          query,
          provider: configValue(config, 'searchEngines'),
          is_fallback: false,
        });
        // WHY: screenshotSink persists Google Crawlee SERP screenshots to
        // {indexLabRoot}/{runId}/screenshots/{filename} — the same directory
        // the asset route resolves via buildRuntimeAssetCandidatePaths.
        let _googleScreenshotFilename = '';
        const screenshotSink = async ({ buffer, queryHash, query: q, ts }) => {
          try {
            const filename = `google-serp-${queryHash}-${(ts || '').replace(/[:.]/g, '-')}.jpeg`;
            const screenshotDir = path.join(defaultIndexLabRoot(), runId, 'screenshots');
            fs.mkdirSync(screenshotDir, { recursive: true });
            fs.writeFileSync(path.join(screenshotDir, filename), buffer);
            _googleScreenshotFilename = filename;
            logger?.info?.('google_crawlee_screenshot_saved', { query: q, filename, bytes: buffer.length });
          } catch (err) {
            logger?.warn?.('google_crawlee_screenshot_save_failed', { query: q, message: err.message });
          }
        };
        const searchProviderResult = await runSearchProvidersFn({
          config,
          query,
          logger,
          screenshotSink,
        });
        // WHY: runSearchProviders returns { results, usedFallback } — destructure
        // but stay backward-compat with callers that may still return a plain array.
        let providerResults = Array.isArray(searchProviderResult) ? searchProviderResult : (searchProviderResult?.results ?? []);
        const usedFallback = Array.isArray(searchProviderResult) ? false : Boolean(searchProviderResult?.usedFallback);
        let reasonCode = 'internet_search';
        // WHY: Search-first — zero results from provider → try learned URLs
        // from frontier, else accept 0. No synthetic URL fallback.
        if (providerResults.length === 0) {
          const cached = getCachedFrontierQueryResults(query);
          if (cached.results.length > 0) {
            providerResults = cached.results;
            reasonCode = 'internet_search_zero_frontier_reuse';
            logger?.info?.('discovery_query_frontier_reuse', {
              query,
              reuse_count: cached.results.length,
              provider: cached.provider,
            });
          }
        }
        // Record discovery search query to NDJSON index
        try {
          const _dqDir = path.join(defaultIndexLabRoot(), job.category || categoryConfig.category || 'mouse');
          fs.mkdirSync(_dqDir, { recursive: true });
          recordQueryResult({
            query,
            provider: configValue(config, 'searchEngines'),
            result_count: providerResults.length,
            run_id: runId,
            category: job.category || categoryConfig.category || '',
            product_id: job.productId || '',
          }, path.join(_dqDir, 'query-index.ndjson'));
        } catch { /* index recording must not crash the pipeline */ }
        const externalSelectedRow = resolveSelectedQueryRow(query);
        const queryRecord = frontierDb?.recordQuery?.({
          productId: job.productId,
          query,
          provider: configValue(config, 'searchEngines'),
          fields: missingFields,
          results: providerResults,
          tier: externalSelectedRow?.tier || null,
          group_key: externalSelectedRow?.group_key || null,
          normalized_key: externalSelectedRow?.normalized_key || null,
          hint_source: externalSelectedRow?.hint_source || null,
        });
        if (runtimeTraceWriter && providerResults.length > 0) {
          const trace = await runtimeTraceWriter.writeJson({
            section: 'search',
            prefix: `query_${queryRecord?.query_hash || 'hash'}`,
            payload: {
              query,
              provider: configValue(config, 'searchEngines'),
              result_count: providerResults.length,
              results: providerResults
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
          provider: configValue(config, 'searchEngines'),
          result_count: providerResults.length,
          duration_ms: durationMs,
          is_fallback: usedFallback,
        });
        if (providerResults.length > 0) {
          const engines = [...new Set(providerResults.map((r) => r?.provider).filter(Boolean))];
          const resolvedProvider = engines.length === 1 ? engines[0] : engines.length > 1 ? engines.join('+') : configValue(config, 'searchEngines');
          logger?.info?.('search_results_collected', {
            query,
            provider: resolvedProvider,
            dedupe_count: 0,
            screenshot_filename: _googleScreenshotFilename || '',
            results: providerResults.map((r, idx) => {
              const rawUrl = String(r?.url || '').trim();
              let domain = '';
              try { domain = normalizeHost(new URL(rawUrl).hostname); } catch { /* ignore */ }
              return {
                title: String(r?.title || '').trim(),
                url: rawUrl,
                domain,
                snippet: String(r?.snippet || '').trim(),
                rank: idx + 1,
                relevance_score: 0,
                decision: '',
                reason: '',
                provider: String(r?.provider || '').trim(),
                already_crawled: Boolean(frontierDb?.getUrlRow?.(rawUrl)?.fetch_count > 0),
              };
            })
          });
        }
        return {
          providerResults,
          attempt: {
            query,
            provider: configValue(config, 'searchEngines'),
            result_count: providerResults.length,
            reason_code: reasonCode,
            duration_ms: durationMs
          },
          journal: {
            ts: new Date().toISOString(),
            query,
            provider: configValue(config, 'searchEngines'),
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
      maxQueries: queryLimit,
      config,
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
          provider: 'plan',
          is_fallback: false,
        });
        logger?.info?.('discovery_query_completed', {
          query,
          provider: 'plan',
          result_count: rows.length,
          duration_ms: 0,
          is_fallback: false,
        });
        logger?.info?.('search_results_collected', {
          query,
          provider: 'plan',
          dedupe_count: 0,
          results: rows.map((result, index) => {
            const rawUrl = String(result?.url || '').trim();
            let domain = '';
            try {
              domain = normalizeHost(new URL(rawUrl).hostname);
            } catch {
              domain = '';
            }
            return {
              title: String(result?.title || '').trim(),
              url: rawUrl,
              domain,
              snippet: String(result?.snippet || '').trim(),
              rank: index + 1,
              relevance_score: 0,
              decision: '',
              reason: 'plan_only_no_provider',
              provider: 'plan',
              already_crawled: Boolean(frontierDb?.getUrlRow?.(rawUrl)?.fetch_count > 0),
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
