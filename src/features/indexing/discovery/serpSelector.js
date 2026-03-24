// WHY: Core pure functions for the LLM-based SERP URL selector.
// Simplified: LLM just picks URLs, all metadata derived deterministically.

import {
  normalizeHost,
  toArray,
} from './discoveryIdentity.js';
import {
  guessDocKind,
  isForumLikeManufacturerSubdomain,
} from './discoveryUrlClassifier.js';
import {
  isApprovedHost,
  resolveTierForHost,
  inferRoleForHost,
} from '../../../categories/loader.js';

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

export const SERP_SELECTOR_MAX_CANDIDATES = 80;
export const SERP_SELECTOR_ABSOLUTE_MAX_CANDIDATES = 120;
export const SERP_SELECTOR_TITLE_MAX_CHARS = 200;
export const SERP_SELECTOR_SNIPPET_MAX_CHARS = 260;

const HOST_TRUST_TO_LANE = {
  official: 1,
  support: 1,
  trusted_specdb: 4,
  trusted_review: 3,
  retailer: 5,
  community: 7,
  unknown: 6,
};

// ---------------------------------------------------------------------------
// serpSelectorOutputSchema — just keep_ids
// ---------------------------------------------------------------------------

import { z, toJSONSchema } from 'zod';

export const serpSelectorOutputZodSchema = z.object({
  keep_ids: z.array(z.string()),
});

export function serpSelectorOutputSchema() {
  const { $schema, ...schema } = toJSONSchema(serpSelectorOutputZodSchema);
  return schema;
}

// ---------------------------------------------------------------------------
// validateSelectorOutput — simple checks
// ---------------------------------------------------------------------------

export function validateSelectorOutput({ selectorOutput, candidateIds, maxTotalKeep }) {
  const fail = (reason) => ({ valid: false, reason });

  if (!selectorOutput || typeof selectorOutput !== 'object') {
    return fail('selectorOutput is not an object');
  }

  const { keep_ids } = selectorOutput;

  if (!Array.isArray(keep_ids)) return fail('keep_ids is not an array');

  const candidateIdSet = new Set(candidateIds);
  const seen = new Set();

  for (const id of keep_ids) {
    const trimmed = String(id || '').trim();
    if (!trimmed) return fail('keep_ids contains empty id');
    if (!candidateIdSet.has(trimmed)) return fail(`unknown id in keep_ids: ${trimmed}`);
    if (seen.has(trimmed)) return fail(`duplicate id in keep_ids: ${trimmed}`);
    seen.add(trimmed);
  }

  if (keep_ids.length > maxTotalKeep) {
    return fail(`keep_ids.length (${keep_ids.length}) exceeds max_total_keep (${maxTotalKeep})`);
  }

  return { valid: true, reason: '' };
}

// ---------------------------------------------------------------------------
// buildSerpSelectorInput — stripped to essentials
// ---------------------------------------------------------------------------

export function buildSerpSelectorInput({
  runId, category, productId,
  variables, brandResolution,
  candidateRows,
  categoryConfig,
  discoveryCap,
  serpSelectorUrlCap,
  domainClassifierUrlCap,
}) {
  const officialDomain = normalizeHost(String(brandResolution?.officialDomain || '').trim());
  const supportDomain = normalizeHost(String(brandResolution?.supportDomain || '').trim());

  // --- Priority-based candidate capping ---
  const isPinned = (row) => {
    const host = normalizeHost(String(row?.host || ''));
    if (officialDomain && host === officialDomain) return true;
    if (supportDomain && host === supportDomain) return true;
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

  // WHY: max_keep is controlled by serpSelectorUrlCap, but the selector input
  // list still honors the classifier-stage URL cap when provided.
  const configuredInputCap = Number(domainClassifierUrlCap);
  const effectiveCap = Number.isFinite(configuredInputCap) && configuredInputCap > 0
    ? Math.min(SERP_SELECTOR_MAX_CANDIDATES, configuredInputCap)
    : SERP_SELECTOR_MAX_CANDIDATES;

  const priorityCapped = priorityRows.slice(0, SERP_SELECTOR_ABSOLUTE_MAX_CANDIDATES);
  const normalSlots = Math.max(0, effectiveCap - priorityCapped.length);
  const normalCapped = normalRows.slice(0, normalSlots);
  let sentRows = [...priorityCapped, ...normalCapped];
  sentRows = sentRows.slice(0, SERP_SELECTOR_ABSOLUTE_MAX_CANDIDATES);

  const sentUrlSet = new Set(sentRows.map((r) => r.url));
  const overflowRows = candidateRows.filter((r) => !sentUrlSet.has(r.url));

  // --- Build candidate map (SSOT for id→row) ---
  const candidateMap = new Map();
  const candidates = sentRows.map((row, idx) => {
    const id = `c_${idx}`;
    candidateMap.set(id, row);
    const url = String(row?.url || '');
    const host = normalizeHost(String(row?.host || ''));
    return {
      id,
      url,
      host,
      title: String(row?.title || '').slice(0, SERP_SELECTOR_TITLE_MAX_CHARS),
      snippet: String(row?.snippet || '').slice(0, SERP_SELECTOR_SNIPPET_MAX_CHARS),
    };
  });

  // WHY: serpSelectorUrlCap is the hard cap on how many URLs the LLM keeps.
  // Caller resolves via configInt — store guarantees min/max clamping.
  const maxKeep = serpSelectorUrlCap;

  const selectorInput = {
    product: {
      brand: String(variables?.brand || ''),
      model: String(variables?.model || ''),
      variant: String(variables?.variant || ''),
    },
    official_domain: officialDomain || undefined,
    max_keep: maxKeep,
    candidates,
  };

  return { selectorInput, candidateMap, overflowRows };
}

// ---------------------------------------------------------------------------
// adaptSerpSelectorOutput — derive all metadata deterministically
// ---------------------------------------------------------------------------

export function adaptSerpSelectorOutput({
  selectorOutput, candidateMap, overflowRows = [],
  officialDomain, supportDomain, categoryConfig,
}) {
  const keepIds = toArray(selectorOutput?.keep_ids).map((id) => String(id || '').trim()).filter(Boolean);
  const keepSet = new Set(keepIds);
  const selected = [];
  const notSelected = [];

  const totalKept = keepIds.length;

  for (let rank = 0; rank < keepIds.length; rank++) {
    const id = keepIds[rank];
    const originalRow = candidateMap.get(id);
    if (!originalRow) continue;

    const host = normalizeHost(String(originalRow.host || ''));
    const url = String(originalRow.url || '');
    let pathname = '';
    try { pathname = new URL(url).pathname; } catch { /* ignore */ }

    const hostTrust = deriveHostTrust({ host, officialDomain, supportDomain, categoryConfig });
    const docKind = guessDocKind({ url, pathname, title: originalRow.title || '', snippet: originalRow.snippet || '' });
    const score = totalKept > 1 ? Math.round(100 - (rank * (99 / (totalKept - 1)))) : 100;

    selected.push({
      ...originalRow,
      approvedDomain: Boolean(originalRow.approvedDomain),
      identity_prelim: hostTrust === 'official' || hostTrust === 'support' ? 'exact' : 'uncertain',
      host_trust_class: hostTrust,
      doc_kind_guess: docKind,
      primary_lane: HOST_TRUST_TO_LANE[hostTrust] || 6,
      triage_disposition: 'fetch_high',
      approval_bucket: 'approved',
      selection_priority: rank < Math.ceil(totalKept / 3) ? 'high' : 'medium',
      soft_reason_codes: ['llm_selected'],
      score,
      score_source: 'llm_selector',
      score_breakdown: { score_source: 'llm_selector', rank: rank + 1 },
    });
  }

  // Not-selected: everything in candidateMap not in keepSet
  for (const [id, originalRow] of candidateMap) {
    if (keepSet.has(id)) continue;
    const host = normalizeHost(String(originalRow.host || ''));
    let pathname = '';
    try { pathname = new URL(String(originalRow.url || '')).pathname; } catch { /* ignore */ }
    const hostTrust = deriveHostTrust({ host, officialDomain, supportDomain, categoryConfig });
    const docKind = guessDocKind({
      url: String(originalRow.url || ''),
      pathname,
      title: originalRow.title || '',
      snippet: originalRow.snippet || '',
    });
    notSelected.push({
      ...originalRow,
      approvedDomain: Boolean(originalRow.approvedDomain),
      host_trust_class: hostTrust,
      identity_prelim: hostTrust === 'official' || hostTrust === 'support' ? 'exact' : 'uncertain',
      doc_kind_guess: docKind,
      primary_lane: HOST_TRUST_TO_LANE[hostTrust] || 6,
      triage_disposition: 'fetch_low',
      selection_priority: 'low',
      score: 0,
      score_source: 'llm_selector',
      score_breakdown: { score_source: 'llm_selector', reason: 'not_selected' },
    });
  }

  // Overflow rows (capped out of selector input)
  for (const row of overflowRows) {
    const host = normalizeHost(String(row.host || ''));
    let pathname = '';
    try { pathname = new URL(String(row.url || '')).pathname; } catch { /* ignore */ }
    const hostTrust = deriveHostTrust({ host, officialDomain, supportDomain, categoryConfig });
    const docKind = guessDocKind({
      url: String(row.url || ''),
      pathname,
      title: row.title || '',
      snippet: row.snippet || '',
    });
    notSelected.push({
      ...row,
      approvedDomain: Boolean(row.approvedDomain),
      host_trust_class: hostTrust,
      identity_prelim: hostTrust === 'official' || hostTrust === 'support' ? 'exact' : 'uncertain',
      doc_kind_guess: docKind,
      primary_lane: HOST_TRUST_TO_LANE[hostTrust] || 6,
      triage_disposition: 'selector_input_capped',
      selection_priority: 'low',
      score: 0,
      score_source: 'llm_selector',
      score_breakdown: { score_source: 'llm_selector', reason: 'selector_input_capped' },
    });
  }

  return { selected, notSelected };
}

function deriveHostTrust({ host, officialDomain, supportDomain, categoryConfig }) {
  if (officialDomain && host === officialDomain) return 'official';
  if (supportDomain && host === supportDomain) return 'support';
  if (isForumLikeManufacturerSubdomain(host)) return 'community';
  if (categoryConfig?.validatedRegistry?.[host]) return 'trusted_specdb';
  if (categoryConfig) {
    const role = inferRoleForHost(host, categoryConfig);
    if (role === 'community') return 'community';
    if (role === 'review' || role === 'lab') return 'trusted_review';
    if (role === 'retailer') return 'retailer';
    if (isApprovedHost(host, categoryConfig)) return 'trusted_review';
  }
  return 'unknown';
}
