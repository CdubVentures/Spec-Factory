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
 */
export function buildLinkedCandidates(specDb, productId, fieldKey, publishedValue, fieldRule) {
  const allCandidates = specDb.getFieldCandidatesByProductAndField(productId, fieldKey);
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
      value: row.value,
      confidence: row.confidence,
      source_count: row.source_count,
      sources: Array.isArray(row.sources_json) ? row.sources_json : [],
      status: row.status,
      submitted_at: row.submitted_at,
    }));
}

/**
 * @param {{ specDb: object, category: string, productId: string, fieldKey: string, candidateRow: object, value: *, unit: string|null, confidence: number, config: object, fieldRule: object, productRoot: string }} opts
 * @returns {{ status: 'published'|'below_threshold'|'manual_override_locked'|'skipped', value?: *, candidateId?: number, confidence?: number, threshold?: number }}
 */
export function publishCandidate({
  specDb, category, productId, fieldKey,
  candidateRow, value, unit, confidence,
  config, fieldRule, productRoot,
}) {
  // --- Confidence gate ---
  const threshold = config?.publishConfidenceThreshold ?? 0.7;
  if (normalizeConfidence(confidence) < threshold) {
    persistPublishResult(specDb, productId, fieldKey, serializeValue(value), { status: 'below_threshold', confidence, threshold });
    return { status: 'below_threshold', confidence, threshold };
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

  // --- Set union for list fields ---
  let publishedValue = value;
  if (fieldRule?.contract?.list_rules?.item_union === 'set_union' && Array.isArray(value)) {
    const existingList = Array.isArray(existing?.value) ? existing.value : [];
    const merged = [...existingList];
    for (const item of value) {
      const serialized = serializeValue(item);
      if (!merged.some(m => serializeValue(m) === serialized)) {
        merged.push(item);
      }
    }
    publishedValue = merged;
  }

  const serialized = serializeValue(publishedValue);
  const now = new Date().toISOString();
  const sources = Array.isArray(candidateRow?.sources_json) ? candidateRow.sources_json : [];

  // --- SQL: demote previous winners, mark contributing candidates resolved ---
  specDb.demoteResolvedCandidates(productId, fieldKey);

  const itemUnion = fieldRule?.contract?.list_rules?.item_union;
  if (itemUnion === 'set_union' && Array.isArray(publishedValue)) {
    // WHY: For set_union, the published array is a merge of multiple candidate rows.
    // Each candidate whose array shares items with the published value contributed —
    // mark all of them resolved, not just an exact serialization match.
    const publishedSet = new Set(publishedValue.map(v => serializeValue(v)));
    const allCandidates = specDb.getFieldCandidatesByProductAndField(productId, fieldKey);
    for (const row of allCandidates) {
      let items;
      try { items = typeof row.value === 'string' ? JSON.parse(row.value) : row.value; }
      catch { items = null; }
      if (!Array.isArray(items)) continue;
      if (items.some(item => publishedSet.has(serializeValue(item)))) {
        specDb.markFieldCandidateResolved(productId, fieldKey, row.value);
      }
    }
  } else {
    specDb.markFieldCandidateResolved(productId, fieldKey, serialized);
  }

  persistPublishResult(specDb, productId, fieldKey, serialized, { status: 'published', published_at: now });

  // --- Build linked candidates (evidence chain) ---
  // WHY: All candidate rows that match the published value are linked as proof.
  // Each carries its own confidence and source history, sorted by confidence desc.
  const linkedCandidates = buildLinkedCandidates(specDb, productId, fieldKey, publishedValue, fieldRule);

  // --- JSON: write to product.json fields[] ---
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

// WHY: Persist the publish decision in the candidate's metadata_json so the
// publisher GUI can display published vs rejected and the rejection reason.
function persistPublishResult(specDb, productId, fieldKey, serializedValue, result) {
  try {
    const row = specDb.getFieldCandidate(productId, fieldKey, serializedValue);
    if (!row) return;
    const meta = row.metadata_json && typeof row.metadata_json === 'object' ? { ...row.metadata_json } : {};
    meta.publish_result = result;
    specDb.upsertFieldCandidate({
      productId, fieldKey,
      value: serializedValue,
      unit: row.unit,
      confidence: row.confidence,
      sourceCount: row.source_count,
      sourcesJson: row.sources_json,
      validationJson: row.validation_json,
      metadataJson: meta,
      status: row.status,
    });
  } catch { /* best-effort — publish result is informational */ }
}
