// WHY: URL and domain classification for processDiscoveryResults.
// Phase 2: canonicalize + classify + dedup candidate URLs.
// Phase 3: deterministic domain safety heuristics.

import {
  inferRoleForHost,
  isApprovedHost,
  isDeniedHost,
  resolveTierForHost,
} from '../../../../categories/loader.js';
import {
  toArray,
  uniqueTokens,
} from '../shared/discoveryIdentity.js';
import {
  classifyUrlCandidate,
  collectDomainClassificationSeeds,
} from '../shared/urlClassifier.js';

/**
 * Canonicalizes, classifies, and deduplicates hard-drop survivors into byUrl map.
 *
 * @param {object} ctx
 * @param {Array} ctx.hardDropSurvivors - URLs that passed hard-drop filter
 * @param {Map} ctx.queryMetaByQuery - query text → query row metadata
 * @param {object} ctx.frontierDb - frontier canonicalization
 * @param {object} ctx.categoryConfig - tier definitions, approved/denied hosts
 * @param {object} ctx.searchProfileBase - variant_guard_terms
 * @param {object} ctx.identityLock - identity constraints
 * @param {Function} ctx.ensureTrace - trace map creator
 * @returns {{ byUrl: Map, canonMergeCount: number }}
 */
export function classifyAndDeduplicateCandidates({
  hardDropSurvivors,
  queryMetaByQuery,
  frontierDb,
  categoryConfig,
  searchProfileBase,
  identityLock,
  ensureTrace,
}) {
  const byUrl = new Map();
  let canonMergeCount = 0;

  for (const raw of hardDropSurvivors) {
    try {
      const parsed = new URL(raw.url);
      const canonicalFromFrontier = frontierDb?.canonicalize?.(parsed.toString())?.canonical_url || parsed.toString();
      const queryList = uniqueTokens(
        [...toArray(raw.seen_in_queries), raw.query]
      );
      const providerList = uniqueTokens(
        [...toArray(raw.seen_by_providers), raw.provider]
      );
      const queryHintList = uniqueTokens(
        queryList.map((query) => String(queryMetaByQuery.get(query)?.doc_hint || '').trim()).filter(Boolean)
      );
      const hintSourceList = uniqueTokens(
        queryList.map((query) => String(queryMetaByQuery.get(query)?.hint_source || '').trim()).filter(Boolean)
      );
      const targetFieldList = uniqueTokens(
        queryList.flatMap((query) => toArray(queryMetaByQuery.get(query)?.target_fields))
      );
      const domainHintList = uniqueTokens(
        queryList.map((query) => String(queryMetaByQuery.get(query)?.domain_hint || '').trim()).filter(Boolean)
      );
      const trace = ensureTrace(canonicalFromFrontier, {
        original_url: parsed.toString(),
        title: String(raw.title || '').trim(),
        snippet: String(raw.snippet || '').trim(),
        providers: providerList,
        queries: queryList,
        query_hints: queryHintList,
        hint_sources: hintSourceList,
        target_fields: targetFieldList,
        domain_hints: domainHintList,
      });
      const classified = classifyUrlCandidate(raw, categoryConfig, {
        identityLock,
        variantGuardTerms: toArray(searchProfileBase?.variant_guard_terms),
      });
      const canonical = canonicalFromFrontier;
      if (trace) {
        trace.host = classified.host;
        trace.root_domain = classified.rootDomain;
        trace.tier_guess = Number.isFinite(Number(classified.tier)) ? Number(classified.tier) : null;
        trace.tier_name_guess = String(classified.tierName || '').trim();
        trace.role = String(classified.role || '').trim();
        trace.doc_kind_guess = String(classified.doc_kind_guess || '').trim();
        // WHY: classified uses camelCase (pipeline convention); trace uses snake_case (DB column names).
        trace.approved_domain = Boolean(classified.approvedDomain);
        trace.decision = 'eligible';
      }
      if (!byUrl.has(canonical)) {
        byUrl.set(canonical, {
          ...classified,
          url: canonical,
          original_url: parsed.toString(),
          seen_by_providers: providerList,
          seen_in_queries: queryList,
          cross_provider_count: providerList.length,
        });
      } else {
        canonMergeCount++;
        const existing = byUrl.get(canonical);
        existing.seen_by_providers = uniqueTokens([...(existing.seen_by_providers || []), ...providerList]);
        existing.seen_in_queries = uniqueTokens([...(existing.seen_in_queries || []), ...queryList]);
        existing.cross_provider_count = (existing.seen_by_providers || []).length;
      }
    } catch {
      // ignore malformed URL
    }
  }

  return { byUrl, canonMergeCount };
}

/**
 * Deterministic domain safety classification with frontier DB runtime data.
 *
 * @param {object} ctx
 * @param {Array} ctx.candidateRows - classified candidate rows
 * @param {object|null} ctx.brandResolution - brand resolver output
 * @param {object} ctx.categoryConfig - tier definitions, denylist
 * @param {object|null} ctx.frontierDb - frontier DB for runtime fetch history
 * @param {object|null} ctx.logger
 * @returns {{ domainClassificationRows: Array, domainSafetyResults: Map }}
 */
export function classifyDomains({
  candidateRows,
  brandResolution,
  categoryConfig,
  frontierDb,
  logger,
}) {
  const domainClassificationSeeds = collectDomainClassificationSeeds({
    searchResultRows: candidateRows,
    brandResolution,
  });

  // WHY: Aggregate per-domain fetch history from frontier DB when available.
  // This provides real success_rate, latency, cooldown, and block data.
  const frontierStats = typeof frontierDb?.aggregateDomainStats === 'function'
    ? frontierDb.aggregateDomainStats(domainClassificationSeeds)
    : new Map();

  const domainClassificationRows = [];
  if (domainClassificationSeeds.length > 0) {
    for (const domain of domainClassificationSeeds) {
      const blocked = isDeniedHost(domain, categoryConfig);
      const approved = !blocked && isApprovedHost(domain, categoryConfig);
      const tier = Number(resolveTierForHost(domain, categoryConfig) || 0);
      const stats = frontierStats.get(domain) || null;

      domainClassificationRows.push({
        domain,
        role: String(inferRoleForHost(domain, categoryConfig) || '').trim(),
        safety_class: blocked ? 'blocked' : (approved ? 'safe' : 'caution'),
        cooldown_remaining: stats ? Math.round(stats.cooldown_remaining_ms / 1000) : 0,
        success_rate: stats ? stats.success_rate : 0,
        avg_latency_ms: stats ? stats.avg_latency_ms : 0,
        fetch_count: stats ? stats.fetch_count : 0,
        blocked_count: stats ? stats.blocked_count : 0,
        timeout_count: stats ? stats.timeout_count : 0,
        last_blocked_ts: stats ? stats.last_blocked_ts : null,
        notes: blocked ? 'category_denylist' : 'deterministic_heuristic',
      });
    }
  }

  const domainSafetyResults = new Map();
  for (const row of domainClassificationRows) {
    domainSafetyResults.set(row.domain, {
      safe: row.safety_class !== 'blocked',
      classification: row.safety_class,
      reason: row.notes,
    });
  }

  if (domainClassificationRows.length > 0) {
    logger?.info?.('domains_classified', {
      classifications: domainClassificationRows,
    });
  }

  return { domainClassificationRows, domainSafetyResults };
}
