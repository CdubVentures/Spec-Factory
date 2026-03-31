import { nowIso } from '../shared/primitives.js';
import { normalizeFieldKey } from './engineTextHelpers.js';
import { generateSuggestionId, deduplicateByKey } from './curationPureDomain.js';

function normalizeValueToken(value) {
  return String(value ?? '').trim();
}

export async function appendComponentCurationSuggestions({
  config = {},
  category,
  productId,
  runId,
  suggestions = [],
  specDb = null
}) {
  if (!specDb) return { appended_count: 0, total_count: 0 };

  const existing = specDb.getCurationSuggestions('new_component') || [];

  const compKeyFn = (row) => {
    const ct = normalizeFieldKey(row?.component_type);
    const v = normalizeValueToken(row?.value);
    return ct && v ? `${ct}::${v.toLowerCase()}` : '';
  };

  const incoming = suggestions
    .map((row) => {
      const componentType = normalizeFieldKey(row?.component_type);
      const value = normalizeValueToken(row?.normalized_value ?? row?.value ?? row?.raw_value);
      if (!componentType || !value) return null;
      return {
        suggestion_id: generateSuggestionId('comp', componentType, value),
        suggestion_type: 'new_component',
        component_type: componentType,
        field_key: normalizeFieldKey(row?.field_key),
        value,
        status: 'pending',
        source: 'runtime_field_rules_engine',
        product_id: String(productId || '').trim() || null,
        run_id: String(runId || '').trim() || null,
        first_seen_at: nowIso()
      };
    })
    .filter(Boolean);

  const { appended } = deduplicateByKey(existing, incoming, compKeyFn);

  for (const suggestion of appended) {
    try {
      specDb.upsertCurationSuggestion({ ...suggestion, last_seen_at: nowIso() });
    } catch { /* best-effort */ }
  }

  const totalCount = (specDb.getCurationSuggestions('new_component') || []).length;

  return {
    appended_count: appended.length,
    total_count: totalCount
  };
}

export async function appendEnumCurationSuggestions({
  config = {},
  category,
  productId,
  runId,
  suggestions = [],
  specDb = null
}) {
  if (!specDb) return { appended_count: 0, total_count: 0 };

  const existing = specDb.getCurationSuggestions('enum_value') || [];

  const enumKeyFn = (row) => {
    const fk = normalizeFieldKey(row?.field_key);
    const v = normalizeValueToken(row?.value);
    return fk && v ? `${fk}::${v.toLowerCase()}` : '';
  };

  // Flatten array values before dedup
  const incoming = suggestions.flatMap((row) => {
    const fieldKey = normalizeFieldKey(row?.field_key);
    const rawValue = row?.normalized_value ?? row?.value ?? row?.raw_value;
    const valuesToProcess = Array.isArray(rawValue) ? rawValue : [rawValue];
    return valuesToProcess
      .map((singleValue) => {
        const value = normalizeValueToken(singleValue);
        if (!fieldKey || !value) return null;
        return {
          suggestion_id: generateSuggestionId('enum', fieldKey, value),
          suggestion_type: 'enum_value',
          field_key: fieldKey,
          value,
          status: 'pending',
          source: 'runtime_field_rules_engine',
          product_id: String(productId || '').trim() || null,
          run_id: String(runId || '').trim() || null,
          first_seen_at: nowIso()
        };
      })
      .filter(Boolean);
  });

  const { appended } = deduplicateByKey(existing, incoming, enumKeyFn);

  for (const suggestion of appended) {
    try {
      specDb.upsertCurationSuggestion({ ...suggestion, last_seen_at: nowIso() });
    } catch { /* best-effort */ }
  }

  const totalCount = (specDb.getCurationSuggestions('enum_value') || []).length;

  return {
    appended_count: appended.length,
    total_count: totalCount
  };
}

// ── Component Review Items (flagged for AI review) ────────────────

export async function appendComponentReviewItems({
  config = {},
  category,
  productId,
  runId,
  items = [],
  specDb = null
}) {
  if (!specDb) return { appended_count: 0, total_count: 0 };

  // Collect unique component types from incoming items for SQL read
  const componentTypes = new Set();
  for (const row of items) {
    const ct = normalizeFieldKey(row?.component_type);
    if (ct) componentTypes.add(ct);
  }

  // Build existing index from SQL across all relevant component types
  const existingIndex = new Map();
  const reviewKeyFn = (row) => {
    const ct = normalizeFieldKey(row?.component_type);
    const rq = normalizeValueToken(row?.raw_query);
    const pid = normalizeValueToken(row?.product_id);
    return ct && rq ? `${ct}::${rq.toLowerCase()}::${pid}` : '';
  };

  for (const ct of componentTypes) {
    const rows = specDb.getComponentReviewItems(ct) || [];
    for (const row of rows) {
      const key = reviewKeyFn(row);
      if (key) existingIndex.set(key, row);
    }
  }

  let appendedCount = 0;
  for (const row of items) {
    const componentType = normalizeFieldKey(row?.component_type);
    const rawQuery = normalizeValueToken(row?.raw_query);
    if (!componentType || !rawQuery) continue;
    const pid = String(productId || '').trim();
    const dedupKey = `${componentType}::${rawQuery.toLowerCase()}::${pid}`;

    const item = {
      review_id: generateSuggestionId('cr', componentType, rawQuery) + `_${pid.replace(/[^a-z0-9]+/gi, '_').substring(0, 30)}`,
      component_type: componentType,
      field_key: normalizeFieldKey(row?.field_key),
      raw_query: rawQuery,
      matched_component: row.matched_component || null,
      match_type: row.match_type || 'fuzzy_flagged',
      name_score: row.name_score ?? 0,
      property_score: row.property_score ?? 0,
      combined_score: row.combined_score ?? 0,
      alternatives: Array.isArray(row.alternatives) ? row.alternatives.slice(0, 5) : [],
      product_id: pid || null,
      run_id: String(runId || '').trim() || null,
      status: 'pending_ai',
      reasoning_note: typeof row.reasoning_note === 'string' ? row.reasoning_note : '',
      product_attributes: row.product_attributes && typeof row.product_attributes === 'object' ? row.product_attributes : {},
      created_at: nowIso(),
    };

    if (!existingIndex.has(dedupKey)) {
      appendedCount += 1;
    }

    try {
      specDb.upsertComponentReviewItem(item);
    } catch { /* best-effort */ }
  }

  // Get total count across all component types we touched
  let totalCount = 0;
  for (const ct of componentTypes) {
    totalCount += (specDb.getComponentReviewItems(ct) || []).length;
  }

  return {
    appended_count: appendedCount,
    total_count: totalCount
  };
}

// ── Component Identity Observations (successful matches) ──────────

export async function appendComponentIdentityObservations({
  config = {},
  category,
  productId,
  runId,
  observations = [],
  specDb = null
}) {
  if (!specDb) return { appended_count: 0, total_count: 0 };

  const incoming = observations
    .map((row) => {
      const componentType = normalizeFieldKey(row?.component_type);
      const rawQuery = normalizeValueToken(row?.raw_query);
      if (!componentType || !rawQuery) return null;
      const pid = String(productId || '').trim();
      return {
        component_type: componentType,
        canonical_name: normalizeValueToken(row?.canonical_name),
        raw_query: rawQuery,
        match_type: row.match_type || 'exact_or_alias',
        score: row.score ?? 1.0,
        field_key: normalizeFieldKey(row?.field_key),
        product_id: pid || null,
        run_id: String(runId || '').trim() || null,
        observed_at: nowIso(),
      };
    })
    .filter(Boolean);

  // SQL upsert handles dedup via UNIQUE constraint
  let upsertedCount = 0;
  for (const obs of incoming) {
    if (obs.canonical_name && obs.product_id) {
      try {
        specDb.upsertItemComponentLink({
          productId: obs.product_id,
          fieldKey: obs.field_key || obs.component_type,
          componentType: obs.component_type,
          componentName: obs.canonical_name,
          componentMaker: '',
          matchType: obs.match_type || 'exact_or_alias',
          matchScore: obs.score ?? 1.0
        });
        upsertedCount += 1;
      } catch { /* best-effort */ }
    }
  }

  return {
    appended_count: upsertedCount,
    total_count: upsertedCount
  };
}

