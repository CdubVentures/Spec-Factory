import { normalizeFieldList } from '../utils/fieldKeys.js';
import { toArray } from '../shared/primitives.js';
import { toInt } from '../shared/valueNormalizers.js';

export { toArray, toInt };

export function normalizedRoundCount(value, fallback = 4) {
  const parsed = toInt(value, fallback);
  return Math.max(1, Math.min(12, parsed || fallback));
}

export function summaryProgress(summary = {}) {
  return {
    missingRequiredCount: toArray(summary.missing_required_fields).length,
    criticalCount: toArray(summary.critical_fields_below_pass_target).length,
    contradictionCount: toInt(summary.constraint_analysis?.contradiction_count, 0),
    confidence: Number.parseFloat(String(summary.confidence || 0)) || 0,
    validated: Boolean(summary.validated)
  };
}

export function isCompleted(summary = {}) {
  const missingRequiredCount = toArray(summary.missing_required_fields).length;
  const criticalCount = toArray(summary.critical_fields_below_pass_target).length;
  return Boolean(summary.validated) && missingRequiredCount === 0 && criticalCount === 0;
}

export function makeRoundHint(round) {
  if (round === 0) return 'fast_pass';
  if (round === 1) return 'targeted_search_pass';
  if (round === 2) return 'deep_manufacturer_pass';
  return 'conflict_resolution_pass';
}

export function normalizeFieldForSearchQuery(value) {
  const token = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^fields\./, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!token) {
    return '';
  }

  const blocked = new Set([
    'id',
    'brand',
    'model',
    'base model',
    'category',
    'variant',
    'active',
    'status',
    'flags'
  ]);
  if (blocked.has(token)) {
    return '';
  }

  if (token === 'lngth') return 'length';
  if (token === 'cpi') return 'dpi';
  return token;
}

export function buildAvailabilityQueries({
  job,
  expectedFields = [],
  sometimesFields = [],
  criticalFields = []
}) {
  const brand = String(job?.identityLock?.brand || '').trim();
  const model = String(job?.identityLock?.model || '').trim();
  const variant = String(job?.identityLock?.variant || '').trim();
  const product = [brand, model, variant].filter(Boolean).join(' ').trim();
  if (!product) {
    return [];
  }
  const fields = [...new Set([
    ...(expectedFields || []),
    ...(criticalFields || [])
  ])];
  const queries = [];

  const baseline = [
    `${product} specifications`,
    `${product} specs`,
    `${product} technical specifications`,
    `${product} datasheet`,
    `${product} manual pdf`,
    `${product} official specs`,
    `${product} review`
  ];
  queries.push(...baseline);

  for (const field of fields.slice(0, 8)) {
    const normalizedField = normalizeFieldForSearchQuery(field);
    if (!normalizedField) {
      continue;
    }
    queries.push(`${product} ${normalizedField} specification`);
    queries.push(`${product} ${normalizedField} support`);
    queries.push(`${product} ${normalizedField} manual pdf`);
  }
  for (const field of (sometimesFields || []).slice(0, 4)) {
    const normalizedField = normalizeFieldForSearchQuery(field);
    if (!normalizedField) {
      continue;
    }
    queries.push(`${product} ${normalizedField} specs`);
  }
  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))].slice(0, 30);
}

export function normalizeFieldContractToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^fields\./, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function llmBlocked(summary = {}) {
  return String(summary.llm?.budget?.blocked_reason || '').trim();
}

export function isIdentityOrEditorialField(field, categoryConfig = {}) {
  const token = String(field || '').trim().toLowerCase();
  if (!token) {
    return true;
  }
  if (['id', 'brand', 'model', 'base_model', 'category', 'sku', 'mpn', 'gtin', 'variant'].includes(token)) {
    return true;
  }
  const editorial = new Set(
    normalizeFieldList(toArray(categoryConfig?.schema?.editorial_fields || []), {
      fieldOrder: categoryConfig?.fieldOrder || []
    })
  );
  return editorial.has(token);
}

export function calcProgressDelta(previous, current) {
  if (!previous) {
    return {
      improved: true,
      reasons: ['first_round']
    };
  }
  const reasons = [];
  if (current.validated && !previous.validated) {
    reasons.push('validated');
  }
  if (current.missingRequiredCount < previous.missingRequiredCount) {
    reasons.push('missing_required_reduced');
  }
  if (current.criticalCount < previous.criticalCount) {
    reasons.push('critical_reduced');
  }
  if (current.contradictionCount < previous.contradictionCount) {
    reasons.push('contradictions_reduced');
  }
  if (current.confidence > previous.confidence + 0.01) {
    reasons.push('confidence_up');
  }
  return {
    improved: reasons.length > 0,
    reasons
  };
}
