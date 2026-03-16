import { buildDedicatedSyntheticSourceIngestionContext } from './buildDedicatedSyntheticSourceIngestionContext.js';
import { runDedicatedSyntheticSourceIngestionPhase } from './runDedicatedSyntheticSourceIngestionPhase.js';
import { buildIdentityConsensusPhaseCallsiteContext } from './buildIdentityConsensusPhaseCallsiteContext.js';
import { buildIdentityConsensusContext } from './buildIdentityConsensusContext.js';
import { buildIdentityNormalizationPhaseCallsiteContext } from './buildIdentityNormalizationPhaseCallsiteContext.js';
import { buildIdentityNormalizationContext } from './buildIdentityNormalizationContext.js';
import { buildValidationGatePhaseCallsiteContext } from './buildValidationGatePhaseCallsiteContext.js';
import { buildValidationGateContext } from './buildValidationGateContext.js';
import { buildConstraintAnalysisPhaseCallsiteContext } from './buildConstraintAnalysisPhaseCallsiteContext.js';
import { buildConstraintAnalysisContext } from './buildConstraintAnalysisContext.js';
import { buildNeedsetReasoningPhaseCallsiteContext } from './buildNeedsetReasoningPhaseCallsiteContext.js';
import { buildNeedsetReasoningContext } from './buildNeedsetReasoningContext.js';
import { buildPhase07PrimeSourcesOptions } from './buildPhase07PrimeSourcesOptions.js';
import { buildPhase07PrimeSourcesPhaseCallsiteContext } from './buildPhase07PrimeSourcesPhaseCallsiteContext.js';
import { buildPhase07PrimeSourcesContext } from './buildPhase07PrimeSourcesContext.js';
import { buildPhase08ExtractionPhaseCallsiteContext } from './buildPhase08ExtractionPhaseCallsiteContext.js';
import { buildPhase08ExtractionContext } from './buildPhase08ExtractionContext.js';
import { buildFinalizationMetricsPhaseCallsiteContext } from './buildFinalizationMetricsPhaseCallsiteContext.js';
import { buildFinalizationMetricsContext } from './buildFinalizationMetricsContext.js';
import { buildCortexSidecarPhaseCallsiteContext } from './buildCortexSidecarPhaseCallsiteContext.js';
import { buildCortexSidecarContext } from './buildCortexSidecarContext.js';
import { applyRuntimeGateAndCuration } from '../quality/applyRuntimeGateAndCuration.js';
import { runComponentPriorPhase } from '../quality/runComponentPriorPhase.js';
import { runAggressiveExtractionPhase } from '../quality/runAggressiveExtractionPhase.js';
import { runInferencePolicyPhase } from '../quality/runInferencePolicyPhase.js';
import { runDeterministicCriticPhase } from '../quality/runDeterministicCriticPhase.js';
import { runLlmValidatorPhase } from '../quality/runLlmValidatorPhase.js';
import { PASS_TARGET_EXEMPT_FIELDS } from '../shared/scoringHelpers.js';
import { selectAggressiveEvidencePack } from '../shared/evidenceHelpers.js';

export function createProductFinalizationDerivationRuntime({
  context = {},
  buildCandidateFieldMapFn = (payload) => payload,
  evaluateAnchorConflictsFn = (payload) => payload,
  evaluateSourceIdentityFn = (payload) => payload,
  evaluateIdentityGateFn = (payload) => payload,
  buildIdentityReportFn = (payload) => payload,
  bestIdentityFromSourcesFn = (payload) => payload,
  buildIdentityObjectFn = (payload) => payload,
  buildSourceSummaryFn = (payload) => payload,
  mergeAnchorConflictListsFn = (payload) => payload,
  executeConsensusPhaseFn = (payload) => payload,
  buildAbortedNormalizedFn = (payload) => payload,
  buildValidatedNormalizedFn = (payload) => payload,
  createEmptyProvenanceFn = (payload) => payload,
  selectAggressiveEvidencePackFn = selectAggressiveEvidencePack,
  aggregateTemporalSignalsFn = (payload) => payload,
  applyInferencePoliciesFn = (payload) => payload,
  passTargetExemptFields = PASS_TARGET_EXEMPT_FIELDS,
  aggregateEndpointSignalsFn = (payload) => payload,
  evaluateConstraintGraphFn = (payload) => payload,
  buildDedicatedSyntheticSourceIngestionContextFn = buildDedicatedSyntheticSourceIngestionContext,
  runDedicatedSyntheticSourceIngestionPhaseFn = runDedicatedSyntheticSourceIngestionPhase,
  buildIdentityConsensusPhaseCallsiteContextFn = buildIdentityConsensusPhaseCallsiteContext,
  buildIdentityConsensusContextFn = buildIdentityConsensusContext,
  buildIdentityNormalizationPhaseCallsiteContextFn = buildIdentityNormalizationPhaseCallsiteContext,
  buildIdentityNormalizationContextFn = buildIdentityNormalizationContext,
  runComponentPriorPhaseFn = runComponentPriorPhase,
  runDeterministicCriticPhaseFn = runDeterministicCriticPhase,
  runLlmValidatorPhaseFn = runLlmValidatorPhase,
  runInferencePolicyPhaseFn = runInferencePolicyPhase,
  runAggressiveExtractionPhaseFn = runAggressiveExtractionPhase,
  applyRuntimeGateAndCurationFn = applyRuntimeGateAndCuration,
  buildValidationGatePhaseCallsiteContextFn = buildValidationGatePhaseCallsiteContext,
  buildValidationGateContextFn = buildValidationGateContext,
  buildConstraintAnalysisPhaseCallsiteContextFn = buildConstraintAnalysisPhaseCallsiteContext,
  buildConstraintAnalysisContextFn = buildConstraintAnalysisContext,
  buildNeedsetReasoningPhaseCallsiteContextFn = buildNeedsetReasoningPhaseCallsiteContext,
  buildNeedsetReasoningContextFn = buildNeedsetReasoningContext,
  buildPhase07PrimeSourcesOptionsFn = buildPhase07PrimeSourcesOptions,
  buildPhase07PrimeSourcesPhaseCallsiteContextFn = buildPhase07PrimeSourcesPhaseCallsiteContext,
  buildPhase07PrimeSourcesContextFn = buildPhase07PrimeSourcesContext,
  buildPhase08ExtractionPhaseCallsiteContextFn = buildPhase08ExtractionPhaseCallsiteContext,
  buildPhase08ExtractionContextFn = buildPhase08ExtractionContext,
  buildFinalizationMetricsPhaseCallsiteContextFn = buildFinalizationMetricsPhaseCallsiteContext,
  buildFinalizationMetricsContextFn = buildFinalizationMetricsContext,
  buildCortexSidecarPhaseCallsiteContextFn = buildCortexSidecarPhaseCallsiteContext,
  buildCortexSidecarContextFn = buildCortexSidecarContext,
} = {}) {
  return {
    async runDedicatedSyntheticSourceIngestion() {
      await runDedicatedSyntheticSourceIngestionPhaseFn({
        ...buildDedicatedSyntheticSourceIngestionContextFn({
          adapterManager: context.adapterManager,
          job: context.job,
          runId: context.runId,
          storage: context.storage,
          helperSupportiveSyntheticSources: context.helperSupportiveSyntheticSources,
          adapterArtifacts: context.adapterArtifacts,
          sourceResults: context.sourceResults,
          anchors: context.anchors,
          config: context.config,
          buildCandidateFieldMap: buildCandidateFieldMapFn,
          evaluateAnchorConflicts: evaluateAnchorConflictsFn,
          evaluateSourceIdentity: evaluateSourceIdentityFn,
        }),
      });
    },
    buildIdentityConsensus() {
      return buildIdentityConsensusContextFn({
        ...buildIdentityConsensusPhaseCallsiteContextFn({
          sourceResults: context.sourceResults,
          productId: context.productId,
          runId: context.runId,
          job: context.job,
          categoryConfig: context.categoryConfig,
          fieldOrder: context.fieldOrder,
          anchors: context.anchors,
          category: context.category,
          config: context.config,
          runtimeFieldRulesEngine: context.runtimeFieldRulesEngine,
          evaluateIdentityGateFn,
          buildIdentityReportFn,
          bestIdentityFromSourcesFn,
          buildIdentityObjectFn,
          buildSourceSummaryFn,
          mergeAnchorConflictListsFn,
          executeConsensusPhaseFn,
        }),
      });
    },
    buildIdentityNormalization({
      identityConfidence,
      identity,
      sourceSummary,
      consensus,
    }) {
      return buildIdentityNormalizationContextFn({
        ...buildIdentityNormalizationPhaseCallsiteContextFn({
          config: context.config,
          identityConfidence,
          allowHelperProvisionalFill: false,
          productId: context.productId,
          runId: context.runId,
          category: context.category,
          identity,
          sourceSummary,
          fieldOrder: context.fieldOrder,
          consensus,
          categoryConfig: context.categoryConfig,
          buildAbortedNormalizedFn,
          buildValidatedNormalizedFn,
          createEmptyProvenanceFn,
          passTargetExemptFields,
        }),
      });
    },
    runComponentPrior({
      identityGate,
      normalized,
      provenance,
      fieldsBelowPassTarget,
      criticalFieldsBelowPassTarget,
    }) {
      return runComponentPriorPhaseFn({
        identityGate,
        storage: context.storage,
        normalized,
        provenance,
        fieldOrder: context.fieldOrder,
        logger: context.logger,
        fieldsBelowPassTarget,
        criticalFieldsBelowPassTarget,
      });
    },
    runDeterministicCritic({
      normalized,
      provenance,
      fieldsBelowPassTarget,
      criticalFieldsBelowPassTarget,
    }) {
      return runDeterministicCriticPhaseFn({
        normalized,
        provenance,
        categoryConfig: context.categoryConfig,
        learnedConstraints: context.learnedConstraints,
        fieldsBelowPassTarget,
        criticalFieldsBelowPassTarget,
      });
    },
    async runLlmValidator({
      skipExpensiveFinalization,
      normalized,
      provenance,
      criticDecisions,
      identityProvisional,
      fieldsBelowPassTarget,
      criticalFieldsBelowPassTarget,
      llmValidatorDecisions,
    }) {
      if (skipExpensiveFinalization) {
        return {
          llmValidatorDecisions,
          fieldsBelowPassTarget,
          criticalFieldsBelowPassTarget,
        };
      }

      return runLlmValidatorPhaseFn({
        config: context.config,
        job: context.job,
        normalized,
        provenance,
        categoryConfig: context.categoryConfig,
        learnedConstraints: context.learnedConstraints,
        fieldOrder: context.fieldOrder,
        logger: context.logger,
        llmContext: context.llmContext,
        criticDecisions,
        identityProvisional,
        fieldsBelowPassTarget,
        criticalFieldsBelowPassTarget,
        llmValidatorDecisions,
      });
    },
    runInferencePolicy({
      normalized,
      provenance,
      fieldsBelowPassTarget,
      criticalFieldsBelowPassTarget,
    }) {
      return runInferencePolicyPhaseFn({
        sourceResults: context.sourceResults,
        categoryConfig: context.categoryConfig,
        normalized,
        provenance,
        logger: context.logger,
        fieldsBelowPassTarget,
        criticalFieldsBelowPassTarget,
        aggregateTemporalSignalsFn,
        applyInferencePoliciesFn,
      });
    },
    selectRuntimeEvidencePack() {
      return selectAggressiveEvidencePackFn(context.sourceResults) || null;
    },
    async runAggressiveExtraction({
      skipExpensiveFinalization,
      identity,
      normalized,
      provenance,
      runtimeEvidencePack,
      fieldsBelowPassTarget,
      criticalFieldsBelowPassTarget,
    }) {
      if (skipExpensiveFinalization) {
        return {
          aggressiveExtraction: null,
          fieldsBelowPassTarget,
          criticalFieldsBelowPassTarget,
        };
      }

      return runAggressiveExtractionPhaseFn({
        config: context.config,
        roundContext: context.roundContext,
        storage: context.storage,
        logger: context.logger,
        category: context.category,
        productId: context.productId,
        runId: context.runId,
        identity,
        normalized,
        provenance,
        fieldOrder: context.fieldOrder,
        categoryConfig: context.categoryConfig,
        discoveryResult: context.discoveryResult,
        sourceResults: context.sourceResults,
        artifactsByHost: context.artifactsByHost,
        runtimeEvidencePack,
        fieldsBelowPassTarget,
        criticalFieldsBelowPassTarget,
      });
    },
    applyRuntimeGateAndCuration({
      normalizedFields,
      provenance,
      runtimeEvidencePack,
      fieldsBelowPassTarget,
      criticalFieldsBelowPassTarget,
    }) {
      return applyRuntimeGateAndCurationFn({
        config: context.config,
        runtimeFieldRulesEngine: context.runtimeFieldRulesEngine,
        normalizedFields,
        provenance,
        fieldOrder: context.fieldOrder,
        runtimeEvidencePack,
        fieldsBelowPassTarget,
        criticalFieldsBelowPassTarget,
        criticalFieldSet: context.categoryConfig.criticalFieldSet,
        category: context.category,
        productId: context.productId,
        runId: context.runId,
        logger: context.logger,
      });
    },
    buildValidationGate({
      normalized,
      provenance,
      allAnchorConflicts,
      consensus,
      identityGate,
      identityConfidence,
      anchorMajorConflictsCount,
      criticalFieldsBelowPassTarget,
      identityFull,
      identityPublishThreshold,
      computeCompletenessRequiredFn,
      computeCoverageOverallFn,
      computeConfidenceFn,
      evaluateValidationGateFn,
    }) {
      return buildValidationGateContextFn({
        ...buildValidationGatePhaseCallsiteContextFn({
          normalized,
          requiredFields: context.requiredFields,
          fieldOrder: context.fieldOrder,
          categoryConfig: context.categoryConfig,
          identityConfidence,
          provenance,
          allAnchorConflicts,
          consensus,
          identityGate,
          config: context.config,
          targets: context.targets,
          anchorMajorConflictsCount,
          criticalFieldsBelowPassTarget,
          identityFull,
          identityPublishThreshold,
          computeCompletenessRequiredFn,
          computeCoverageOverallFn,
          computeConfidenceFn,
          evaluateValidationGateFn,
        }),
      });
    },
    buildConstraintAnalysis({
      runtimeGateResult,
      normalized,
      provenance,
    }) {
      return buildConstraintAnalysisContextFn({
        ...buildConstraintAnalysisPhaseCallsiteContextFn({
          sourceResults: context.sourceResults,
          runtimeGateResult,
          normalized,
          provenance,
          categoryConfig: context.categoryConfig,
          aggregateEndpointSignalsFn,
          evaluateConstraintGraphFn,
        }),
      });
    },
    buildNeedsetReasoning({
      provenance,
      constraintAnalysis,
      criticalFieldsBelowPassTarget,
      completenessStats,
      identity,
      fieldsBelowPassTarget,
      identityGate,
      identityConfidence,
      publishable,
      publishBlockers,
      identityReport,
    }) {
      return buildNeedsetReasoningContextFn({
        ...buildNeedsetReasoningPhaseCallsiteContextFn({
          runId: context.runId,
          category: context.category,
          productId: context.productId,
          config: context.config,
          fieldOrder: context.fieldOrder,
          provenance,
          sourceResults: context.sourceResults,
          constraintAnalysis,
          criticalFieldsBelowPassTarget,
          completenessStats,
          sourceIntel: context.sourceIntel,
          job: context.job,
          identity,
          categoryConfig: context.categoryConfig,
          llmBudgetGuard: context.llmBudgetGuard,
          fieldsBelowPassTarget,
          identityGate,
          identityConfidence,
          identityLock: context.identityLock,
          publishable,
          publishBlockers,
          identityReport,
          learnedFieldAvailability: context.learnedFieldAvailability,
          learnedFieldYield: context.learnedFieldYield,
          discoveryResult: context.discoveryResult,
        }),
      });
    },
    buildPhase07PrimeSources({
      needSet,
      provenance,
      identity,
    }) {
      const phase07Options = buildPhase07PrimeSourcesOptionsFn({
        config: context.config,
      });

      return buildPhase07PrimeSourcesContextFn({
        ...buildPhase07PrimeSourcesPhaseCallsiteContextFn({
          runId: context.runId,
          category: context.category,
          productId: context.productId,
          needSet,
          provenance,
          sourceResults: context.sourceResults,
          categoryConfig: context.categoryConfig,
          job: context.job,
          identity,
          config: context.config,
          phase07Options,
        }),
      });
    },
    buildPhase08Extraction({ llmValidatorDecisions }) {
      return buildPhase08ExtractionContextFn({
        ...buildPhase08ExtractionPhaseCallsiteContextFn({
          runId: context.runId,
          category: context.category,
          productId: context.productId,
          phase08BatchRows: context.phase08BatchRows,
          phase08FieldContexts: context.phase08FieldContexts,
          phase08PrimeRows: context.phase08PrimeRows,
          llmValidatorDecisions,
        }),
      });
    },
    buildFinalizationMetrics({ normalized, provenance }) {
      return buildFinalizationMetricsContextFn({
        ...buildFinalizationMetricsPhaseCallsiteContextFn({
          sourceResults: context.sourceResults,
          fieldOrder: context.fieldOrder,
          normalized,
          provenance,
        }),
      });
    },
    buildCortexSidecar({
      constrainedFinalizationConfig,
      confidence,
      criticalFieldsBelowPassTarget,
      anchorMajorConflictsCount,
      constraintAnalysis,
      completenessStats,
    }) {
      return buildCortexSidecarContextFn({
        ...buildCortexSidecarPhaseCallsiteContextFn({
          config: constrainedFinalizationConfig,
          confidence,
          criticalFieldsBelowPassTarget,
          anchorMajorConflictsCount,
          constraintAnalysis,
          completenessStats,
          logger: context.logger,
        }),
      });
    },
  };
}
