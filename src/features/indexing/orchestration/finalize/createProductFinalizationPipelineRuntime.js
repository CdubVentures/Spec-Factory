import { runProductFinalizationDerivation } from './runProductFinalizationDerivation.js';
import { buildRunProductFinalizationSummary } from './buildRunProductFinalizationSummary.js';
import { runProductCompletionLifecycle } from './runProductCompletionLifecycle.js';
import { buildProductFinalizationPipelineContracts } from './buildProductFinalizationPipelineContracts.js';

export function createProductFinalizationPipelineRuntime({
  context = {},
  runProductFinalizationDerivationFn = runProductFinalizationDerivation,
  buildRunProductFinalizationSummaryFn = buildRunProductFinalizationSummary,
  runProductCompletionLifecycleFn = runProductCompletionLifecycle,
  buildProductFinalizationPipelineContractsFn = buildProductFinalizationPipelineContracts,
} = {}) {
  const contracts = buildProductFinalizationPipelineContractsFn({ context });

  return {
    contracts,
    deriveFinalization() {
      return runProductFinalizationDerivationFn({
        ...contracts.derivation,
      });
    },
    buildSummary({ finalizationDerivation }) {
      return buildRunProductFinalizationSummaryFn({
        ...contracts.summary,
        gate: finalizationDerivation.gate,
        validatedReason: finalizationDerivation.validatedReason,
        confidence: finalizationDerivation.confidence,
        completenessStats: finalizationDerivation.completenessStats,
        coverageStats: finalizationDerivation.coverageStats,
        allAnchorConflicts: finalizationDerivation.allAnchorConflicts,
        anchorMajorConflictsCount: finalizationDerivation.anchorMajorConflictsCount,
        identityConfidence: finalizationDerivation.identityConfidence,
        identityGate: finalizationDerivation.identityGate,
        extractionGateOpen: finalizationDerivation.extractionGateOpen,
        publishable: finalizationDerivation.publishable,
        publishBlockers: finalizationDerivation.publishBlockers,
        identityReport: finalizationDerivation.identityReport,
        fieldsBelowPassTarget: finalizationDerivation.fieldsBelowPassTarget,
        criticalFieldsBelowPassTarget: finalizationDerivation.criticalFieldsBelowPassTarget,
        newValuesProposed: finalizationDerivation.newValuesProposed,
        provenance: finalizationDerivation.provenance,
        componentPriorFilledFields: finalizationDerivation.componentPriorFilledFields,
        componentPriorMatches: finalizationDerivation.componentPriorMatches,
        criticDecisions: finalizationDerivation.criticDecisions,
        llmValidatorDecisions: finalizationDerivation.llmValidatorDecisions,
        runtimeGateResult: finalizationDerivation.runtimeGateResult,
        curationSuggestionResult: finalizationDerivation.curationSuggestionResult,
        contribution: finalizationDerivation.contribution,
        llmBudgetBlockedReason: finalizationDerivation.llmBudgetBlockedReason,
        aggressiveExtraction: finalizationDerivation.aggressiveExtraction,
        manufacturerSources: finalizationDerivation.manufacturerSources,
        manufacturerMajorConflicts: finalizationDerivation.manufacturerMajorConflicts,
        endpointMining: finalizationDerivation.endpointMining,
        temporalEvidence: finalizationDerivation.temporalEvidence,
        inferenceResult: finalizationDerivation.inferenceResult,
        hypothesisQueue: finalizationDerivation.hypothesisQueue,
        constraintAnalysis: finalizationDerivation.constraintAnalysis,
        fieldReasoning: finalizationDerivation.fieldReasoning,
        trafficLight: finalizationDerivation.trafficLight,
        needSet: finalizationDerivation.needSet,
        phase07PrimeSources: finalizationDerivation.phase07PrimeSources,
        phase08Extraction: finalizationDerivation.phase08Extraction,
        parserHealthRows: finalizationDerivation.parserHealthRows,
        parserHealthAverage: finalizationDerivation.parserHealthAverage,
        fingerprintCount: finalizationDerivation.fingerprintCount,
        durationMs: finalizationDerivation.durationMs,
      });
    },
    runCompletion({ finalizationDerivation, summaryBuildResult }) {
      return runProductCompletionLifecycleFn({
        ...contracts.completion,
        constrainedFinalizationConfig: finalizationDerivation.constrainedFinalizationConfig,
        summary: summaryBuildResult.summary,
        normalized: finalizationDerivation.normalized,
        provenance: finalizationDerivation.provenance,
        needSet: finalizationDerivation.needSet,
        phase08Extraction: finalizationDerivation.phase08Extraction,
        phase07PrimeSources: finalizationDerivation.phase07PrimeSources,
        confidence: finalizationDerivation.confidence,
        llmCallCount: summaryBuildResult.llmCallCount,
        llmCostUsd: summaryBuildResult.llmCostUsd,
        contribution: finalizationDerivation.contribution,
        llmEstimatedUsageCount: summaryBuildResult.llmEstimatedUsageCount,
        llmRetryWithoutSchemaCount: summaryBuildResult.llmRetryWithoutSchemaCount,
        llmBudgetBlockedReason: finalizationDerivation.llmBudgetBlockedReason,
        componentPriorFilledFields: finalizationDerivation.componentPriorFilledFields,
        criticDecisions: finalizationDerivation.criticDecisions,
        llmValidatorDecisions: finalizationDerivation.llmValidatorDecisions,
        trafficLight: finalizationDerivation.trafficLight,
        aggressiveExtraction: finalizationDerivation.aggressiveExtraction,
        durationMs: finalizationDerivation.durationMs,
        identityReport: finalizationDerivation.identityReport,
        sourceIntelBrand:
          contracts.completion.sourceIntelBrand
          || context.job?.identityLock?.brand
          || finalizationDerivation.identity?.brand
          || '',
        constraintAnalysis: finalizationDerivation.constraintAnalysis,
        candidates: finalizationDerivation.candidates,
        runtimeEvidencePack: finalizationDerivation.runtimeEvidencePack,
        fieldReasoning: finalizationDerivation.fieldReasoning,
      });
    },
  };
}
