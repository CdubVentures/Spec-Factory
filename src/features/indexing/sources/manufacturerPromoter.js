// WHY: Pure functions to promote brand-resolved manufacturer domains into
// first-class source entries at runtime. Eliminates the need to maintain
// 30+ static manufacturer entries across category sources.json files.

export const MANUFACTURER_CRAWL_DEFAULTS = Object.freeze({
  method: 'http',
  rate_limit_ms: 2000,
  timeout_ms: 12000,
  robots_txt_compliant: true,
});

/**
 * Deterministic sourceId from host string. Stable across runs so that
 * evidence records, learning data, and source registry dedup all work.
 */
export function sourceIdFromHost(host) {
  return 'brand_' + String(host || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
}

/**
 * Resolve crawl config for a manufacturer host.
 * Priority: override > sourcesData.manufacturer_defaults > hardcoded fallback.
 */
export function resolveManufacturerCrawlConfig(host, sourcesData) {
  const overrides = sourcesData?.manufacturer_crawl_overrides || {};
  const defaults = sourcesData?.manufacturer_defaults || MANUFACTURER_CRAWL_DEFAULTS;

  const override = overrides[host];
  if (override) {
    return {
      ...defaults,
      ...override,
      robots_txt_compliant: override.robots_txt_compliant ?? defaults.robots_txt_compliant ?? true,
    };
  }
  return { ...defaults };
}

function displayNameFromHost(host) {
  const base = String(host || '').split('.')[0] || 'Unknown';
  return base.charAt(0).toUpperCase() + base.slice(1) + ' Official';
}

/**
 * Promote a single manufacturer host into a full source entry shape.
 * @param {string} host
 * @param {object} sourcesData - category sources.json data
 * @param {object} [options]
 * @param {string} [options.brandName] - brand name for display_name
 */
export function promoteManufacturerHost(host, sourcesData, options = {}) {
  const crawlConfig = resolveManufacturerCrawlConfig(host, sourcesData);
  const displayName = options.brandName
    ? `${options.brandName} Official`
    : displayNameFromHost(host);

  return {
    _sourceId: sourceIdFromHost(host),
    display_name: displayName,
    tier: 'tier1_manufacturer',
    authority: 'authoritative',
    base_url: `https://${host}`,
    content_types: ['product_page'],
    doc_kinds: ['spec_sheet'],
    crawl_config: crawlConfig,
    field_coverage: null,
    discovery: {
      method: 'search_first',
      source_type: 'manufacturer',
      search_pattern: '',
      priority: 70,
      enabled: true,
      notes: 'auto-promoted from brand resolver',
    },
  };
}

/**
 * Collect all hosts that already exist as source entries (by base_url host).
 */
function existingSourceHosts(sourcesData) {
  const hosts = new Set();
  for (const entry of Object.values(sourcesData?.sources || {})) {
    if (entry?.base_url) {
      try {
        hosts.add(new URL(entry.base_url).hostname.replace(/^www\./, '').toLowerCase());
      } catch { /* skip invalid */ }
    }
  }
  return hosts;
}

/**
 * Promote all hosts from a brand resolution into source entries.
 * Returns Map<host, sourceEntry>. Skips hosts already in sourcesData.sources.
 *
 * @param {object|null} brandResolution - { officialDomain, aliases, ... }
 * @param {object} sourcesData - category sources.json data
 * @param {object} [options]
 * @param {string} [options.brandName]
 */
export function promoteFromBrandResolution(brandResolution, sourcesData, options = {}) {
  const promoted = new Map();

  if (!brandResolution?.officialDomain) {
    return promoted;
  }

  const existing = existingSourceHosts(sourcesData);
  const candidates = new Set();

  const official = String(brandResolution.officialDomain).trim().toLowerCase();
  if (official) candidates.add(official);

  if (brandResolution.supportDomain) {
    const support = String(brandResolution.supportDomain).trim().toLowerCase();
    if (support) candidates.add(support);
  }

  for (const host of candidates) {
    if (existing.has(host)) continue;
    if (promoted.has(host)) continue;
    promoted.set(host, promoteManufacturerHost(host, sourcesData, options));
  }

  return promoted;
}
