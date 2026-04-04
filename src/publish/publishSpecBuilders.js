import path from 'node:path';
import {
  nowIso,
  normalizeToken,
  isObject,
  hasKnownValue,
  toNumber,
  coerceOutputValue
} from './publishPrimitives.js';

export function inferProductIdFromKey(key) {
  const match = String(key || '').replace(/\\/g, '/').match(/\/published\/([^/]+)\/current\.json$/i);
  return match ? match[1] : '';
}

export function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function hostnameFromUrl(url) {
  try {
    return new URL(String(url || '')).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function firstEvidence(row = {}) {
  if (Array.isArray(row.evidence) && row.evidence.length > 0) {
    return row.evidence[0] || {};
  }
  return row || {};
}

export function stableSpecFieldOrder(fields = {}) {
  return Object.keys(fields || {}).sort((a, b) => a.localeCompare(b));
}

export async function readOverrideDoc({ config = {}, category, productId, specDb = null }) {
  // WHY: Phase E3 — SQL is sole source for override docs
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  const overridePath = path.join(helperRoot, category, '_overrides', `${productId}.overrides.json`);
  if (specDb) {
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
            source: { host: null, source_id: null, method: row.override_source || null, tier: null, evidence_key: null },
            set_at: row.overridden_at || row.updated_at || null
          };
        }
        return {
          path: `sql://product_review_state/${category}/${productId}`,
          payload: {
            version: 1,
            category,
            product_id: productId,
            review_status: reviewState?.review_status || 'pending',
            review_started_at: reviewState?.review_started_at || null,
            overrides
          }
        };
      }
    } catch { /* SQL read failed — return null payload */ }
  }
  // WHY: Overlap 0d — try consolidated JSON when SQL has no data
  try {
    const { readProductFromConsolidated } = await import('../shared/consolidatedOverrides.js');
    const entry = await readProductFromConsolidated({ config, category, productId });
    if (entry) {
      return { path: `json://overrides/${category}/${productId}`, payload: entry };
    }
  } catch { /* consolidated read failed */ }
  return { path: overridePath, payload: null };
}

export async function listApprovedOverrideProductIds({ config = {}, category, specDb = null }) {
  // WHY: Phase E3 — SQL is sole source for approved product IDs
  if (specDb) {
    try {
      return specDb.listApprovedProductIds();
    } catch { /* SQL read failed — return empty */ }
  }
  return [];
}
export function mergeOverrideValue({ existing, override, field }) {
  const value = String(override?.override_value ?? override?.value ?? '').trim();
  if (!value) {
    return existing;
  }
  const provenance = isObject(override?.override_provenance) ? override.override_provenance : {};
  const source = isObject(override?.source) ? override.source : {};

  const evidence = {
    url: String(provenance.url || '').trim() || null,
    host: hostnameFromUrl(provenance.url),
    method: String(source.method || 'manual_override').trim(),
    keyPath: `overrides.${field}`,
    tier: 1,
    tierName: 'user_override',
    source_id: String(provenance.source_id || '').trim() || '',
    snippet_id: String(provenance.snippet_id || '').trim() || '',
    snippet_hash: String(provenance.snippet_hash || '').trim() || '',
    quote_span: Array.isArray(provenance.quote_span) ? provenance.quote_span : null,
    quote: String(provenance.quote || '').trim() || '',
    retrieved_at: String(provenance.retrieved_at || nowIso()).trim()
  };

  return {
    ...(isObject(existing) ? existing : {}),
    value,
    confidence: 1,
    evidence: [evidence],
    override: {
      candidate_id: String(override?.candidate_id || '').trim(),
      override_source: String(override?.override_source || 'manual_override').trim(),
      override_reason: String(override?.override_reason || '').trim() || null,
      set_at: String(override?.set_at || override?.overridden_at || nowIso()).trim()
    }
  };
}

export function computeDiffRows(previousSpecs = {}, nextSpecs = {}) {
  const keys = [...new Set([...Object.keys(previousSpecs || {}), ...Object.keys(nextSpecs || {})])]
    .sort((a, b) => a.localeCompare(b));
  const rows = [];
  for (const key of keys) {
    const left = previousSpecs[key];
    const right = nextSpecs[key];
    if (JSON.stringify(left) === JSON.stringify(right)) {
      continue;
    }
    rows.push({
      field: key,
      before: left ?? 'unk',
      after: right ?? 'unk'
    });
  }
  return rows;
}

export function coverageFromSpecs(specs = {}, fieldOrder = []) {
  const keys = fieldOrder.length > 0 ? fieldOrder : stableSpecFieldOrder(specs);
  let known = 0;
  for (const key of keys) {
    if (hasKnownValue(specs[key])) {
      known += 1;
    }
  }
  return {
    total: keys.length,
    known,
    coverage: keys.length > 0 ? Number.parseFloat((known / keys.length).toFixed(6)) : 0
  };
}

export function resolveFieldConfidence(provenanceRow = {}) {
  const direct = toNumber(provenanceRow?.confidence, NaN);
  if (Number.isFinite(direct)) {
    return Math.max(0, Math.min(1, direct));
  }
  return 0;
}

export function evidenceWarningsForRecord(fields = {}, provenance = {}) {
  const warnings = [];
  for (const [field, value] of Object.entries(fields || {})) {
    if (!hasKnownValue(value)) {
      continue;
    }
    const row = isObject(provenance[field]) ? provenance[field] : {};
    const evidence = firstEvidence(row);
    if (!String(evidence.url || '').trim()) {
      warnings.push({ field, code: 'missing_evidence_url' });
    }
    if (!String(evidence.quote || '').trim()) {
      warnings.push({ field, code: 'missing_evidence_quote' });
    }
    if (!String(evidence.snippet_id || '').trim()) {
      warnings.push({ field, code: 'missing_snippet_id' });
    }
  }
  return warnings;
}

export function buildUnknowns(specs = {}, summary = {}) {
  const fieldReasoning = isObject(summary?.field_reasoning) ? summary.field_reasoning : {};
  const out = {};
  for (const [field, value] of Object.entries(specs || {})) {
    if (hasKnownValue(value)) {
      continue;
    }
    const row = isObject(fieldReasoning[field]) ? fieldReasoning[field] : {};
    out[field] = {
      reason: String(row.unknown_reason || 'not_found_after_search').trim() || 'not_found_after_search'
    };
  }
  return out;
}

export function sourceCountFromProvenance(provenance = {}) {
  const sources = new Set();
  for (const row of Object.values(provenance || {})) {
    const evidence = firstEvidence(row || {});
    const sourceId = String(evidence.source_id || '').trim();
    const host = String(evidence.host || hostnameFromUrl(evidence.url)).trim();
    if (sourceId) {
      sources.add(`id:${sourceId}`);
    }
    if (host) {
      sources.add(`host:${host}`);
    }
  }
  return sources.size;
}

export function summarizeConfidenceFromMetadata(specsWithMetadata = {}) {
  let total = 0;
  let count = 0;
  for (const row of Object.values(specsWithMetadata || {})) {
    const confidence = toNumber(row?.confidence, NaN);
    if (!Number.isFinite(confidence)) {
      continue;
    }
    total += confidence;
    count += 1;
  }
  if (count === 0) {
    return 0;
  }
  return Number.parseFloat((total / count).toFixed(6));
}

export function normalizeSpecForCompact(fullRecord = {}) {
  return {
    product_id: fullRecord.product_id,
    category: fullRecord.category,
    published_version: fullRecord.published_version,
    published_at: fullRecord.published_at,
    identity: fullRecord.identity,
    specs: fullRecord.specs,
    metrics: fullRecord.metrics
  };
}

export function toJsonLdProduct(fullRecord = {}) {
  const identity = fullRecord.identity || {};
  const name = String(identity.full_name || `${identity.brand || ''} ${identity.model || ''}`.trim()).trim();
  const properties = [];
  for (const [field, value] of Object.entries(fullRecord.specs || {})) {
    if (!hasKnownValue(value)) {
      continue;
    }
    properties.push({
      '@type': 'PropertyValue',
      name: field,
      value: Array.isArray(value) ? value.join(', ') : String(value)
    });
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    brand: {
      '@type': 'Brand',
      name: String(identity.brand || '')
    },
    category: String(fullRecord.category || ''),
    additionalProperty: properties
  };
}

export function toMarkdownRecord(fullRecord = {}) {
  const lines = [];
  lines.push(`# ${fullRecord.identity?.full_name || fullRecord.product_id}`);
  lines.push('');
  lines.push(`- Product ID: ${fullRecord.product_id}`);
  lines.push(`- Category: ${fullRecord.category}`);
  lines.push(`- Published Version: ${fullRecord.published_version}`);
  lines.push(`- Published At: ${fullRecord.published_at}`);
  lines.push('');
  lines.push('| Field | Value | Confidence | Source |');
  lines.push('| --- | --- | ---: | --- |');
  for (const [field, row] of Object.entries(fullRecord.specs_with_metadata || {})) {
    lines.push(`| ${field} | ${String(row.value ?? 'unk')} | ${toNumber(row.confidence, 0)} | ${String(row.source || '')} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function buildSpecsWithMetadata({
  engine,
  fields,
  provenance,
  fieldOrder
}) {
  const out = {};
  for (const field of fieldOrder) {
    const value = fields[field];
    const provRow = isObject(provenance[field]) ? provenance[field] : {};
    const evidence = firstEvidence(provRow);
    const rule = engine?.getFieldRule?.(field) || {};
    out[field] = {
      value: coerceOutputValue(value),
      unit: rule?.contract?.unit || null,
      confidence: resolveFieldConfidence(provRow),
      source: String(evidence.host || hostnameFromUrl(evidence.url) || ''),
      source_tier: String(evidence.tierName || '').trim() || null,
      last_verified: String(evidence.retrieved_at || '').trim() || null,
      source_id: String(evidence.source_id || '').trim() || null,
      snippet_id: String(evidence.snippet_id || '').trim() || null,
      snippet_hash: String(evidence.snippet_hash || '').trim() || null,
      quote_span: Array.isArray(evidence.quote_span) ? evidence.quote_span : null,
      override_source: String(provRow?.override?.override_source || '').trim() || null
    };
  }
  return out;
}
