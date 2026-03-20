// WHY: Pure domain logic extracted from curationSuggestions.js.
// Testable in isolation — no filesystem, no SpecDb.

export function generateSuggestionId(prefix, ...tokens) {
  const slugged = tokens
    .map((t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
    .filter(Boolean)
    .join('_');
  return `${prefix}_${slugged}`;
}

export function deduplicateByKey(existing, incoming, keyFn) {
  const index = new Map();
  for (const row of existing) {
    const key = keyFn(row);
    if (key) index.set(key, row);
  }
  const appended = [];
  for (const row of incoming) {
    const key = keyFn(row);
    if (!key || index.has(key)) continue;
    index.set(key, row);
    appended.push(row);
  }
  return { index, appended };
}

export function stableSortSuggestions(rows = []) {
  return [...rows].sort((a, b) => {
    const byField = String(a.field_key || '').localeCompare(String(b.field_key || ''));
    if (byField !== 0) return byField;
    const byValue = String(a.value || '').localeCompare(String(b.value || ''));
    if (byValue !== 0) return byValue;
    return String(a.first_seen_at || '').localeCompare(String(b.first_seen_at || ''));
  });
}
