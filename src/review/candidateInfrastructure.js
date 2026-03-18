// ── Candidate Infrastructure ────────────────────────────────────────
//
// Pure candidate lifecycle functions extracted from componentReviewData.js.
// Value tokens, source normalization, candidate builders, invariants,
// SpecDb conversion, review lookups, and attribution context.

import { confidenceColor } from './confidenceColor.js';
import {
  isObject,
  toArray,
  normalizeToken,
  slugify,
} from './reviewNormalization.js';

// ── Serialization ───────────────────────────────────────────────────

export function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${k}:${stableSerialize(v)}`).join(',')}}`;
  }
  return String(value ?? '');
}

// ── Value Tokens ────────────────────────────────────────────────────

export function valueToken(value) {
  if (value == null) return '';
  if (typeof value === 'string') return normalizeToken(value);
  if (typeof value === 'number' || typeof value === 'boolean') return normalizeToken(value);
  return normalizeToken(stableSerialize(value));
}

export function hasKnownValue(value) {
  const token = valueToken(value);
  return token !== '' && token !== 'unk' && token !== 'unknown' && token !== 'n/a' && token !== 'null';
}

export function clamp01(value, fallback = 0) {
  const n = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// ── Source Normalization ────────────────────────────────────────────

export function normalizeSourceToken(source) {
  const token = normalizeToken(source);
  if (!token) return '';
  if (token === 'component_db' || token === 'known_values' || token === 'reference') {
    return 'reference';
  }
  if (token === 'pipeline' || token.startsWith('pipeline')) return 'pipeline';
  if (token === 'specdb') return 'specdb';
  if (token === 'manual' || token === 'user') return 'user';
  return token;
}

export function sourceLabelFromToken(token, fallback = '') {
  const normalized = normalizeSourceToken(token);
  const fallbackLabel = String(fallback || '').trim();
  if (normalized === 'reference') return fallbackLabel || 'Reference';
  if (normalized === 'pipeline') return fallbackLabel || 'Pipeline';
  if (normalized === 'specdb') return fallbackLabel || 'SpecDb';
  if (normalized === 'user') return fallbackLabel || 'user';
  return fallbackLabel || normalized || '';
}

export function sourceMethodFromToken(token, fallback = null) {
  const normalized = normalizeSourceToken(token);
  if (normalized === 'reference') return 'reference_data';
  if (normalized === 'pipeline') return 'pipeline_extraction';
  if (normalized === 'specdb') return 'specdb_lookup';
  if (normalized === 'user') return 'manual_override';
  return fallback;
}

export function candidateSourceToken(candidate, fallback = '') {
  return normalizeSourceToken(candidate?.source_id || candidate?.source || fallback);
}

// ── Attribution ─────────────────────────────────────────────────────

export function buildPipelineAttributionContext(reviewItems) {
  const productIds = [...new Set(
    toArray(reviewItems)
      .map((entry) => String(entry?.product_id || '').trim())
      .filter(Boolean)
  )];
  const productCount = productIds.length;
  return {
    productIds,
    productCount,
    productLabel: `${productCount} product${productCount === 1 ? '' : 's'}`,
  };
}

export function pipelineSourceFromAttribution(attributionContext) {
  const label = String(attributionContext?.productLabel || '').trim();
  return label ? `Pipeline (${label})` : 'Pipeline';
}

export function buildPipelineEvidenceQuote(baseQuote, attributionContext) {
  const quote = String(baseQuote || '').trim();
  const label = String(attributionContext?.productLabel || '').trim();
  if (!label) return quote;
  if (!quote) return `Observed across ${label}`;
  return `${quote}; observed across ${label}`;
}

export function reviewItemScore(reviewItem, fallback = 0.5) {
  const value = Number(reviewItem?.combined_score);
  return Number.isFinite(value) ? value : fallback;
}

// ── Candidate Builders ──────────────────────────────────────────────

export function buildPipelineReviewCandidate({
  candidateId,
  value,
  reviewItem,
  method,
  quote,
  snippetText,
  attributionContext,
}) {
  return {
    candidate_id: candidateId,
    value,
    score: reviewItemScore(reviewItem),
    source_id: 'pipeline',
    source: pipelineSourceFromAttribution(attributionContext),
    tier: null,
    method,
    evidence: {
      url: '',
      retrieved_at: reviewItem?.created_at || '',
      snippet_id: '',
      snippet_hash: '',
      quote: buildPipelineEvidenceQuote(quote, attributionContext),
      quote_span: null,
      snippet_text: String(snippetText || '').trim(),
      source_id: 'pipeline',
    },
  };
}

export function sortCandidatesByScore(candidates) {
  return [...candidates].sort((a, b) => {
    const aScore = clamp01(a?.score, -1);
    const bScore = clamp01(b?.score, -1);
    if (bScore !== aScore) return bScore - aScore;
    return String(a?.candidate_id || '').localeCompare(String(b?.candidate_id || ''));
  });
}

export function ensureCandidateShape(candidate, fallbackId, fallbackSourceToken = '') {
  const sourceToken = candidateSourceToken(candidate, fallbackSourceToken);
  const sourceLabel = sourceLabelFromToken(sourceToken, String(candidate?.source || '').trim());
  const existingEvidence = isObject(candidate?.evidence) ? candidate.evidence : {};
  const isSyntheticSelected = Boolean(candidate?.is_synthetic_selected);
  return {
    candidate_id: String(candidate?.candidate_id || fallbackId || '').trim() || String(fallbackId || 'candidate'),
    value: candidate?.value ?? null,
    score: clamp01(candidate?.score, 0),
    source_id: sourceToken || String(candidate?.source_id || '').trim(),
    source: sourceLabel,
    tier: candidate?.tier ?? null,
    method: String(candidate?.method || '').trim() || sourceMethodFromToken(sourceToken, null),
    evidence: {
      url: String(existingEvidence.url || '').trim(),
      retrieved_at: String(existingEvidence.retrieved_at || '').trim(),
      snippet_id: String(existingEvidence.snippet_id || '').trim(),
      snippet_hash: String(existingEvidence.snippet_hash || '').trim(),
      quote: String(existingEvidence.quote || '').trim(),
      quote_span: Array.isArray(existingEvidence.quote_span) ? existingEvidence.quote_span : null,
      snippet_text: String(existingEvidence.snippet_text || '').trim(),
      source_id: String(existingEvidence.source_id || sourceToken || '').trim(),
    },
    is_synthetic_selected: isSyntheticSelected,
  };
}

export function buildSyntheticSelectedCandidate({
  candidateId,
  value,
  confidence,
  sourceToken,
  sourceTimestamp = null,
  quote = '',
}) {
  const normalizedSource = normalizeSourceToken(sourceToken) || 'pipeline';
  const message = String(quote || '').trim() || 'Selected value carried from current slot state';
  return {
    candidate_id: String(candidateId || '').trim() || 'selected_value',
    value,
    score: clamp01(confidence, 0.5),
    source_id: normalizedSource,
    source: sourceLabelFromToken(normalizedSource),
    tier: null,
    method: sourceMethodFromToken(normalizedSource, 'selected_value'),
    evidence: {
      url: '',
      retrieved_at: String(sourceTimestamp || '').trim(),
      snippet_id: '',
      snippet_hash: '',
      quote: message,
      quote_span: null,
      snippet_text: message,
      source_id: normalizedSource,
    },
    is_synthetic_selected: true,
  };
}

// ── Invariants (mutate in-place) ────────────────────────────────────

export function ensureTrackedStateCandidateInvariant(state, {
  fallbackCandidateId,
  fallbackQuote = '',
} = {}) {
  if (!isObject(state)) return;
  const sourceToken = normalizeSourceToken(state.source);
  const userDriven = Boolean(state.overridden) || sourceToken === 'user';
  const selectedValue = state?.selected?.value;
  const selectedToken = valueToken(selectedValue);
  const selectedConfidence = clamp01(state?.selected?.confidence, 0.5);
  const acceptedCandidateId = String(state?.accepted_candidate_id || '').trim();

  let candidates = toArray(state.candidates)
    .filter((candidate) => hasKnownValue(candidate?.value))
    .map((candidate, index) => ensureCandidateShape(
      candidate,
      `${fallbackCandidateId || 'candidate'}_${index + 1}`,
      sourceToken,
    ));

  const hasAcceptedCandidateId = acceptedCandidateId
    ? candidates.some((candidate) => String(candidate.candidate_id || '').trim() === acceptedCandidateId)
    : false;

  if (!userDriven && selectedToken && acceptedCandidateId && !hasAcceptedCandidateId) {
    candidates.push(buildSyntheticSelectedCandidate({
      candidateId: acceptedCandidateId,
      value: selectedValue,
      confidence: selectedConfidence,
      sourceToken,
      sourceTimestamp: state.source_timestamp,
      quote: fallbackQuote,
    }));
  }

  if (!userDriven && selectedToken && !candidates.some((candidate) => valueToken(candidate.value) === selectedToken)) {
    candidates.push(buildSyntheticSelectedCandidate({
      candidateId: `${fallbackCandidateId || 'candidate'}_selected`,
      value: selectedValue,
      confidence: selectedConfidence,
      sourceToken,
      sourceTimestamp: state.source_timestamp,
      quote: fallbackQuote,
    }));
  }

  candidates = sortCandidatesByScore(candidates);
  state.candidates = candidates;
  state.candidate_count = candidates.length;

  if (userDriven) {
    if (isObject(state.selected) && hasKnownValue(state.selected.value)) {
      const conf = clamp01(state.selected.confidence, selectedConfidence);
      state.selected.confidence = conf;
      state.selected.color = confidenceColor(conf, toArray(state.reason_codes));
    }
    return;
  }

  const acceptedId = String(state.accepted_candidate_id || '').trim();
  const acceptedCandidate = acceptedId
    ? candidates.find((candidate) => String(candidate.candidate_id || '').trim() === acceptedId)
    : null;
  const selectedCandidate = acceptedCandidate || candidates[0] || null;
  if (!selectedCandidate || !hasKnownValue(selectedCandidate.value)) return;

  const confidence = clamp01(selectedCandidate.score, selectedConfidence);
  state.selected = {
    ...(isObject(state.selected) ? state.selected : {}),
    value: selectedCandidate.value,
    confidence,
    status: acceptedCandidate ? 'accepted' : (state.needs_review ? 'needs_review' : 'ok'),
    color: confidenceColor(confidence, toArray(state.reason_codes)),
  };
  const candidateSource = candidateSourceToken(selectedCandidate, sourceToken);
  if (candidateSource) {
    state.source = candidateSource;
  }
}

export function ensureEnumValueCandidateInvariant(entry, {
  fieldKey,
  fallbackQuote = '',
} = {}) {
  if (!isObject(entry)) return;
  const sourceToken = normalizeSourceToken(entry.source);
  const userDriven = sourceToken === 'user' || sourceToken === 'manual' || Boolean(entry.overridden);
  const selectedToken = valueToken(entry.value);
  const selectedConfidence = clamp01(entry.confidence, 0.5);
  const acceptedCandidateId = String(entry.accepted_candidate_id || '').trim();

  let candidates = toArray(entry.candidates)
    .filter((candidate) => hasKnownValue(candidate?.value))
    .map((candidate, index) => ensureCandidateShape(
      candidate,
      `enum_${slugify(fieldKey || 'field')}_${slugify(entry.value || index)}_${index + 1}`,
      sourceToken,
    ));

  const hasAcceptedCandidateId = acceptedCandidateId
    ? candidates.some((candidate) => String(candidate.candidate_id || '').trim() === acceptedCandidateId)
    : false;

  if (!userDriven && selectedToken && acceptedCandidateId && !hasAcceptedCandidateId) {
    candidates.push(buildSyntheticSelectedCandidate({
      candidateId: acceptedCandidateId,
      value: entry.value,
      confidence: selectedConfidence,
      sourceToken,
      sourceTimestamp: entry.source_timestamp,
      quote: fallbackQuote,
    }));
  }

  if (!userDriven && selectedToken && !candidates.some((candidate) => valueToken(candidate.value) === selectedToken)) {
    candidates.push(buildSyntheticSelectedCandidate({
      candidateId: `enum_${slugify(fieldKey || 'field')}_${slugify(entry.value || 'value')}_selected`,
      value: entry.value,
      confidence: selectedConfidence,
      sourceToken,
      sourceTimestamp: entry.source_timestamp,
      quote: fallbackQuote,
    }));
  }

  candidates = sortCandidatesByScore(candidates);
  entry.candidates = candidates;

  if (userDriven) {
    if (hasKnownValue(entry.value)) {
      entry.confidence = clamp01(entry.confidence, selectedConfidence);
      entry.color = confidenceColor(entry.confidence, entry.needs_review ? ['pending_ai'] : []);
    }
    return;
  }

  const acceptedId = String(entry.accepted_candidate_id || '').trim();
  const acceptedCandidate = acceptedId
    ? candidates.find((candidate) => String(candidate.candidate_id || '').trim() === acceptedId)
    : null;
  const selectedCandidate = acceptedCandidate || candidates[0] || null;
  if (!selectedCandidate || !hasKnownValue(selectedCandidate.value)) return;

  entry.value = String(selectedCandidate.value);
  entry.confidence = clamp01(selectedCandidate.score, selectedConfidence);
  const candidateSource = candidateSourceToken(selectedCandidate, sourceToken);
  if (candidateSource) {
    entry.source = candidateSource;
  }
  entry.color = confidenceColor(entry.confidence, entry.needs_review ? ['pending_ai'] : []);
}

// ── Shared Lane ─────────────────────────────────────────────────────

export function isSharedLanePending(state, basePending = false) {
  const laneStatus = String(state?.ai_confirm_shared_status || '').trim().toLowerCase();
  const userOverride = Boolean(state?.user_override_ai_shared);
  // Shared lane remains pending until explicitly AI-confirmed; user-accept is independent.
  if (userOverride) return false;
  if (laneStatus) return laneStatus !== 'confirmed';
  return Boolean(basePending);
}

// ── SpecDb Conversion ───────────────────────────────────────────────

export function toSpecDbCandidate(row, fallbackId) {
  const candidateId = String(row?.candidate_id || fallbackId || '').trim()
    || `${fallbackId || 'specdb_candidate'}`;
  const productId = String(row?.product_id || '').trim();
  return {
    candidate_id: candidateId,
    value: row?.value ?? null,
    score: row?.score ?? 0,
    source_id: 'specdb',
    source: row?.source_host
      ? `${row.source_host}${productId ? ` (${productId})` : ''}`
      : `SpecDb${productId ? ` (${productId})` : ''}`,
    tier: row?.source_tier ?? null,
    method: row?.source_method || 'specdb_lookup',
    evidence: {
      url: row?.evidence_url || row?.source_url || '',
      snippet_id: row?.snippet_id || '',
      snippet_hash: row?.snippet_hash || '',
      quote: row?.quote || '',
      snippet_text: row?.snippet_text || '',
      source_id: 'specdb',
    },
  };
}

export function appendAllSpecDbCandidates(target, rows, fallbackPrefix) {
  const existingIds = new Set(target.map((c) => String(c?.candidate_id || '')));
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const candidate = toSpecDbCandidate(row, `${fallbackPrefix}_${i}`);
    if (candidate.value == null || candidate.value === '') continue;
    if (existingIds.has(candidate.candidate_id)) continue;
    existingIds.add(candidate.candidate_id);
    target.push(candidate);
  }
}

export function hasActionableCandidate(candidates) {
  return toArray(candidates).some((candidate) => (
    !candidate?.is_synthetic_selected
    && hasKnownValue(candidate?.value)
    && String(candidate?.candidate_id || '').trim().length > 0
  ));
}

export function shouldIncludeEnumValueEntry(entry, { requireLinkedPendingPipeline = false } = {}) {
  if (!isObject(entry)) return false;
  if (!requireLinkedPendingPipeline) return true;
  const isPipeline = normalizeSourceToken(entry.source) === 'pipeline';
  const isPending = Boolean(entry.needs_review) && hasActionableCandidate(entry.candidates);
  if (!isPipeline || !isPending) return true;
  const linkedCount = Array.isArray(entry.linked_products) ? entry.linked_products.length : 0;
  return linkedCount > 0;
}

// ── Review Lookups ──────────────────────────────────────────────────

export function buildCandidateReviewLookup(reviewRows) {
  const exact = new Map();
  for (const row of toArray(reviewRows)) {
    const candidateId = String(row?.candidate_id || '').trim();
    if (!candidateId) continue;
    exact.set(candidateId, row);
  }
  return { exact };
}

export function getCandidateReviewRow(lookup, candidateId) {
  if (!lookup) return null;
  const cid = String(candidateId || '').trim();
  if (!cid) return null;
  if (lookup.exact.has(cid)) return lookup.exact.get(cid) || null;
  return null;
}

export function normalizeCandidateSharedReviewStatus(candidate, reviewRow = null) {
  if (candidate?.is_synthetic_selected) return 'accepted';
  if (reviewRow) {
    const aiStatus = normalizeToken(reviewRow.ai_review_status);
    const aiReason = normalizeToken(reviewRow.ai_reason);
    // Shared-lane accept is independent from AI confirm.
    // Legacy rows with ai_reason=shared_accept (or human_accepted) must remain pending
    // so AI confirm buttons stay candidate-scoped and independent.
    if (
      (Number(reviewRow.human_accepted) === 1 || aiReason === 'shared_accept')
      && aiStatus === 'accepted'
    ) {
      return 'pending';
    }
    if (aiStatus === 'accepted') return 'accepted';
    if (aiStatus === 'rejected') return 'rejected';
    return 'pending';
  }
  const sourceToken = candidateSourceToken(candidate, '');
  if (
    sourceToken === 'reference'
    || sourceToken === 'known_values'
    || sourceToken === 'component_db'
    || sourceToken === 'manual'
    || sourceToken === 'user'
  ) {
    return 'accepted';
  }
  return 'pending';
}

export function annotateCandidateSharedReviews(candidates, reviewRows = []) {
  const lookup = buildCandidateReviewLookup(reviewRows);
  for (const candidate of toArray(candidates)) {
    const candidateId = String(candidate?.candidate_id || '').trim();
    const reviewRow = candidateId ? getCandidateReviewRow(lookup, candidateId) : null;
    candidate.shared_review_status = normalizeCandidateSharedReviewStatus(candidate, reviewRow);
    candidate.human_accepted = Number(reviewRow?.human_accepted || 0) === 1;
  }
}

export function reviewStatusToken(reviewItem) {
  return normalizeToken(reviewItem?.status);
}

export function isReviewItemCandidateVisible(reviewItem) {
  const status = reviewStatusToken(reviewItem);
  // Keep historical reviewed rows (confirmed/accepted) as candidate evidence.
  // Only explicitly dismissed/ignored rows are hidden from candidate hydration.
  if (!status) return true;
  if (status === 'dismissed' || status === 'ignored' || status === 'rejected') return false;
  return true;
}
