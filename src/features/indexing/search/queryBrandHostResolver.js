import { slug, tokenize, toArray } from './queryIdentityNormalizer.js';

const BRAND_HOST_HINTS = {
  logitech: ['logitech', 'logitechg', 'logi'],
  razer: ['razer'],
  steelseries: ['steelseries'],
  alienware: ['alienware', 'dell'],
  dell: ['dell', 'alienware'],
  asus: ['asus', 'rog'],
  zowie: ['zowie', 'benq'],
  benq: ['benq', 'zowie'],
  hp: ['hp', 'hyperx'],
  hyperx: ['hyperx', 'hp'],
  lenovo: ['lenovo', 'legion'],
  msi: ['msi'],
  acer: ['acer', 'predator'],
  finalmouse: ['finalmouse'],
  lamzu: ['lamzu'],
  pulsar: ['pulsar'],
  corsair: ['corsair'],
  glorious: ['glorious'],
  endgame: ['endgamegear', 'endgame-gear']
};

const TLD_STOPWORDS = new Set(['com', 'net', 'org', 'io', 'co', 'dev', 'gg', 'xyz', 'info']);

function manufacturerHostHintsForBrand(brand) {
  const hints = new Set(tokenize(brand));
  const brandSlug = slug(brand);
  for (const [key, aliases] of Object.entries(BRAND_HOST_HINTS)) {
    if (brandSlug.includes(key) || hints.has(key)) {
      for (const alias of aliases) {
        hints.add(alias);
      }
    }
  }
  return [...hints];
}

export function selectManufacturerHosts(categoryConfig, brand, extraHints = []) {
  const hints = manufacturerHostHintsForBrand(brand);
  for (const hint of toArray(extraHints)) {
    hints.push(...tokenize(hint).filter((t) => !TLD_STOPWORDS.has(t)));
  }
  const rows = toArray(categoryConfig?.sourceHosts)
    .filter((row) => String(row?.tierName || row?.role || '').toLowerCase() === 'manufacturer')
    .map((row) => String(row?.host || '').trim().toLowerCase())
    .filter(Boolean);
  if (!hints.length) {
    return rows.slice(0, 4);
  }
  return rows.filter((host) => hints.some((hint) => host.includes(hint))).slice(0, 6);
}
