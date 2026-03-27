// WHY: Core pure functions for the LLM-based SERP URL selector.
// Simplified: LLM just picks URLs, all metadata derived deterministically.

import {
  toArray,
} from '../shared/discoveryIdentity.js';
import { normalizeHost } from '../shared/hostParser.js';
import {
  guessDocKind,
  isForumLikeManufacturerSubdomain,
} from '../shared/urlClassifier.js';
import {
  isApprovedHost,
  resolveTierForHost,
  inferRoleForHost,
} from '../../../../categories/loader.js';

// ---------------------------------------------------------------------------
// serpSelectorOutputSchema — just keep_ids
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { zodToLlmSchema } from '../../../../core/llm/zodToLlmSchema.js';

const serpSelectorOutputZodSchema = z.object({
  keep_ids: z.array(z.string()),
});

export function serpSelectorOutputSchema() {
  return zodToLlmSchema(serpSelectorOutputZodSchema);
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
  serpSelectorMaxKeep,
}) {
  const officialDomain = normalizeHost(String(brandResolution?.officialDomain || '').trim());
  const supportDomain = normalizeHost(String(brandResolution?.supportDomain || '').trim());

  // --- Priority sort (pinned/multi-hit first) ---
  const isPinned = (row) => {
    const host = normalizeHost(String(row?.host || ''));
    if (officialDomain && host === officialDomain) return true;
    if (supportDomain && host === supportDomain) return true;
    if (categoryConfig?.validatedRegistry?.[host]) return true;
    return false;
  };
  const isMultiHit = (row) =>
    (toArray(row?.seen_in_queries).length >= 2) || (toArray(row?.seen_by_providers).length >= 2);

  // WHY: Sort pinned/multi-hit first so fallback truncation preserves high-value URLs.
  const sorted = [...candidateRows].sort((a, b) => {
    const aPriority = isPinned(a) || isMultiHit(a) ? 0 : 1;
    const bPriority = isPinned(b) || isMultiHit(b) ? 0 : 1;
    return aPriority - bPriority;
  });

  // --- Build candidate map (SSOT for id→row) ---
  const candidateMap = new Map();
  const candidates = sorted.map((row, idx) => {
    const id = `c_${idx}`;
    candidateMap.set(id, row);
    const url = String(row?.url || '');
    const host = normalizeHost(String(row?.host || ''));
    return {
      id,
      url,
      host,
      title: String(row?.title || ''),
      snippet: String(row?.snippet || ''),
    };
  });

  // WHY: serpSelectorMaxKeep controls how many URLs the LLM can return (output cap).
  // All candidates are sent to the LLM; it decides which to keep.
  const maxKeep = serpSelectorMaxKeep;

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

  return { selectorInput, candidateMap };
}

// ---------------------------------------------------------------------------
// enrichCandidateRow — shared host trust + doc kind enrichment
// ---------------------------------------------------------------------------

function enrichCandidateRow(row, { officialDomain, supportDomain, categoryConfig, scoreSource = 'llm_selector' }) {
  const host = normalizeHost(String(row.host || ''));
  const url = String(row.url || '');
  let pathname = '';
  try { pathname = new URL(url).pathname; } catch { /* ignore */ }
  const hostTrust = deriveHostTrust({ host, officialDomain, supportDomain, categoryConfig });
  const docKind = guessDocKind({ url, pathname, title: row.title || '', snippet: row.snippet || '' });
  return {
    ...row,
    approvedDomain: Boolean(row.approvedDomain),
    identity_prelim: hostTrust === 'official' || hostTrust === 'support' ? 'exact' : 'uncertain',
    host_trust_class: hostTrust,
    doc_kind_guess: docKind,
    score_source: scoreSource,
  };
}

// ---------------------------------------------------------------------------
// adaptSerpSelectorOutput — derive all metadata deterministically
// ---------------------------------------------------------------------------

export function adaptSerpSelectorOutput({
  selectorOutput, candidateMap,
  officialDomain, supportDomain, categoryConfig,
  scoreSource = 'llm_selector',
}) {
  const keepIds = toArray(selectorOutput?.keep_ids).map((id) => String(id || '').trim()).filter(Boolean);
  const keepSet = new Set(keepIds);
  const selected = [];
  const notSelected = [];

  const totalKept = keepIds.length;

  // WHY: Shared enrichment extracted — host trust, doc kind, identity prelim, and
  // lane assignment are identical across selected/notSelected/overflow candidates.
  const enrich = (row) => enrichCandidateRow(row, { officialDomain, supportDomain, categoryConfig, scoreSource });

  for (let rank = 0; rank < keepIds.length; rank++) {
    const originalRow = candidateMap.get(keepIds[rank]);
    if (!originalRow) continue;
    const score = totalKept > 1 ? Math.round(100 - (rank * (99 / (totalKept - 1)))) : 100;
    selected.push({
      ...enrich(originalRow),
      triage_disposition: 'fetch_high',
      approval_bucket: 'approved',
      soft_reason_codes: [scoreSource === 'passthrough_fallback' ? 'passthrough_fallback' : 'llm_selected'],
      score,
      score_breakdown: { score_source: scoreSource, rank: rank + 1 },
    });
  }

  for (const [id, originalRow] of candidateMap) {
    if (keepSet.has(id)) continue;
    notSelected.push({
      ...enrich(originalRow),
      triage_disposition: 'fetch_low',
      score: 0,
      score_breakdown: { score_source: scoreSource, reason: 'not_selected' },
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
