import { buildResearchArtifactsPhaseContext } from './buildResearchArtifactsPhaseContext.js';
import { applyResearchArtifactsContext } from './applyResearchArtifactsContext.js';
import { buildAnalysisArtifactKeyPhaseContext } from './buildAnalysisArtifactKeyPhaseContext.js';
import { buildAnalysisArtifactKeyContext } from './buildAnalysisArtifactKeyContext.js';
import { buildIndexingSchemaArtifactsPhaseCallsiteContext } from './buildIndexingSchemaArtifactsPhaseCallsiteContext.js';
import { buildIndexingSchemaArtifactsPhaseContext } from './buildIndexingSchemaArtifactsPhaseContext.js';
import { runIndexingSchemaArtifactsPhase } from './runIndexingSchemaArtifactsPhase.js';
import { resolveIndexingSchemaValidation } from './resolveIndexingSchemaValidation.js';
import { buildIndexingSchemaSummaryPayload } from './buildIndexingSchemaSummaryPayload.js';
import { persistAnalysisArtifacts } from './persistAnalysisArtifacts.js';
import { buildFinalizationEventPayloads } from './buildFinalizationEventPayloads.js';
import { buildFinalizationTelemetryPhaseCallsiteContext } from './buildFinalizationTelemetryPhaseCallsiteContext.js';
import { buildFinalizationTelemetryContext } from './buildFinalizationTelemetryContext.js';
import { runFinalizationTelemetryPhase } from './runFinalizationTelemetryPhase.js';
import { emitFinalizationEvents } from './emitFinalizationEvents.js';
import { buildRunCompletedPayloadPhaseCallsiteContext } from './buildRunCompletedPayloadPhaseCallsiteContext.js';
import { buildRunCompletedPayloadContext } from './buildRunCompletedPayloadContext.js';
import { buildRunCompletedPayload } from './buildRunCompletedPayload.js';
import { buildRunCompletedEventCallsiteContext } from './buildRunCompletedEventCallsiteContext.js';
import { buildRunCompletedEventContext } from './buildRunCompletedEventContext.js';
import { emitRunCompletedEvent } from './emitRunCompletedEvent.js';
import { buildSummaryArtifactsPhaseCallsiteContext } from './buildSummaryArtifactsPhaseCallsiteContext.js';
import { buildSummaryArtifactsPhaseContext } from './buildSummaryArtifactsPhaseContext.js';
import { buildSummaryArtifactsContext } from './buildSummaryArtifactsContext.js';
import { buildIdentityReportPersistencePhaseCallsiteContext } from './buildIdentityReportPersistencePhaseCallsiteContext.js';
import { buildIdentityReportPersistenceContext } from './buildIdentityReportPersistenceContext.js';
import { runIdentityReportPersistencePhase } from './runIdentityReportPersistencePhase.js';
import { buildSourceIntelFinalizationPhaseCallsiteContext } from './buildSourceIntelFinalizationPhaseCallsiteContext.js';
import { buildSourceIntelFinalizationContext } from './buildSourceIntelFinalizationContext.js';
import { runSourceIntelFinalizationPhase } from './runSourceIntelFinalizationPhase.js';
import { buildPostLearningUpdatesPhaseCallsiteContext } from './buildPostLearningUpdatesPhaseCallsiteContext.js';
import { buildPostLearningUpdatesContext } from './buildPostLearningUpdatesContext.js';
import { runPostLearningUpdatesPhase } from './runPostLearningUpdatesPhase.js';
import { buildLearningGatePhaseCallsiteContext } from './buildLearningGatePhaseCallsiteContext.js';
import { buildLearningGateContext } from './buildLearningGateContext.js';
import { runLearningGatePhase } from './runLearningGatePhase.js';
import { buildSelfImproveLearningStoresPhaseCallsiteContext } from './buildSelfImproveLearningStoresPhaseCallsiteContext.js';
import { buildSelfImproveLearningStoresContext } from './buildSelfImproveLearningStoresContext.js';
import { persistSelfImproveLearningStores } from './persistSelfImproveLearningStores.js';
import { buildLearningExportPhaseCallsiteContext } from './buildLearningExportPhaseCallsiteContext.js';
import { buildLearningExportPhaseContext } from './buildLearningExportPhaseContext.js';
import { buildTerminalLearningExportLifecyclePhaseCallsiteContext } from './buildTerminalLearningExportLifecyclePhaseCallsiteContext.js';
import { buildTerminalLearningExportLifecycleContext } from './buildTerminalLearningExportLifecycleContext.js';
import { runTerminalLearningExportLifecycle } from './runTerminalLearningExportLifecycle.js';
import { buildRunResultPayloadPhaseCallsiteContext } from './buildRunResultPayloadPhaseCallsiteContext.js';
import { buildRunResultPayloadContext } from './buildRunResultPayloadContext.js';
import { buildRunResultPayload } from './buildRunResultPayload.js';

export function createProductCompletionRuntime({
  context = {},
  buildResearchArtifactsPhaseContextFn = buildResearchArtifactsPhaseContext,
  applyResearchArtifactsContextFn = applyResearchArtifactsContext,
  buildAnalysisArtifactKeyPhaseContextFn = buildAnalysisArtifactKeyPhaseContext,
  buildAnalysisArtifactKeyContextFn = buildAnalysisArtifactKeyContext,
  buildIndexingSchemaArtifactsPhaseCallsiteContextFn = buildIndexingSchemaArtifactsPhaseCallsiteContext,
  buildIndexingSchemaArtifactsPhaseContextFn = buildIndexingSchemaArtifactsPhaseContext,
  runIndexingSchemaArtifactsPhaseFn = runIndexingSchemaArtifactsPhase,
  resolveIndexingSchemaValidationFn = resolveIndexingSchemaValidation,
  buildIndexingSchemaSummaryPayloadFn = buildIndexingSchemaSummaryPayload,
  persistAnalysisArtifactsFn = persistAnalysisArtifacts,
  buildFinalizationEventPayloadsFn = buildFinalizationEventPayloads,
  buildFinalizationTelemetryPhaseCallsiteContextFn = buildFinalizationTelemetryPhaseCallsiteContext,
  buildFinalizationTelemetryContextFn = buildFinalizationTelemetryContext,
  runFinalizationTelemetryPhaseFn = runFinalizationTelemetryPhase,
  emitFinalizationEventsFn = emitFinalizationEvents,
  buildRunCompletedPayloadPhaseCallsiteContextFn = buildRunCompletedPayloadPhaseCallsiteContext,
  buildRunCompletedPayloadContextFn = buildRunCompletedPayloadContext,
  buildRunCompletedPayloadFn = buildRunCompletedPayload,
  buildRunCompletedEventCallsiteContextFn = buildRunCompletedEventCallsiteContext,
  buildRunCompletedEventContextFn = buildRunCompletedEventContext,
  emitRunCompletedEventFn = emitRunCompletedEvent,
  buildSummaryArtifactsPhaseCallsiteContextFn = buildSummaryArtifactsPhaseCallsiteContext,
  buildSummaryArtifactsPhaseContextFn = buildSummaryArtifactsPhaseContext,
  buildSummaryArtifactsContextFn = buildSummaryArtifactsContext,
  buildIdentityReportPersistencePhaseCallsiteContextFn = buildIdentityReportPersistencePhaseCallsiteContext,
  buildIdentityReportPersistenceContextFn = buildIdentityReportPersistenceContext,
  runIdentityReportPersistencePhaseFn = runIdentityReportPersistencePhase,
  buildSourceIntelFinalizationPhaseCallsiteContextFn = buildSourceIntelFinalizationPhaseCallsiteContext,
  buildSourceIntelFinalizationContextFn = buildSourceIntelFinalizationContext,
  runSourceIntelFinalizationPhaseFn = runSourceIntelFinalizationPhase,
  buildPostLearningUpdatesPhaseCallsiteContextFn = buildPostLearningUpdatesPhaseCallsiteContext,
  buildPostLearningUpdatesContextFn = buildPostLearningUpdatesContext,
  runPostLearningUpdatesPhaseFn = runPostLearningUpdatesPhase,
  buildLearningGatePhaseCallsiteContextFn = buildLearningGatePhaseCallsiteContext,
  buildLearningGateContextFn = buildLearningGateContext,
  runLearningGatePhaseFn = runLearningGatePhase,
  buildSelfImproveLearningStoresPhaseCallsiteContextFn = buildSelfImproveLearningStoresPhaseCallsiteContext,
  buildSelfImproveLearningStoresContextFn = buildSelfImproveLearningStoresContext,
  persistSelfImproveLearningStoresFn = persistSelfImproveLearningStores,
  buildLearningExportPhaseCallsiteContextFn = buildLearningExportPhaseCallsiteContext,
  buildLearningExportPhaseContextFn = buildLearningExportPhaseContext,
  buildTerminalLearningExportLifecyclePhaseCallsiteContextFn = buildTerminalLearningExportLifecyclePhaseCallsiteContext,
  buildTerminalLearningExportLifecycleContextFn = buildTerminalLearningExportLifecycleContext,
  runTerminalLearningExportLifecycleFn = runTerminalLearningExportLifecycle,
  buildRunResultPayloadPhaseCallsiteContextFn = buildRunResultPayloadPhaseCallsiteContext,
  buildRunResultPayloadContextFn = buildRunResultPayloadContext,
  buildRunResultPayloadFn = buildRunResultPayload,
} = {}) {
  const runBase = context.runBase || context.runArtifactsBase || '';

  return {
    async applyResearchArtifacts() {
      await applyResearchArtifactsContextFn({
        ...buildResearchArtifactsPhaseContextFn({
          frontierDb: context.frontierDb,
          uberOrchestrator: context.uberOrchestrator,
          storage: context.storage,
          category: context.category,
          productId: context.productId,
          runId: context.runId,
          discoveryResult: context.discoveryResult,
          previousFinalSpec: context.previousFinalSpec,
          normalized: context.normalized,
          fieldOrder: context.fieldOrder,
          summary: context.summary,
          runtimeMode: context.runtimeMode,
        }),
      });
    },
    resolveAnalysisArtifactKeys() {
      return buildAnalysisArtifactKeyContextFn({
        ...buildAnalysisArtifactKeyPhaseContextFn({
          storage: context.storage,
          category: context.category,
          productId: context.productId,
          runBase,
          summary: context.summary,
        }),
      });
    },
    async runIndexingSchemaArtifacts({ keys }) {
      return runIndexingSchemaArtifactsPhaseFn({
        ...buildIndexingSchemaArtifactsPhaseContextFn({
          ...buildIndexingSchemaArtifactsPhaseCallsiteContextFn({
            runId: context.runId,
            category: context.category,
            productId: context.productId,
            startMs: context.startMs,
            summary: context.summary,
            categoryConfig: context.categoryConfig,
            sourceResults: context.sourceResults,
            normalized: context.normalized,
            provenance: context.provenance,
            needSet: context.needSet,
            phase08Extraction: context.phase08Extraction,
            phase07PrimeSources: context.phase07PrimeSources,
            config: context.config,
            logger: context.logger,
            storage: context.storage,
            keys,
            buildIndexingSchemaPackets: context.buildIndexingSchemaPacketsFn,
            resolveIndexingSchemaValidation: resolveIndexingSchemaValidationFn,
            buildIndexingSchemaSummaryPayload: buildIndexingSchemaSummaryPayloadFn,
            persistAnalysisArtifacts: persistAnalysisArtifactsFn,
            validateIndexingSchemaPackets: context.validateIndexingSchemaPacketsFn,
          }),
        }),
      });
    },
    emitFinalizationTelemetry({ keys, indexingSchemaPackets }) {
      runFinalizationTelemetryPhaseFn({
        ...buildFinalizationTelemetryContextFn({
          ...buildFinalizationTelemetryPhaseCallsiteContextFn({
            logger: context.logger,
            productId: context.productId,
            runId: context.runId,
            category: context.category,
            needSet: context.needSet,
            needSetRunKey: keys.needSetRunKey,
            phase07PrimeSources: context.phase07PrimeSources,
            phase07RunKey: keys.phase07RunKey,
            phase08Extraction: context.phase08Extraction,
            phase08RunKey: keys.phase08RunKey,
            indexingSchemaPackets,
            sourcePacketsRunKey: keys.sourcePacketsRunKey,
            itemPacketRunKey: keys.itemPacketRunKey,
            runMetaPacketRunKey: keys.runMetaPacketRunKey,
            buildFinalizationEventPayloads: buildFinalizationEventPayloadsFn,
            emitFinalizationEvents: emitFinalizationEventsFn,
          }),
        }),
      });
    },
    buildRunCompletedPayload() {
      return buildRunCompletedPayloadFn({
        ...buildRunCompletedPayloadContextFn({
          ...buildRunCompletedPayloadPhaseCallsiteContextFn({
            productId: context.productId,
            runId: context.runId,
            config: context.config,
            runtimeMode: context.runtimeMode,
            identityFingerprint: context.identityFingerprint,
            identityLockStatus: context.identityLockStatus,
            dedupeMode: context.dedupeMode,
            summary: context.summary,
            confidence: context.confidence,
            llmCandidatesAccepted: context.llmCandidatesAccepted,
            llmCallCount: context.llmCallCount,
            llmCostUsd: context.llmCostUsd,
            contribution: context.contribution,
            llmEstimatedUsageCount: context.llmEstimatedUsageCount,
            llmRetryWithoutSchemaCount: context.llmRetryWithoutSchemaCount,
            llmBudgetBlockedReason: context.llmBudgetBlockedReason,
            indexingHelperFlowEnabled: context.indexingHelperFlowEnabled,
            helperContext: context.helperContext,
            helperFilledFields: context.helperFilledFields,
            componentPriorFilledFields: context.componentPriorFilledFields,
            criticDecisions: context.criticDecisions,
            llmValidatorDecisions: context.llmValidatorDecisions,
            phase08Extraction: context.phase08Extraction,
            trafficLight: context.trafficLight,
            resumeMode: context.resumeMode,
            resumeMaxAgeHours: context.resumeMaxAgeHours,
            resumeReextractEnabled: context.resumeReextractEnabled,
            resumeReextractAfterHours: context.resumeReextractAfterHours,
            resumeSeededPendingCount: context.resumeSeededPendingCount,
            resumeSeededLlmRetryCount: context.resumeSeededLlmRetryCount,
            resumeSeededReextractCount: context.resumeSeededReextractCount,
            resumePersistedPendingCount: context.resumePersistedPendingCount,
            resumePersistedLlmRetryCount: context.resumePersistedLlmRetryCount,
            resumePersistedSuccessCount: context.resumePersistedSuccessCount,
            hypothesisFollowupRoundsExecuted: context.hypothesisFollowupRoundsExecuted,
            hypothesisFollowupSeededUrls: context.hypothesisFollowupSeededUrls,
            aggressiveExtraction: context.aggressiveExtraction,
            durationMs: context.durationMs,
          }),
        }),
      });
    },
    emitRunCompletedEvent({ runCompletedPayload }) {
      emitRunCompletedEventFn({
        ...buildRunCompletedEventContextFn({
          ...buildRunCompletedEventCallsiteContextFn({
            logger: context.logger,
            runCompletedPayload,
          }),
        }),
      });
    },
    async buildSummaryArtifacts() {
      return buildSummaryArtifactsContextFn({
        ...buildSummaryArtifactsPhaseContextFn({
          ...buildSummaryArtifactsPhaseCallsiteContextFn({
            config: context.constrainedFinalizationConfig,
            fieldOrder: context.fieldOrder,
            normalized: context.normalized,
            provenance: context.provenance,
            summary: context.summary,
            logger: context.logger,
            llmContext: context.llmContext,
            writeSummaryMarkdownLLM: context.writeSummaryMarkdownLLMFn,
            buildMarkdownSummary: context.buildMarkdownSummaryFn,
            tsvRowFromFields: context.tsvRowFromFieldsFn,
          }),
        }),
      });
    },
    async persistIdentityReport() {
      await runIdentityReportPersistencePhaseFn({
        ...buildIdentityReportPersistenceContextFn({
          ...buildIdentityReportPersistencePhaseCallsiteContextFn({
            storage: context.storage,
            runBase,
            summary: context.summary,
            identityReport: context.identityReport,
          }),
        }),
      });
    },
    async runSourceIntelFinalization() {
      await runSourceIntelFinalizationPhaseFn({
        ...buildSourceIntelFinalizationContextFn({
          ...buildSourceIntelFinalizationPhaseCallsiteContextFn({
            storage: context.storage,
            config: context.config,
            category: context.category,
            productId: context.productId,
            brand: context.sourceIntelBrand,
            sourceResults: context.sourceResults,
            provenance: context.provenance,
            categoryConfig: context.categoryConfig,
            constraintAnalysis: context.constraintAnalysis,
            summary: context.summary,
            persistSourceIntel: context.persistSourceIntelFn,
          }),
        }),
      });
    },
    runPostLearningUpdates() {
      return runPostLearningUpdatesPhaseFn({
        ...buildPostLearningUpdatesContextFn({
          ...buildPostLearningUpdatesPhaseCallsiteContextFn({
            storage: context.storage,
            config: context.config,
            category: context.category,
            job: context.job,
            normalized: context.normalized,
            summary: context.summary,
            provenance: context.provenance,
            sourceResults: context.sourceResults,
            discoveryResult: context.discoveryResult,
            runId: context.runId,
            updateCategoryBrain: context.updateCategoryBrainFn,
            updateComponentLibrary: context.updateComponentLibraryFn,
          }),
        }),
      });
    },
    runLearningGate() {
      return runLearningGatePhaseFn({
        ...buildLearningGateContextFn({
          ...buildLearningGatePhaseCallsiteContextFn({
            fieldOrder: context.fieldOrder,
            fields: context.normalized.fields,
            provenance: context.provenance,
            category: context.category,
            runId: context.runId,
            runtimeFieldRulesEngine: context.runtimeFieldRulesEngine,
            config: context.config,
            logger: context.logger,
            evaluateFieldLearningGates: context.evaluateFieldLearningGatesFn,
            emitLearningGateEvents: context.emitLearningGateEventsFn,
          }),
        }),
      });
    },
    async persistSelfImproveLearningStores({ learningGateResult }) {
      await persistSelfImproveLearningStoresFn({
        ...buildSelfImproveLearningStoresContextFn({
          ...buildSelfImproveLearningStoresPhaseCallsiteContextFn({
            config: context.config,
            learningGateResult,
            provenance: context.provenance,
            category: context.category,
            runId: context.runId,
            runtimeFieldRulesEngine: context.runtimeFieldRulesEngine,
            logger: context.logger,
            importSpecDb: context.importSpecDbFn,
            UrlMemoryStoreClass: context.UrlMemoryStoreClass,
            DomainFieldYieldStoreClass: context.DomainFieldYieldStoreClass,
            FieldAnchorsStoreClass: context.FieldAnchorsStoreClass,
            ComponentLexiconStoreClass: context.ComponentLexiconStoreClass,
            populateLearningStores: context.populateLearningStoresFn,
          }),
        }),
      });
    },
    buildLearningExportPhaseContext({ rowTsv, markdownSummary }) {
      return buildLearningExportPhaseContextFn({
        ...buildLearningExportPhaseCallsiteContextFn({
          config: context.config,
          storage: context.storage,
          category: context.category,
          productId: context.productId,
          runId: context.runId,
          job: context.job,
          sourceResults: context.sourceResults,
          summary: context.summary,
          learningProfile: context.learningProfile,
          discoveryResult: context.discoveryResult,
          runBase,
          artifactsByHost: context.artifactsByHost,
          adapterArtifacts: context.adapterArtifacts,
          normalized: context.normalized,
          provenance: context.provenance,
          candidates: context.candidates,
          logger: context.logger,
          markdownSummary,
          rowTsv,
          runtimeFieldRulesEngine: context.runtimeFieldRulesEngine,
          fieldOrder: context.fieldOrder,
          runtimeEvidencePack: context.runtimeEvidencePack,
          trafficLight: context.trafficLight,
          persistLearningProfile: context.persistLearningProfileFn,
          exportRunArtifacts: context.exportRunArtifactsFn,
          writeFinalOutputs: context.writeFinalOutputsFn,
          writeProductReviewArtifacts: context.writeProductReviewArtifactsFn,
          writeCategoryReviewArtifacts: context.writeCategoryReviewArtifactsFn,
        }),
      });
    },
    runTerminalLearningExportLifecycle({ learningExportPhaseContext }) {
      return runTerminalLearningExportLifecycleFn({
        ...buildTerminalLearningExportLifecycleContextFn({
          ...buildTerminalLearningExportLifecyclePhaseCallsiteContextFn({
            learningExportPhaseContext,
            runLearningExportPhaseFn: context.runLearningExportPhaseFn,
            finalizeRunLifecycleFn: context.finalizeRunLifecycleFn,
            logger: context.logger,
            frontierDb: context.frontierDb,
            fieldOrder: context.fieldOrder,
            normalized: context.normalized,
            provenance: context.provenance,
            fieldReasoning: context.fieldReasoning,
            trafficLight: context.trafficLight,
            emitFieldDecisionEventsFn: context.emitFieldDecisionEventsFn,
          }),
        }),
      });
    },
    buildRunResultPayload({
      exportInfo,
      finalExport,
      learning,
      learningGateResult,
      categoryBrain,
      needSet,
    }) {
      return buildRunResultPayloadFn({
        ...buildRunResultPayloadContextFn({
          ...buildRunResultPayloadPhaseCallsiteContextFn({
            job: context.job,
            normalized: context.normalized,
            provenance: context.provenance,
            summary: context.summary,
            runId: context.runId,
            productId: context.productId,
            exportInfo,
            finalExport,
            learning,
            learningGateResult,
            categoryBrain,
            needSet,
          }),
        }),
      });
    },
  };
}
