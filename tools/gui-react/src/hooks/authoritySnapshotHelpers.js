import {
  resolveDataChangeInvalidationQueryKeys,
  shouldHandleDataChangeMessage,
  resolveDataChangeScopedCategories,
} from '../features/data-change/index.js';

function normalizedToken(value) {
  return String(value || '').trim();
}

function normalizedSyncVersion(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export const AUTHORITY_SNAPSHOT_DOMAINS = Object.freeze([
  'studio',
  'mapping',
  'review-layout',
  'labels',
  'component',
  'enum',
  'identity',
  'catalog',
  'review',
  'product',
]);

export function buildAuthorityVersionToken(snapshot) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const version = source.version && typeof source.version === 'object' ? source.version : source;
  return [
    normalizedToken(version.map_hash) || 'none',
    normalizedToken(version.compiled_hash) || 'none',
    String(normalizedSyncVersion(version.specdb_sync_version)),
    normalizedToken(version.updated_at) || '',
  ].join('|');
}

function dedupeQueryKeys(queryKeys) {
  const seen = new Set();
  const output = [];
  for (const queryKey of queryKeys) {
    if (!Array.isArray(queryKey) || queryKey.length === 0) continue;
    const signature = JSON.stringify(queryKey);
    if (seen.has(signature)) continue;
    seen.add(signature);
    output.push(queryKey);
  }
  return output;
}

export function shouldRefreshAuthoritySnapshot({
  message,
  category,
  domains = AUTHORITY_SNAPSHOT_DOMAINS,
}) {
  return shouldHandleDataChangeMessage({
    message,
    category,
    domains,
  });
}

export function resolveAuthoritySnapshotInvalidationQueryKeys({
  message,
  category,
}) {
  const scopedCategories = resolveDataChangeScopedCategories(message, category);
  const keys = resolveDataChangeInvalidationQueryKeys({
    message,
    categories: scopedCategories,
    fallbackCategory: category,
  });
  for (const scopedCategory of scopedCategories) {
    keys.push(['data-authority', 'snapshot', scopedCategory]);
  }
  return dedupeQueryKeys(keys);
}
