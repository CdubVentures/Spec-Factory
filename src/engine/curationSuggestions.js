import path from 'node:path';
import { nowIso } from '../utils/common.js';
import { normalizeFieldKey } from './engineTextHelpers.js';
import { generateSuggestionId, deduplicateByKey, stableSortSuggestions } from './curationPureDomain.js';
import { readJsonDoc, writeJsonDoc } from './curationPersistence.js';

function normalizeCategory(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+$/g, '') || 'category';
}

function normalizeValueToken(value) {
  return String(value ?? '').trim();
}

function suggestionDocDefaults(category) {
  return {
    version: 1,
    category: normalizeCategory(category),
    suggestions: []
  };
}

export function enumSuggestionPath({ config = {}, category }) {
  const helperRoot = path.resolve(config.categoryAuthorityRoot || config['helper' + 'FilesRoot'] || 'category_authority');
  return path.join(helperRoot, normalizeCategory(category), '_suggestions', 'enums.json');
}

export function componentSuggestionPath({ config = {}, category }) {
  const helperRoot = path.resolve(config.categoryAuthorityRoot || config['helper' + 'FilesRoot'] || 'category_authority');
  return path.join(helperRoot, normalizeCategory(category), '_suggestions', 'components.json');
}

export async function appendComponentCurationSuggestions({
  config = {},
  category,
  productId,
  runId,
  suggestions = [],
  specDb = null
}) {
  const filePath = componentSuggestionPath({ config, category });
  const next = await readJsonDoc(filePath, () => suggestionDocDefaults(category));
  const currentSuggestions = Array.isArray(next.suggestions) ? next.suggestions : [];

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

  const { appended } = deduplicateByKey(currentSuggestions, incoming, compKeyFn);
  currentSuggestions.push(...appended);

  for (const suggestion of appended) {
    if (specDb) {
      try {
        specDb.upsertCurationSuggestion({ ...suggestion, last_seen_at: nowIso() });
      } catch { /* best-effort */ }
    }
  }

  next.version = 1;
  next.category = normalizeCategory(category);
  next.suggestions = stableSortSuggestions(currentSuggestions);
  next.updated_at = nowIso();

  await writeJsonDoc(filePath, next);

  return {
    path: filePath,
    appended_count: appended.length,
    total_count: next.suggestions.length
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
  const filePath = enumSuggestionPath({ config, category });
  const next = await readJsonDoc(filePath, () => suggestionDocDefaults(category));
  const currentSuggestions = Array.isArray(next.suggestions) ? next.suggestions : [];

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

  const { appended } = deduplicateByKey(currentSuggestions, incoming, enumKeyFn);
  currentSuggestions.push(...appended);

  for (const suggestion of appended) {
    if (specDb) {
      try {
        specDb.upsertCurationSuggestion({ ...suggestion, last_seen_at: nowIso() });
      } catch { /* best-effort */ }
    }
  }

  next.version = 1;
  next.category = normalizeCategory(category);
  next.suggestions = stableSortSuggestions(currentSuggestions);
  next.updated_at = nowIso();

  await writeJsonDoc(filePath, next);

  return {
    path: filePath,
    appended_count: appended.length,
    total_count: next.suggestions.length
  };
}

// ── Component Review Items (flagged for AI review) ────────────────

export function componentReviewPath({ config = {}, category }) {
  const helperRoot = path.resolve(config.categoryAuthorityRoot || config['helper' + 'FilesRoot'] || 'category_authority');
  return path.join(helperRoot, normalizeCategory(category), '_suggestions', 'component_review.json');
}

export async function appendComponentReviewItems({
  config = {},
  category,
  productId,
  runId,
  items = [],
  specDb = null
}) {
  const filePath = componentReviewPath({ config, category });
  const next = await readJsonDoc(filePath, () => ({ version: 1, category: normalizeCategory(category), items: [] }));
  const currentItems = Array.isArray(next.items) ? next.items : [];

  const reviewKeyFn = (row) => {
    const ct = normalizeFieldKey(row?.component_type);
    const rq = normalizeValueToken(row?.raw_query);
    const pid = normalizeValueToken(row?.product_id);
    return ct && rq ? `${ct}::${rq.toLowerCase()}::${pid}` : '';
  };

  // Build index for score updates on existing duplicates
  const existingIndex = new Map();
  for (const row of currentItems) {
    const key = reviewKeyFn(row);
    if (key) existingIndex.set(key, row);
  }

  let appendedCount = 0;
  for (const row of items) {
    const componentType = normalizeFieldKey(row?.component_type);
    const rawQuery = normalizeValueToken(row?.raw_query);
    if (!componentType || !rawQuery) continue;
    const pid = String(productId || '').trim();
    const dedupKey = `${componentType}::${rawQuery.toLowerCase()}::${pid}`;

    if (existingIndex.has(dedupKey)) {
      const entry = existingIndex.get(dedupKey);
      entry.name_score = row.name_score ?? entry.name_score;
      entry.property_score = row.property_score ?? entry.property_score;
      entry.combined_score = row.combined_score ?? entry.combined_score;
      continue;
    }

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
    existingIndex.set(dedupKey, item);
    currentItems.push(item);
    appendedCount += 1;

    if (specDb) {
      try {
        specDb.upsertComponentReviewItem(item);
      } catch { /* best-effort */ }
    }
  }

  next.version = 1;
  next.category = normalizeCategory(category);
  next.items = currentItems;
  next.updated_at = nowIso();

  await writeJsonDoc(filePath, next);

  return {
    path: filePath,
    appended_count: appendedCount,
    total_count: next.items.length
  };
}

// ── Component Identity Observations (successful matches) ──────────

export function componentIdentityPath({ config = {}, category }) {
  const helperRoot = path.resolve(config.categoryAuthorityRoot || config['helper' + 'FilesRoot'] || 'category_authority');
  return path.join(helperRoot, normalizeCategory(category), '_suggestions', 'component_identity.json');
}

export async function appendComponentIdentityObservations({
  config = {},
  category,
  productId,
  runId,
  observations = [],
  specDb = null
}) {
  const filePath = componentIdentityPath({ config, category });
  const next = await readJsonDoc(filePath, () => ({ version: 1, category: normalizeCategory(category), observations: [] }));
  const currentObs = Array.isArray(next.observations) ? next.observations : [];

  const identityKeyFn = (row) => {
    const ct = normalizeFieldKey(row?.component_type);
    const rq = normalizeValueToken(row?.raw_query);
    const pid = normalizeValueToken(row?.product_id);
    return ct && rq ? `${ct}::${rq.toLowerCase()}::${pid}` : '';
  };

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

  const { appended } = deduplicateByKey(currentObs, incoming, identityKeyFn);
  currentObs.push(...appended);

  for (const obs of appended) {
    if (specDb && obs.canonical_name && obs.product_id) {
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
      } catch { /* best-effort */ }
    }
  }

  next.version = 1;
  next.category = normalizeCategory(category);
  next.observations = currentObs;
  next.updated_at = nowIso();

  await writeJsonDoc(filePath, next);

  return {
    path: filePath,
    appended_count: appended.length,
    total_count: next.observations.length
  };
}

