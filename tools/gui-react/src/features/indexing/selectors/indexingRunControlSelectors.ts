import { parseRuntimeFloat, parseRuntimeInt } from '../../pipeline-settings/state/runtimeSettingsDomain';
import type { RuntimeSettingsNumericBaseline } from '../../pipeline-settings/state/runtimeSettingsAuthority';
import type { RuntimeResumeMode } from '../../../stores/settingsManifest';

interface DeriveRunControlPayloadInput {
  runtimeSettingsBaseline: RuntimeSettingsNumericBaseline;
  resumeMode: RuntimeResumeMode;
  reextractIndexed: boolean;
  values: Record<string, unknown>;
}

export function deriveRunControlPayload(input: DeriveRunControlPayloadInput) {
  const { runtimeSettingsBaseline, resumeMode, reextractIndexed } = input;
  const clampWithFallback = (parsed: number, fallback: number, min: number, max: number) => {
    const source = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(min, Math.min(max, source));
  };
  const {
    resumeWindowHours,
    reextractAfterHours,
    consensusMethodWeightNetworkJson,
    consensusMethodWeightAdapterApi,
    consensusMethodWeightStructuredMeta,
    consensusMethodWeightPdf,
    consensusMethodWeightTableKv,
    consensusMethodWeightDom,
    consensusMethodWeightLlmExtractBase,
    consensusPolicyBonus,
    consensusWeightedMajorityThreshold,
    consensusStrictAcceptanceDomainCount,
    consensusRelaxedAcceptanceDomainCount,
    consensusInstrumentedFieldThreshold,
    consensusConfidenceScoringBase,
    consensusPassTargetIdentityStrong,
    consensusPassTargetNormal,
    retrievalTierWeightTier1,
    retrievalTierWeightTier2,
    retrievalTierWeightTier3,
    retrievalTierWeightTier4,
    retrievalTierWeightTier5,
    retrievalDocKindWeightManualPdf,
    retrievalDocKindWeightSpecPdf,
    retrievalDocKindWeightSupport,
    retrievalDocKindWeightLabReview,
    retrievalDocKindWeightProductPage,
    retrievalDocKindWeightOther,
    retrievalMethodWeightTable,
    retrievalMethodWeightKv,
    retrievalMethodWeightJsonLd,
    retrievalMethodWeightLlmExtract,
    retrievalMethodWeightHelperSupportive,
    retrievalAnchorScorePerMatch,
    retrievalIdentityScorePerMatch,
    retrievalUnitMatchBonus,
    retrievalDirectFieldMatchBonus,
    identityGateBaseMatchThreshold,
    qualityGateIdentityThreshold,
    evidenceTextMaxChars,
  } = input.values;
  const parsedResumeWindowHours = parseRuntimeInt(resumeWindowHours, runtimeSettingsBaseline.resumeWindowHours);
  const parsedReextractAfterHours = parseRuntimeInt(reextractAfterHours, runtimeSettingsBaseline.reextractAfterHours);
  const parsedConsensusMethodWeightNetworkJson = parseRuntimeFloat(
    consensusMethodWeightNetworkJson,
    runtimeSettingsBaseline.consensusMethodWeightNetworkJson,
  );
  const parsedConsensusMethodWeightAdapterApi = parseRuntimeFloat(
    consensusMethodWeightAdapterApi,
    runtimeSettingsBaseline.consensusMethodWeightAdapterApi,
  );
  const parsedConsensusMethodWeightStructuredMeta = parseRuntimeFloat(
    consensusMethodWeightStructuredMeta,
    runtimeSettingsBaseline.consensusMethodWeightStructuredMeta,
  );
  const parsedConsensusMethodWeightPdf = parseRuntimeFloat(
    consensusMethodWeightPdf,
    runtimeSettingsBaseline.consensusMethodWeightPdf,
  );
  const parsedConsensusMethodWeightTableKv = parseRuntimeFloat(
    consensusMethodWeightTableKv,
    runtimeSettingsBaseline.consensusMethodWeightTableKv,
  );
  const parsedConsensusMethodWeightDom = parseRuntimeFloat(
    consensusMethodWeightDom,
    runtimeSettingsBaseline.consensusMethodWeightDom,
  );
  const parsedConsensusMethodWeightLlmExtractBase = parseRuntimeFloat(
    consensusMethodWeightLlmExtractBase,
    runtimeSettingsBaseline.consensusMethodWeightLlmExtractBase,
  );
  const parsedConsensusPolicyBonus = parseRuntimeFloat(
    consensusPolicyBonus,
    runtimeSettingsBaseline.consensusPolicyBonus,
  );
  const parsedConsensusWeightedMajorityThreshold = parseRuntimeFloat(
    consensusWeightedMajorityThreshold,
    runtimeSettingsBaseline.consensusWeightedMajorityThreshold,
  );
  const parsedConsensusStrictAcceptanceDomainCount = parseRuntimeInt(
    consensusStrictAcceptanceDomainCount,
    runtimeSettingsBaseline.consensusStrictAcceptanceDomainCount,
  );
  const parsedConsensusRelaxedAcceptanceDomainCount = parseRuntimeInt(
    consensusRelaxedAcceptanceDomainCount,
    runtimeSettingsBaseline.consensusRelaxedAcceptanceDomainCount,
  );
  const parsedConsensusInstrumentedFieldThreshold = parseRuntimeInt(
    consensusInstrumentedFieldThreshold,
    runtimeSettingsBaseline.consensusInstrumentedFieldThreshold,
  );
  const parsedConsensusConfidenceScoringBase = parseRuntimeFloat(
    consensusConfidenceScoringBase,
    runtimeSettingsBaseline.consensusConfidenceScoringBase,
  );
  const parsedConsensusPassTargetIdentityStrong = parseRuntimeInt(
    consensusPassTargetIdentityStrong,
    runtimeSettingsBaseline.consensusPassTargetIdentityStrong,
  );
  const parsedConsensusPassTargetNormal = parseRuntimeInt(
    consensusPassTargetNormal,
    runtimeSettingsBaseline.consensusPassTargetNormal,
  );
  const parsedRetrievalTierWeightTier1 = parseRuntimeFloat(
    retrievalTierWeightTier1,
    runtimeSettingsBaseline.retrievalTierWeightTier1,
  );
  const parsedRetrievalTierWeightTier2 = parseRuntimeFloat(
    retrievalTierWeightTier2,
    runtimeSettingsBaseline.retrievalTierWeightTier2,
  );
  const parsedRetrievalTierWeightTier3 = parseRuntimeFloat(
    retrievalTierWeightTier3,
    runtimeSettingsBaseline.retrievalTierWeightTier3,
  );
  const parsedRetrievalTierWeightTier4 = parseRuntimeFloat(
    retrievalTierWeightTier4,
    runtimeSettingsBaseline.retrievalTierWeightTier4,
  );
  const parsedRetrievalTierWeightTier5 = parseRuntimeFloat(
    retrievalTierWeightTier5,
    runtimeSettingsBaseline.retrievalTierWeightTier5,
  );
  const parsedRetrievalDocKindWeightManualPdf = parseRuntimeFloat(
    retrievalDocKindWeightManualPdf,
    runtimeSettingsBaseline.retrievalDocKindWeightManualPdf,
  );
  const parsedRetrievalDocKindWeightSpecPdf = parseRuntimeFloat(
    retrievalDocKindWeightSpecPdf,
    runtimeSettingsBaseline.retrievalDocKindWeightSpecPdf,
  );
  const parsedRetrievalDocKindWeightSupport = parseRuntimeFloat(
    retrievalDocKindWeightSupport,
    runtimeSettingsBaseline.retrievalDocKindWeightSupport,
  );
  const parsedRetrievalDocKindWeightLabReview = parseRuntimeFloat(
    retrievalDocKindWeightLabReview,
    runtimeSettingsBaseline.retrievalDocKindWeightLabReview,
  );
  const parsedRetrievalDocKindWeightProductPage = parseRuntimeFloat(
    retrievalDocKindWeightProductPage,
    runtimeSettingsBaseline.retrievalDocKindWeightProductPage,
  );
  const parsedRetrievalDocKindWeightOther = parseRuntimeFloat(
    retrievalDocKindWeightOther,
    runtimeSettingsBaseline.retrievalDocKindWeightOther,
  );
  const parsedRetrievalMethodWeightTable = parseRuntimeFloat(
    retrievalMethodWeightTable,
    runtimeSettingsBaseline.retrievalMethodWeightTable,
  );
  const parsedRetrievalMethodWeightKv = parseRuntimeFloat(
    retrievalMethodWeightKv,
    runtimeSettingsBaseline.retrievalMethodWeightKv,
  );
  const parsedRetrievalMethodWeightJsonLd = parseRuntimeFloat(
    retrievalMethodWeightJsonLd,
    runtimeSettingsBaseline.retrievalMethodWeightJsonLd,
  );
  const parsedRetrievalMethodWeightLlmExtract = parseRuntimeFloat(
    retrievalMethodWeightLlmExtract,
    runtimeSettingsBaseline.retrievalMethodWeightLlmExtract,
  );
  const parsedRetrievalMethodWeightHelperSupportive = parseRuntimeFloat(
    retrievalMethodWeightHelperSupportive,
    runtimeSettingsBaseline.retrievalMethodWeightHelperSupportive,
  );
  const parsedRetrievalAnchorScorePerMatch = parseRuntimeFloat(
    retrievalAnchorScorePerMatch,
    runtimeSettingsBaseline.retrievalAnchorScorePerMatch,
  );
  const parsedRetrievalIdentityScorePerMatch = parseRuntimeFloat(
    retrievalIdentityScorePerMatch,
    runtimeSettingsBaseline.retrievalIdentityScorePerMatch,
  );
  const parsedRetrievalUnitMatchBonus = parseRuntimeFloat(
    retrievalUnitMatchBonus,
    runtimeSettingsBaseline.retrievalUnitMatchBonus,
  );
  const parsedRetrievalDirectFieldMatchBonus = parseRuntimeFloat(
    retrievalDirectFieldMatchBonus,
    runtimeSettingsBaseline.retrievalDirectFieldMatchBonus,
  );
  const parsedIdentityGateBaseMatchThreshold = parseRuntimeFloat(
    identityGateBaseMatchThreshold,
    runtimeSettingsBaseline.identityGateBaseMatchThreshold,
  );
  const parsedQualityGateIdentityThreshold = parseRuntimeFloat(
    qualityGateIdentityThreshold,
    runtimeSettingsBaseline.qualityGateIdentityThreshold,
  );
  const parsedEvidenceTextMaxChars = parseRuntimeInt(
    evidenceTextMaxChars,
    runtimeSettingsBaseline.evidenceTextMaxChars,
  );
  return {
    resumeMode,
    resumeWindowHours: Number.isFinite(parsedResumeWindowHours) && parsedResumeWindowHours >= 0
      ? parsedResumeWindowHours
      : runtimeSettingsBaseline.resumeWindowHours,
    reextractAfterHours: Number.isFinite(parsedReextractAfterHours) && parsedReextractAfterHours >= 0
      ? parsedReextractAfterHours
      : runtimeSettingsBaseline.reextractAfterHours,
    reextractIndexed,
    consensusMethodWeightNetworkJson: clampWithFallback(
      parsedConsensusMethodWeightNetworkJson,
      runtimeSettingsBaseline.consensusMethodWeightNetworkJson,
      0,
      2,
    ),
    consensusMethodWeightAdapterApi: clampWithFallback(
      parsedConsensusMethodWeightAdapterApi,
      runtimeSettingsBaseline.consensusMethodWeightAdapterApi,
      0,
      2,
    ),
    consensusMethodWeightStructuredMeta: clampWithFallback(
      parsedConsensusMethodWeightStructuredMeta,
      runtimeSettingsBaseline.consensusMethodWeightStructuredMeta,
      0,
      2,
    ),
    consensusMethodWeightPdf: clampWithFallback(
      parsedConsensusMethodWeightPdf,
      runtimeSettingsBaseline.consensusMethodWeightPdf,
      0,
      2,
    ),
    consensusMethodWeightTableKv: clampWithFallback(
      parsedConsensusMethodWeightTableKv,
      runtimeSettingsBaseline.consensusMethodWeightTableKv,
      0,
      2,
    ),
    consensusMethodWeightDom: clampWithFallback(
      parsedConsensusMethodWeightDom,
      runtimeSettingsBaseline.consensusMethodWeightDom,
      0,
      2,
    ),
    consensusMethodWeightLlmExtractBase: clampWithFallback(
      parsedConsensusMethodWeightLlmExtractBase,
      runtimeSettingsBaseline.consensusMethodWeightLlmExtractBase,
      0,
      2,
    ),
    consensusPolicyBonus: clampWithFallback(
      parsedConsensusPolicyBonus,
      runtimeSettingsBaseline.consensusPolicyBonus,
      -5,
      5,
    ),
    consensusWeightedMajorityThreshold: clampWithFallback(
      parsedConsensusWeightedMajorityThreshold,
      runtimeSettingsBaseline.consensusWeightedMajorityThreshold,
      1,
      10,
    ),
    consensusStrictAcceptanceDomainCount: clampWithFallback(
      parsedConsensusStrictAcceptanceDomainCount,
      runtimeSettingsBaseline.consensusStrictAcceptanceDomainCount,
      1,
      50,
    ),
    consensusRelaxedAcceptanceDomainCount: clampWithFallback(
      parsedConsensusRelaxedAcceptanceDomainCount,
      runtimeSettingsBaseline.consensusRelaxedAcceptanceDomainCount,
      1,
      50,
    ),
    consensusInstrumentedFieldThreshold: clampWithFallback(
      parsedConsensusInstrumentedFieldThreshold,
      runtimeSettingsBaseline.consensusInstrumentedFieldThreshold,
      1,
      50,
    ),
    consensusConfidenceScoringBase: clampWithFallback(
      parsedConsensusConfidenceScoringBase,
      runtimeSettingsBaseline.consensusConfidenceScoringBase,
      0,
      1,
    ),
    consensusPassTargetIdentityStrong: clampWithFallback(
      parsedConsensusPassTargetIdentityStrong,
      runtimeSettingsBaseline.consensusPassTargetIdentityStrong,
      1,
      50,
    ),
    consensusPassTargetNormal: clampWithFallback(
      parsedConsensusPassTargetNormal,
      runtimeSettingsBaseline.consensusPassTargetNormal,
      1,
      50,
    ),
    retrievalTierWeightTier1: clampWithFallback(
      parsedRetrievalTierWeightTier1,
      runtimeSettingsBaseline.retrievalTierWeightTier1,
      0,
      10,
    ),
    retrievalTierWeightTier2: clampWithFallback(
      parsedRetrievalTierWeightTier2,
      runtimeSettingsBaseline.retrievalTierWeightTier2,
      0,
      10,
    ),
    retrievalTierWeightTier3: clampWithFallback(
      parsedRetrievalTierWeightTier3,
      runtimeSettingsBaseline.retrievalTierWeightTier3,
      0,
      10,
    ),
    retrievalTierWeightTier4: clampWithFallback(
      parsedRetrievalTierWeightTier4,
      runtimeSettingsBaseline.retrievalTierWeightTier4,
      0,
      10,
    ),
    retrievalTierWeightTier5: clampWithFallback(
      parsedRetrievalTierWeightTier5,
      runtimeSettingsBaseline.retrievalTierWeightTier5,
      0,
      10,
    ),
    retrievalDocKindWeightManualPdf: clampWithFallback(
      parsedRetrievalDocKindWeightManualPdf,
      runtimeSettingsBaseline.retrievalDocKindWeightManualPdf,
      0,
      10,
    ),
    retrievalDocKindWeightSpecPdf: clampWithFallback(
      parsedRetrievalDocKindWeightSpecPdf,
      runtimeSettingsBaseline.retrievalDocKindWeightSpecPdf,
      0,
      10,
    ),
    retrievalDocKindWeightSupport: clampWithFallback(
      parsedRetrievalDocKindWeightSupport,
      runtimeSettingsBaseline.retrievalDocKindWeightSupport,
      0,
      10,
    ),
    retrievalDocKindWeightLabReview: clampWithFallback(
      parsedRetrievalDocKindWeightLabReview,
      runtimeSettingsBaseline.retrievalDocKindWeightLabReview,
      0,
      10,
    ),
    retrievalDocKindWeightProductPage: clampWithFallback(
      parsedRetrievalDocKindWeightProductPage,
      runtimeSettingsBaseline.retrievalDocKindWeightProductPage,
      0,
      10,
    ),
    retrievalDocKindWeightOther: clampWithFallback(
      parsedRetrievalDocKindWeightOther,
      runtimeSettingsBaseline.retrievalDocKindWeightOther,
      0,
      10,
    ),
    retrievalMethodWeightTable: clampWithFallback(
      parsedRetrievalMethodWeightTable,
      runtimeSettingsBaseline.retrievalMethodWeightTable,
      0,
      10,
    ),
    retrievalMethodWeightKv: clampWithFallback(
      parsedRetrievalMethodWeightKv,
      runtimeSettingsBaseline.retrievalMethodWeightKv,
      0,
      10,
    ),
    retrievalMethodWeightJsonLd: clampWithFallback(
      parsedRetrievalMethodWeightJsonLd,
      runtimeSettingsBaseline.retrievalMethodWeightJsonLd,
      0,
      10,
    ),
    retrievalMethodWeightLlmExtract: clampWithFallback(
      parsedRetrievalMethodWeightLlmExtract,
      runtimeSettingsBaseline.retrievalMethodWeightLlmExtract,
      0,
      10,
    ),
    retrievalMethodWeightHelperSupportive: clampWithFallback(
      parsedRetrievalMethodWeightHelperSupportive,
      runtimeSettingsBaseline.retrievalMethodWeightHelperSupportive,
      0,
      10,
    ),
    retrievalAnchorScorePerMatch: clampWithFallback(
      parsedRetrievalAnchorScorePerMatch,
      runtimeSettingsBaseline.retrievalAnchorScorePerMatch,
      0,
      2,
    ),
    retrievalIdentityScorePerMatch: clampWithFallback(
      parsedRetrievalIdentityScorePerMatch,
      runtimeSettingsBaseline.retrievalIdentityScorePerMatch,
      0,
      2,
    ),
    retrievalUnitMatchBonus: clampWithFallback(
      parsedRetrievalUnitMatchBonus,
      runtimeSettingsBaseline.retrievalUnitMatchBonus,
      0,
      2,
    ),
    retrievalDirectFieldMatchBonus: clampWithFallback(
      parsedRetrievalDirectFieldMatchBonus,
      runtimeSettingsBaseline.retrievalDirectFieldMatchBonus,
      0,
      2,
    ),
    identityGateBaseMatchThreshold: clampWithFallback(
      parsedIdentityGateBaseMatchThreshold,
      runtimeSettingsBaseline.identityGateBaseMatchThreshold,
      0,
      1,
    ),
    qualityGateIdentityThreshold: clampWithFallback(
      parsedQualityGateIdentityThreshold,
      runtimeSettingsBaseline.qualityGateIdentityThreshold,
      0,
      1,
    ),
    evidenceTextMaxChars: clampWithFallback(
      parsedEvidenceTextMaxChars,
      runtimeSettingsBaseline.evidenceTextMaxChars,
      200,
      200_000,
    ),
  };
}
