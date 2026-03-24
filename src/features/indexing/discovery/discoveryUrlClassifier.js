/**
 * Discovery URL Classifier & Admission Gate
 *
 * Extracted from searchDiscovery.js (Phase 3 of structural decomposition).
 * Owns: URL classification, doc-kind guessing, relevance checking,
 * admission exclusion, domain classification seeds.
 * All functions are pure — zero module state, zero side effects.
 */
import {
  normalizeHost,
  slug,
  toArray,
  countTokenHits,
  normalizeIdentityTokens,
} from './discoveryIdentity.js';
import { extractRootDomain } from '../../../utils/common.js';
import {
  inferRoleForHost,
  isApprovedHost,
  resolveTierForHost,
  resolveTierNameForHost,
} from '../../../categories/loader.js';

// ---------------------------------------------------------------------------
// Identity match helpers (re-exported for backward compat)
// ---------------------------------------------------------------------------

export function computeIdentityMatchLevel({ url = '', title = '', snippet = '', identityLock = {} } = {}) {
  const haystack = `${String(url || '')} ${String(title || '')} ${String(snippet || '')}`.toLowerCase();
  const brand = String(identityLock.brand || '').trim().toLowerCase();
  const model = String(identityLock.model || '').trim().toLowerCase();
  const variant = String(identityLock.variant || '').trim().toLowerCase();
  const hasBrand = brand ? haystack.includes(brand) : false;
  const hasModel = model ? haystack.includes(model) : false;
  const hasVariant = variant ? haystack.includes(variant) : false;
  if (hasBrand && hasModel && hasVariant && variant) return 'strong';
  if (hasBrand && hasModel) return 'partial';
  if (hasBrand) return 'weak';
  return 'none';
}

export function detectVariantGuardHit({ title = '', snippet = '', url = '', variantGuardTerms = [], targetVariant = '' } = {}) {
  const haystack = `${String(url || '')} ${String(title || '')} ${String(snippet || '')}`.toLowerCase();
  const target = String(targetVariant || '').trim().toLowerCase();
  for (const term of variantGuardTerms || []) {
    const normalized = String(term || '').trim().toLowerCase();
    if (!normalized) continue;
    if (target && normalized === target) continue;
    if (haystack.includes(normalized)) return true;
  }
  return false;
}

export function detectMultiModelHint({ title = '', snippet = '' } = {}) {
  const text = `${String(title || '')} ${String(snippet || '')}`.toLowerCase();
  return /\bvs\b/.test(text)
    || /\btop\s+\d+\b/.test(text)
    || /\bbest\s+\d*\s*\w*\s*(mice|mouse|keyboards?|headsets?|monitors?)/.test(text)
    || /\bcompar(ison|e|ing)\b/.test(text);
}

// ---------------------------------------------------------------------------
// Video platform detection
// ---------------------------------------------------------------------------

const VIDEO_HOSTS = new Set([
  'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com',
  'twitch.tv', 'tiktok.com', 'rumble.com',
]);

export function isVideoUrl(url = '') {
  try {
    const host = new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '');
    return VIDEO_HOSTS.has(host);
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Doc kind classification
// ---------------------------------------------------------------------------

export function guessDocKind({
  url = '',
  pathname = '',
  title = '',
  snippet = ''
} = {}) {
  if (isVideoUrl(url)) return 'video';

  const pathToken = String(pathname || '').toLowerCase();
  const urlToken = String(url || '').toLowerCase();
  const text = `${String(title || '')} ${String(snippet || '')}`.toLowerCase();

  if (pathToken.endsWith('.pdf') || urlToken.includes('.pdf?')) {
    if (/manual|user guide|owner/.test(text) || /manual|guide|support/.test(pathToken)) {
      return 'manual_pdf';
    }
    return 'spec_pdf';
  }
  if (/teardown|disassembly|internal photos/.test(text) || /teardown|disassembly/.test(pathToken)) {
    return 'teardown_review';
  }
  if (/review|benchmark|latency|measurements|rtings|techpowerup/.test(text) || /review|benchmark/.test(pathToken)) {
    return 'lab_review';
  }
  if (/datasheet/.test(text) || /datasheet|spec|technical/.test(pathToken)) {
    return 'spec';
  }
  if (/support|download|driver|firmware|faq|kb/.test(pathToken) || /support|manual|driver|firmware/.test(text)) {
    return 'support';
  }
  if (/\/product|\/products|\/p\//.test(pathToken)) {
    return 'product_page';
  }
  return 'other';
}

export function normalizeDocHint(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function docHintMatchesDocKind(docHint = '', docKind = '') {
  const hint = normalizeDocHint(docHint);
  const kind = normalizeDocHint(docKind);
  if (!hint || !kind) return false;
  if (hint === kind) return true;
  const matchMap = {
    manual: ['manual_pdf', 'support'],
    manual_pdf: ['manual_pdf'],
    support: ['support', 'manual_pdf'],
    spec: ['spec', 'spec_pdf', 'product_page'],
    spec_pdf: ['spec_pdf', 'manual_pdf'],
    datasheet: ['spec', 'spec_pdf'],
    pdf: ['manual_pdf', 'spec_pdf'],
    teardown: ['teardown_review'],
    teardown_review: ['teardown_review'],
    review: ['lab_review', 'teardown_review'],
    lab_review: ['lab_review', 'teardown_review'],
    benchmark: ['lab_review']
  };
  return (matchMap[hint] || []).includes(kind);
}

// ---------------------------------------------------------------------------
// URL candidate classification
// ---------------------------------------------------------------------------

export function classifyUrlCandidate(result, categoryConfig, { identityLock = {}, variantGuardTerms = [] } = {}) {
  let parsed;
  try { parsed = new URL(result.url); } catch { return null; }
  const host = normalizeHost(parsed.hostname);
  const docKindGuess = guessDocKind({
    url: parsed.toString(),
    pathname: parsed.pathname,
    title: result.title || '',
    snippet: result.snippet || ''
  });
  const resolvedIdentityLock = result._identityLock || identityLock || {};
  const resolvedVariantGuardTerms = result._variantGuardTerms || variantGuardTerms || [];
  const targetVariant = String(identityLock.variant || '').trim();
  return {
    url: parsed.toString(),
    host,
    rootDomain: extractRootDomain(host),
    path: String(parsed.pathname || '/').toLowerCase(),
    title: result.title || '',
    snippet: result.snippet || '',
    query: result.query || '',
    provider: result.provider || result.source || 'plan',
    approvedDomain: isApprovedHost(host, categoryConfig),
    tier: resolveTierForHost(host, categoryConfig),
    tierName: resolveTierNameForHost(host, categoryConfig),
    role: inferRoleForHost(host, categoryConfig),
    doc_kind_guess: docKindGuess,
    identity_match_level: computeIdentityMatchLevel({
      url: parsed.toString(),
      title: result.title || '',
      snippet: result.snippet || '',
      identityLock: resolvedIdentityLock
    }),
    variant_guard_hit: detectVariantGuardHit({
      title: result.title || '',
      snippet: result.snippet || '',
      url: parsed.toString(),
      variantGuardTerms: resolvedVariantGuardTerms,
      targetVariant
    }),
    multi_model_hint: detectMultiModelHint({
      title: result.title || '',
      snippet: result.snippet || ''
    })
  };
}

// ---------------------------------------------------------------------------
// Low-signal path detection
// ---------------------------------------------------------------------------

export function isLowSignalDiscoveryPath(parsed) {
  const host = normalizeHost(parsed?.hostname || '');
  const pathname = String(parsed?.pathname || '').toLowerCase();
  const search = String(parsed?.search || '').toLowerCase();
  const pathAndQuery = `${pathname}${search}`;
  if (!pathAndQuery || pathAndQuery === '/' || pathAndQuery === '/index.html') {
    return true;
  }
  if (
    pathname.endsWith('.xml') ||
    pathname.endsWith('.rss') ||
    pathname.endsWith('.atom') ||
    pathAndQuery.includes('opensearch') ||
    pathAndQuery.includes('latest-rss')
  ) {
    return true;
  }
  if (/\/search(\/|\?|$)/.test(pathAndQuery)) {
    return true;
  }
  // WHY: Catch query-param-based search pages that don't use /search in the path
  if (/[?&](q|query|s|keyword|search|term|searchterm)=/i.test(search)) {
    return true;
  }
  if (host.endsWith('amazon.com')) {
    if ((pathname === '/s' || pathname.startsWith('/s/')) && /(?:^|[?&])k=/.test(search)) {
      return true;
    }
    if (/^\/gp\/search(?:\/|$)/.test(pathname)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Forum / community detection
// ---------------------------------------------------------------------------

export const FORUM_SUBDOMAIN_LABELS = new Set(['community', 'forum', 'forums', 'insider']);

export function isForumLikeManufacturerSubdomain(hostname = '') {
  const host = normalizeHost(hostname);
  const rootDomain = extractRootDomain(host);
  if (!host || !rootDomain || host === rootDomain) {
    return false;
  }
  const suffix = `.${rootDomain}`;
  if (!host.endsWith(suffix)) {
    return false;
  }
  const subdomain = host.slice(0, -suffix.length);
  if (!subdomain) {
    return false;
  }
  return subdomain
    .split('.')
    .map((label) => label.trim().toLowerCase())
    .some((label) => FORUM_SUBDOMAIN_LABELS.has(label));
}

// ---------------------------------------------------------------------------
// Sibling manufacturer product page detection
// ---------------------------------------------------------------------------

export const DISCOVERY_PRODUCT_PATH_IGNORE_TOKENS = new Set([
  'buy',
  'support',
  'manual',
  'download',
  'spec',
  'specs',
  'product',
  'products',
  'gaming',
  'mouse',
  'mice',
  'keyboard',
  'keyboards',
  'headset',
  'headsets',
  'monitor',
  'monitors',
  'base',
  'black',
  'white',
  'wireless',
  'wired',
  'edition',
  'ultralight',
  'lightweight',
  'esports',
  'usb',
  'rgb'
]);

export function resolveProductPathAnchor(pathname = '') {
  const segments = String(pathname || '')
    .split('/')
    .map((segment) => slug(segment))
    .filter(Boolean);
  if (!segments.length) {
    return '';
  }
  const last = segments[segments.length - 1];
  if (DISCOVERY_PRODUCT_PATH_IGNORE_TOKENS.has(last) && segments.length > 1) {
    return `${segments[segments.length - 2]}-${last}`;
  }
  return last;
}

export function buildProductPathTokenSignature(value = '') {
  const alpha = new Set();
  const numeric = new Set();
  for (const part of String(value || '').toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean)) {
    if (DISCOVERY_PRODUCT_PATH_IGNORE_TOKENS.has(part)) {
      continue;
    }
    for (const digits of part.match(/\d+/g) || []) {
      const normalizedDigits = String(Number.parseInt(digits, 10));
      if (normalizedDigits && normalizedDigits !== 'NaN') {
        numeric.add(normalizedDigits);
      }
    }
    if (/^[a-z]+$/.test(part)) {
      alpha.add(part);
      continue;
    }
    const alphaOnly = part.replace(/\d+/g, '');
    if (alphaOnly.length >= 2 && !DISCOVERY_PRODUCT_PATH_IGNORE_TOKENS.has(alphaOnly)) {
      alpha.add(alphaOnly);
    }
  }
  return {
    alpha,
    numeric
  };
}

export function detectSiblingManufacturerProductPage({
  row = {},
  variables = {}
} = {}) {
  const role = String(row?.role || '').trim().toLowerCase();
  if (role !== 'manufacturer') {
    return false;
  }
  const anchor = resolveProductPathAnchor(row?.path || '');
  if (!anchor) {
    return false;
  }
  const targetSignature = buildProductPathTokenSignature([
    variables.model,
    variables.variant
  ].filter(Boolean).join(' '));
  const brandSignature = buildProductPathTokenSignature(variables.brand || '');
  const rowSignature = buildProductPathTokenSignature(anchor);

  if (targetSignature.alpha.size === 0 && targetSignature.numeric.size === 0) {
    return false;
  }

  const hasFamilyOverlap = (
    [...targetSignature.alpha].some((token) => rowSignature.alpha.has(token))
    || [...targetSignature.numeric].some((token) => rowSignature.numeric.has(token))
  );
  if (!hasFamilyOverlap) {
    return false;
  }

  const missingTargetAlpha = [...targetSignature.alpha].filter((token) => !rowSignature.alpha.has(token));
  const missingTargetNumeric = [...targetSignature.numeric].filter((token) => !rowSignature.numeric.has(token));
  const extraAlpha = [...rowSignature.alpha].filter(
    (token) => !targetSignature.alpha.has(token) && !brandSignature.alpha.has(token)
  );
  const extraNumeric = [...rowSignature.numeric].filter((token) => !targetSignature.numeric.has(token));

  return missingTargetAlpha.length > 0
    || missingTargetNumeric.length > 0
    || extraAlpha.length > 0
    || extraNumeric.length > 0;
}

// ---------------------------------------------------------------------------
// Relevance checking
// ---------------------------------------------------------------------------

export function isRelevantSearchResult({
  parsed,
  raw = {},
  classified = {},
  variables = {}
}) {
  // WHY: plan-provider bypass removed — all URLs pass same relevance checks.
  if (String(classified.role || '').toLowerCase() === 'manufacturer') {
    return true;
  }
  if (isLowSignalDiscoveryPath(parsed)) {
    return false;
  }

  const { brandTokens, modelTokens } = normalizeIdentityTokens(variables);
  const haystack = [
    parsed?.hostname || '',
    parsed?.pathname || '',
    parsed?.search || '',
    raw.title || classified.title || '',
    raw.snippet || classified.snippet || '',
    raw.query || classified.query || ''
  ]
    .join(' ')
    .toLowerCase();
  const brandHits = countTokenHits(haystack, brandTokens);
  const modelHits = countTokenHits(haystack, modelTokens);
  const minModelHits = modelTokens.length >= 3 ? 2 : 1;

  if (modelTokens.length > 0) {
    if (modelHits < minModelHits) {
      return false;
    }
    if (brandTokens.length > 0 && brandHits < 1) {
      return false;
    }
    return true;
  }
  if (brandTokens.length > 0 && brandHits < 1) {
    return false;
  }
  return /review|spec|manual|support|product|technical|datasheet|benchmark|latency|sensor|dpi/.test(haystack);
}

// ---------------------------------------------------------------------------
// Domain classification seeds
// ---------------------------------------------------------------------------

export function collectDomainClassificationSeeds({
  searchResultRows = [],
  brandResolution = null,
}) {
  const seeds = new Set(
    searchResultRows
      .map((row) => normalizeHost(row?.host || ''))
      .filter(Boolean)
  );
  if (seeds.size > 0) {
    return [...seeds];
  }

  for (const domain of [
    brandResolution?.officialDomain,
    brandResolution?.supportDomain,
    ...toArray(brandResolution?.aliases),
  ]) {
    const host = normalizeHost(domain || '');
    if (host) seeds.add(host);
  }

  return [...seeds];
}
