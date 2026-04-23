/**
 * Auto-publish a validated candidate to product.json fields[] + mark resolved in SQL.
 *
 * Called by submitCandidate() after the candidate dual-write succeeds.
 * Gates: confidence threshold, manual override lock.
 * Set union: list fields with item_union='set_union' merge into the published list.
 *
 * Dual-state: JSON SSOT (product.json fields[]) + SQL projection (field_candidates.status).
 */

import fs from 'node:fs';
import path from 'node:path';
import { evaluateFieldBuckets } from './evidenceGate.js';

function safeReadJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function serializeValue(value) {
  if (value == null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// WHY: Candidates use mixed scales (CEF: 0-100, provenance: 0-1).
// Threshold is always 0-1. Normalize before comparing.
export function normalizeConfidence(c) {
  if (typeof c !== 'number' || !Number.isFinite(c)) return 0;
  return c > 1 ? c / 100 : c;
}

/**
 * Build linked candidates — all candidate rows that match the published value.
 * For scalar/winner_only: exact serialization match.
 * For set_union: candidate's array shares at least one item with the published array.
 * Sorted by confidence descending.
 *
 * @param variantId — when set, scopes to rows with that variant_id (variant-scoped publish).
 *                   When undefined, returns all rows (variant-blind, legacy behavior).
 */
export function buildLinkedCandidates(specDb, productId, fieldKey, publishedValue, fieldRule, variantId) {
  const allCandidates = specDb.getFieldCandidatesByProductAndField(productId, fieldKey, variantId);
  const itemUnion = fieldRule?.contract?.list_rules?.item_union;
  const publishedSerialized = serializeValue(publishedValue);

  return allCandidates
    .filter(row => {
      if (itemUnion === 'set_union' && Array.isArray(publishedValue)) {
        // set_union: linked if candidate's array shares items with published array
        let candidateItems;
        try { candidateItems = typeof row.value === 'string' ? JSON.parse(row.value) : row.value; }
        catch { candidateItems = null; }
        if (!Array.isArray(candidateItems)) return false;
        const publishedSet = new Set(publishedValue.map(v => serializeValue(v)));
        return candidateItems.some(item => publishedSet.has(serializeValue(item)));
      }
      // Scalar / winner_only: exact serialization match
      return (row.value ?? null) === (publishedSerialized ?? null);
    })
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .map(row => ({
      candidate_id: row.id,
      source_id: row.source_id || '',
      source_type: row.source_type || '',
      model: row.model || '',
      value: row.value,
      confidence: row.confidence,
      status: row.status,
      submitted_at: row.submitted_at,
    }));
}

/**
 * @param {{ specDb: object, category: string, productId: string, fieldKey: string, candidateRow: object, value: *, unit: string|null, confidence: number, config: object, fieldRule: object, productRoot: string, variantId?: string|null }} opts
 * @returns {{ status: 'published'|'below_threshold'|'manual_override_locked'|'skipped', value?: *, candidateId?: number, confidence?: number, threshold?: number }}
 */
export function publishCandidate({
  specDb, category, productId, fieldKey,
  candidateRow, value, unit, confidence,
  config, fieldRule, productRoot, variantId,
}) {
  // WHY: Resolve variant_id from the candidate row if not explicitly passed.
  // Caller (submitCandidate) may or may not thread it; the row itself is authoritative.
  const resolvedVariantId = variantId ?? candidateRow?.variant_id ?? null;
  if (resolvedVariantId) {
    return publishVariantScopedCandidate({
      specDb, category, productId, fieldKey,
      candidateRow, value, unit, confidence,
      config, fieldRule, productRoot,
      variantId: resolvedVariantId,
    });
  }
  // --- Gate 1: LLM candidate confidence ---
  const threshold = config?.publishConfidenceThreshold ?? 0.7;
  if (normalizeConfidence(confidence) < threshold) {
    persistPublishResult(specDb, productId, fieldKey, serializeValue(value), { status: 'below_threshold', confidence, threshold });
    return { status: 'below_threshold', confidence, threshold };
  }

  // --- Gate 2: pooled evidence evaluator (deterministic) ---
  const evalResult = evaluateFieldBuckets({
    specDb, productId, fieldKey, fieldRule, variantId: null, threshold,
  });
  if (evalResult.publishedValue === undefined) {
    const triggerBucket = evalResult.buckets.find(b => b.memberIds.includes(candidateRow?.id));
    const actual = triggerBucket?.pooledCount ?? 0;
    persistPublishResult(specDb, productId, fieldKey, serializeValue(value), {
      status: 'below_evidence_refs',
      required: evalResult.required,
      actual,
    });
    return { status: 'below_evidence_refs', required: evalResult.required, actual };
  }

  // --- Product.json read ---
  const productDir = path.join(productRoot, productId);
  const productPath = path.join(productDir, 'product.json');
  const productJson = safeReadJson(productPath);
  if (!productJson) {
    persistPublishResult(specDb, productId, fieldKey, serializeValue(value), { status: 'skipped', reason: 'no_product_json' });
    return { status: 'skipped' };
  }

  // --- Manual override lock ---
  if (!productJson.fields) productJson.fields = {};
  const existing = productJson.fields[fieldKey];
  if (existing?.source === 'manual_override') {
    persistPublishResult(specDb, productId, fieldKey, serializeValue(value), { status: 'manual_override_locked' });
    return { status: 'manual_override_locked', lockedValue: existing.value };
  }

  const publishedValue = evalResult.publishedValue;
  const serialized = serializeValue(publishedValue);
  const now = new Date().toISOString();
  const sources = candidateRow?.source_id
    ? [{ source: candidateRow.source_type || '', source_id: candidateRow.source_id, model: candidateRow.model || '', confidence, submitted_at: candidateRow.submitted_at || now }]
    : (Array.isArray(candidateRow?.sources_json) ? candidateRow.sources_json : []);

  // --- SQL: demote prior winners, mark every member of qualifying bucket(s) resolved ---
  specDb.demoteResolvedCandidates(productId, fieldKey);
  const memberIds = new Set(evalResult.publishedMemberIds);
  if (memberIds.size > 0) {
    const placeholders = Array.from(memberIds).map(() => '?').join(',');
    specDb.db.prepare(
      `UPDATE field_candidates SET status = 'resolved', updated_at = datetime('now')
       WHERE id IN (${placeholders})`
    ).run(...Array.from(memberIds));
  }

  persistPublishResult(specDb, productId, fieldKey, serialized, { status: 'published', published_at: now });

  const linkedCandidates = buildLinkedCandidates(specDb, productId, fieldKey, publishedValue, fieldRule);

  productJson.fields[fieldKey] = {
    value: publishedValue,
    confidence,
    source: 'pipeline',
    resolved_at: now,
    sources,
    linked_candidates: linkedCandidates,
  };
  productJson.updated_at = now;
  fs.writeFileSync(productPath, JSON.stringify(productJson, null, 2));

  return { status: 'published', value: publishedValue, candidateId: candidateRow?.id ?? null };
}

/**
 * Variant-scoped publish branch (branch 3).
 *
 * WHY: When a candidate carries a variant_id, the published value belongs to
 * that variant alone — not to the product-scalar field. Writes to
 * product.json.variant_fields[vid][fieldKey] and scopes candidate resolution
 * to rows with variant_id === vid. The scalar fields[fieldKey] is untouched.
 *
 * Rules:
 *  - delete variant → variant_fields[vid] goes with it (variantLifecycle cascade)
 *  - delete a variant-scoped source → republishField rescopes (fieldKey, vid)
 *  - other variants' entries remain intact
 */
function publishVariantScopedCandidate({
  specDb, category, productId, fieldKey,
  candidateRow, value, unit, confidence,
  config, fieldRule, productRoot, variantId,
}) {
  const threshold = config?.publishConfidenceThreshold ?? 0.7;
  if (normalizeConfidence(confidence) < threshold) {
    persistPublishResult(specDb, productId, fieldKey, serializeValue(value), { status: 'below_threshold', confidence, threshold }, variantId);
    return { status: 'below_threshold', confidence, threshold };
  }

  const evalResult = evaluateFieldBuckets({
    specDb, productId, fieldKey, fieldRule, variantId, threshold,
  });
  if (evalResult.publishedValue === undefined) {
    const triggerBucket = evalResult.buckets.find(b => b.memberIds.includes(candidateRow?.id));
    const actual = triggerBucket?.pooledCount ?? 0;
    persistPublishResult(specDb, productId, fieldKey, serializeValue(value), {
      status: 'below_evidence_refs',
      required: evalResult.required,
      actual,
    }, variantId);
    return { status: 'below_evidence_refs', required: evalResult.required, actual };
  }

  const productDir = path.join(productRoot, productId);
  const productPath = path.join(productDir, 'product.json');
  const productJson = safeReadJson(productPath);
  if (!productJson) {
    persistPublishResult(specDb, productId, fieldKey, serializeValue(value), { status: 'skipped', reason: 'no_product_json' }, variantId);
    return { status: 'skipped' };
  }

  if (!productJson.variant_fields) productJson.variant_fields = {};
  if (!productJson.variant_fields[variantId]) productJson.variant_fields[variantId] = {};
  const existing = productJson.variant_fields[variantId][fieldKey];
  if (existing?.source === 'manual_override') {
    persistPublishResult(specDb, productId, fieldKey, serializeValue(value), { status: 'manual_override_locked' }, variantId);
    return { status: 'manual_override_locked', lockedValue: existing.value };
  }

  const publishedValue = evalResult.publishedValue;
  const serialized = serializeValue(publishedValue);
  const now = new Date().toISOString();
  const sources = candidateRow?.source_id
    ? [{ source: candidateRow.source_type || '', source_id: candidateRow.source_id, model: candidateRow.model || '', confidence, submitted_at: candidateRow.submitted_at || now }]
    : (Array.isArray(candidateRow?.sources_json) ? candidateRow.sources_json : []);

  specDb.demoteResolvedCandidates(productId, fieldKey, variantId);
  const memberIds = new Set(evalResult.publishedMemberIds);
  if (memberIds.size > 0) {
    const placeholders = Array.from(memberIds).map(() => '?').join(',');
    specDb.db.prepare(
      `UPDATE field_candidates SET status = 'resolved', updated_at = datetime('now')
       WHERE id IN (${placeholders})`
    ).run(...Array.from(memberIds));
  }

  persistPublishResult(specDb, productId, fieldKey, serialized, { status: 'published', published_at: now }, variantId);

  const linkedCandidates = buildLinkedCandidates(specDb, productId, fieldKey, publishedValue, fieldRule, variantId);

  productJson.variant_fields[variantId][fieldKey] = {
    value: publishedValue,
    confidence,
    source: 'pipeline',
    resolved_at: now,
    sources,
    linked_candidates: linkedCandidates,
  };
  productJson.updated_at = now;
  fs.writeFileSync(productPath, JSON.stringify(productJson, null, 2));

  return { status: 'published', value: publishedValue, candidateId: candidateRow?.id ?? null, variantId };
}

// WHY: Persist the publish decision in the candidate's metadata_json so the
// publisher GUI can display published vs rejected and the rejection reason.
// WHY: Persist publish decision in existing row's metadata_json.
// Uses the row's own source_id to upsert without creating a new row.
export function persistPublishResult(specDb, productId, fieldKey, serializedValue, result, variantId) {
  try {
    // WHY: Try value-based lookup first (may match multiple source-centric rows — pick first).
    // For variant-scoped publishes, filter by variantId so we don't pollute another variant's metadata.
    let rows = specDb.getFieldCandidatesByValue?.(productId, fieldKey, serializedValue) || [];
    if (variantId !== undefined && variantId !== null) {
      rows = rows.filter((r) => (r.variant_id ?? null) === variantId);
    }
    const row = rows[0] || specDb.getFieldCandidate?.(productId, fieldKey, serializedValue);
    if (!row) return;
    const meta = row.metadata_json && typeof row.metadata_json === 'object' ? { ...row.metadata_json } : {};
    meta.publish_result = result;
    specDb.upsertFieldCandidate({
      productId, fieldKey,
      value: serializedValue,
      unit: row.unit,
      confidence: row.confidence,
      sourceId: row.source_id || '',
      sourceType: row.source_type || '',
      model: row.model || '',
      validationJson: row.validation_json,
      metadataJson: meta,
      status: row.status,
      variantId: row.variant_id ?? null,
    });
  } catch { /* best-effort — publish result is informational */ }
}
