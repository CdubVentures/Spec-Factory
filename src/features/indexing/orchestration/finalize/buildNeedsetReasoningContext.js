import { buildHypothesisQueue } from '../../learning/hypothesisQueue.js';
import { buildFieldReasoning } from '../shared/reasoningHelpers.js';
import { buildTrafficLight } from '../../validation/trafficLight.js';
import {
  deriveNeedSetIdentityState,
  buildNeedSetIdentityAuditRows,
} from '../shared/identityHelpers.js';
import { normalizeAmbiguityLevel } from '../../../../utils/identityNormalize.js';
import { computeNeedSet } from '../../../../indexlab/needsetEngine.js';
import { isHelperSyntheticSource } from '../shared/urlHelpers.js';

export function buildNeedsetReasoningContext({
  runId,
  category,
  productId,
  config = {},
  fieldOrder = [],
  provenance = {},
  sourceResults = [],
  constraintAnalysis = null,
  criticalFieldsBelowPassTarget = [],
  completenessStats = {},
  sourceIntel = {},
  job = {},
  identity = {},
  categoryConfig = {},
  fieldsBelowPassTarget = [],
  identityGate = {},
  identityConfidence = 0,
  identityLock = {},
  publishable = false,
  publishBlockers = [],
  identityReport = {},
  learnedFieldAvailability = {},
  learnedFieldYield = {},
  discoveryResult = {},
  buildHypothesisQueueFn = buildHypothesisQueue,
  buildFieldReasoningFn = buildFieldReasoning,
  buildTrafficLightFn = buildTrafficLight,
  deriveNeedSetIdentityStateFn = deriveNeedSetIdentityState,
  buildNeedSetIdentityAuditRowsFn = buildNeedSetIdentityAuditRows,
  normalizeAmbiguityLevelFn = normalizeAmbiguityLevel,
  computeNeedSetFn = computeNeedSet,
  isHelperSyntheticSourceFn = isHelperSyntheticSource,
} = {}) {
  const hypothesisSourceResults = sourceResults.filter((source) => !isHelperSyntheticSourceFn(source));
  const hypothesisQueue = buildHypothesisQueueFn({
    criticalFieldsBelowPassTarget,
    missingRequiredFields: completenessStats.missingRequiredFields,
    provenance,
    sourceResults: hypothesisSourceResults,
    sourceIntelDomains: sourceIntel.data?.domains || {},
    brand: job.identityLock?.brand || identity.brand || '',
    criticalFieldSet: categoryConfig.criticalFieldSet,
    maxItems: Math.max(1, Number(config.maxHypothesisItems || 50)),
  });

  const fieldReasoning = buildFieldReasoningFn({
    fieldOrder,
    provenance,
    fieldsBelowPassTarget,
    criticalFieldsBelowPassTarget,
    missingRequiredFields: completenessStats.missingRequiredFields,
    constraintAnalysis,
    identityGateValidated: identityGate.validated,
    sourceResults: hypothesisSourceResults,
    fieldAvailabilityModel: learnedFieldAvailability,
    fieldYieldArtifact: learnedFieldYield,
    searchAttemptCount: (discoveryResult.search_attempts || []).length,
  });
  const trafficLight = buildTrafficLightFn({
    fieldOrder,
    provenance,
    fieldReasoning,
  });

  const needSetIdentityState = deriveNeedSetIdentityStateFn({
    identityGate,
    identityConfidence,
  });
  const extractionGateOpen = true;
  const needSetIdentityAuditRows = buildNeedSetIdentityAuditRowsFn(
    identityReport,
  );
  const contradictionCount = Number(
    identityReport.contradiction_count
    ?? identityGate.contradictions?.length
    ?? 0
  ) || 0;
  const needSetIdentityContext = {
    status: needSetIdentityState,
    confidence: identityConfidence,
    identity_gate_validated: identityGate.validated,
    extraction_gate_open: extractionGateOpen,
    family_model_count: Number(identityLock.family_model_count || 0),
    ambiguity_level: normalizeAmbiguityLevelFn(identityLock.ambiguity_level || ''),
    publishable,
    publish_blockers: publishBlockers,
    reason_codes: identityReport.reason_codes || identityGate.reasonCodes || [],
    page_count: identityReport.pages?.length || 0,
    contradiction_count: contradictionCount,
    contradictions: identityReport.contradictions || identityGate.contradictions || [],
    accepted_exact_match_sources: identityReport.accepted_exact_match_sources || identityGate.acceptedExactMatchSources || [],
    accepted_conflict_contributors: identityReport.accepted_conflict_contributors || identityGate.acceptedConflictContributors || [],
    rejected_sibling_sources: identityReport.rejected_sibling_sources || identityGate.rejectedSiblingSources || [],
    first_conflict_trigger: identityReport.first_conflict_trigger || identityGate.firstConflictTrigger || null,
    max_match_score: Math.max(
      0,
      ...sourceResults.map((source) => Number(source?.identity?.score || 0)).filter((value) => Number.isFinite(value)),
    ),
    audit_rows: needSetIdentityAuditRows,
    // Schema 2 enrichments
    manufacturer: job.identityLock?.brand || identity.brand || '',
    official_domain: discoveryResult?.official_domain || null,
    support_domain: discoveryResult?.support_domain || null,
    review_required: publishBlockers.length > 0,
  };
  const needSet = computeNeedSetFn({
    runId,
    category,
    productId,
    fieldOrder,
    provenance,
    fieldRules: categoryConfig.fieldRules,
    fieldReasoning,
    constraintAnalysis,
    identityContext: needSetIdentityContext,
    brand: job.identityLock?.brand || identity.brand || '',
    model: job.identityLock?.model || identity.model || '',
    baseModel: job.identityLock?.base_model || '',
    aliases: job.identityLock?.aliases || [],
  });

  return {
    hypothesisQueue,
    fieldReasoning,
    trafficLight,
    extractionGateOpen,
    needSet,
    needSetIdentityContext,
  };
}
