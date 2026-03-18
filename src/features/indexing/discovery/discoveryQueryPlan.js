/**
 * Discovery Query Plan Builder & Guard
 *
 * Extracted from searchDiscovery.js (Phase 2 of structural decomposition).
 * Owns: query construction, deduplication, ranking, identity-guard filtering.
 * All functions are pure — zero module state, zero side effects.
 */
import {
  normalizeHost,
  slug,
  tokenize,
  compactToken,
  toArray,
  uniqueTokens,
  productText,
  buildModelSlugCandidates,
  categoryPathSegments,
  containsGuardToken,
  extractDigitGroups,
  extractQueryModelLikeTokens,
  isLikelyUnitToken,
  GENERIC_MODEL_TOKENS,
} from './discoveryIdentity.js';

import {
  inferRoleForHost,
  resolveTierForHost,
  resolveTierNameForHost
} from '../../../categories/loader.js';

// ---------------------------------------------------------------------------
// Manufacturer URL plan generation
// ---------------------------------------------------------------------------

let _manufacturerPlanUrlCallCount = 0;

export function getManufacturerPlanUrlCallCount() {
  return _manufacturerPlanUrlCallCount;
}

export function resetManufacturerPlanUrlCallCount() {
  _manufacturerPlanUrlCallCount = 0;
}

export function buildManufacturerPlanUrls({ host, variables, queries, maxQueries = 3, deterministicAliasCap = 6, logger = null, reason = '' }) {
  _manufacturerPlanUrlCallCount += 1;
  const urls = [];

  // Feature flag: DISABLE_URL_GUESS_FALLBACK (default: false)
  if (process.env.DISABLE_URL_GUESS_FALLBACK === 'true') {
    logger?.info?.('manufacturer_plan_urls_disabled', { host, reason });
    return urls;
  }
  const product = productText(variables);
  const queryText = product || queries[0] || '';
  const slugs = buildModelSlugCandidates(variables, deterministicAliasCap);
  const brandSlug = slug(variables.brand || '');
  const categorySegments = categoryPathSegments(variables.category);

  const add = (path, query = '') => {
    const value = `https://${host}${path}`;
    if (!urls.some((row) => row.url === value)) {
      urls.push({
        url: value,
        title: `${host} planned manufacturer path`,
        snippet: 'planned manufacturer candidate URL',
        provider: 'plan',
        query
      });
    }
  };

  for (const modelSlug of slugs) {
    add(`/product/${modelSlug}`, queryText);
    add(`/products/${modelSlug}`, queryText);
    add(`/p/${modelSlug}`, queryText);
    add(`/${modelSlug}`, queryText);
    add(`/support/${modelSlug}`, queryText);
    add(`/manual/${modelSlug}`, queryText);
    add(`/downloads/${modelSlug}`, queryText);
    add(`/specs/${modelSlug}`, queryText);
    for (const segment of categorySegments) {
      add(`/${segment}/${modelSlug}`, queryText);
    }
    add(`/en-us/product/${modelSlug}`, queryText);
    add(`/en-us/products/${modelSlug}`, queryText);
    for (const segment of categorySegments) {
      add(`/en-us/products/${segment}/${modelSlug}`, queryText);
    }
    if (brandSlug && !modelSlug.startsWith(`${brandSlug}-`)) {
      add(`/product/${brandSlug}-${modelSlug}`, queryText);
      add(`/products/${brandSlug}-${modelSlug}`, queryText);
      for (const segment of categorySegments) {
        add(`/${segment}/${brandSlug}-${modelSlug}`, queryText);
      }
      add(`/en-us/products/${brandSlug}-${modelSlug}`, queryText);
      for (const segment of categorySegments) {
        add(`/en-us/products/${segment}/${brandSlug}-${modelSlug}`, queryText);
      }
    }
  }

  // WHY: Internal search URLs removed — search-first mode. Guessed product
  // paths above are the only plan-only fallback for manufacturer hosts.

  const result = urls.slice(0, 40);
  logger?.info?.('manufacturer_plan_urls_generated', {
    reason: reason || 'plan_only',
    host,
    url_count: result.length,
    call_count: _manufacturerPlanUrlCallCount
  });
  return result;
}

// ---------------------------------------------------------------------------
// Plan-only URL generation (no search provider)
// ---------------------------------------------------------------------------

export function buildPlanOnlyResults({ categoryConfig, queries, variables, maxQueries = 3, deterministicAliasCap = 6 }) {
  const planned = [];
  for (const sourceHost of categoryConfig.sourceHosts || []) {
    const host = sourceHost.host;
    const role = sourceHost.role || sourceHost.tierName || '';
    if (String(role).toLowerCase() === 'manufacturer') {
      planned.push(
        ...buildManufacturerPlanUrls({
          host,
          variables,
          queries,
          maxQueries,
          deterministicAliasCap,
        })
      );
      continue;
    }

    // WHY: Non-manufacturer hosts produce zero plan-only results.
    // Search-first mode — real URLs come from search providers, not guessed paths.
    continue;
  }
  return planned;
}

// ---------------------------------------------------------------------------
// Fallback results for zero-result queries
// ---------------------------------------------------------------------------

export function extractSiteHostFromQuery(query = '') {
  const match = String(query || '').match(/(?:^|\s)site:([^\s]+)/i);
  return normalizeHost(match?.[1] || '');
}

export function buildQueryPlanFallbackResults({
  categoryConfig,
  query,
  queryRow = null,
  variables = {},
  maxResults = 10,
  deterministicAliasCap = 6,
}) {
  const hintedHost = normalizeHost(
    queryRow?.source_host ||
    queryRow?.domain_hint ||
    extractSiteHostFromQuery(query)
  );
  const configuredHosts = toArray(categoryConfig?.sourceHosts).filter(Boolean);
  const matchedHosts = hintedHost
    ? configuredHosts.filter((row) => normalizeHost(row?.host || '') === hintedHost)
    : [];
  const scopedHosts = matchedHosts.length > 0
    ? matchedHosts
    : (hintedHost
      ? [{
        host: hintedHost,
        role: inferRoleForHost(hintedHost, categoryConfig),
        tier: resolveTierForHost(hintedHost, categoryConfig),
        tierName: resolveTierNameForHost(hintedHost, categoryConfig),
      }]
      : configuredHosts);
  if (scopedHosts.length === 0) {
    return [];
  }

  const scopedCategoryConfig = {
    ...categoryConfig,
    sourceHosts: scopedHosts,
  };
  return buildPlanOnlyResults({
    categoryConfig: scopedCategoryConfig,
    queries: [query],
    variables,
    maxQueries: 1,
    deterministicAliasCap,
  })
    .slice(0, Math.max(1, Number(maxResults || 10)))
    .map((row) => ({
      ...row,
      provider: 'plan_fallback',
      query: String(row?.query || query).trim(),
      snippet: String(row?.snippet || 'planned zero-result fallback URL'),
    }));
}

// ---------------------------------------------------------------------------
// Query dedup, ranking, and identity guard
// ---------------------------------------------------------------------------

export function dedupeQueryRows(rows = [], limit = 24) {
  const parsedLimit = Number(limit);
  const hasCap = Number.isFinite(parsedLimit) && parsedLimit > 0;
  const cap = hasCap ? Math.max(1, Math.floor(parsedLimit)) : Number.POSITIVE_INFINITY;
  const out = [];
  const rejectLog = [];
  const seen = new Map();
  for (const row of rows || []) {
    const query = String(row?.query || row || '').trim();
    const source = String(row?.source || 'unknown').trim() || 'unknown';
    if (!query) {
      rejectLog.push({
        query: '',
        source,
        reason: 'empty_query',
        stage: 'pre_execution_merge',
        detail: ''
      });
      continue;
    }
    const normalized = query.toLowerCase();
    if (seen.has(normalized)) {
      const existing = out[seen.get(normalized)];
      existing.sources = uniqueTokens([...(existing.sources || []), source], 8);
      existing.target_fields = uniqueTokens([
        ...toArray(existing.target_fields),
        ...toArray(row?.target_fields)
      ], 16);
      if (!existing.doc_hint) {
        existing.doc_hint = String(row?.doc_hint || '').trim();
      }
      if (!existing.domain_hint) {
        existing.domain_hint = String(row?.domain_hint || '').trim().toLowerCase();
      }
      if (!existing.hint_source) {
        existing.hint_source = String(row?.hint_source || '').trim();
      }
      rejectLog.push({
        query,
        source,
        reason: 'duplicate_query',
        stage: 'pre_execution_merge',
        detail: ''
      });
      continue;
    }
    if (out.length >= cap) {
      rejectLog.push({
        query,
        source,
        reason: 'max_query_cap',
        stage: 'pre_execution_merge',
        detail: `cap:${cap}`
      });
      continue;
    }
    out.push({
      query,
      sources: uniqueTokens([source], 8),
      target_fields: uniqueTokens(toArray(row?.target_fields), 16),
      doc_hint: String(row?.doc_hint || '').trim(),
      domain_hint: String(row?.domain_hint || '').trim().toLowerCase(),
      hint_source: String(row?.hint_source || '').trim()
    });
    seen.set(normalized, out.length - 1);
  }
  return {
    rows: out,
    rejectLog
  };
}

export function prioritizeQueryRows(rows = [], variables = {}, missingFields = [], {
  fieldPriority = null,
  hostFieldFit = null,
} = {}) {
  const brand = String(variables.brand || '').trim().toLowerCase();
  const model = String(variables.model || '').trim().toLowerCase();
  const brandToken = brand.replace(/\s+/g, '');
  const missingFieldSet = new Set(
    toArray(missingFields).map((field) => String(field || '').trim()).filter(Boolean)
  );

  const ranked = [...(rows || [])].map((row) => {
    const query = String(row?.query || '').trim();
    const text = query.toLowerCase();
    const targetFields = toArray(row?.target_fields)
      .map((field) => String(field || '').trim())
      .filter(Boolean);

    // Signal 1 — Field value (0 to 10)
    let field_value = 0;
    for (const field of targetFields) {
      if (!missingFieldSet.has(field)) continue;
      if (fieldPriority) {
        const priority = fieldPriority.get(field);
        field_value += priority === 'critical' ? 3 : priority === 'required' ? 2 : 1;
      } else {
        field_value += 2;
      }
    }
    field_value = Math.min(10, field_value);

    // Signal 2 — Source fit (0 to 5)
    const host = normalizeHost(row?.domain_hint || '');
    const hostData = host ? hostFieldFit?.get(host) : null;
    let source_fit = 0;
    if (hostData) {
      if (hostData.heuristic !== undefined) {
        source_fit = Number((hostData.heuristic * 5).toFixed(2));
      } else {
        const queryFields = targetFields.filter((f) => missingFieldSet.has(f));
        const fieldsToScore = queryFields.length > 0 ? queryFields : [...missingFieldSet];
        let points = 0;
        for (const field of fieldsToScore) {
          if (hostData.high?.has(field)) points += 1.0;
          else if (hostData.medium?.has(field)) points += 0.5;
        }
        source_fit = Number(((points / Math.max(1, fieldsToScore.length)) * 5).toFixed(2));
      }
    }

    // Signal 3 — Identity match (0 to 2)
    let identity_match = 0;
    if ((brandToken && text.includes(brandToken)) || (brand && text.includes(brand))) {
      identity_match += 1;
    }
    if (model && text.includes(model)) {
      identity_match += 1;
    }

    // Signal 5 — Overconstraint (-2 to 0)
    let overconstraint = 0;
    if (hostFieldFit) {
      const siteHost = extractSiteHostFromQuery(text);
      if (siteHost) {
        const siteHostData = hostFieldFit.get(siteHost);
        if (!siteHostData) {
          overconstraint = -2;
        } else {
          let effectiveFit = 0;
          if (siteHostData.heuristic !== undefined) {
            effectiveFit = siteHostData.heuristic;
          } else {
            const qf = targetFields.filter((f) => missingFieldSet.has(f));
            const fs = qf.length > 0 ? qf : [...missingFieldSet];
            let pts = 0;
            for (const field of fs) {
              if (siteHostData.high?.has(field)) pts += 1.0;
              else if (siteHostData.medium?.has(field)) pts += 0.5;
            }
            effectiveFit = pts / Math.max(1, fs.length);
          }
          if (effectiveFit < 0.2) {
            overconstraint = -1;
          }
        }
      }
    }

    const score = field_value + source_fit + identity_match + overconstraint;
    return {
      ...row,
      query,
      score,
      score_breakdown: { field_value, source_fit, identity_match, redundancy: 0, overconstraint },
    };
  });

  // Initial sort by score descending, then alphabetical
  ranked.sort((a, b) => b.score - a.score || a.query.localeCompare(b.query));

  // Signal 4 — Redundancy (-3 to 0): post-sort pass, host-only
  const hostCount = new Map();
  for (const row of ranked) {
    const rHost = normalizeHost(row?.domain_hint || '');
    if (!rHost) continue;
    const count = (hostCount.get(rHost) || 0) + 1;
    hostCount.set(rHost, count);
    if (count >= 2) {
      const penalty = -Math.min(3, count - 1);
      row.score += penalty;
      row.score_breakdown.redundancy = penalty;
    }
  }

  // Re-sort after redundancy penalties
  ranked.sort((a, b) => b.score - a.score || a.query.localeCompare(b.query));

  return ranked;
}

// ---------------------------------------------------------------------------
// Identity query guard
// ---------------------------------------------------------------------------

export function buildIdentityQueryGuardContext(variables = {}, variantGuardTerms = []) {
  const brandTokens = [...new Set(tokenize(variables.brand).map((token) => compactToken(token)).filter(Boolean))];
  const modelTokens = [...new Set([
    ...tokenize(variables.model),
    ...tokenize(variables.variant)
  ].map((token) => compactToken(token)).filter(Boolean))]
    .filter((token) => !brandTokens.includes(token) && !GENERIC_MODEL_TOKENS.has(token));
  const requiredDigitGroups = extractDigitGroups(
    [variables.model, variables.variant].filter(Boolean).join(' ')
  );
  const allowedModelTokens = new Set();
  for (const token of [...modelTokens, ...toArray(variantGuardTerms).map((value) => compactToken(value))]) {
    const normalized = compactToken(token);
    if (!normalized || !/[a-z]/.test(normalized) || !/\d/.test(normalized)) {
      continue;
    }
    allowedModelTokens.add(normalized);
    const trimLeftAlpha = normalized.replace(/^[a-z]+/, '');
    const trimRightAlpha = normalized.replace(/[a-z]+$/, '');
    if (trimLeftAlpha && trimLeftAlpha.length >= 2) {
      allowedModelTokens.add(trimLeftAlpha);
    }
    if (trimRightAlpha && trimRightAlpha.length >= 2 && /[a-z]/.test(trimRightAlpha) && /\d/.test(trimRightAlpha)) {
      allowedModelTokens.add(trimRightAlpha);
    }
  }
  return {
    brandTokens,
    modelTokens,
    requiredDigitGroups,
    allowedModelTokens: [...allowedModelTokens]
  };
}

export function validateQueryAgainstIdentity(query = '', context = {}) {
  const reasons = [];
  const queryText = String(query || '').toLowerCase();
  const compactQuery = compactToken(queryText);
  const brandTokens = toArray(context.brandTokens);
  const modelTokens = toArray(context.modelTokens);
  const requiredDigitGroups = toArray(context.requiredDigitGroups);
  const allowedModelTokens = new Set(toArray(context.allowedModelTokens).map((value) => compactToken(value)));

  if (
    brandTokens.length > 0
    && !brandTokens.some((token) => containsGuardToken(queryText, compactQuery, token))
  ) {
    reasons.push('missing_brand_token');
  }

  for (const digits of requiredDigitGroups) {
    if (!containsGuardToken(queryText, compactQuery, digits)) {
      reasons.push(`missing_required_digit_group:${digits}`);
    }
  }

  if (requiredDigitGroups.length === 0 && modelTokens.length > 0) {
    const requiredModelTokens = modelTokens.filter((token) => token.length >= 4);
    if (
      requiredModelTokens.length > 0
      && !requiredModelTokens.some((token) => containsGuardToken(queryText, compactQuery, token))
    ) {
      reasons.push('missing_model_token');
    }
  }

  for (const token of extractQueryModelLikeTokens(queryText)) {
    const normalized = compactToken(token);
    if (!normalized || allowedModelTokens.has(normalized) || isLikelyUnitToken(token)) {
      continue;
    }
    reasons.push(`foreign_model_token:${token}`);
    if (reasons.length >= 6) {
      break;
    }
  }

  return {
    accepted: reasons.length === 0,
    reasons
  };
}

export function enforceIdentityQueryGuard({ rows = [], variables = {}, variantGuardTerms = [] } = {}) {
  const context = buildIdentityQueryGuardContext(variables, variantGuardTerms);
  const accepted = [];
  const rejectLog = [];
  for (const row of rows || []) {
    const query = String(row?.query || '').trim();
    if (!query) {
      continue;
    }
    const result = validateQueryAgainstIdentity(query, context);
    if (result.accepted) {
      accepted.push(row);
      continue;
    }
    rejectLog.push({
      query,
      source: toArray(row?.sources),
      reason: result.reasons[0] || 'identity_guard_reject',
      stage: 'pre_execution_guard',
      detail: result.reasons.join('|')
    });
  }
  return {
    rows: accepted,
    rejectLog,
    guardContext: context
  };
}
