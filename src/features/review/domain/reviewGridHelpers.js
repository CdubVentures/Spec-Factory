// ── Review Grid Helpers ─────────────────────────────────────────────
//
// Private helpers extracted from reviewGridData.js.
// Number parsing, file I/O, field studio hints, contract normalization,
// flag inference, candidate evidence/scoring, source labels, and queue scoring.

import fs from 'node:fs/promises';
import path from 'node:path';
import { nowIso } from '../../../shared/primitives.js';
import { ruleRequiredLevel } from '../../../engine/ruleAccessors.js';
import {
  isObject,
  toArray,
  normalizeToken,
  normalizeField,
  normalizePathToken,
  toNumber,
} from './reviewNormalization.js';
import {
  isKnownSlotValue,
} from '../../../utils/slotValueShape.js';
import { normalizeHost } from '../../../shared/hostParser.js';

// ── Number Parsing ──────────────────────────────────────────────────

export function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// toNumber consolidated into reviewNormalization.js — import from there

export function hasKnownValue(value) {
  return isKnownSlotValue(value, 'scalar') || isKnownSlotValue(value, 'list');
}

// ── File I/O ────────────────────────────────────────────────────────

export function resolveOverrideFilePath({ config = {}, category, productId }) {
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  return path.join(helperRoot, category, '_overrides', `${productId}.overrides.json`);
}

export async function readOverrideFile(filePath, { config, category, productId } = {}) {
  // WHY: Overlap 0d — try consolidated file first when context is available
  if (config && category && productId) {
    try {
      const { readProductFromConsolidated } = await import('../../../shared/consolidatedOverrides.js');
      const entry = await readProductFromConsolidated({ config, category, productId });
      if (entry) return entry;
    } catch { /* consolidated read failed — fall through to per-product file */ }
  }
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (isObject(parsed)) return parsed;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return null;
}

export async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return isObject(parsed) ? parsed : null;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return null;
}

// ── Field Studio ────────────────────────────────────────────────────

export function parseFieldStudioRowFromCell(cell) {
  const text = String(cell || '').trim().toUpperCase();
  const match = text.match(/[A-Z]+(\d+)/);
  if (!match) {
    return null;
  }
  const row = Number.parseInt(match[1], 10);
  return Number.isFinite(row) ? row : null;
}

export function extractFieldStudioHints(rule = {}) {
  const blocks = [
    rule.field_studio_hints,
    rule.field_studio
  ].filter(isObject);
  for (const block of blocks) {
    for (const key of ['dataEntry', 'dataentry', 'source']) {
      if (isObject(block[key])) {
        return block[key];
      }
    }
    if (isObject(block.data) && isObject(block.data.dataEntry)) {
      return block.data.dataEntry;
    }
    if (isObject(block.default)) {
      return block.default;
    }
  }
  return {};
}

// ── Storage Keys ────────────────────────────────────────────────────

export function reviewKeys(storage, category, productId) {
  const reviewBase = ['final', normalizePathToken(category), normalizePathToken(productId), 'review'].join('/');
  const legacyReviewBase = storage.resolveOutputKey(category, productId, 'review');
  return {
    reviewBase,
    legacyReviewBase,
    candidatesKey: `${reviewBase}/candidates.json`,
    legacyCandidatesKey: `${legacyReviewBase}/candidates.json`,
    reviewQueueKey: `${reviewBase}/review_queue.json`,
    legacyReviewQueueKey: `${legacyReviewBase}/review_queue.json`,
    productKey: `${reviewBase}/product.json`,
    legacyProductKey: `${legacyReviewBase}/product.json`
  };
}

// ── Field Contract ──────────────────────────────────────────────────

export function normalizeFieldContract(rule = {}) {
  const contract = isObject(rule.contract) ? rule.contract : {};
  const level = ruleRequiredLevel(rule);
  const comp = isObject(rule.component) ? rule.component : null;
  const enu = isObject(rule.enum) ? rule.enum : null;
  const evidence = isObject(rule.evidence) ? rule.evidence : {};
  return {
    type: String(contract.type || 'string'),
    shape: String(contract.shape || 'scalar').trim().toLowerCase() || 'scalar',
    required: level === 'required' || level === 'critical' || level === 'identity',
    units: contract.unit || null,
    enum_name: String(rule.enum_name || '').trim() || null,
    component_type: comp?.type || null,
    enum_source: enu?.source || null,
    min_evidence_refs: toInt(evidence.min_evidence_refs, 1),
    conflict_policy: String(evidence.conflict_policy || 'resolve_by_tier').trim(),
  };
}

// ── Flag Inference ──────────────────────────────────────────────────

export const REAL_FLAG_CODES = new Set([
  'variance_violation',
  'constraint_conflict',
  'compound_range_conflict',
  'dependency_missing',
  'new_component',
  'new_enum_value',
  'below_min_evidence',
  'conflict_policy_hold',
]);

export function inferFlags({ reasonCodes = [], fieldRule = {}, candidates = [], acceptedCandidateId = null, overridden = false }) {
  const flags = [];
  for (const code of reasonCodes) {
    if (REAL_FLAG_CODES.has(code)) flags.push(code);
  }
  const minRefs = toInt(fieldRule.min_evidence_refs, 1);
  if (minRefs > 1 && !overridden) {
    const distinctSources = new Set(
      toArray(candidates)
        .map(c => String(c.source_id || c.source_host || c.host || '').trim().toLowerCase())
        .filter(Boolean)
    );
    if (distinctSources.size > 0 && distinctSources.size < minRefs) {
      flags.push('below_min_evidence');
    }
  }
  if (fieldRule.conflict_policy === 'preserve_all_candidates' && !overridden) {
    const candidateValues = toArray(candidates)
      .map(c => String(c.value ?? '').trim().toLowerCase())
      .filter(Boolean);
    const distinctValues = new Set(candidateValues);
    if (distinctValues.size > 1) {
      flags.push('conflict_policy_hold');
    }
  }
  return [...new Set(flags)];
}

// ── Storage Write ───────────────────────────────────────────────────

export async function writeJson(storage, key, value) {
  await storage.writeObject(
    key,
    Buffer.from(JSON.stringify(value, null, 2), 'utf8'),
    { contentType: 'application/json' }
  );
}

// ── Candidate Evidence / Scoring ────────────────────────────────────

export function candidateEvidenceFromRows(candidate = {}, provenanceRow = {}) {
  const candidateEvidence = isObject(candidate.evidence) ? candidate.evidence : {};
  const provenanceEvidence = toArray(provenanceRow.evidence)[0] || {};
  const quote = String(candidateEvidence.quote || provenanceEvidence.quote || '').trim();
  return {
    url: String(candidateEvidence.url || candidate.url || provenanceEvidence.url || '').trim(),
    retrieved_at: String(
      candidateEvidence.retrieved_at ||
      candidate.retrieved_at ||
      provenanceEvidence.retrieved_at ||
      nowIso()
    ),
    snippet_id: String(candidateEvidence.snippet_id || candidate.snippet_id || provenanceEvidence.snippet_id || '').trim(),
    snippet_hash: String(candidateEvidence.snippet_hash || candidate.snippet_hash || provenanceEvidence.snippet_hash || '').trim(),
    quote,
    quote_span: Array.isArray(candidateEvidence.quote_span)
      ? candidateEvidence.quote_span
      : (Array.isArray(provenanceEvidence.quote_span) ? provenanceEvidence.quote_span : null),
    snippet_text: String(candidateEvidence.snippet_text || candidate.snippet_text || '').trim() || quote,
    source_id: String(
      candidateEvidence.source_id ||
      candidate.source_id ||
      provenanceEvidence.source_id ||
      ''
    ).trim()
  };
}

export function candidateScore(candidate = {}, provenanceRow = {}) {
  const score = toNumber(candidate.score, NaN);
  if (Number.isFinite(score)) {
    return Math.max(0, Math.min(1, score));
  }
  const confidence = toNumber(provenanceRow.confidence, NaN);
  if (Number.isFinite(confidence)) {
    return Math.max(0, Math.min(1, confidence));
  }
  return candidate.approvedDomain ? 0.8 : 0.5;
}

export function inferReasonCodes({
  field,
  selectedValue,
  selectedConfidence,
  summary,
  hasConflict = false,
  hasCompoundConflict = false
}) {
  const reasons = [];
  const below = new Set(toArray(summary.fields_below_pass_target).map((item) => normalizeField(item)));
  const criticalBelow = new Set(toArray(summary.critical_fields_below_pass_target).map((item) => normalizeField(item)));
  const missingRequired = new Set(toArray(summary.missing_required_fields).map((item) => normalizeField(item)));
  const normalizedField = normalizeField(field);
  const fieldReasoning = isObject(summary.field_reasoning?.[field])
    ? summary.field_reasoning[field]
    : (isObject(summary.field_reasoning?.[normalizedField]) ? summary.field_reasoning[normalizedField] : {});

  if (hasCompoundConflict) {
    reasons.push('compound_range_conflict');
  } else if (hasConflict) {
    reasons.push('constraint_conflict');
  }
  const unknownReason = String(fieldReasoning.unknown_reason || '').trim();
  if (unknownReason) {
    reasons.push(unknownReason);
  }
  return [...new Set(reasons)];
}

// ── Source Labels ───────────────────────────────────────────────────

export function dbSourceLabel(source) {
  const token = normalizeToken(source);
  if (token === 'component_db' || token === 'known_values' || token === 'reference') return 'Reference';
  if (token === 'pipeline') return 'Pipeline';
  if (token === 'user') return 'user';
  return String(source || '').trim();
}

export function dbSourceMethod(source) {
  const token = normalizeToken(source);
  if (token === 'component_db' || token === 'known_values' || token === 'reference') return 'contract_import';
  if (token === 'pipeline') return 'pipeline_extract';
  if (token === 'user') return 'manual_override';
  return null;
}

export function extractHostFromUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return '';
  }
}

export function candidateSourceLabel(candidate = {}, evidence = {}) {
  const host = String(candidate.host || '').trim();
  if (host) return host;
  const source = String(candidate.source || '').trim();
  if (source) return source;
  const sourceId = String(candidate.source_id || evidence.source_id || '').trim();
  if (sourceId) {
    const mapped = dbSourceLabel(sourceId);
    return mapped || sourceId;
  }
  const evidenceUrl = String(evidence.url || candidate.url || '').trim();
  return extractHostFromUrl(evidenceUrl);
}

// ── Queue Scoring ───────────────────────────────────────────────────

// parseDateMs consolidated into reviewNormalization.js — import from there

export function urgencyScore(row = {}) {
  const flags = toInt(row.flags, 0);
  const confidence = toNumber(row.confidence, 0);
  const coverage = toNumber(row.coverage, 0);
  let score = flags * 100;
  score += Math.max(0, (0.9 - confidence) * 40);
  if (coverage < 0.85) {
    score += 10;
  }
  if (normalizeToken(row.status) === 'needs_manual') {
    score += 20;
  }
  return score;
}
