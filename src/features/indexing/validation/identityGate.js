import { normalizeAlphanumToken } from '../../../shared/primitives.js';
import {
  tokenize,
  includesAllTokens,
  tokenOverlapScore,
  minNumericDelta,
  hasAllExpectedNumericFragments,
  str,
  detectConnectionClass,
  firstKnownClass,
  unique,
  expectedRequiredTokens,
  expectedNegativeTokens,
  detectUnexpectedVariantTokens,
  buildSourceTokenSet,
  scoreDecisionBand,
  gateStatusFromIdentityResult,
} from './identityGatePrimitives.js';
import { buildIdentityCriticalContradictions } from './identityGateConflicts.js';
import {
  canonicalSourceId,
  summarizeIdentitySourceSnake,
  buildAcceptedSourceRows,
  buildRejectedSiblingSourceRows,
  buildAcceptedConflictContributorRows,
  buildFirstConflictTrigger,
} from './identityGateReporting.js';

export { buildIdentityCriticalContradictions } from './identityGateConflicts.js';

function likelyProductSpecificSource(source) {
  const rawUrl = String(source?.url || '');
  const url = rawUrl.toLowerCase();
  try {
    const parsed = new URL(rawUrl);
    const path = parsed.pathname.toLowerCase();
    const query = parsed.search.toLowerCase();
    const categoryHubSignals = [
      '/products/gaming-mice',
      '/products/mice',
      '/shop/c/',
      '/search',
      '/sitemap',
      '/robots.txt'
    ];
    if (categoryHubSignals.some((token) => path.includes(token))) {
      return false;
    }
    if (query.includes('q=') || query.includes('query=')) {
      return false;
    }
  } catch {
    // continue with heuristic fallback
  }

  const title = normalizeAlphanumToken(source?.title || '');
  const signals = [
    '/product',
    '/products/',
    '/support/',
    '/manual',
    '/spec',
    '/download'
  ];
  if (signals.some((signal) => url.includes(signal))) {
    return true;
  }
  return title.includes('spec') || title.includes('support') || title.includes('manual');
}

export function evaluateSourceIdentity(source, identityLock = {}, thresholdConfig = null) {
  const baseThreshold = (thresholdConfig && typeof thresholdConfig === 'object')
    ? Number(thresholdConfig.identityGateBaseMatchThreshold) || 0.8
    : 0.8;
  const candidate = source.identityCandidates || {};
  const reasons = [];
  const criticalConflicts = [];
  const reasonCodes = [];
  let score = 0;

  const expectedBrand = str(identityLock.brand);
  const expectedModel = str(identityLock.base_model || identityLock.model);
  const expectedVariant = str(identityLock.variant);
  const expectedSku = str(identityLock.sku);
  const expectedMpn = str(identityLock.mpn);
  const expectedGtin = str(identityLock.gtin);

  const candidateBrandToken = normalizeAlphanumToken(candidate.brand);
  const candidateModelToken = normalizeAlphanumToken(candidate.model);
  const candidateVariantToken = normalizeAlphanumToken(candidate.variant || source.connectionHint || '');
  const requiredTokens = expectedRequiredTokens(identityLock);
  const negativeTokens = expectedNegativeTokens(identityLock);
  const unexpectedVariantTokens = detectUnexpectedVariantTokens({
    expectedModel,
    expectedVariant,
    candidateVariant: candidate.variant,
    candidateModel: candidate.model,
    sourceTitle: source.title,
    sourceUrl: source.url,
  });
  const sourceTokenSet = buildSourceTokenSet(source, candidate);

  if (expectedBrand) {
    const brandTokens = tokenize(expectedBrand);
    const titleToken = normalizeAlphanumToken(source.title || '');
    const urlToken = normalizeAlphanumToken(source.url || '');
    if (
      includesAllTokens(candidateBrandToken, brandTokens) ||
      includesAllTokens(candidateModelToken, brandTokens) ||
      includesAllTokens(titleToken, brandTokens) ||
      includesAllTokens(urlToken, brandTokens)
    ) {
      score += 0.35;
      reasons.push('brand_match');
      reasonCodes.push('brand_match');
    } else if (candidateBrandToken) {
      criticalConflicts.push('brand_mismatch');
      reasonCodes.push('brand_mismatch');
    }
  } else {
    score += 0.1;
  }

  if (expectedModel) {
    const modelTokens = tokenize(expectedModel);
    const titleToken = normalizeAlphanumToken(source.title || '');
    const urlToken = normalizeAlphanumToken(source.url || '');
    const candidateModelOverlap = tokenOverlapScore(modelTokens, candidateModelToken, 0.1);
    const titleOverlap = tokenOverlapScore(modelTokens, titleToken, 0.1);
    const urlOverlap = tokenOverlapScore(modelTokens, urlToken, 0.1);
    const bestModelOverlap = Math.max(candidateModelOverlap, titleOverlap, urlOverlap);
    const modelNumericDelta = minNumericDelta(expectedModel, [
      candidate.model,
      source.title,
      source.url
    ]);
    const hasExpectedModelDigits = hasAllExpectedNumericFragments(expectedModel, [
      candidate.model,
      source.title,
      source.url
    ]);
    const numericRangeThreshold = 3;
    const numericRangeOutOfRange = modelNumericDelta !== null && modelNumericDelta > numericRangeThreshold;
    const missingExpectedModelDigits = !hasExpectedModelDigits;

    if (
      includesAllTokens(candidateModelToken, modelTokens) ||
      includesAllTokens(titleToken, modelTokens) ||
      includesAllTokens(urlToken, modelTokens) ||
      bestModelOverlap >= 0.72 ||
      (
        bestModelOverlap >= 0.55 &&
        modelTokens.some((token) => /^\d+$/.test(token)) &&
        (
          candidateModelToken.includes(modelTokens.find((token) => /^\d+$/.test(token)) || '') ||
          titleToken.includes(modelTokens.find((token) => /^\d+$/.test(token)) || '') ||
          urlToken.includes(modelTokens.find((token) => /^\d+$/.test(token)) || '')
        )
      )
    ) {
      score += 0.35;
      reasons.push('model_match');
      reasonCodes.push('model_match');
    } else if (candidateModelToken && likelyProductSpecificSource(source)) {
      criticalConflicts.push('model_mismatch');
      reasonCodes.push('model_mismatch');
    }
    if (missingExpectedModelDigits || numericRangeOutOfRange) {
      reasonCodes.push('model_numeric_range_out_of_range');
      score = Math.max(0, score - 0.1);
      if (likelyProductSpecificSource(source)) {
        criticalConflicts.push('model_numeric_range_out_of_range');
      }
    }
  } else {
    score += 0.1;
  }

  if (expectedVariant) {
    const expectedClass = detectConnectionClass(expectedVariant);
    const candidateClass = firstKnownClass(
      detectConnectionClass(candidateVariantToken),
      detectConnectionClass(source.connectionHint)
    );

    if (expectedClass === 'unk') {
      if (normalizeAlphanumToken(expectedVariant) && normalizeAlphanumToken(expectedVariant) === candidateVariantToken) {
        score += 0.15;
        reasons.push('variant_match');
        reasonCodes.push('variant_match');
      }
    } else if (candidateClass === expectedClass || candidateClass === 'dual') {
      score += 0.15;
      reasons.push('variant_match');
      reasonCodes.push('variant_match');
    } else if (candidateClass !== 'unk') {
      criticalConflicts.push('variant_mismatch');
      reasonCodes.push('variant_mismatch');
    }
  } else {
    score += 0.05;
  }

  const idMatches = [];
  const hardIdMatches = {};
  const hardIdMismatches = [];
  if (expectedSku) {
    if (normalizeAlphanumToken(expectedSku) === normalizeAlphanumToken(candidate.sku)) {
      idMatches.push('sku');
      hardIdMatches.sku = expectedSku;
    } else if (candidate.sku) {
      criticalConflicts.push('sku_mismatch');
      hardIdMismatches.push('sku_mismatch');
      reasonCodes.push('sku_mismatch');
    }
  }
  if (expectedMpn) {
    if (normalizeAlphanumToken(expectedMpn) === normalizeAlphanumToken(candidate.mpn)) {
      idMatches.push('mpn');
      hardIdMatches.mpn = expectedMpn;
    } else if (candidate.mpn) {
      criticalConflicts.push('mpn_mismatch');
      hardIdMismatches.push('mpn_mismatch');
      reasonCodes.push('mpn_mismatch');
    }
  }
  if (expectedGtin) {
    if (normalizeAlphanumToken(expectedGtin) === normalizeAlphanumToken(candidate.gtin)) {
      idMatches.push('gtin');
      hardIdMatches.gtin = expectedGtin;
    } else if (candidate.gtin) {
      criticalConflicts.push('gtin_mismatch');
      hardIdMismatches.push('gtin_mismatch');
      reasonCodes.push('gtin_mismatch');
    }
  }

  if (idMatches.length > 0) {
    score += 0.15;
    reasons.push('hard_id_match');
    reasonCodes.push('hard_id_match');
    for (const id of idMatches) {
      const code = `${id}_match`;
      reasons.push(code);
      reasonCodes.push(code);
    }
  }

  score = Math.max(0, Math.min(1, score));
  const matchThreshold = baseThreshold;
  const matchedRequiredTokens = requiredTokens.filter((token) => sourceTokenSet.has(token));
  const missingRequiredTokens = requiredTokens.filter((token) => !sourceTokenSet.has(token));
  const matchedNegativeTokens = unique([
    ...negativeTokens.filter((token) => sourceTokenSet.has(token)),
    ...unexpectedVariantTokens
  ]);
  if (matchedNegativeTokens.length > 0) {
    reasonCodes.push('negative_token_present');
    criticalConflicts.push('negative_token_present');
  }
  if (unexpectedVariantTokens.length > 0) {
    reasonCodes.push('unexpected_variant_token');
  }
  if (missingRequiredTokens.length > 0 && requiredTokens.length > 0) {
    reasonCodes.push('missing_required_tokens');
  }
  if (hardIdMismatches.length > 0) {
    reasonCodes.push('hard_id_mismatch');
  }

  const hasHardIdMatch = idMatches.length > 0;
  const hasHardIdMismatch = hardIdMismatches.length > 0;
  const hasCriticalConflicts = criticalConflicts.length > 0;
  const match = score >= matchThreshold && !hasCriticalConflicts;

  let decision = scoreDecisionBand(score);
  if (hasHardIdMismatch || matchedNegativeTokens.length > 0) {
    decision = 'REJECTED';
  } else if (hasHardIdMatch) {
    decision = 'CONFIRMED';
  } else if (hasCriticalConflicts) {
    decision = 'REJECTED';
  } else if (match) {
    decision = 'CONFIRMED';
  }

  let confidence = score;
  if (hasHardIdMatch && !hasHardIdMismatch) {
    confidence = 1;
  }
  if (decision === 'REJECTED') {
    confidence = Math.min(confidence, 0.39);
  }
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    match,
    score,
    confidence,
    decision,
    matchThreshold,
    reasons: unique(reasons),
    reasonCodes: unique(reasonCodes),
    criticalConflicts: unique(criticalConflicts),
    matchedHardIds: hardIdMatches,
    matchedRequiredTokens: unique(matchedRequiredTokens),
    missingRequiredTokens: unique(missingRequiredTokens),
    matchedNegativeTokens: unique(matchedNegativeTokens)
  };
}

export function evaluateIdentityGate(sourceResults) {
  const accepted = sourceResults.filter(
    (s) =>
      !s.discoveryOnly &&
      s.identity?.match &&
      (s.anchorCheck?.majorConflicts || []).length === 0 &&
      s.approvedDomain
  );

  const manufacturer = accepted.find(
    (s) => s.role === 'manufacturer' && s.tier === 1 && s.approvedDomain
  );
  const helperAccepted = accepted.filter((s) =>
    s.helperSource ||
    String(s.host || '').toLowerCase() === 'helper-files.local' ||
    String(s.url || '').startsWith('category_authority://')
  );
  const credibleAdditionalDomains = new Set(
    accepted
      .filter((s) => s.tier <= 2 && s.approvedDomain)
      .filter((s) => !manufacturer || s.rootDomain !== manufacturer.rootDomain)
      .map((s) => s.rootDomain)
  );

  const directContradictions = sourceResults
    .filter((s) => !s.discoveryOnly)
    .filter((s) => (s.identity?.criticalConflicts || []).length > 0)
    .filter((s) =>
      (s.identity?.score || 0) >= 0.45 ||
      (s.identity?.reasons || []).includes('model_match') ||
      (
        (s.identity?.reasons || []).includes('brand_match') &&
        (s.identity?.reasons || []).includes('variant_match') &&
        likelyProductSpecificSource(s)
      )
    )
    .flatMap((s) =>
      (s.identity?.criticalConflicts || []).map((conflict) => ({
        source: s.url,
        conflict
      }))
  );
  const crossSourceContradictions = buildIdentityCriticalContradictions(sourceResults);
  const contradictions = [...directContradictions, ...crossSourceContradictions];
  const acceptedExactMatchSources = buildAcceptedSourceRows(accepted, sourceResults);
  const acceptedConflictContributors = buildAcceptedConflictContributorRows(
    sourceResults,
    accepted,
    contradictions,
  );
  const rejectedSiblingSources = buildRejectedSiblingSourceRows(sourceResults);
  const firstConflictTrigger = buildFirstConflictTrigger(sourceResults, accepted, contradictions);

  const majorAnchors = sourceResults.flatMap((s) =>
    (s.anchorCheck?.majorConflicts || []).map((c) => ({
      source: s.url,
      ...c
    }))
  );

  const hasManufacturer = Boolean(manufacturer);
  const hasTrustedHelper = helperAccepted.length > 0;
  const hasAdditional =
    credibleAdditionalDomains.size >= 2 ||
    (hasTrustedHelper && credibleAdditionalDomains.size >= 1);
  const noContradictions = contradictions.length === 0;
  const noMajorAnchorConflicts = majorAnchors.length === 0;

  const labDomains = new Set(
    accepted
      .filter((s) => s.tier === 1 && s.approvedDomain)
      .map((s) => s.rootDomain)
  );
  const hasLabConsensus = labDomains.size >= 2;
  const hasManufacturerOrLabConsensus = hasManufacturer || hasLabConsensus;

  const validated = hasManufacturerOrLabConsensus && hasAdditional && noContradictions && noMajorAnchorConflicts;
  const reasonCodes = [];
  if (!hasManufacturerOrLabConsensus) {
    reasonCodes.push('missing_manufacturer_confirmation');
  }
  if (!hasAdditional) {
    reasonCodes.push('missing_additional_credible_sources');
  }
  if (!noContradictions) {
    reasonCodes.push('identity_conflict');
  }
  if (!noMajorAnchorConflicts) {
    reasonCodes.push('major_anchor_conflict');
  }

  let certainty = 0.4;
  if (hasManufacturer) certainty += 0.25;
  else if (hasLabConsensus) certainty += 0.20;
  if (hasAdditional) certainty += 0.2;
  if (hasTrustedHelper) certainty += 0.05;
  if (noContradictions) certainty += 0.1;
  if (noMajorAnchorConflicts) certainty += 0.1;
  if (accepted.length >= 3) certainty += 0.05;
  certainty = Math.max(0, Math.min(1, certainty));

  if (validated) {
    certainty = Math.max(certainty, 0.95);
  }

  let status = 'CONFIRMED';
  if (!validated) {
    if (!noContradictions || !noMajorAnchorConflicts) {
      status = 'IDENTITY_CONFLICT';
    } else if (accepted.length === 0) {
      status = 'IDENTITY_FAILED';
    } else {
      status = 'LOW_CONFIDENCE';
    }
  }

  let reason = 'OK';
  if (!validated) {
    reason = 'MODEL_AMBIGUITY_ALERT';
    reasonCodes.push('model_ambiguity_alert');
  }

  const needsReview = status !== 'CONFIRMED';
  if (certainty < 0.70) {
    reasonCodes.push('certainty_below_publish_threshold');
  }

  return {
    validated,
    reason,
    status,
    needsReview,
    certainty,
    reasonCodes: unique(reasonCodes),
    requirements: {
      hasManufacturer,
      hasLabConsensus,
      hasTrustedHelper,
      additionalCredibleSources: credibleAdditionalDomains.size,
      noContradictions,
      noMajorAnchorConflicts
    },
    contradictions,
    acceptedExactMatchSources,
    acceptedConflictContributors,
    rejectedSiblingSources,
    firstConflictTrigger,
    majorAnchors,
    manufacturerSource: manufacturer?.url || null,
    acceptedSourceCount: accepted.length
  };
}

export function buildIdentityReport({
  productId,
  runId,
  sourceResults = [],
  identityGate = null
}) {
  const reconciliation = identityGate || evaluateIdentityGate(sourceResults);
  const pages = (sourceResults || [])
    .filter((source) => !source.discoveryOnly)
    .map((source, index) => {
      const identity = source.identity || {};
      const decision = gateStatusFromIdentityResult(identity);
      const reasonCodes = unique([
        ...(identity.reasonCodes || []),
        ...(identity.reasons || []),
        ...(identity.criticalConflicts || []),
        ...(source.anchorCheck?.majorConflicts || []).map(() => 'major_anchor_conflict')
      ]);
      const confidence = Number.parseFloat(String(identity.confidence ?? identity.score ?? 0)) || 0;

      return {
        source_id: canonicalSourceId(source, index),
        url: source.finalUrl || source.url || '',
        decision,
        confidence: Number.parseFloat(confidence.toFixed(6)),
        matched_hard_ids: identity.matchedHardIds || {},
        matched_required_tokens: identity.matchedRequiredTokens || [],
        matched_negative_tokens: identity.matchedNegativeTokens || [],
        reason_codes: reasonCodes
      };
    });

  const decisionCounts = pages.reduce((acc, page) => {
    acc[page.decision] = (acc[page.decision] || 0) + 1;
    return acc;
  }, {});

  return {
    product_id: String(productId || ''),
    run_id: String(runId || ''),
    pages,
    status: reconciliation.status || 'IDENTITY_FAILED',
    needs_review: Boolean(reconciliation.needsReview),
    reason_codes: reconciliation.reasonCodes || [],
    contradiction_count: Array.isArray(reconciliation.contradictions)
      ? reconciliation.contradictions.length
      : 0,
    contradictions: Array.isArray(reconciliation.contradictions)
      ? reconciliation.contradictions.map((row) => ({
          source: String(row?.source || '').trim(),
          conflict: String(row?.conflict || '').trim(),
          ...(row?._dim_values ? { _dim_values: row._dim_values } : {}),
        }))
      : [],
    accepted_exact_match_sources: Array.isArray(reconciliation.acceptedExactMatchSources)
      ? reconciliation.acceptedExactMatchSources.map((row) => summarizeIdentitySourceSnake({}, 0, {
          source_id: row.sourceId,
          url: row.url,
          host: row.host,
          root_domain: row.rootDomain,
          role: row.role,
          tier: row.tier,
          candidate_brand: row.candidateBrand,
          candidate_model: row.candidateModel,
          identity_score: row.identityScore,
          identity_confidence: row.identityConfidence,
          reason_codes: row.reasonCodes,
        }))
      : [],
    accepted_conflict_contributors: Array.isArray(reconciliation.acceptedConflictContributors)
      ? reconciliation.acceptedConflictContributors.map((row) => ({
          source_id: row.sourceId,
          url: row.url,
          host: row.host,
          root_domain: row.rootDomain,
          role: row.role,
          tier: row.tier,
          candidate_brand: row.candidateBrand,
          candidate_model: row.candidateModel,
          identity_score: row.identityScore,
          identity_confidence: row.identityConfidence,
          reason_codes: row.reasonCodes,
          contributing_conflicts: Array.isArray(row.contributingConflicts)
            ? row.contributingConflicts
            : [],
        }))
      : [],
    rejected_sibling_sources: Array.isArray(reconciliation.rejectedSiblingSources)
      ? reconciliation.rejectedSiblingSources.map((row) => ({
          source_id: row.sourceId,
          url: row.url,
          host: row.host,
          root_domain: row.rootDomain,
          role: row.role,
          tier: row.tier,
          candidate_brand: row.candidateBrand,
          candidate_model: row.candidateModel,
          identity_score: row.identityScore,
          identity_confidence: row.identityConfidence,
          reason_codes: row.reasonCodes,
        }))
      : [],
    first_conflict_trigger: reconciliation.firstConflictTrigger
      ? {
          source: String(reconciliation.firstConflictTrigger.source || '').trim(),
          conflict: String(reconciliation.firstConflictTrigger.conflict || '').trim(),
          contributors: Array.isArray(reconciliation.firstConflictTrigger.contributors)
            ? reconciliation.firstConflictTrigger.contributors.map((row) => ({
                source_id: row.sourceId,
                url: row.url,
                host: row.host,
                root_domain: row.rootDomain,
                role: row.role,
                tier: row.tier,
                candidate_brand: row.candidateBrand,
                candidate_model: row.candidateModel,
                identity_score: row.identityScore,
                identity_confidence: row.identityConfidence,
                reason_codes: row.reasonCodes,
              }))
            : [],
        }
      : null,
    summary: {
      page_count: pages.length,
      confirmed_count: decisionCounts.CONFIRMED || 0,
      warning_count: decisionCounts.WARNING || 0,
      quarantine_count: decisionCounts.QUARANTINE || 0,
      rejected_count: decisionCounts.REJECTED || 0
    }
  };
}
