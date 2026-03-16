export async function resolveBrandDomain({
  brand,
  category,
  config,
  callLlmFn,
  storage
}) {
  const brandKey = String(brand || '').trim();
  const categoryKey = String(category || '').trim();
  const empty = { officialDomain: '', aliases: [], supportDomain: '', confidence: 0, reasoning: [] };

  if (!brandKey) return empty;

  if (typeof storage?.getBrandDomain === 'function') {
    const cached = storage.getBrandDomain(brandKey, categoryKey);
    if (cached) {
      const aliases = parseAliases(cached.aliases);
      return {
        officialDomain: cached.official_domain || '',
        aliases,
        supportDomain: cached.support_domain || '',
        confidence: cached.confidence || 0.8,
        reasoning: []
      };
    }
  }

  if (!callLlmFn) return empty;

  try {
    const result = await callLlmFn({
      brand: brandKey,
      category: categoryKey,
      config
    });
    const officialDomain = String(result?.official_domain || '').trim().toLowerCase();
    const aliases = toArray(result?.aliases).map(a => String(a || '').trim().toLowerCase()).filter(Boolean);
    const supportDomain = String(result?.support_domain || '').trim().toLowerCase();
    const reasoning = toArray(result?.reasoning).map(r => String(r || '').trim()).filter(Boolean);

    if (typeof storage?.upsertBrandDomain === 'function') {
      storage.upsertBrandDomain({
        brand: brandKey,
        category: categoryKey,
        official_domain: officialDomain,
        aliases: JSON.stringify(aliases),
        support_domain: supportDomain,
        confidence: 0.8
      });
    }

    return { officialDomain, aliases, supportDomain, confidence: 0.8, reasoning };
  } catch {
    return empty;
  }
}

function parseAliases(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}
