import { toArray } from '../../../../shared/primitives.js';

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

  if (!callLlmFn) return empty;

  try {
    const { result } = await callLlmFn({
      brand: brandKey,
      category: categoryKey,
      config
    });
    const officialDomain = String(result?.official_domain || '').trim().toLowerCase();
    const aliases = toArray(result?.aliases).map(a => String(a || '').trim().toLowerCase()).filter(Boolean);
    const supportDomain = String(result?.support_domain || '').trim().toLowerCase();
    const reasoning = toArray(result?.reasoning).map(r => String(r || '').trim()).filter(Boolean);
    const confidence = officialDomain ? parseConfidence(result?.confidence) : null;

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


