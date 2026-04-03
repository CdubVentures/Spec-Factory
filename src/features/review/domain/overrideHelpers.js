// ── Override Helpers ─────────────────────────────────────────────────
//
// Private helpers extracted from overrideWorkflow.js.
// Value normalization, evidence handling, candidate mapping, file I/O,
// and field list manipulation for the override workflow.

import { nowIso } from '../../../shared/primitives.js';
import { toRawFieldKey } from '../../../utils/fieldKeys.js';
import { buildManualOverrideCandidateId } from '../../../utils/candidateIdentifier.js';
import {
  isObject,
  toArray,
  normalizeToken,
  toNumber,
} from './reviewNormalization.js';
import { buildProductReviewPayload } from './reviewGridData.js';
import { hasKnownValue } from '../../../shared/valueNormalizers.js';

// ── Local normalizers (different semantics from shared modules) ─────

// WHY: Uses toRawFieldKey, not regex-based normalizeFieldKey
export function normalizeField(field) {
  return toRawFieldKey(String(field || '').trim(), { fieldOrder: [] });
}

export { hasKnownValue };

// toNumber consolidated into reviewNormalization.js — import from there

// ── Value Normalization ─────────────────────────────────────────────

export function normalizeComparableValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value) || typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  const text = String(value).trim();
  if (!text) {
    return '';
  }
  const numeric = Number.parseFloat(text);
  if (Number.isFinite(numeric) && String(numeric) === text.replace(/,/g, '')) {
    return String(numeric);
  }
  return normalizeToken(text.replace(/,/g, ''));
}

export function normalizeQuoteSpan(value) {
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }
  const start = Number.parseInt(String(value[0]), 10);
  const end = Number.parseInt(String(value[1]), 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return [start, end];
}

// ── Evidence ────────────────────────────────────────────────────────

export function normalizeOverrideEvidence(evidence = {}) {
  const url = String(evidence?.url || '').trim();
  const quote = String(evidence?.quote || '').trim();
  if (!url || !quote) {
    throw new Error('manual override requires evidence.url and evidence.quote');
  }
  return {
    url,
    source_id: String(evidence?.source_id || '').trim() || null,
    retrieved_at: String(evidence?.retrieved_at || nowIso()).trim(),
    snippet_id: String(evidence?.snippet_id || '').trim() || null,
    snippet_hash: String(evidence?.snippet_hash || '').trim() || null,
    quote_span: normalizeQuoteSpan(evidence?.quote_span),
    quote
  };
}

export function manualCandidateId({ category, productId, field, value, evidence }) {
  return buildManualOverrideCandidateId({
    category,
    productId,
    fieldKey: normalizeField(field),
    value: String(value || '').trim(),
    evidenceUrl: String(evidence?.url || '').trim(),
    evidenceQuote: String(evidence?.quote || '').trim(),
  });
}

export function extractOverrideValue(override = {}) {
  const value = String(
    override?.override_value ??
    override?.value ??
    ''
  ).trim();
  return value;
}

export function extractOverrideProvenance(override = {}, category, productId, field) {
  const source = isObject(override?.override_provenance) ? override.override_provenance : {};
  const fallbackSource = isObject(override?.source) ? override.source : {};
  const quote = String(source.quote || '').trim();
  const url = String(source.url || '').trim();
  if (url && quote) {
    return {
      url,
      source_id: String(source.source_id || '').trim() || null,
      retrieved_at: String(source.retrieved_at || nowIso()).trim(),
      snippet_id: String(source.snippet_id || '').trim() || null,
      snippet_hash: String(source.snippet_hash || '').trim() || null,
      quote_span: normalizeQuoteSpan(source.quote_span),
      quote
    };
  }
  return {
    url: `category_authority://${category}/_overrides/${productId}.overrides.json`,
    source_id: String(fallbackSource.source_id || '').trim() || null,
    retrieved_at: nowIso(),
    snippet_id: null,
    snippet_hash: null,
    quote_span: null,
    quote: `override ${field}`
  };
}

// ── Field List Manipulation ─────────────────────────────────────────

export function removeFieldFromList(list = [], field = '') {
  if (!Array.isArray(list)) {
    return [];
  }
  const fieldRaw = normalizeField(field);
  const fieldPrefixed = `fields.${fieldRaw}`;
  return list.filter((entry) => {
    const token = String(entry || '').trim().toLowerCase();
    return token && token !== fieldRaw && token !== fieldPrefixed;
  });
}

export function addFieldToList(list = [], field = '') {
  const out = Array.isArray(list) ? [...list] : [];
  const normalizedField = normalizeField(field);
  if (!normalizedField) {
    return out;
  }
  const prefixed = `fields.${normalizedField}`;
  const hasField = out.some((entry) => {
    const token = String(entry || '').trim().toLowerCase();
    return token === normalizedField || token === prefixed;
  });
  if (!hasField) {
    out.push(normalizedField);
  }
  return out;
}

// ── Storage Keys ────────────────────────────────────────────────────

export function reviewKeys(storage, category, productId) {
  const reviewBase = ['final', normalizeToken(category) || 'unknown-category', normalizeToken(productId) || 'unknown-product', 'review'].join('/');
  const legacyReviewBase = storage.resolveOutputKey(category, productId, 'review');
  return {
    reviewBase,
    legacyReviewBase,
    candidatesKey: `${reviewBase}/candidates.json`,
    legacyCandidatesKey: `${legacyReviewBase}/candidates.json`,
    reviewQueueKey: `${reviewBase}/review_queue.json`,
    legacyReviewQueueKey: `${legacyReviewBase}/review_queue.json`,
    finalizeReportKey: `${reviewBase}/finalize_report.json`
  };
}

export function latestKeys(storage, category, productId) {
  const latestBase = storage.resolveOutputKey(category, productId, 'latest');
  return {
    latestBase,
    normalizedKey: `${latestBase}/normalized.json`,
    provenanceKey: `${latestBase}/provenance.json`,
    summaryKey: `${latestBase}/summary.json`
  };
}

// ── File I/O ────────────────────────────────────────────────────────

export async function readOverrideFile(filePath, { specDb = null, category = '', productId = '' } = {}) {
  // WHY: Phase E2c — read from SQL when available, file fallback for backward compat
  if (specDb && productId) {
    try {
      const reviewState = specDb.getProductReviewState(productId);
      const overriddenRows = specDb.getOverriddenFieldsForProduct(productId);
      if (reviewState || overriddenRows.length > 0) {
        const overrides = {};
        for (const row of overriddenRows) {
          overrides[row.field_key] = {
            field: row.field_key,
            override_source: row.override_source || 'candidate_selection',
            override_value: row.override_value || row.value || '',
            override_reason: row.override_reason || null,
            override_provenance: row.override_provenance ? JSON.parse(row.override_provenance) : null,
            overridden_by: row.overridden_by || null,
            overridden_at: row.overridden_at || row.updated_at || null,
            candidate_id: row.accepted_candidate_id || '',
            value: row.override_value || row.value || '',
            set_at: row.overridden_at || row.updated_at || null
          };
        }
        // WHY: Join with candidate_reviews to capture AI review state.
        // Without this, AI review decisions are lost on DB rebuild.
        if (typeof specDb.getReviewsForContext === 'function') {
          try {
            const reviews = specDb.getReviewsForContext('item', productId);
            const reviewMap = new Map();
            for (const rev of reviews) {
              reviewMap.set(rev.candidate_id, rev);
            }
            for (const ovr of Object.values(overrides)) {
              const rev = reviewMap.get(ovr.candidate_id);
              if (rev && rev.ai_review_status && rev.ai_review_status !== 'not_run') {
                ovr.ai_review = {
                  ai_review_status: rev.ai_review_status,
                  ai_confidence: rev.ai_confidence,
                  ai_reason: rev.ai_reason,
                  ai_reviewed_at: rev.ai_reviewed_at,
                  ai_review_model: rev.ai_review_model,
                  human_override_ai: Boolean(rev.human_override_ai),
                  human_override_ai_at: rev.human_override_ai_at || null,
                };
              }
            }
          } catch { /* best-effort — AI review fields are non-critical */ }
        }
        return {
          version: 1,
          category: category || reviewState?.category,
          product_id: productId,
          review_status: reviewState?.review_status || 'pending',
          review_started_at: reviewState?.review_started_at || null,
          reviewed_at: reviewState?.reviewed_at || null,
          reviewed_by: reviewState?.reviewed_by || null,
          overrides
        };
      }
    } catch { /* SQL read failed — return null */ }
  }
  return null;
}

// ── Candidate Mapping ───────────────────────────────────────────────

export function findCandidateRows(candidatesArtifact = {}) {
  const items = toArray(candidatesArtifact.items).filter((row) => isObject(row));
  if (items.length > 0) {
    return items;
  }

  const rows = [];
  for (const [field, fieldRows] of Object.entries(candidatesArtifact.by_field || {})) {
    for (const row of toArray(fieldRows)) {
      if (!isObject(row)) {
        continue;
      }
      rows.push({
        ...row,
        field: row.field || field
      });
    }
  }
  return rows;
}

export function buildCandidateOverrideEntry({
  candidate = {},
  category,
  productId,
  field,
  reviewer = '',
  reason = '',
  setAt = nowIso()
}) {
  const source = {
    host: candidate.host || candidate.source || null,
    source_id: candidate.source_id || null,
    method: candidate.method || null,
    tier: candidate.tier || null,
    evidence_key: candidate.evidence_key || null
  };
  const candidateEvidence = isObject(candidate.evidence) ? candidate.evidence : {};
  const overrideProvenance = {
    url: String(candidateEvidence.url || candidate.url || '').trim() || null,
    source_id: String(candidateEvidence.source_id || candidate.source_id || '').trim() || null,
    retrieved_at: String(candidateEvidence.retrieved_at || nowIso()).trim(),
    snippet_id: String(candidateEvidence.snippet_id || '').trim() || null,
    snippet_hash: String(candidateEvidence.snippet_hash || '').trim() || null,
    quote_span: normalizeQuoteSpan(candidateEvidence.quote_span),
    quote: String(candidateEvidence.quote || '').trim() || null
  };
  const normalizedField = normalizeField(field);
  return {
    field: normalizedField,
    override_source: 'candidate_selection',
    candidate_index: Number.isFinite(toNumber(candidate.candidate_index, NaN))
      ? toNumber(candidate.candidate_index, NaN)
      : null,
    override_value: String(candidate.value || '').trim(),
    override_reason: String(reason || '').trim() || null,
    override_provenance: overrideProvenance,
    overridden_by: String(reviewer || '').trim() || null,
    overridden_at: setAt,
    validated: null,
    candidate_id: String(candidate.candidate_id || ''),
    value: String(candidate.value || '').trim(),
    source,
    set_at: setAt,
    product_id: productId,
    category
  };
}

export function buildCandidateMap(rows = []) {
  const byField = new Map();
  for (const row of rows) {
    if (!isObject(row)) {
      continue;
    }
    const field = normalizeField(row.field);
    if (!field) {
      continue;
    }
    if (!byField.has(field)) {
      byField.set(field, []);
    }
    byField.get(field).push({
      ...row,
      field
    });
  }
  return byField;
}

export function selectCandidateForValue(candidateRows = [], selectedValue) {
  const target = normalizeComparableValue(selectedValue);
  if (!target) {
    return null;
  }
  const matches = candidateRows.filter((row) =>
    normalizeComparableValue(row?.value) === target
  );
  if (matches.length === 0) {
    return null;
  }
  matches.sort((a, b) => toNumber(b.score, 0) - toNumber(a.score, 0));
  return matches[0];
}

// ── Storage Read/Write ──────────────────────────────────────────────

export async function readReviewProductPayload({ storage, config = {}, category, productId, keys }) {
  let payload = await storage.readJsonOrNull(`${keys.reviewBase}/product.json`);
  if (!payload) {
    payload = await storage.readJsonOrNull(`${keys.legacyReviewBase}/product.json`);
  }
  if (payload && isObject(payload.fields)) {
    return payload;
  }
  return buildProductReviewPayload({ storage, config, category, productId });
}

export async function listOverrideDocs(helperRoot, category, { specDb = null } = {}) {
  // WHY: Phase E3 — SQL is sole source for override docs
  if (specDb) {
    try {
      const productIds = specDb.listApprovedProductIds();
      const out = [];
      for (const pid of productIds) {
        const doc = await readOverrideFile(null, { specDb, category, productId: pid });
        if (doc) {
          out.push({ path: `sql://overrides/${category}/${pid}`, payload: doc });
        }
      }
      return out;
    } catch { /* SQL read failed — return empty */ }
  }
  return [];
}

// parseDateMs consolidated into reviewNormalization.js — import from there

export async function writeStorageJson(storage, key, value) {
  await storage.writeObject(
    key,
    Buffer.from(JSON.stringify(value, null, 2), 'utf8'),
    { contentType: 'application/json' }
  );
}
