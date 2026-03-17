import { normalizeHost, tokenize, slug } from './sourcePlannerUrlUtils.js';

export const BRAND_HOST_HINTS = {
  logitech: ['logitech', 'logitechg', 'logi'],
  razer: ['razer'],
  steelseries: ['steelseries'],
  zowie: ['zowie', 'benq'],
  benq: ['benq', 'zowie'],
  finalmouse: ['finalmouse'],
  lamzu: ['lamzu'],
  pulsar: ['pulsar'],
  corsair: ['corsair'],
  glorious: ['glorious'],
  endgame: ['endgamegear', 'endgame-gear'],
  cooler: ['coolermaster', 'cooler-master'],
  asus: ['asus', 'rog'],
};

export const BRAND_DOMAIN_OVERRIDES = {
  alienware: ['alienware.com', 'dell.com'],
  logitech: ['logitechg.com', 'logitech.com'],
  steelseries: ['steelseries.com'],
  razer: ['razer.com'],
  cooler: ['coolermaster.com'],
  asus: ['asus.com', 'rog.asus.com'],
};

export const BRAND_PREFIXED_CATEGORY_HOSTS = new Set(['razer.com']);

export function manufacturerHostHintsForBrand(brand) {
  const rawTokens = tokenize(brand);
  const hints = new Set(rawTokens);
  const brandSlug = slug(brand);
  const matchedRawTokens = new Set();
  for (const [key, aliases] of Object.entries(BRAND_HOST_HINTS)) {
    if (brandSlug.includes(key) || hints.has(key)) {
      for (const alias of aliases) {
        hints.add(alias);
      }
      for (const rt of rawTokens) {
        if (brandSlug.includes(rt)) matchedRawTokens.add(rt);
      }
    }
  }
  if (matchedRawTokens.size > 0 && matchedRawTokens.size < hints.size) {
    for (const rt of matchedRawTokens) {
      if (hints.size - matchedRawTokens.size >= 1) {
        hints.delete(rt);
      }
    }
  }
  return [...hints];
}

export function manufacturerSeedHostsForBrand(brand = '', hints = []) {
  const seeds = new Set();
  const brandSlug = slug(brand);
  for (const [token, domains] of Object.entries(BRAND_DOMAIN_OVERRIDES)) {
    if (brandSlug.includes(token)) {
      for (const domain of domains || []) {
        const normalized = normalizeHost(domain);
        if (normalized) {
          seeds.add(normalized);
        }
      }
    }
  }

  for (const hint of hints || []) {
    const token = String(hint || '').trim().toLowerCase();
    if (!token || token.length < 3 || !/^[a-z0-9-]+$/.test(token)) {
      continue;
    }
    if (['logi', 'mice', 'mouse', 'gaming', 'wireless', 'wired', 'master', 'model', 'pro', 'ace'].includes(token)) {
      continue;
    }
    seeds.add(`${token}.com`);
  }

  return [...seeds];
}

export function buildAllowedCategoryProductSlugs({ brand = '', modelSlug = '' }) {
  if (!modelSlug) {
    return [];
  }
  const variants = [modelSlug];
  const brandSlug = slug(brand);
  if (brandSlug && !modelSlug.startsWith(`${brandSlug}-`)) {
    variants.push(`${brandSlug}-${modelSlug}`);
  }
  return [...new Set(variants)];
}
