import { nowIso, isObject, normalizeToken } from '../../../shared/primitives.js';

function normalizeField(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^fields\./, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeType(value) {
  const token = normalizeToken(value);
  if (token === 'enum' || token === 'enum_value' || token === 'new_enum') {
    return 'enum';
  }
  if (token === 'component' || token === 'new_component') {
    return 'component';
  }
  if (token === 'alias' || token === 'new_alias') {
    return 'alias';
  }
  throw new Error(`Unsupported suggestion type '${value}'`);
}

function fileNameForType(type) {
  // Consolidated: use the same files as the runtime curation system
  if (type === 'enum') {
    return 'enums.json';
  }
  if (type === 'component') {
    return 'components.json';
  }
  return 'aliases.json';
}

function dedupeKeyForType(type, item = {}) {
  if (type === 'alias') {
    return [
      normalizeField(item.field),
      normalizeToken(item.value),
      normalizeToken(item.canonical)
    ].join('|');
  }
  return [
    normalizeField(item.field),
    normalizeToken(item.value)
  ].join('|');
}

function normalizePayload(type, payload = {}) {
  if (!isObject(payload)) {
    throw new Error('appendReviewSuggestion requires payload object');
  }
  const field = normalizeField(payload.field);
  const value = String(payload.value || '').trim();
  const evidence = isObject(payload.evidence) ? payload.evidence : {};
  const evidenceUrl = String(evidence.url || '').trim();
  const evidenceQuote = String(evidence.quote || '').trim();
  if (!field) {
    throw new Error('appendReviewSuggestion requires payload.field');
  }
  if (!value) {
    throw new Error('appendReviewSuggestion requires payload.value');
  }
  if (!evidenceUrl || !evidenceQuote) {
    throw new Error('appendReviewSuggestion requires evidence.url and evidence.quote');
  }
  const item = {
    type,
    category: String(payload.category || '').trim(),
    product_id: String(payload.product_id || '').trim(),
    field,
    value,
    canonical: String(payload.canonical || '').trim(),
    reason: String(payload.reason || '').trim() || null,
    reviewer: String(payload.reviewer || '').trim() || null,
    evidence: {
      url: evidenceUrl,
      quote: evidenceQuote,
      quote_span: Array.isArray(evidence.quote_span) ? evidence.quote_span : null,
      snippet_id: String(evidence.snippet_id || '').trim() || null,
      snippet_hash: String(evidence.snippet_hash || '').trim() || null
    },
    created_at: nowIso()
  };
  return item;
}

export function suggestionFilePath({ config = {}, category, type }) {
  const normalizedType = normalizeType(type);
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  const normalizedCategory = String(category || '').trim() || 'unknown';
  return path.join(
    helperRoot,
    normalizedCategory,
    '_suggestions',
    fileNameForType(normalizedType)
  );
}

export async function appendReviewSuggestion({
  config = {},
  category,
  type,
  payload,
  specDb = null
}) {
  const normalizedType = normalizeType(type);
  const normalizedPayload = normalizePayload(normalizedType, {
    ...payload,
    category
  });
  const fieldKey = normalizedPayload.field || normalizedPayload.field_key || '';
  const value = normalizedPayload.value || '';
  const sqlType = normalizedType === 'enum' ? 'enum_value' : normalizedType;

  // WHY: Phase E3 — SQL is sole source. Dedup via SQL query, write to SQL only.
  let found = false;
  if (specDb && fieldKey && value) {
    try {
      const existing = specDb.getCurationSuggestions(sqlType);
      const dedupeKey = dedupeKeyForType(normalizedType, normalizedPayload);
      found = existing.some((row) => {
        const rowKey = [
          normalizeField(row.field_key),
          normalizeToken(row.value)
        ].join('|');
        return rowKey === dedupeKey;
      });
      if (!found) {
        specDb.upsertCurationSuggestion({
          suggestion_id: `${normalizedType}::${fieldKey}::${normalizeToken(value)}`,
          category,
          suggestion_type: sqlType,
          field_key: fieldKey,
          component_type: normalizedPayload.component_type || null,
          value,
          normalized_value: normalizeToken(value),
          status: 'pending',
          source: 'review_suggestion',
          product_id: normalizedPayload.product_id || null,
          run_id: null,
          first_seen_at: normalizedPayload.created_at || nowIso(),
          last_seen_at: nowIso()
        });
      }
    } catch { /* best-effort SQL write */ }
  }

  return {
    category,
    type: normalizedType,
    appended: !found,
  };
}
