/**
 * Stage 06 SERP Triage — Soft Labeler
 *
 * Assigns 5 label dimensions to every candidate. These labels drive lane
 * assignment and scoring but NEVER cause a drop. All existing detection
 * functions are reused via composition — not reimplemented.
 *
 * Label dimensions:
 * 1. identity_prelim   — exact | family | variant | multi_model | uncertain | off_target
 * 2. host_trust_class  — official | support | trusted_review | trusted_specdb | retailer | community | unknown
 * 3. doc_kind_guess    — product_page | support_page | manual_pdf | spec_sheet | review | spec_db | retailer_listing | article | forum | community
 * 4. extraction_surface_prior — network_json | adapter_api | json_ld | embedded_state | html_table | pdf_table | pdf_text | article_text | weak_surface
 * 5. soft_reason_codes — accumulated array of all signals that fired
 */
import {
  computeIdentityMatchLevel,
  detectVariantGuardHit,
  detectMultiModelHint,
  guessDocKind,
  isForumLikeManufacturerSubdomain,
} from './discoveryUrlClassifier.js';
import {
  normalizeHost,
  toArray,
  manufacturerHostHintsForBrand,
  manufacturerHostMatchesBrand,
} from './discoveryIdentity.js';
import {
  inferRoleForHost,
  isApprovedHost,
  resolveTierForHost,
} from '../../../categories/loader.js';
import { extractRootDomain } from '../../../utils/common.js';

// ---------------------------------------------------------------------------
// identity_prelim resolution
// ---------------------------------------------------------------------------

function resolveIdentityPrelim({
  candidate, identityLock, variables, searchProfileBase,
  categoryConfig, manufacturerHostHints,
}) {
  const { url, host, title, snippet } = candidate;

  // Identity match level from existing function
  const matchLevel = computeIdentityMatchLevel({
    url, title, snippet, identityLock,
  });

  // Variant guard check
  const variantGuardHit = detectVariantGuardHit({
    title, snippet, url,
    variantGuardTerms: toArray(searchProfileBase?.variant_guard_terms),
    targetVariant: String(identityLock?.variant || '').trim(),
  });

  // Multi-model detection
  const multiModel = detectMultiModelHint({ title, snippet });

  // Manufacturer brand mismatch (soft, not hard drop)
  const role = inferRoleForHost(host, categoryConfig);
  const brandMismatch = (
    role === 'manufacturer' &&
    manufacturerHostHints.length > 0 &&
    !manufacturerHostMatchesBrand(host, manufacturerHostHints)
  );

  // Resolution order: most specific condition wins.
  // WHY: variant guard and multi_model override identity match because they
  // describe the PAGE TYPE, not the product match quality.
  if (variantGuardHit) return 'variant';
  if (multiModel) return 'multi_model';
  if (brandMismatch) return 'off_target';
  if (matchLevel === 'strong') return 'exact';
  if (matchLevel === 'partial') return 'family';
  if (matchLevel === 'weak') return 'uncertain';
  return 'off_target';
}

// ---------------------------------------------------------------------------
// host_trust_class resolution
// ---------------------------------------------------------------------------

function resolveHostTrustClass({ host, categoryConfig }) {
  const role = inferRoleForHost(host, categoryConfig);
  const tier = resolveTierForHost(host, categoryConfig);
  const approved = isApprovedHost(host, categoryConfig);

  // Community check first (forum subdomain on manufacturer)
  if (isForumLikeManufacturerSubdomain(host)) return 'community';

  // Forum-like host patterns
  const hostLower = String(host || '').toLowerCase();
  if (/^(?:forum|community|discuss|insider)\./.test(hostLower)) return 'community';
  if (/reddit\.com|forums?\.|community\.|discuss\./.test(hostLower)) return 'community';

  if (role === 'manufacturer' && approved) return 'official';
  if (role === 'manufacturer') return 'official';
  if (role === 'review' && (tier === 1 || tier === 2)) return 'trusted_review';
  if (role === 'review') return 'trusted_review';
  if (role === 'retailer') return 'retailer';

  // Spec database heuristic
  if (/techspec|versus|gadgetversus|specsheet|productz|pangoly|nanoreviews/.test(hostLower)) {
    return 'trusted_specdb';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// doc_kind_guess resolution (enhanced from existing guessDocKind)
// ---------------------------------------------------------------------------

function resolveDocKindGuess({ url, host, title, snippet }) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'other';
  }

  // Use existing guessDocKind as base
  const baseKind = guessDocKind({
    url,
    pathname: parsed.pathname,
    title,
    snippet,
  });

  // Map existing kinds to our vocabulary
  const kindMap = {
    manual_pdf: 'manual_pdf',
    spec_pdf: 'spec_sheet',
    teardown_review: 'review',
    lab_review: 'review',
    spec: 'spec_sheet',
    support: 'support_page',
    product_page: 'product_page',
    other: 'other',
  };

  const mapped = kindMap[baseKind] || baseKind;

  // Additional enrichment for unmapped cases
  if (mapped === 'other') {
    const hostLower = String(host || '').toLowerCase();
    const pathLower = String(parsed.pathname || '').toLowerCase();
    const textLower = `${title || ''} ${snippet || ''}`.toLowerCase();

    // Forum/community detection
    if (/reddit\.com|forum|community|discuss/.test(hostLower) || /\/forum|\/community|\/discuss/.test(pathLower)) {
      return 'forum';
    }

    // Retailer listing detection
    if (/amazon\.com|bestbuy\.com|newegg\.com|bhphoto\.com|walmart\.com/.test(hostLower)) {
      return 'retailer_listing';
    }

    // Article detection
    if (/article|blog|news|guide|how.to/.test(pathLower) || /article|blog/.test(textLower)) {
      return 'article';
    }
  }

  return mapped;
}

// ---------------------------------------------------------------------------
// extraction_surface_prior resolution
// ---------------------------------------------------------------------------

function resolveExtractionSurfacePrior({ url, host, docKind }) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'weak_surface';
  }

  const pathLower = String(parsed.pathname || '').toLowerCase();
  const hostLower = String(host || '').toLowerCase();

  // PDF surfaces
  if (pathLower.endsWith('.pdf') || /\.pdf[?#]/.test(pathLower)) {
    if (/table|spec|sheet|data/.test(`${pathLower} ${docKind}`)) return 'pdf_table';
    return 'pdf_text';
  }

  // Forum/community → weak
  if (docKind === 'forum' || docKind === 'community') return 'weak_surface';
  if (/reddit\.com|forum|community/.test(hostLower)) return 'weak_surface';

  // Spec database → html_table
  if (docKind === 'spec_sheet' || docKind === 'spec_db') return 'html_table';
  if (/techspec|versus|pangoly|nanoreviews|specsheet/.test(hostLower)) return 'html_table';

  // Manufacturer product/support pages → json_ld likely
  if (docKind === 'product_page' || docKind === 'support_page') return 'json_ld';

  // Review pages → article_text
  if (docKind === 'review' || docKind === 'lab_review') return 'article_text';

  // Retailer → embedded_state
  if (docKind === 'retailer_listing') return 'embedded_state';

  // Default
  return 'article_text';
}

// ---------------------------------------------------------------------------
// soft_reason_codes accumulation
// ---------------------------------------------------------------------------

function collectSoftReasonCodes({ url, host, identityPrelim, hostTrustClass, docKind }) {
  const codes = [];
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return codes;
  }

  const pathLower = String(parsed.pathname || '').toLowerCase();

  // Path-based soft labels
  if (pathLower === '/' || pathLower === '') codes.push('homepage_like');
  if (pathLower === '/index.html' || pathLower === '/index.htm') codes.push('root_path_only');
  if (pathLower.length <= 2) codes.push('weak_surface');

  // Identity-derived codes
  if (identityPrelim === 'variant') codes.push('variant_guard_hit');
  if (identityPrelim === 'multi_model') codes.push('multi_model_hint');
  if (identityPrelim === 'off_target') codes.push('weak_identity_match');
  if (identityPrelim === 'uncertain') codes.push('weak_identity_match');

  // Host-derived codes
  if (hostTrustClass === 'community') codes.push('community_source');
  if (hostTrustClass === 'official') codes.push('approved_domain');

  // Comparison surface
  if (/\bvs\b|compar(?:e|ison|ing)|top\s+\d+|best\s+\d+/.test(`${parsed.pathname} ${host}`)) {
    codes.push('comparison_surface');
  }

  return codes;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * @param {object} options
 * @param {Array} options.candidates — survivors from hard-drop filter
 * @param {object} options.categoryConfig
 * @param {object} options.identityLock
 * @param {object} options.variables
 * @param {Map} [options.domainSafetyResults]
 * @param {object} [options.brandResolution]
 * @param {object} [options.effectiveHostPlan]
 * @param {object} [options.searchProfileBase]
 * @returns {Array} Same candidates array, mutated with label fields
 */
export function assignSoftLabels({
  candidates,
  categoryConfig,
  identityLock = {},
  variables = {},
  domainSafetyResults = null,
  brandResolution = null,
  effectiveHostPlan = null,
  searchProfileBase = null,
} = {}) {
  if (!candidates || !candidates.length) return candidates || [];

  const manufacturerHostHints = manufacturerHostHintsForBrand(identityLock?.brand || '');

  for (const candidate of candidates) {
    const host = normalizeHost(candidate.host || '');
    const { url, title, snippet } = candidate;

    // 1. identity_prelim
    candidate.identity_prelim = resolveIdentityPrelim({
      candidate,
      identityLock,
      variables,
      searchProfileBase,
      categoryConfig,
      manufacturerHostHints,
    });

    // 2. host_trust_class
    candidate.host_trust_class = resolveHostTrustClass({ host, categoryConfig });

    // 3. doc_kind_guess (enriched)
    candidate.doc_kind_guess = resolveDocKindGuess({ url, host, title, snippet });

    // 4. extraction_surface_prior
    candidate.extraction_surface_prior = resolveExtractionSurfacePrior({
      url, host, docKind: candidate.doc_kind_guess,
    });

    // 5. soft_reason_codes
    candidate.soft_reason_codes = collectSoftReasonCodes({
      url, host,
      identityPrelim: candidate.identity_prelim,
      hostTrustClass: candidate.host_trust_class,
      docKind: candidate.doc_kind_guess,
    });
  }

  return candidates;
}
