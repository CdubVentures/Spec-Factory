/**
 * Field classification and candidate row helpers for indexing schema packets.
 * Identity field detection, tier weights, target matching, row normalization.
 * Extracted from indexingSchemaPackets.js (P4 decomposition).
 */
import {
  clamp01, hasKnownValue, unitForField, inferValueType, tryNormalizeValue,
} from './schemaPacketValueHelpers.js';

export const IDENTITY_FIELDS = new Set(['id', 'brand', 'model', 'base_model', 'category', 'sku']);

export function requiredLevelForField(fieldKey = '', categoryConfig = {}) {
  const field = String(fieldKey || '').trim();
  if (!field) return 'optional';
  if (IDENTITY_FIELDS.has(field)) return 'identity';
  const critical = categoryConfig?.criticalFieldSet instanceof Set
    ? categoryConfig.criticalFieldSet
    : new Set(Array.isArray(categoryConfig?.schema?.critical_fields) ? categoryConfig.schema.critical_fields : []);
  if (critical.has(field)) return 'critical';
  const required = new Set(Array.isArray(categoryConfig?.requiredFields) ? categoryConfig.requiredFields : []);
  if (required.has(field)) return 'required';
  return 'optional';
}

export function parseTierWeight(tier = 0) {
  if (tier === 1) return 1;
  if (tier === 2) return 0.8;
  if (tier === 3) return 0.45;
  return 0.35;
}

export function makeTargetMatch(source = {}) {
  const score = clamp01(source?.identity?.score, 0);
  const passed = Boolean(source?.identity?.match);
  return {
    page_product_cluster_id: passed ? 'cluster_main_product' : 'cluster_non_target',
    target_match_score: score,
    target_match_passed: passed,
    ...(passed ? {} : { identity_reject_reason: 'identity_mismatch' })
  };
}

export function makeCandidateRows(source = {}) {
  const rows = Array.isArray(source?.fieldCandidates) ? source.fieldCandidates : [];
  const out = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    const fieldKey = String(row.field || row.field_key || '').trim();
    if (!fieldKey) continue;
    const value = row.value;
    if (!hasKnownValue(value)) continue;
    out.push({
      idx: index + 1,
      field_key: fieldKey,
      context_kind: String(row.context_kind || row.contextKind || 'scalar').trim() || 'scalar',
      context_ref: row.context_ref ?? null,
      value_raw: value,
      value_normalized: tryNormalizeValue(row.normalized_value ?? row.value_normalized ?? value),
      value_type: inferValueType(row.normalized_value ?? row.value_normalized ?? value),
      unit: row.unit ?? unitForField(fieldKey),
      extraction_method: String(row.method || 'dom').trim(),
      parser_confidence: clamp01(row.confidence ?? row.score ?? source?.parserHealth?.health_score, 0.7),
      confidence: clamp01(row.score ?? row.confidence ?? source?.identity?.score, 0.7),
      evidence_refs: Array.isArray(row.evidenceRefs)
        ? row.evidenceRefs.map((id) => String(id || '').trim()).filter(Boolean)
        : [],
      evidence_quote: String(row?.evidence?.quote || '').trim(),
      evidence_snippet_id: String(row?.evidence?.snippet_id || '').trim(),
      evidence_snippet_hash: String(row?.evidence?.snippet_hash || '').trim(),
      evidence_source_id: String(row?.evidence?.source_id || '').trim(),
      evidence_file_uri: String(row?.evidence?.file_uri || '').trim(),
      evidence_mime_type: String(row?.evidence?.mime_type || '').trim(),
      evidence_content_hash: String(row?.evidence?.content_hash || '').trim(),
      evidence_surface: String(row?.evidence?.surface || '').trim(),
      key_path: String(row.keyPath || row.key_path || '').trim()
    });
  }
  return out;
}

export function topFieldKeysByNeedSet(needSet = {}, fallbackKeys = []) {
  const rows = Array.isArray(needSet?.fields) ? needSet.fields : [];
  const ranked = rows
    .filter((row) => row && row.state !== 'accepted')
    .map((row) => String(row?.field_key || '').trim())
    .filter(Boolean);
  if (ranked.length > 0) return [...new Set(ranked)].slice(0, 24);
  return [...new Set((fallbackKeys || []).map((row) => String(row || '').trim()).filter(Boolean))].slice(0, 24);
}
