import { buildPhase07PrimeSources } from '../../../../retrieve/primeSourcesBuilder.js';
import { createFtsQueryFn } from '../../../../retrieve/ftsQueryAdapter.js';

export function buildPhase07PrimeSourcesContext({
  runId,
  category,
  productId,
  needSet,
  provenance,
  sourceResults,
  categoryConfig = {},
  job = {},
  identity = {},
  config = {},
  phase07Options = null,
  createFtsQueryFnArg = createFtsQueryFn,
  buildPhase07PrimeSourcesFn = buildPhase07PrimeSources,
} = {}) {
  const ftsQueryFn = config.evidenceIndexDb
    ? createFtsQueryFnArg({ db: config.evidenceIndexDb, category, productId })
    : null;
  const resolvedPhase07Options = phase07Options || {
    maxHitsPerField: config.retrievalMaxHitsPerField || 24,
    maxPrimeSourcesPerField: config.retrievalMaxPrimeSources || 8,
    identityFilterEnabled: Boolean(config.retrievalIdentityFilterEnabled),
    retrievalTierWeightTier1: config.retrievalTierWeightTier1,
    retrievalTierWeightTier2: config.retrievalTierWeightTier2,
    retrievalTierWeightTier3: config.retrievalTierWeightTier3,
    retrievalTierWeightTier4: config.retrievalTierWeightTier4,
    retrievalTierWeightTier5: config.retrievalTierWeightTier5,
    retrievalDocKindWeightManualPdf: config.retrievalDocKindWeightManualPdf,
    retrievalDocKindWeightSpecPdf: config.retrievalDocKindWeightSpecPdf,
    retrievalDocKindWeightSupport: config.retrievalDocKindWeightSupport,
    retrievalDocKindWeightLabReview: config.retrievalDocKindWeightLabReview,
    retrievalDocKindWeightProductPage: config.retrievalDocKindWeightProductPage,
    retrievalDocKindWeightOther: config.retrievalDocKindWeightOther,
    retrievalMethodWeightTable: config.retrievalMethodWeightTable,
    retrievalMethodWeightKv: config.retrievalMethodWeightKv,
    retrievalMethodWeightJsonLd: config.retrievalMethodWeightJsonLd,
    retrievalMethodWeightLlmExtract: config.retrievalMethodWeightLlmExtract,
    retrievalMethodWeightHelperSupportive: config.retrievalMethodWeightHelperSupportive,
    retrievalAnchorScorePerMatch: config.retrievalAnchorScorePerMatch,
    retrievalIdentityScorePerMatch: config.retrievalIdentityScorePerMatch,
    retrievalUnitMatchBonus: config.retrievalUnitMatchBonus,
    retrievalDirectFieldMatchBonus: config.retrievalDirectFieldMatchBonus,
    retrievalEvidenceTierWeightMultiplier: config.retrievalEvidenceTierWeightMultiplier,
    retrievalEvidenceDocWeightMultiplier: config.retrievalEvidenceDocWeightMultiplier,
    retrievalEvidenceMethodWeightMultiplier: config.retrievalEvidenceMethodWeightMultiplier,
    retrievalEvidencePoolMaxRows: config.retrievalEvidencePoolMaxRows,
    retrievalSnippetsPerSourceCap: config.retrievalSnippetsPerSourceCap,
    retrievalMaxHitsCap: config.retrievalMaxHitsCap,
    retrievalEvidenceRefsLimit: config.retrievalEvidenceRefsLimit,
    retrievalReasonBadgesLimit: config.retrievalReasonBadgesLimit,
    retrievalAnchorsLimit: config.retrievalAnchorsLimit,
    retrievalPrimeSourcesMaxCap: config.retrievalPrimeSourcesMaxCap,
    retrievalFallbackEvidenceMaxRows: config.retrievalFallbackEvidenceMaxRows,
    retrievalProvenanceOnlyMinRows: config.retrievalProvenanceOnlyMinRows,
    retrievalInternalsMapJson: config.retrievalInternalsMapJson,
    fetchSchedulerInternalsMapJson: config.fetchSchedulerInternalsMapJson,
    evidencePackLimitsMapJson: config.evidencePackLimitsMapJson,
    parsingConfidenceBaseMapJson: config.parsingConfidenceBaseMapJson,
    repairDedupeRule: config.repairDedupeRule,
    consensusMethodWeightLlmExtractBase: config.consensusMethodWeightLlmExtractBase,
  };
  const phase07PrimeSources = buildPhase07PrimeSourcesFn({
    runId,
    category,
    productId,
    needSet,
    provenance,
    sourceResults,
    fieldRules: categoryConfig.fieldRules || {},
    identity: {
      brand: job.identityLock?.brand || identity.brand || '',
      model: job.identityLock?.model || identity.model || '',
      variant: job.identityLock?.variant || identity.variant || '',
      sku: job.identityLock?.sku || identity.sku || '',
    },
    options: resolvedPhase07Options,
    ftsQueryFn,
  });

  return {
    ftsQueryFn,
    phase07PrimeSources,
  };
}
