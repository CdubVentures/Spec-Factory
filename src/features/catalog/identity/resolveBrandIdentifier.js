// WHY: Pure helper to resolve a brand display name to its stable 8-hex identifier
// via appDb. Returns '' when appDb is unavailable or brand is unknown — never throws.
// Used by product write paths (addProduct, updateProduct, seed, backfill).

export function resolveBrandIdentifier(appDb, brandDisplayName) {
  if (!appDb?.findBrandByAlias) return '';
  const name = String(brandDisplayName ?? '').trim();
  if (!name) return '';
  try {
    const row = appDb.findBrandByAlias(name);
    return String(row?.identifier || '').trim() || '';
  } catch { return ''; }
}
