// WHY: Core pure functions for the LLM-based SERP URL selector.
// Builds input, validates output, adapts output back to pipeline format.
// No I/O — all functions are pure (except frontierDb lookups in buildSerpSelectorInput).

import {
  normalizeHost,
  toArray,
  countTokenHits,
  normalizeIdentityTokens,
} from './discoveryIdentity.js';
import {
  detectVariantGuardHit,
  detectMultiModelHint,
  guessDocKind,
} from './discoveryUrlClassifier.js';
import {
  isApprovedHost,
} from '../../../categories/loader.js';

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

export const SERP_SELECTOR_MAX_CANDIDATES = 80;
export const SERP_SELECTOR_ABSOLUTE_MAX_CANDIDATES = 120;
export const SERP_SELECTOR_TITLE_MAX_CHARS = 200;
export const SERP_SELECTOR_SNIPPET_MAX_CHARS = 260;

const VALID_DECISIONS = new Set(['approved', 'candidate', 'reject']);

const AUTHORITY_TO_HOST_TRUST = {
  official: 'official',
  support: 'support',
  validated_registry: 'trusted_specdb',
  internal: 'official',
  trusted_review: 'trusted_review',
  trusted_database: 'trusted_specdb',
  retailer: 'retailer',
  community: 'community',
  unknown: 'unknown',
};

const AUTHORITY_TO_LANE = {
  official: 1,
  support: 1,
  validated_registry: 4,
  internal: 1,
  trusted_review: 3,
  trusted_database: 4,
  retailer: 5,
  community: 7,
  unknown: 6,
};

const PAGE_TYPE_TO_SURFACE = {
  product_page: 'json_ld',
  support_page: 'json_ld',
  manual_pdf: 'pdf_table',
  spec_pdf: 'pdf_table',
  review: 'article_text',
  database: 'html_table',
  retailer_detail: 'embedded_state',
  internal_doc: 'html_table',
  broad_article: 'article_text',
  category_or_search: 'weak_surface',
  forum_or_social: 'weak_surface',
  homepage: 'weak_surface',
  login_or_account: 'weak_surface',
  unknown: 'article_text',
};

// ---------------------------------------------------------------------------
// serpSelectorOutputSchema
// ---------------------------------------------------------------------------

export function serpSelectorOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      schema_version: { type: 'string' },
      keep_ids: { type: 'array', items: { type: 'string' } },
      approved_ids: { type: 'array', items: { type: 'string' } },
      candidate_ids: { type: 'array', items: { type: 'string' } },
      reject_ids: { type: 'array', items: { type: 'string' } },
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            decision: { type: 'string', enum: ['approved', 'candidate', 'reject'] },
            score: { type: 'number' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            fetch_rank: { type: ['integer', 'null'] },
            page_type: { type: 'string' },
            authority_bucket: { type: 'string' },
            likely_field_keys: { type: 'array', items: { type: 'string' } },
            reason_code: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['id', 'decision', 'score', 'confidence', 'fetch_rank', 'page_type', 'authority_bucket', 'reason_code', 'reason'],
        },
      },
      summary: {
        type: 'object',
        properties: {
          input_count: { type: 'integer' },
          approved_count: { type: 'integer' },
          candidate_count: { type: 'integer' },
          reject_count: { type: 'integer' },
          notes: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    required: ['keep_ids', 'approved_ids', 'candidate_ids', 'reject_ids', 'results', 'summary'],
  };
}

// ---------------------------------------------------------------------------
// validateSelectorOutput
// ---------------------------------------------------------------------------

export function validateSelectorOutput({ selectorOutput, candidateIds, maxTotalKeep }) {
  const fail = (reason) => ({ valid: false, reason });

  if (!selectorOutput || typeof selectorOutput !== 'object') {
    return fail('selectorOutput is not an object');
  }

  const { results, keep_ids, approved_ids, candidate_ids, reject_ids } = selectorOutput;

  // Structural: results array
  if (!Array.isArray(results)) return fail('results is not an array');
  if (results.length !== candidateIds.length) {
    return fail(`results.length (${results.length}) !== candidateIds.length (${candidateIds.length})`);
  }

  // Structural: ID arrays exist
  if (!Array.isArray(keep_ids)) return fail('keep_ids is not an array');
  if (!Array.isArray(approved_ids)) return fail('approved_ids is not an array');
  if (!Array.isArray(candidate_ids)) return fail('candidate_ids is not an array');
  if (!Array.isArray(reject_ids)) return fail('reject_ids is not an array');

  // Structural: every result has valid ID and decision
  const resultIdSet = new Set();
  const candidateIdSet = new Set(candidateIds);
  const approvedFromResults = [];
  const candidateFromResults = [];
  const rejectFromResults = [];

  for (const r of results) {
    const id = String(r?.id || '').trim();
    if (!id) return fail('result has empty id');
    if (!candidateIdSet.has(id)) return fail(`unknown id in results: ${id}`);
    if (resultIdSet.has(id)) return fail(`duplicate id in results: ${id}`);
    resultIdSet.add(id);

    const decision = String(r?.decision || '').trim();
    if (!VALID_DECISIONS.has(decision)) return fail(`invalid decision: ${decision} for id ${id}`);

    if (decision === 'approved') approvedFromResults.push(id);
    else if (decision === 'candidate') candidateFromResults.push(id);
    else rejectFromResults.push(id);
  }

  // Structural: every candidateId appears in results
  for (const id of candidateIds) {
    if (!resultIdSet.has(id)) return fail(`candidate id missing from results: ${id}`);
  }

  // Decision↔array consistency
  const setEq = (a, b) => {
    const sa = new Set(a);
    const sb = new Set(b);
    if (sa.size !== sb.size) return false;
    for (const v of sa) if (!sb.has(v)) return false;
    return true;
  };

  if (!setEq(approved_ids, approvedFromResults)) {
    return fail('approved_ids does not match results with decision=approved');
  }
  if (!setEq(candidate_ids, candidateFromResults)) {
    return fail('candidate_ids does not match results with decision=candidate');
  }
  if (!setEq(reject_ids, rejectFromResults)) {
    return fail('reject_ids does not match results with decision=reject');
  }

  const expectedKeep = new Set([...approved_ids, ...candidate_ids]);
  const actualKeep = new Set(keep_ids);
  if (!setEq(expectedKeep, actualKeep)) {
    return fail('keep_ids does not equal approved_ids ∪ candidate_ids');
  }

  // Cross-array duplicates
  const allBuckets = [...approved_ids, ...candidate_ids, ...reject_ids];
  const bucketSet = new Set();
  for (const id of allBuckets) {
    if (bucketSet.has(id)) return fail(`id appears in multiple arrays: ${id}`);
    bucketSet.add(id);
  }

  // Fetch_rank integrity
  const keptResults = results.filter((r) => r.decision !== 'reject');
  const rejectedResults = results.filter((r) => r.decision === 'reject');

  for (const r of keptResults) {
    if (r.fetch_rank === null || r.fetch_rank === undefined || !Number.isInteger(r.fetch_rank) || r.fetch_rank < 1) {
      return fail(`kept row ${r.id} has invalid fetch_rank: ${r.fetch_rank}`);
    }
  }
  for (const r of rejectedResults) {
    if (r.fetch_rank !== null) {
      return fail(`rejected row ${r.id} has non-null fetch_rank: ${r.fetch_rank}`);
    }
  }

  // Contiguous 1..N
  if (keptResults.length > 0) {
    const ranks = keptResults.map((r) => r.fetch_rank).sort((a, b) => a - b);
    const rankSet = new Set(ranks);
    if (rankSet.size !== ranks.length) return fail('duplicate fetch_rank among kept rows');
    for (let i = 0; i < ranks.length; i++) {
      if (ranks[i] !== i + 1) return fail(`fetch_rank not contiguous: expected ${i + 1}, got ${ranks[i]}`);
    }
  }

  // Limit compliance
  if (keep_ids.length > maxTotalKeep) {
    return fail(`keep_ids.length (${keep_ids.length}) exceeds max_total_keep (${maxTotalKeep})`);
  }

  return { valid: true, reason: '' };
}

// ---------------------------------------------------------------------------
// buildSerpSelectorInput
// ---------------------------------------------------------------------------

export function buildSerpSelectorInput({
  runId, category, productId, round, roundMode,
  variables, identityLock, brandResolution,
  missingFields, missingCriticalFields, focusFields,
  effectiveHostPlan, searchProfileBase,
  candidateRows,
  queryMetaByQuery,
  categoryConfig, frontierDb,
  discoveryCap,
  maxUrlsPerProduct,
  maxCandidateUrls,
}) {
  const { brandTokens, modelTokens } = normalizeIdentityTokens(variables || {});
  const variantGuardTerms = toArray(searchProfileBase?.variant_guard_terms);
  const officialDomain = normalizeHost(String(brandResolution?.officialDomain || '').trim());
  const supportDomain = normalizeHost(String(brandResolution?.supportDomain || '').trim());

  // --- Priority-based candidate capping ---
  const isPinned = (row) => {
    const host = normalizeHost(String(row?.host || ''));
    if (officialDomain && host === officialDomain) return true;
    if (supportDomain && host === supportDomain) return true;
    if (effectiveHostPlan?.policy_map?.[host]) return true;
    if (categoryConfig?.validatedRegistry?.[host]) return true;
    return false;
  };
  const isMultiHit = (row) =>
    (toArray(row?.seen_in_queries).length >= 2) || (toArray(row?.seen_by_providers).length >= 2);

  const priorityRows = [];
  const normalRows = [];
  for (const row of candidateRows) {
    if (isPinned(row) || isMultiHit(row)) priorityRows.push(row);
    else normalRows.push(row);
  }

  // WHY: Use config maxCandidateUrls when provided so the GUI knob controls
  // how many candidates the LLM sees. Fall back to the named constant default.
  const effectiveCap = (typeof maxCandidateUrls === 'number' && maxCandidateUrls > 0)
    ? maxCandidateUrls
    : SERP_SELECTOR_MAX_CANDIDATES;

  // Priority rows first, then fill normal up to effectiveCap total
  const priorityCapped = priorityRows.slice(0, SERP_SELECTOR_ABSOLUTE_MAX_CANDIDATES);
  const normalSlots = Math.max(0, effectiveCap - priorityCapped.length);
  const normalCapped = normalRows.slice(0, normalSlots);
  let sentRows = [...priorityCapped, ...normalCapped];
  // Hard emergency ceiling
  sentRows = sentRows.slice(0, SERP_SELECTOR_ABSOLUTE_MAX_CANDIDATES);

  const sentUrlSet = new Set(sentRows.map((r) => r.url));
  const overflowRows = candidateRows.filter((r) => !sentUrlSet.has(r.url));

  // --- Build candidate map (SSOT for id→row) ---
  const candidateMap = new Map();
  const candidates = sentRows.map((row, idx) => {
    const id = `c_${idx}`;
    candidateMap.set(id, row);
    return buildCandidateEntry({
      id, row, brandTokens, modelTokens, variantGuardTerms,
      officialDomain, supportDomain,
      effectiveHostPlan, categoryConfig, frontierDb, queryMetaByQuery,
      variables,
    });
  });

  // --- Assemble SelectorInput ---
  const selectorInput = {
    schema_version: 'serp_selector_input.v1',
    run: {
      run_id: runId || '',
      category: category || categoryConfig?.category || '',
      product_id: productId || '',
      round: round ?? 0,
      round_mode: roundMode || '',
    },
    product_lock: {
      brand: String(identityLock?.brand || ''),
      model: String(identityLock?.model || ''),
      variant: String(identityLock?.variant || ''),
      aliases: toArray(searchProfileBase?.identity_aliases).map((a) => String(a?.alias || a || '')).filter(Boolean),
      variant_guard_terms: variantGuardTerms,
      negative_terms: toArray(searchProfileBase?.negative_terms),
      identity_lock: {
        brand_tokens: toArray(identityLock?.brand_tokens),
        model_tokens: toArray(identityLock?.model_tokens),
        allowed_model_tokens: toArray(identityLock?.allowed_model_tokens),
        required_digit_groups: toArray(identityLock?.required_digit_groups),
      },
    },
    need_context: {
      missing_critical_fields: toArray(missingCriticalFields),
      unresolved_fields: toArray(missingFields),
      focus_fields: toArray(focusFields).map((f) => ({
        field_key: String(f?.field_key || ''),
        required_level: String(f?.required_level || 'optional'),
        need_score: Number(f?.need_score || 0),
      })),
    },
    selection_limits: {
      // WHY: Cap at maxUrlsPerProduct when provided — the planner will never
      // approve more than that, so telling the LLM a higher number wastes its
      // selection budget on URLs that can never be fetched.
      max_total_keep: Math.max(1, Math.min(
        Number(discoveryCap || 60),
        (typeof maxUrlsPerProduct === 'number' && maxUrlsPerProduct > 0) ? maxUrlsPerProduct : Infinity,
      )),
      prefer_pinned: true,
    },
    candidates,
  };

  // Optional sections
  if (brandResolution?.officialDomain) {
    selectorInput.brand_resolution = {
      official_domain: String(brandResolution.officialDomain || ''),
      support_domain: String(brandResolution.supportDomain || ''),
      aliases: toArray(brandResolution.aliases).map((a) => String(a || '')).filter(Boolean),
      confidence: Number(brandResolution.confidence || 0),
      reasoning: toArray(brandResolution.reasoning).map((r) => String(r || '')).filter(Boolean),
    };
  }

  if (effectiveHostPlan) {
    const hostPlanEntries = Object.entries(effectiveHostPlan.policy_map || {}).map(([host, policy]) => ({
      host,
      role: String(policy?.role || 'other'),
      score: Number(policy?.score || 0),
      reason: String(policy?.reason || ''),
    }));
    selectorInput.source_hints = {
      preferred_domains: toArray(categoryConfig?.sourceHosts)
        .filter((h) => h?.tierName === 'manufacturer' || h?.tierName === 'lab')
        .map((h) => String(h?.host || '')).filter(Boolean).slice(0, 20),
      effective_host_plan: hostPlanEntries.slice(0, 20),
    };
  }

  return { selectorInput, candidateMap, overflowRows };
}

function buildCandidateEntry({
  id, row, brandTokens, modelTokens, variantGuardTerms,
  officialDomain, supportDomain,
  effectiveHostPlan, categoryConfig, frontierDb, queryMetaByQuery,
  variables,
}) {
  const host = normalizeHost(String(row?.host || ''));
  const url = String(row?.url || '');
  let pathname = '';
  try { pathname = new URL(url).pathname; } catch { /* ignore */ }
  const title = String(row?.title || '').slice(0, SERP_SELECTOR_TITLE_MAX_CHARS);
  const snippet = String(row?.snippet || '').slice(0, SERP_SELECTOR_SNIPPET_MAX_CHARS);
  const haystack = `${title} ${snippet} ${url}`.toLowerCase();

  // Host signals — product-resolved, not generic
  const hostIsOfficial = Boolean(officialDomain && host === officialDomain);
  const hostIsSupport = Boolean(supportDomain && host === supportDomain);
  const hostIsPreferred = Boolean(isApprovedHost(host, categoryConfig));
  const hostPlanHit = Boolean(effectiveHostPlan?.policy_map?.[host]);
  const validatedRegistryHost = Boolean(categoryConfig?.validatedRegistry?.[host]);

  // Identity signals
  const brandMatch = countTokenHits(haystack, brandTokens) > 0;
  const modelMatch = countTokenHits(haystack, modelTokens) > 0;
  const variantGuardHit = detectVariantGuardHit({
    title, snippet, url,
    variantGuardTerms,
    targetVariant: String(variables?.variant || ''),
  });
  const multiModelHint = detectMultiModelHint({ title, snippet });

  // Surface flags
  const isPdf = pathname.toLowerCase().endsWith('.pdf');
  const docKind = guessDocKind({ url, pathname, title, snippet });
  const looksLikeProductDetail = docKind === 'product_page' || docKind === 'spec';
  const looksLikeSupportDoc = docKind === 'support';
  const looksLikeManualOrDatasheet = docKind === 'manual_pdf' || docKind === 'spec_pdf';
  const looksLikeCategoryOrSearch = /\/(category|categories|search|tag|tags|archive)\b/i.test(pathname);
  const looksLikeForumOrSocial = /\b(forum|community|discuss|reddit|twitter|facebook)\b/i.test(host + pathname);
  const looksLikeHomepage = pathname === '/' || pathname === '';
  const looksLikeLoginOrAccount = /\/(login|signin|account|cart|checkout|register)\b/i.test(pathname);

  // History flags
  const deadDomain = Boolean(frontierDb?.isDomainDead?.(host));
  const cooldownUrl = Boolean(frontierDb?.shouldSkipUrl?.(url));
  const repeatLoser = Boolean(frontierDb?.isRepeatLoser?.(url));

  // Query hits
  const seenQueries = toArray(row?.seen_in_queries);
  const queryHits = seenQueries.map((q) => {
    const meta = queryMetaByQuery?.get(String(q || '').trim()) || {};
    return {
      q: String(q || '').trim(),
      source: String(meta?.hint_source || 'other'),
      target_fields: toArray(meta?.target_fields),
    };
  }).filter((h) => h.q);

  const likelyFields = [...new Set(queryHits.flatMap((h) => h.target_fields))];

  // Pinned status
  const pinned = hostIsOfficial || hostIsSupport || hostPlanHit || validatedRegistryHost;

  // Page type hint
  const pageTypeHint = mapDocKindToPageType(docKind);

  // Page extension
  const pageExt = isPdf ? 'pdf' : 'html';

  return {
    id,
    url,
    host,
    path: pathname,
    title,
    snippet,
    provider: String(toArray(row?.seen_by_providers)[0] || row?.provider || ''),
    source_channel: 'internet',
    page_ext: pageExt,
    page_type_hint: pageTypeHint,
    best_rank: Number(row?.rank || 0),
    seen_in_queries: seenQueries.length,
    seen_by_providers: toArray(row?.seen_by_providers).length,
    query_hits: queryHits.slice(0, 10),
    likely_fields_from_query: likelyFields.slice(0, 20),
    pinned,
    pin_reason: pinned
      ? (hostIsOfficial ? 'official_host' : hostIsSupport ? 'support_host' : hostPlanHit ? 'host_plan' : 'validated_registry')
      : undefined,
    host_signals: {
      official_host: hostIsOfficial,
      support_host: hostIsSupport,
      preferred_host: hostIsPreferred,
      effective_host_plan_hit: hostPlanHit,
      validated_registry_host: validatedRegistryHost,
    },
    identity_signals: {
      brand_match: brandMatch,
      model_match: modelMatch,
      variant_guard_hit: variantGuardHit,
      foreign_model_tokens: [],
    },
    surface_flags: {
      is_pdf: isPdf,
      looks_like_product_detail: looksLikeProductDetail,
      looks_like_support_doc: looksLikeSupportDoc,
      looks_like_manual_or_datasheet: looksLikeManualOrDatasheet,
      looks_like_category_or_search: looksLikeCategoryOrSearch,
      looks_like_forum_or_social: looksLikeForumOrSocial,
      looks_like_homepage: looksLikeHomepage,
      looks_like_login_or_account: looksLikeLoginOrAccount,
    },
    history_flags: {
      dead_domain: deadDomain,
      cooldown_url: cooldownUrl,
      repeat_loser: repeatLoser,
    },
  };
}

function mapDocKindToPageType(docKind) {
  const map = {
    product_page: 'product_page',
    support: 'support_page',
    manual_pdf: 'manual_pdf',
    spec_pdf: 'spec_pdf',
    spec: 'database',
    spec_sheet: 'database',
    teardown_review: 'review',
    lab_review: 'review',
    review: 'review',
    forum: 'forum_thread',
    community: 'forum_index',
    other: 'unknown',
  };
  return map[docKind] || 'unknown';
}

// ---------------------------------------------------------------------------
// adaptSerpSelectorOutput
// ---------------------------------------------------------------------------

export function adaptSerpSelectorOutput({ selectorOutput, candidateMap, overflowRows = [] }) {
  const results = toArray(selectorOutput?.results);
  const selected = [];
  const notSelected = [];

  // Sort by fetch_rank for kept rows
  const sortedResults = [...results].sort((a, b) => {
    if (a.decision === 'reject' && b.decision === 'reject') return 0;
    if (a.decision === 'reject') return 1;
    if (b.decision === 'reject') return -1;
    return (a.fetch_rank || 0) - (b.fetch_rank || 0);
  });

  for (const result of sortedResults) {
    const id = String(result?.id || '');
    const originalRow = candidateMap.get(id);
    if (!originalRow) continue;

    const decision = String(result?.decision || '');
    const score = Number(result?.score || 0) * 100;
    const authorityBucket = String(result?.authority_bucket || 'unknown');
    const pageType = String(result?.page_type || 'unknown');
    const confidence = String(result?.confidence || 'low');
    const reasonCode = String(result?.reason_code || 'unclear');
    const reason = String(result?.reason || '');

    const enrichedRow = {
      ...originalRow,
      // WHY: approvedDomain preserved from original row, NOT from LLM decision
      approvedDomain: Boolean(originalRow.approvedDomain),
      approved_domain: Boolean(originalRow.approvedDomain || originalRow.approved_domain),
      identity_prelim: mapAuthorityToIdentityPrelim(authorityBucket, confidence),
      host_trust_class: AUTHORITY_TO_HOST_TRUST[authorityBucket] || 'unknown',
      doc_kind_guess: pageType,
      extraction_surface_prior: PAGE_TYPE_TO_SURFACE[pageType] || 'article_text',
      primary_lane: AUTHORITY_TO_LANE[authorityBucket] || 6,
      triage_disposition: decision === 'approved' ? 'fetch_high' : decision === 'candidate' ? 'fetch_normal' : 'fetch_low',
      approval_bucket: decision === 'reject' ? undefined : decision,
      selection_priority: decision === 'approved' ? 'high' : decision === 'candidate' ? 'medium' : 'low',
      soft_reason_codes: [reasonCode],
      score,
      score_source: 'llm_selector',
      score_breakdown: {
        llm_score: Number(result?.score || 0),
        llm_confidence: confidence,
        llm_reason_code: reasonCode,
        llm_reason: reason,
        score_source: 'llm_selector',
      },
      triage_enriched: true,
      triage_schema_version: 2,
      target_fields: toArray(result?.likely_field_keys),
      _fetch_rank: result?.fetch_rank ?? null,
    };

    if (decision === 'approved' || decision === 'candidate') {
      selected.push(enrichedRow);
    } else {
      notSelected.push(enrichedRow);
    }
  }

  // Add overflow rows (capped out of selector input)
  for (const row of overflowRows) {
    notSelected.push({
      ...row,
      approvedDomain: Boolean(row.approvedDomain),
      approved_domain: Boolean(row.approvedDomain || row.approved_domain),
      triage_disposition: 'selector_input_capped',
      selection_priority: 'low',
      triage_enriched: true,
      triage_schema_version: 2,
      score: 0,
      score_source: 'llm_selector',
      score_breakdown: { score_source: 'llm_selector', reason: 'selector_input_capped' },
    });
  }

  // Compatibility-only lane stats
  const laneCounts = {};
  for (const row of selected) {
    const lane = row.primary_lane || 6;
    laneCounts[lane] = (laneCounts[lane] || 0) + 1;
  }
  const laneStats = {
    _compatibility: true,
    lanes: Object.entries(laneCounts).map(([lane, count]) => ({
      lane: Number(lane),
      selected: count,
    })),
  };
  const laneQuotas = {
    _compatibility: true,
  };

  return { selected, notSelected, laneStats, laneQuotas };
}

function mapAuthorityToIdentityPrelim(authorityBucket, confidence) {
  if (authorityBucket === 'official' || authorityBucket === 'support') {
    return confidence === 'high' ? 'exact' : 'family';
  }
  if (authorityBucket === 'validated_registry' || authorityBucket === 'internal') {
    return 'exact';
  }
  if (confidence === 'high') return 'exact';
  if (confidence === 'medium') return 'family';
  return 'uncertain';
}
