import {
  normalizeIdentityToken,
  ambiguityLevelFromFamilyCount,
  normalizeAmbiguityLevel
} from '../../../../utils/identityNormalize.js';
import { sha256 } from './cryptoHelpers.js';
import { toFloat } from './typeHelpers.js';

export async function resolveIdentityAmbiguitySnapshot({ config, category = '', identityLock = {}, specDb = null, currentModel = '', logger = null } = {}) {
  const brandToken = normalizeIdentityToken(identityLock?.brand);
  const modelToken = normalizeIdentityToken(identityLock?.base_model);
  if (!brandToken || !modelToken) {
    logger?.warn?.('identity_ambiguity_snapshot_missing_identity', {
      category,
      brand: identityLock?.brand,
      base_model: identityLock?.base_model,
    });
    return {
      family_model_count: 0,
      ambiguity_level: 'unknown',
      sibling_models: [],
      source: 'missing_identity'
    };
  }

  try {
    // WHY: SQL is the sole SSOT for products.
    const rows = specDb?.getAllProducts?.() || [];
    const familyRows = rows.filter((row) =>
      normalizeIdentityToken(row?.brand) === brandToken
      && normalizeIdentityToken(row?.base_model) === modelToken
    );
    const safeCount = Math.max(1, familyRows.length);

    // WHY: List sibling model names so prompts can say "this is NOT: X, Y, Z".
    // Excludes the current product's own model name.
    const currentModelToken = normalizeIdentityToken(currentModel);
    const siblingModels = [...new Set(
      familyRows
        .map(r => r.model || '')
        .filter(m => m && normalizeIdentityToken(m) !== currentModelToken)
    )];

    logger?.info?.('identity_ambiguity_snapshot_resolved', {
      category,
      brand: identityLock?.brand,
      base_model: identityLock?.base_model,
      total_rows: rows.length,
      family_rows: familyRows.length,
      sibling_count: siblingModels.length,
      siblings: siblingModels,
      specDb_has_getAllProducts: typeof specDb?.getAllProducts === 'function',
    });

    return {
      family_model_count: safeCount,
      ambiguity_level: ambiguityLevelFromFamilyCount(safeCount),
      sibling_models: siblingModels,
      source: 'specDb'
    };
  } catch (err) {
    // WHY: swallowing this error silently caused the M75 Corsair sibling bug
    // to stay invisible. Always log so audits and oncall can see fallbacks.
    logger?.warn?.('identity_ambiguity_snapshot_failed', {
      category,
      brand: identityLock?.brand,
      base_model: identityLock?.base_model,
      error: err?.message || String(err),
    });
    return {
      family_model_count: 1,
      ambiguity_level: 'easy',
      sibling_models: [],
      source: 'fallback'
    };
  }
}

export function buildRunIdentityFingerprint({ category = '', productId = '', identityLock = {} } = {}) {
  const lockBrand = normalizeIdentityToken(identityLock?.brand);
  const lockModel = normalizeIdentityToken(identityLock?.base_model);
  const lockVariant = normalizeIdentityToken(identityLock?.variant);
  const lockSku = normalizeIdentityToken(identityLock?.sku);
  const seed = [
    normalizeIdentityToken(category),
    normalizeIdentityToken(productId),
    lockBrand,
    lockModel,
    lockVariant,
    lockSku
  ].join('|');
  return `sha256:${sha256(seed)}`;
}

export function bestIdentityFromSources(sourceResults, identityLock = {}) {
  const expectedVariant = normalizeIdentityToken(identityLock?.variant);
  const identityMatched = (sourceResults || []).filter((source) => source.identity?.match);
  const pool = identityMatched.length > 0 ? identityMatched : (sourceResults || []);
  const sorted = [...pool].sort((a, b) => {
    const aMatched = a.identity?.match ? 1 : 0;
    const bMatched = b.identity?.match ? 1 : 0;
    if (bMatched !== aMatched) {
      return bMatched - aMatched;
    }
    if ((b.identity?.score || 0) !== (a.identity?.score || 0)) {
      return (b.identity?.score || 0) - (a.identity?.score || 0);
    }

    const aVariant = normalizeIdentityToken(a.identityCandidates?.variant);
    const bVariant = normalizeIdentityToken(b.identityCandidates?.variant);
    const variantScore = (variant) => {
      if (expectedVariant) {
        if (variant === expectedVariant) {
          return 2;
        }
        if (variant && (variant.includes(expectedVariant) || expectedVariant.includes(variant))) {
          return 1;
        }
        if (!variant) {
          return 0.25;
        }
        return 0;
      }
      return variant ? 0 : 1;
    };
    const aVariantScore = variantScore(aVariant);
    const bVariantScore = variantScore(bVariant);
    if (bVariantScore !== aVariantScore) {
      return bVariantScore - aVariantScore;
    }

    return (a.tier || 99) - (b.tier || 99);
  });
  return sorted[0]?.identityCandidates || {};
}

export function isIdentityLockedField(field) {
  return ['id', 'brand', 'model', 'base_model', 'category', 'sku'].includes(field);
}

export function helperSupportsProvisionalFill(helperContext, identityLock = {}) {
  const topMatch = helperContext?.supportive_matches?.[0] || helperContext?.active_match || null;
  if (!topMatch) {
    return false;
  }

  const expectedBrand = normalizeIdentityToken(identityLock?.brand);
  const expectedModel = normalizeIdentityToken(identityLock?.base_model);
  if (!expectedBrand || !expectedModel) {
    return false;
  }

  const matchBrand = normalizeIdentityToken(topMatch.brand);
  const matchModel = normalizeIdentityToken(topMatch.base_model || topMatch.model);
  if (matchBrand !== expectedBrand || matchModel !== expectedModel) {
    return false;
  }

  const expectedVariant = normalizeIdentityToken(identityLock?.variant);
  if (!expectedVariant) {
    return true;
  }

  const matchVariant = normalizeIdentityToken(topMatch.variant);
  if (!matchVariant) {
    return true;
  }

  return (
    matchVariant === expectedVariant ||
    matchVariant.includes(expectedVariant) ||
    expectedVariant.includes(matchVariant)
  );
}

const IDENTITY_LOCK_THRESHOLD = 0.95;
const IDENTITY_PROVISIONAL_THRESHOLD = 0.70;

export function deriveNeedSetIdentityState({
  identityGate = {},
  identityConfidence = 0,
} = {}) {
  if (identityGate?.validated && Number(identityConfidence || 0) >= IDENTITY_LOCK_THRESHOLD) {
    return 'locked';
  }
  const reasonCodes = Array.isArray(identityGate?.reasonCodes) ? identityGate.reasonCodes : [];
  const hasConflictCode = reasonCodes.some((row) => {
    const token = String(row || '').toLowerCase();
    return token.includes('conflict') || token.includes('mismatch') || token.includes('major_anchor');
  });
  if (hasConflictCode || identityGate?.status === 'IDENTITY_CONFLICT') {
    return 'conflict';
  }
  if (Number(identityConfidence || 0) >= IDENTITY_PROVISIONAL_THRESHOLD) {
    return 'provisional';
  }
  return 'unlocked';
}

export function resolveExtractionGateOpen({
  identityLock = {},
  identityGate = {}
} = {}) {
  if (identityGate?.validated) {
    return true;
  }
  const reasonCodes = Array.isArray(identityGate?.reasonCodes) ? identityGate.reasonCodes : [];
  const hasHardConflict = reasonCodes.some((row) => {
    const token = String(row || '').toLowerCase();
    return token.includes('conflict') || token.includes('mismatch') || token.includes('major_anchor');
  }) || String(identityGate?.status || '').toUpperCase() === 'IDENTITY_CONFLICT';
  if (hasHardConflict) {
    return false;
  }
  const hasVariant = Boolean(normalizeIdentityToken(identityLock?.variant));
  if (hasVariant) {
    return false;
  }
  const familyCount = Math.max(0, Number.parseInt(String(identityLock?.family_model_count || 0), 10) || 0);
  const ambiguityLevel = normalizeAmbiguityLevel(
    identityLock?.ambiguity_level || ambiguityLevelFromFamilyCount(familyCount)
  );
  if (ambiguityLevel === 'hard' || ambiguityLevel === 'very_hard' || ambiguityLevel === 'extra_hard') {
    return false;
  }
  return Boolean(normalizeIdentityToken(identityLock?.brand) && normalizeIdentityToken(identityLock?.base_model));
}

export function buildNeedSetIdentityAuditRows(identityReport = {}, limit = 24) {
  const pages = Array.isArray(identityReport?.pages) ? identityReport.pages : [];
  return pages
    .map((row) => ({
      source_id: String(row?.source_id || '').trim(),
      url: String(row?.url || '').trim(),
      decision: String(row?.decision || '').trim().toUpperCase(),
      confidence: toFloat(row?.confidence, 0),
      reason_codes: Array.isArray(row?.reason_codes) ? row.reason_codes.slice(0, 12) : []
    }))
    .filter((row) => row.source_id || row.url)
    .slice(0, Math.max(1, Number(limit || 24)));
}
