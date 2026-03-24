import { toArray } from '../../../../shared/primitives.js';

/**
 * Storage contract (getBrandDomain / upsertBrandDomain):
 * @typedef {object} BrandDomainRow
 * @property {string} brand
 * @property {string} category
 * @property {string} official_domain
 * @property {string|string[]} aliases — JSON string or array
 * @property {string} support_domain
 * @property {number|null} confidence — 0-1 or null when LLM did not provide
 */

function parseConfidence(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n > 1) return Math.min(n / 100, 1); // handle 80 vs 0.8
  return Math.max(0, Math.min(n, 1));
}

export async function resolveBrandDomain({
  brand,
  category,
  config,
  callLlmFn,
  storage,
  logger,
}) {
  const brandKey = String(brand || '').trim();
  const categoryKey = String(category || '').trim();
  const empty = { officialDomain: '', aliases: [], supportDomain: '', confidence: null, reasoning: [] };

  if (!brandKey) return empty;

  if (typeof storage?.getBrandDomain === 'function') {
    const cached = storage.getBrandDomain(brandKey, categoryKey);
    if (cached) {
      const aliases = parseAliases(cached.aliases);
      return {
        officialDomain: cached.official_domain || '',
        aliases,
        supportDomain: cached.support_domain || '',
        confidence: parseConfidence(cached.confidence),
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
    const confidence = officialDomain ? parseConfidence(result?.confidence) : null;

    if (typeof storage?.upsertBrandDomain === 'function') {
      storage.upsertBrandDomain({
        brand: brandKey,
        category: categoryKey,
        official_domain: officialDomain,
        aliases: JSON.stringify(aliases),
        support_domain: supportDomain,
        confidence,
      });
    }

    return { officialDomain, aliases, supportDomain, confidence, reasoning };
  } catch (err) {
    logger?.warn?.('brand_resolver_llm_error', {
      brand: brandKey,
      category: categoryKey,
      error: String(err?.message || 'unknown'),
    });
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

