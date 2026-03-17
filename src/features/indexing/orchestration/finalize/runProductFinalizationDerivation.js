import { createProductFinalizationDerivationRuntime } from './createProductFinalizationDerivationRuntime.js';
import { enrichNeedSetFieldHistories } from './enrichNeedSetFieldHistories.js';

export async function runProductFinalizationDerivation({
  adapterManager,
  job = {},
  runId = '',
  storage,
  helperSupportiveSyntheticSources = [],
  adapterArtifacts = {},
  sourceResults = [],
  anchors = {},
  config = {},
  productId = '',
  categoryConfig = {},
  fieldOrder = [],
  category = '',
  runtimeFieldRulesEngine = null,
  terminalReason = '',
  learnedConstraints = {},
  logger,
  llmContext,
  roundContext = {},
  discoveryResult = {},
  artifactsByHost = {},
  requiredFields = [],
  targets = {},
  startMs = 0,
  nowFn = () => Date.now(),
  sourceIntel = {},
  identityLock = {},
  learnedFieldAvailability = {},
  learnedFieldYield = {},
  llmBudgetGuard,
  phase08BatchRows = [],
  phase08FieldContexts = {},
  phase08PrimeRows = [],
  llmValidatorDecisions = {},
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
  selectAggressiveEvidencePackFn,
  aggregateTemporalSignalsFn = (payload) => payload,
  applyInferencePoliciesFn = (payload) => payload,
  computeCompletenessRequiredFn = (payload) => payload,
  computeCoverageOverallFn = (payload) => payload,
  computeConfidenceFn = (payload) => payload,
  evaluateValidationGateFn = (payload) => payload,
  aggregateEndpointSignalsFn = (payload) => payload,
  evaluateConstraintGraphFn = (payload) => payload,
  passTargetExemptFields,
  buildDedicatedSyntheticSourceIngestionContextFn,
  runDedicatedSyntheticSourceIngestionPhaseFn,
  buildIdentityConsensusPhaseCallsiteContextFn,
  buildIdentityConsensusContextFn,
  buildIdentityNormalizationPhaseCallsiteContextFn,
  buildIdentityNormalizationContextFn,
  runComponentPriorPhaseFn,
  runDeterministicCriticPhaseFn,
  runLlmValidatorPhaseFn,
  runInferencePolicyPhaseFn,
  runAggressiveExtractionPhaseFn,
  applyRuntimeGateAndCurationFn,
  buildValidationGatePhaseCallsiteContextFn,
  buildValidationGateContextFn,
  buildConstraintAnalysisPhaseCallsiteContextFn,
  buildConstraintAnalysisContextFn,
  buildNeedsetReasoningPhaseCallsiteContextFn,
  buildNeedsetReasoningContextFn,
  buildPhase07PrimeSourcesOptionsFn,
  buildPhase07PrimeSourcesPhaseCallsiteContextFn,
  buildPhase07PrimeSourcesContextFn,
  buildPhase08ExtractionPhaseCallsiteContextFn,
  buildPhase08ExtractionContextFn,
  buildFinalizationMetricsPhaseCallsiteContextFn,
  buildFinalizationMetricsContextFn,
  buildCortexSidecarPhaseCallsiteContextFn,
  buildCortexSidecarContextFn,
  finalizationDerivationRuntime = null,
  createProductFinalizationDerivationRuntimeFn = createProductFinalizationDerivationRuntime,
} = {}) {
  const resolvedFinalizationDerivationRuntime =
    finalizationDerivationRuntime || createProductFinalizationDerivationRuntimeFn({
      context: {
        adapterManager,
        job,
        runId,
        storage,
        helperSupportiveSyntheticSources,
        adapterArtifacts,
        sourceResults,
        anchors,
        config,
        productId,
        categoryConfig,
        fieldOrder,
        category,
        runtimeFieldRulesEngine,
        learnedConstraints,
        logger,
        llmContext,
        roundContext,
        discoveryResult,
        artifactsByHost,
        requiredFields,
        targets,
        sourceIntel,
        identityLock,
        learnedFieldAvailability,
        learnedFieldYield,
        llmBudgetGuard,
        phase08BatchRows,
        phase08FieldContexts,
        phase08PrimeRows,
        llmValidatorDecisions,
      },
      buildCandidateFieldMapFn,
      evaluateAnchorConflictsFn,
      evaluateSourceIdentityFn,
      evaluateIdentityGateFn,
      buildIdentityReportFn,
      bestIdentityFromSourcesFn,
      buildIdentityObjectFn,
      buildSourceSummaryFn,
      mergeAnchorConflictListsFn,
      executeConsensusPhaseFn,
      buildAbortedNormalizedFn,
      buildValidatedNormalizedFn,
      createEmptyProvenanceFn,
      selectAggressiveEvidencePackFn,
      aggregateTemporalSignalsFn,
      applyInferencePoliciesFn,
      passTargetExemptFields,
      aggregateEndpointSignalsFn,
      evaluateConstraintGraphFn,
      buildDedicatedSyntheticSourceIngestionContextFn,
      runDedicatedSyntheticSourceIngestionPhaseFn,
      buildIdentityConsensusPhaseCallsiteContextFn,
      buildIdentityConsensusContextFn,
      buildIdentityNormalizationPhaseCallsiteContextFn,
      buildIdentityNormalizationContextFn,
      runComponentPriorPhaseFn,
      runDeterministicCriticPhaseFn,
      runLlmValidatorPhaseFn,
      runInferencePolicyPhaseFn,
      runAggressiveExtractionPhaseFn,
      applyRuntimeGateAndCurationFn,
      buildValidationGatePhaseCallsiteContextFn,
      buildValidationGateContextFn,
      buildConstraintAnalysisPhaseCallsiteContextFn,
      buildConstraintAnalysisContextFn,
      buildNeedsetReasoningPhaseCallsiteContextFn,
      buildNeedsetReasoningContextFn,
      buildPhase07PrimeSourcesOptionsFn,
      buildPhase07PrimeSourcesPhaseCallsiteContextFn,
      buildPhase07PrimeSourcesContextFn,
      buildPhase08ExtractionPhaseCallsiteContextFn,
      buildPhase08ExtractionContextFn,
      buildFinalizationMetricsPhaseCallsiteContextFn,
      buildFinalizationMetricsContextFn,
      buildCortexSidecarPhaseCallsiteContextFn,
      buildCortexSidecarContextFn,
    });

  await resolvedFinalizationDerivationRuntime.runDedicatedSyntheticSourceIngestion();

  const identityConsensusContext = resolvedFinalizationDerivationRuntime.buildIdentityConsensus();
  const identityGate = identityConsensusContext.identityGate;
  const identityConfidence = identityConsensusContext.identityConfidence;
  const identityReport = identityConsensusContext.identityReport;
  const identity = identityConsensusContext.identity;
  const sourceSummary = identityConsensusContext.sourceSummary;
  const allAnchorConflicts = identityConsensusContext.allAnchorConflicts;
  const anchorMajorConflictsCount = identityConsensusContext.anchorMajorConflictsCount;
  const consensus = identityConsensusContext.consensus;

  const identityNormalizationContext =
    resolvedFinalizationDerivationRuntime.buildIdentityNormalization({
      identityConfidence,
      identity,
      sourceSummary,
      consensus,
    });
  const identityPublishThreshold = identityNormalizationContext.identityPublishThreshold;
  const identityProvisional = identityNormalizationContext.identityProvisional;
  const identityFull = identityNormalizationContext.identityFull;
  const normalized = identityNormalizationContext.normalized;
  const provenance = identityNormalizationContext.provenance;
  const candidates = identityNormalizationContext.candidates;
  let fieldsBelowPassTarget = identityNormalizationContext.fieldsBelowPassTarget;
  let criticalFieldsBelowPassTarget =
    identityNormalizationContext.criticalFieldsBelowPassTarget;
  const newValuesProposed = identityNormalizationContext.newValuesProposed;
  const skipExpensiveFinalization = terminalReason === 'max_run_seconds_reached';
  const constrainedFinalizationConfig = skipExpensiveFinalization
    ? {
        ...config,
        llmWriteSummary: false,
        cortexEnabled: false,
      }
    : config;

  const componentPriorPhase =
    await resolvedFinalizationDerivationRuntime.runComponentPrior({
      identityGate,
      normalized,
      provenance,
      fieldsBelowPassTarget,
      criticalFieldsBelowPassTarget,
    });
  const componentPriorFilledFields = componentPriorPhase.componentPriorFilledFields;
  const componentPriorMatches = componentPriorPhase.componentPriorMatches;
  fieldsBelowPassTarget = componentPriorPhase.fieldsBelowPassTarget;
  criticalFieldsBelowPassTarget = componentPriorPhase.criticalFieldsBelowPassTarget;

  const deterministicCriticPhase =
    resolvedFinalizationDerivationRuntime.runDeterministicCritic({
      normalized,
      provenance,
      fieldsBelowPassTarget,
      criticalFieldsBelowPassTarget,
    });
  const criticDecisions = deterministicCriticPhase.criticDecisions;
  fieldsBelowPassTarget = deterministicCriticPhase.fieldsBelowPassTarget;
  criticalFieldsBelowPassTarget = deterministicCriticPhase.criticalFieldsBelowPassTarget;

  const llmValidatorPhase = await resolvedFinalizationDerivationRuntime.runLlmValidator({
    skipExpensiveFinalization,
    normalized,
    provenance,
    criticDecisions,
    identityProvisional,
    fieldsBelowPassTarget,
    criticalFieldsBelowPassTarget,
    llmValidatorDecisions,
  });
  const nextLlmValidatorDecisions = llmValidatorPhase.llmValidatorDecisions;
  fieldsBelowPassTarget = llmValidatorPhase.fieldsBelowPassTarget;
  criticalFieldsBelowPassTarget = llmValidatorPhase.criticalFieldsBelowPassTarget;

  const inferencePolicyPhase =
    resolvedFinalizationDerivationRuntime.runInferencePolicy({
      normalized,
      provenance,
      fieldsBelowPassTarget,
      criticalFieldsBelowPassTarget,
    });
  const temporalEvidence = inferencePolicyPhase.temporalEvidence;
  const inferenceResult = inferencePolicyPhase.inferenceResult;
  fieldsBelowPassTarget = inferencePolicyPhase.fieldsBelowPassTarget;
  criticalFieldsBelowPassTarget = inferencePolicyPhase.criticalFieldsBelowPassTarget;

  const runtimeEvidencePack =
    resolvedFinalizationDerivationRuntime.selectRuntimeEvidencePack();
  const aggressiveExtractionPhase =
    await resolvedFinalizationDerivationRuntime.runAggressiveExtraction({
      skipExpensiveFinalization,
      identity,
      normalized,
      provenance,
      runtimeEvidencePack,
      fieldsBelowPassTarget,
      criticalFieldsBelowPassTarget,
    });
  const aggressiveExtraction = aggressiveExtractionPhase.aggressiveExtraction;
  fieldsBelowPassTarget = aggressiveExtractionPhase.fieldsBelowPassTarget;
  criticalFieldsBelowPassTarget = aggressiveExtractionPhase.criticalFieldsBelowPassTarget;

  const runtimeGateOutcome =
    await resolvedFinalizationDerivationRuntime.applyRuntimeGateAndCuration({
      normalizedFields: normalized.fields,
      provenance,
      runtimeEvidencePack,
      fieldsBelowPassTarget,
      criticalFieldsBelowPassTarget,
    });
  const runtimeGateResult = runtimeGateOutcome.runtimeGateResult;
  normalized.fields = runtimeGateOutcome.normalizedFields;
  fieldsBelowPassTarget = runtimeGateOutcome.fieldsBelowPassTarget;
  criticalFieldsBelowPassTarget = runtimeGateOutcome.criticalFieldsBelowPassTarget;
  const curationSuggestionResult = runtimeGateOutcome.curationSuggestionResult;

  const validationGateContext =
    resolvedFinalizationDerivationRuntime.buildValidationGate({
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
    });
  const completenessStats = validationGateContext.completenessStats;
  const coverageStats = validationGateContext.coverageStats;
  const confidence = validationGateContext.confidence;
  const gate = validationGateContext.gate;
  const publishable = validationGateContext.publishable;
  const publishBlockers = validationGateContext.publishBlockers;

  const durationMs = nowFn() - startMs;
  const validatedReason = gate.validatedReason;
  const constraintAnalysisContext =
    resolvedFinalizationDerivationRuntime.buildConstraintAnalysis({
      runtimeGateResult,
      normalized,
      provenance,
    });
  const manufacturerSources = constraintAnalysisContext.manufacturerSources;
  const manufacturerMajorConflicts =
    constraintAnalysisContext.manufacturerMajorConflicts;
  const endpointMining = constraintAnalysisContext.endpointMining;
  const constraintAnalysis = constraintAnalysisContext.constraintAnalysis;

  const needsetReasoningContext =
    resolvedFinalizationDerivationRuntime.buildNeedsetReasoning({
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
    });
  const hypothesisQueue = needsetReasoningContext.hypothesisQueue;
  const fieldReasoning = needsetReasoningContext.fieldReasoning;
  const trafficLight = needsetReasoningContext.trafficLight;
  const llmBudgetBlockedReason = needsetReasoningContext.llmBudgetBlockedReason;
  const extractionGateOpen = needsetReasoningContext.extractionGateOpen;
  const needSet = needsetReasoningContext.needSet;

  // WHY: Use the seed-phase schema4 from discovery — the needset planner fires
  // once at run start, not during finalization. Finalization derives from prior data.
  const searchPlanOutput = discoveryResult?.seed_search_plan_output || null;
  const seedBundles = searchPlanOutput?.panel?.bundles || [];
  const seedHasQueries = seedBundles.some((b) => b.queries?.length > 0);
  if (searchPlanOutput?.panel && seedHasQueries) {
    needSet.bundles = seedBundles;
    needSet.profile_influence = searchPlanOutput.panel.profile_influence;
    needSet.deltas = searchPlanOutput.panel.deltas;
    needSet.round = searchPlanOutput.panel.round ?? 0;
    needSet.round_mode = searchPlanOutput.panel.round_mode ?? 'seed';
    needSet.schema_version = searchPlanOutput.schema_version;
  }

  // WHY: NeedSet fields carry history from previous rounds (via computeNeedSet +
  // previousFieldHistories) but NOT the current round's queries/provenance.
  // Enrich here so needset_computed event and needset.json have complete history.
  if (Array.isArray(needSet.fields) && needSet.fields.length > 0) {
    const discoveryQueries = (Array.isArray(discoveryResult?.queries) ? discoveryResult.queries : [])
      .filter((q) => q && typeof q === 'object')
      .map((q) => ({
        query: String(q.query || '').trim(),
        target_fields: Array.isArray(q.target_fields) ? q.target_fields : [],
      }));
    needSet.fields = enrichNeedSetFieldHistories({
      fields: needSet.fields,
      provenance,
      searchPlanQueries: discoveryQueries,
    });
  }

  const phase07PrimeSourcesContext =
    resolvedFinalizationDerivationRuntime.buildPhase07PrimeSources({
      needSet,
      provenance,
      identity,
    });
  const phase07PrimeSources = phase07PrimeSourcesContext.phase07PrimeSources;

  const phase08Context = resolvedFinalizationDerivationRuntime.buildPhase08Extraction({
    llmValidatorDecisions: nextLlmValidatorDecisions,
  });
  const phase08Extraction = phase08Context.phase08Extraction;

  const finalizationMetricsContext =
    resolvedFinalizationDerivationRuntime.buildFinalizationMetrics({
      normalized,
      provenance,
    });
  const parserHealthRows = finalizationMetricsContext.parserHealthRows;
  const parserHealthAverage = finalizationMetricsContext.parserHealthAverage;
  const fingerprintCount = finalizationMetricsContext.fingerprintCount;
  const contribution = finalizationMetricsContext.contribution;

  const cortexSidecar = await resolvedFinalizationDerivationRuntime.buildCortexSidecar({
    constrainedFinalizationConfig,
    confidence,
    criticalFieldsBelowPassTarget,
    anchorMajorConflictsCount,
    constraintAnalysis,
    completenessStats,
  });

  return {
    identityGate,
    identityConfidence,
    identityReport,
    identity,
    allAnchorConflicts,
    anchorMajorConflictsCount,
    normalized,
    provenance,
    candidates,
    fieldsBelowPassTarget,
    criticalFieldsBelowPassTarget,
    newValuesProposed,
    constrainedFinalizationConfig,
    componentPriorFilledFields,
    componentPriorMatches,
    criticDecisions,
    llmValidatorDecisions: nextLlmValidatorDecisions,
    temporalEvidence,
    inferenceResult,
    runtimeEvidencePack,
    aggressiveExtraction,
    runtimeGateResult,
    curationSuggestionResult,
    completenessStats,
    coverageStats,
    confidence,
    gate,
    publishable,
    publishBlockers,
    durationMs,
    validatedReason,
    manufacturerSources,
    manufacturerMajorConflicts,
    endpointMining,
    constraintAnalysis,
    hypothesisQueue,
    fieldReasoning,
    trafficLight,
    llmBudgetBlockedReason,
    extractionGateOpen,
    needSet,
    searchPlanOutput,
    phase07PrimeSources,
    phase08Extraction,
    parserHealthRows,
    parserHealthAverage,
    fingerprintCount,
    contribution,
    cortexSidecar,
  };
}
