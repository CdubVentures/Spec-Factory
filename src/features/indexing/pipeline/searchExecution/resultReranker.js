import {
  inferRoleForHost,
  isApprovedHost,
  isDeniedHost,
  resolveTierForHost,
  resolveTierNameForHost
} from '../../../../categories/loader.js';
import { extractRootDomain } from '../../../../utils/common.js';
import { normalizeFieldList } from '../../../../utils/fieldKeys.js';

function normalizeHost(value) {
  return String(value || '').toLowerCase().replace(/^www\./, '');
}

function textScore(text, tokens) {
  const haystack = String(text || '').toLowerCase();
  let score = 0;
  for (const token of tokens || []) {
    if (haystack.includes(String(token || '').toLowerCase())) {
      score += 1;
    }
  }
  return score;
}

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function parseCandidateUrl(url) {
  try {
    const parsed = new URL(url);
    return {
      url: parsed.toString(),
      rawHost: String(parsed.hostname || '').toLowerCase(),
      host: normalizeHost(parsed.hostname),
      path: String(parsed.pathname || '/').toLowerCase(),
      query: String(parsed.search || '').toLowerCase()
    };
  } catch {
    return null;
  }
}

const CATEGORY_PRODUCT_PATH_RE = /\/(?:gaming-)?(?:mice|mouse|keyboards?|headsets?|monitors?)\//;
const RETAILER_SEARCH_SURFACE_RE = /(?:\/|^)(?:search|searchpage)(?:[/.]|$)|[?&](?:q|query|st)=/;
const RETAILER_BRAND_SURFACE_RE = /\/(?:site\/)?brands?\//;
const COMPARISON_SURFACE_RE = /\bvs\b|compar(?:e|ison|ing)|top\s+\d+|best\s+\d*\s*(?:gaming\s+)?(?:mice|mouse|keyboards?|headsets?|monitors?)/;
const IDENTITY_SCORE_MAP = Object.freeze({
  strong: 30,
  partial: 22,
  weak: 6,
  none: -10
});

function isRetailerSearchSurface(parsed, row, role) {
  if (role !== 'retailer') {
    return false;
  }
  const text = `${normalizeText(row.title)} ${normalizeText(row.snippet)}`;
  return RETAILER_SEARCH_SURFACE_RE.test(`${parsed.path}${parsed.query}`) || /\bsearch\b/.test(text);
}

function isRetailerBrandSurface(parsed, row, role) {
  if (role !== 'retailer') {
    return false;
  }
  const text = `${normalizeText(row.title)} ${normalizeText(row.snippet)}`;
  return RETAILER_BRAND_SURFACE_RE.test(parsed.path) || /\bbrand\b/.test(text);
}

function isComparisonSurface(parsed, row) {
  return COMPARISON_SURFACE_RE.test(`${parsed.path} ${normalizeText(row.title)} ${normalizeText(row.snippet)}`);
}

function computeScore(row, { categoryConfig, missingFields, fieldYieldMap }) {
  const parsed = parseCandidateUrl(row.url);
  if (!parsed) {
    return Number.NEGATIVE_INFINITY;
  }
  if (isDeniedHost(parsed.host, categoryConfig)) {
    return Number.NEGATIVE_INFINITY;
  }

  const rootDomain = extractRootDomain(parsed.host);
  const provider = String(row.provider || row.source || '').toLowerCase();
  const identityLevel = String(row.identity_match_level || '').toLowerCase();
  let score = 0;
  if (isApprovedHost(parsed.host, categoryConfig)) {
    score += 40;
  }
  const tier = resolveTierForHost(parsed.host, categoryConfig);
  if (tier === 1) score += 50;
  if (tier === 2) score += 35;
  if (tier === 3) score += 20;

  const role = inferRoleForHost(parsed.host, categoryConfig);
  if (role === 'manufacturer') score += 30;
  if (role === 'review') score += 12;
  score += IDENTITY_SCORE_MAP[identityLevel] ?? 0;
  if (role === 'manufacturer') {
    const categoryProductPath = CATEGORY_PRODUCT_PATH_RE.test(parsed.path);
    const rootToken = String(rootDomain || '').split('.')[0].replace(/[^a-z0-9]+/g, '');
    const pathIncludesRootToken = rootToken.length >= 4 && parsed.path.includes(rootToken);
    if (categoryProductPath) {
      score += 24;
      if (pathIncludesRootToken) {
        score += 8;
      }
    } else if (/manual|datasheet|support|spec/.test(parsed.path)) {
      score += 20;
    } else if (/\/products?\//.test(parsed.path)) {
      score += 8;
      if (!pathIncludesRootToken) {
        score -= 4;
      }
    }
  }

  if (/manual|datasheet|spec|support|download|technical/.test(parsed.path)) {
    score += 18;
  }
  if (/manual|datasheet|specification|specs|technical/.test(`${normalizeText(row.title)} ${normalizeText(row.snippet)}`)) {
    score += 8;
  }
  if (parsed.path.endsWith('.pdf')) {
    score += 12;
  }
  if (/forum|community|reddit|news|blog|shop\/c\//.test(parsed.path)) {
    score -= 15;
  }
  if (row.variant_guard_hit) {
    score -= 56;
  }
  if (row.multi_model_hint) {
    score -= 18;
  }
  if (isComparisonSurface(parsed, row)) {
    score -= 10;
  }
  if (isRetailerSearchSurface(parsed, row, role)) {
    score -= 80;
  }
  if (isRetailerBrandSurface(parsed, row, role)) {
    score -= 75;
  }
  if (provider === 'plan') {
    score -= 10;
  }

  const tokenPool = [
    ...(missingFields || []).map((field) => String(field || '').replace(/_/g, ' ')),
    row.title || '',
    row.snippet || ''
  ];
  score += textScore(`${row.title || ''} ${row.snippet || ''} ${parsed.path}`, tokenPool) * 2;

  const domainYield = fieldYieldMap?.by_domain?.[rootDomain];
  if (domainYield) {
    for (const field of missingFields || []) {
      const yieldRow = domainYield.fields?.[field];
      if (!yieldRow) {
        continue;
      }
      score += Math.max(0, Number.parseFloat(String(yieldRow.yield || 0)) * 12);
    }
  }

  return score;
}

export function rerankSearchResults({
  results = [],
  categoryConfig,
  missingFields = [],
  fieldYieldMap = {}
}) {
  const normalizedMissingFields = normalizeFieldList(missingFields, {
    fieldOrder: categoryConfig?.fieldOrder || []
  });
  const rows = [];
  const dedupe = new Set();
  for (const row of results || []) {
    const parsed = parseCandidateUrl(row.url);
    if (!parsed) {
      continue;
    }
    if (dedupe.has(parsed.url)) {
      continue;
    }
    dedupe.add(parsed.url);
    const score = computeScore(row, {
      categoryConfig,
      missingFields: normalizedMissingFields,
      fieldYieldMap
    });
    if (!Number.isFinite(score)) {
      continue;
    }
    rows.push({
      ...row,
      url: parsed.url,
      host: parsed.host,
      rootDomain: extractRootDomain(parsed.host),
      path: parsed.path,
      tier: resolveTierForHost(parsed.host, categoryConfig),
      tier_name: resolveTierNameForHost(parsed.host, categoryConfig),
      role: inferRoleForHost(parsed.host, categoryConfig),
      approved_domain: isApprovedHost(parsed.host, categoryConfig),
      score
    });
  }

  return rows.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}
