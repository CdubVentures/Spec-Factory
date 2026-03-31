// ── Component Review Data Builder ────────────────────────────────────
//
// Mirrors reviewGridData.js patterns for component tables and enum lists.
// Three exported functions supply the review-components API endpoints.

import { projectFieldRulesForConsumer } from '../../../field-rules/consumerGate.js';
import { toArray } from './reviewNormalization.js';
import {
  resolveReviewEnabledEnumFieldSet,
  resolveDeclaredComponentPropertyColumns,
  mergePropertyColumns,
  resolvePropertyFieldMeta,
} from './componentReviewHelpers.js';
import { buildEnumReviewPayloadsSpecDb } from './enumReviewData.js';
import { buildComponentReviewPayloadsSpecDb } from './componentReviewSpecDb.js';


// Re-export resolvePropertyFieldMeta (public API preserved)
export { resolvePropertyFieldMeta };

// ── Layout ──────────────────────────────────────────────────────────

export async function buildComponentReviewLayout({ config = {}, category, specDb = null, fieldRules = null }) {
  if (!specDb) {
    return { category, types: [] };
  }
  const typeRows = specDb.getComponentTypeList();
  const componentTypes = [...new Set(
    toArray(typeRows)
      .map((row) => String(row?.component_type || '').trim())
      .filter(Boolean)
  )];
  const payloads = await Promise.all(componentTypes.map(async (componentType) => {
    const payload = await buildComponentReviewPayloadsSpecDb({
      config,
      category,
      componentType,
      specDb,
      fieldRules,
    });
    const declaredColumns = resolveDeclaredComponentPropertyColumns({ fieldRules, componentType });
    const observedColumns = specDb.getPropertyColumnsForType(componentType);
    return {
      type: componentType,
      property_columns: mergePropertyColumns(payload?.property_columns || observedColumns, declaredColumns),
      item_count: Array.isArray(payload?.items) ? payload.items.length : 0,
    };
  }));
  const types = payloads;
  return { category, types };
}


// ── Component Payloads ──────────────────────────────────────────────

export async function buildComponentReviewPayloads({ config = {}, category, componentType, specDb = null, fieldRules = null, fieldOrderOverride = null }) {
  const reviewFieldRules = projectFieldRulesForConsumer(fieldRules, 'review');
  if (!specDb) {
    return { category, componentType, items: [], metrics: { total: 0, avg_confidence: 0, flags: 0 } };
  }
  let result = await buildComponentReviewPayloadsSpecDb({
    config,
    category,
    componentType,
    specDb,
    fieldRules: reviewFieldRules,
  });
  if (Array.isArray(fieldOrderOverride) && fieldOrderOverride.length > 0 && Array.isArray(result?.property_columns)) {
    const orderIndex = new Map(fieldOrderOverride.map((k, i) => [k, i]));
    result.property_columns = [...result.property_columns].sort((a, b) => {
      const ai = orderIndex.has(a) ? orderIndex.get(a) : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b) ? orderIndex.get(b) : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }
  return result;
}


// ── Enum Payloads ───────────────────────────────────────────────────

export async function buildEnumReviewPayloads({
  config = {},
  category,
  specDb = null,
  fieldRules = null,
  fieldOrderOverride = null,
}) {
  const enabledEnumFields = resolveReviewEnabledEnumFieldSet(fieldRules);
  if (!specDb) {
    const error = new Error(`SpecDb not ready for ${String(category || '').trim()}`);
    error.code = 'specdb_not_ready';
    throw error;
  }
  const result = await buildEnumReviewPayloadsSpecDb({ config, category, specDb, enabledEnumFields });
  if (Array.isArray(fieldOrderOverride) && fieldOrderOverride.length > 0 && Array.isArray(result?.fields)) {
    const orderIndex = new Map(fieldOrderOverride.map((k, i) => [k, i]));
    result.fields = [...result.fields].sort((a, b) => {
      const ai = orderIndex.has(a.field) ? orderIndex.get(a.field) : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.field) ? orderIndex.get(b.field) : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }
  return result;
}
