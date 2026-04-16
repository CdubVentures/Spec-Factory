/**
 * Discovery Search Execution
 *
 * Search execution loop: provider diagnostics, internal-first branch,
 * internet search branch, frontier cache, query index recording,
 * and plan-only fallback.
 */
import path from 'node:path';
import fs from 'node:fs';
import { defaultIndexLabRoot } from '../../../../core/config/runtimeArtifactRoots.js';
import { runSearchProviders as _defaultRunSearchProviders } from './searchProviders.js';
import { searchSourceCorpus as _defaultSearchSourceCorpus } from './sourceCorpus.js';
import { configValue, configBool, configInt } from '../../../../shared/settingsAccessor.js';
import {
  buildPlanOnlyResults,
  extractSiteHostFromQuery,
} from '../shared/queryPlan.js';
import { toArray } from '../shared/discoveryIdentity.js';
import { runWithConcurrency } from '../shared/helpers.js';
import { normalizeHost } from '../shared/hostParser.js';
import { isVideoUrl } from '../shared/urlClassifier.js';

function isUrlCooldownExpired(lastSeenTs, cooldownMs) {
  if (cooldownMs <= 0) return true;
  if (!lastSeenTs) return true;
  return (Date.now() - new Date(lastSeenTs).getTime()) > cooldownMs;
}

/**
 * Execute the search queries phase of discovery.
 *
 * @param {object} ctx - Execution context
 * @returns {{ searchResults, searchAttempts, searchJournal, internalSatisfied, externalSearchReason }}
 */
export async function executeSearchQueries({
  // Infrastructure
  config, storage, logger, frontierDb,
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

  // URL cooldown: allow re-crawl of URLs older than this
  const urlCooldownDays = configInt(config, 'urlCooldownDays') ?? 90;
  const urlCooldownMs = Math.max(0, urlCooldownDays) * 86400000;

  const rawResults = [];
  const searchAttempts = [];
  const searchJournal = [];

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
      // WHY: Same source_host logic as external path.
      const internalProfileRow = resolveProfileQueryRow(query);
      const internalTier = internalSelectedRow?.tier || internalProfileRow?.tier || '';
      const internalSeedProvider = internalTier === 'seed'
        ? (internalProfileRow?.source_host || internalSelectedRow?.source_host || '')
        : 'internal';
      frontierDb?.recordQuery?.({
        productId: job.productId,
        query,
        provider: internalSeedProvider,
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
    // WHY: Serper is a stateless JSON API — concurrent dispatch is safe.
    // Non-Serper providers (Crawlee, SearXNG) use browsers/proxies and remain sequential.
    const isSerperBurst = providerState.serper_ready && configBool(config, 'serperBurstEnabled');
    const searchConcurrency = isSerperBurst ? executionQueryLimit : 1;
    // WHY: Burst overrides pacing — the shared pacer would re-serialize concurrent
    // workers through _lastQueryMs, defeating parallel dispatch.
    const effectiveConfig = isSerperBurst ? { ...config, serperSearchMinIntervalMs: 0 } : config;

    logger?.info?.('search_concurrency_resolved', {
      serper_burst: isSerperBurst,
      concurrency: searchConcurrency,
      query_count: queries.slice(0, executionQueryLimit).length,
    });

    const queryResults = await runWithConcurrency(
      queries.slice(0, executionQueryLimit),
      searchConcurrency,
      async (query) => {
        const startedAt = Date.now();
        logger?.info?.('discovery_query_started', {
          query,
          provider: configValue(effectiveConfig, 'searchEngines'),
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
          config: effectiveConfig,
          query,
          logger,
          screenshotSink,
        });
        // WHY: runSearchProviders returns { results, usedFallback } — destructure
        // but stay backward-compat with callers that may still return a plain array.
        let providerResults = Array.isArray(searchProviderResult) ? searchProviderResult : (searchProviderResult?.results ?? []);
        const usedFallback = Array.isArray(searchProviderResult) ? false : Boolean(searchProviderResult?.usedFallback);
        let reasonCode = 'internet_search';
        // WHY: Zero results from provider → accept 0. Cooldown-based query
        // management replaces the old permanent frontier cache reuse path.
        // The NeedSet controls when expired queries get re-executed.
        // Record discovery search query to SQL index
        try {
          const _dqSpecDb = config.specDb || null;
          if (_dqSpecDb) {
            _dqSpecDb.insertQueryIndexEntry({
              query,
              provider: configValue(config, 'searchEngines'),
              result_count: providerResults.length,
              run_id: runId,
              category: job.category || categoryConfig.category || '',
              product_id: job.productId || '',
              ts: new Date().toISOString(),
            });
          }
        } catch { /* index recording must not crash the pipeline */ }
        const externalSelectedRow = resolveSelectedQueryRow(query);
        // WHY: For seed queries, provider must be the source_host (e.g. 'rtings.com')
        // so deriveSeedStatus can match source seeds by source_name. For specs/brand
        // seeds (no source_host), provider stays empty so source_name is falsy.
        // For group/key searches, provider is the search engine name.
        // source_host lives on the profile row (buildSearchProfile output), NOT
        // on the selected row (which passes through the LLM planner and loses it).
        const profileRow = resolveProfileQueryRow(query);
        const effectiveTier = externalSelectedRow?.tier || profileRow?.tier || '';
        const seedSourceHost = effectiveTier === 'seed'
          ? (profileRow?.source_host || externalSelectedRow?.source_host || '')
          : configValue(config, 'searchEngines');
        const queryRecord = frontierDb?.recordQuery?.({
          productId: job.productId,
          query,
          provider: seedSourceHost,
          fields: missingFields,
          results: providerResults,
          tier: externalSelectedRow?.tier || null,
          group_key: externalSelectedRow?.group_key || null,
          normalized_key: externalSelectedRow?.normalized_key || null,
          hint_source: externalSelectedRow?.hint_source || null,
        });
        const durationMs = Math.max(0, Date.now() - startedAt);
        logger?.info?.('discovery_query_completed', {
          query,
          provider: configValue(config, 'searchEngines'),
          result_count: providerResults.length,
          duration_ms: durationMs,
          is_fallback: usedFallback,
          tier: effectiveTier || null,
          hint_source: externalSelectedRow?.hint_source || profileRow?.hint_source || null,
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
                already_crawled: (() => { const r = frontierDb?.getUrlRow?.(rawUrl); return Boolean(r?.fetch_count > 0 && !isUrlCooldownExpired(r.last_seen_ts, urlCooldownMs)); })(),
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
        const plannedRow = resolveSelectedQueryRow(query) || resolveProfileQueryRow(query);
        logger?.info?.('discovery_query_completed', {
          query,
          provider: 'plan',
          result_count: rows.length,
          duration_ms: 0,
          is_fallback: false,
          tier: plannedRow?.tier || null,
          hint_source: plannedRow?.hint_source || null,
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
              already_crawled: (() => { const r = frontierDb?.getUrlRow?.(rawUrl); return Boolean(r?.fetch_count > 0 && !isUrlCooldownExpired(r.last_seen_ts, urlCooldownMs)); })(),
            };
          })
        });
      }
    }
  }

  // WHY: Search Results phase owns dedup + video + crawled filtering.
  // Downstream phases receive only unique uncrawled URLs.
  const seen = new Set();
  const searchResults = [];
  for (const row of rawResults) {
    const url = String(row?.url || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (isVideoUrl(url)) continue;
    const urlRow = frontierDb?.getUrlRow?.(url);
    if (urlRow?.fetch_count > 0 && !isUrlCooldownExpired(urlRow.last_seen_ts, urlCooldownMs)) continue;
    searchResults.push(row);
  }

  return {
    searchResults,
    searchAttempts,
    searchJournal,
    internalSatisfied,
    externalSearchReason,
  };
}
