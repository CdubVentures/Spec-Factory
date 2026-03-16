import { applyRuntimeFieldRules } from '../../../../engine/runtimeGate.js';
import {
  appendEnumCurationSuggestions,
  appendComponentCurationSuggestions,
  appendComponentReviewItems,
  appendComponentIdentityObservations,
} from '../../../../engine/curationSuggestions.js';
import { ensureProvenanceField } from '../shared/provenanceHelpers.js';

function applyGateFailuresToProvenance({
  runtimeGateResult,
  fieldsBelowPassTarget,
  criticalFieldsBelowPassTarget,
  criticalFieldSet,
  provenance,
  ensureProvenanceFieldFn,
} = {}) {
  if ((runtimeGateResult.failures || []).length === 0) {
    return {
      fieldsBelowPassTarget,
      criticalFieldsBelowPassTarget,
    };
  }

  const belowSet = new Set(fieldsBelowPassTarget || []);
  const criticalSet = new Set(criticalFieldsBelowPassTarget || []);
  for (const failure of runtimeGateResult.failures) {
    if (!failure?.field) {
      continue;
    }
    belowSet.add(failure.field);
    if (criticalFieldSet.has(failure.field)) {
      criticalSet.add(failure.field);
    }

    const bucket = ensureProvenanceFieldFn(provenance, failure.field, 'unk');
    bucket.value = 'unk';
    bucket.meets_pass_target = false;
    bucket.confidence = Math.min(Number(bucket.confidence || 0), 0.2);
    bucket.evidence = [
      ...(Array.isArray(bucket.evidence) ? bucket.evidence : []),
      {
        url: 'engine://field-rules',
        host: 'engine.local',
        rootDomain: 'engine.local',
        tier: 1,
        tierName: 'manufacturer',
        method: 'field_rules_engine',
        keyPath: `engine.${failure.field}`,
        approvedDomain: true,
        reason: failure.reason_code || 'normalize_failed',
      },
    ];
  }

  return {
    fieldsBelowPassTarget: [...belowSet],
    criticalFieldsBelowPassTarget: [...criticalSet],
  };
}

function partitionCurationSuggestions(suggestions = []) {
  return {
    enumSuggestions: suggestions.filter((item) => item.suggestion_type !== 'new_component'),
    componentSuggestions: suggestions.filter((item) => item.suggestion_type === 'new_component'),
  };
}

export async function applyRuntimeGateAndCuration({
  config = {},
  runtimeFieldRulesEngine = null,
  normalizedFields = {},
  provenance = {},
  fieldOrder = [],
  runtimeEvidencePack = null,
  fieldsBelowPassTarget = [],
  criticalFieldsBelowPassTarget = [],
  criticalFieldSet = new Set(),
  category = '',
  productId = '',
  runId = '',
  logger = null,
  applyRuntimeFieldRulesFn = applyRuntimeFieldRules,
  ensureProvenanceFieldFn = ensureProvenanceField,
  appendEnumCurationSuggestionsFn = appendEnumCurationSuggestions,
  appendComponentCurationSuggestionsFn = appendComponentCurationSuggestions,
  appendComponentReviewItemsFn = appendComponentReviewItems,
  appendComponentIdentityObservationsFn = appendComponentIdentityObservations,
} = {}) {
  const componentReviewQueue = [];
  const identityObservations = [];
  const runtimeGateResult = applyRuntimeFieldRulesFn({
    engine: runtimeFieldRulesEngine,
    fields: normalizedFields,
    provenance,
    fieldOrder,
    enforceEvidence: Boolean(config.fieldRulesEngineEnforceEvidence),
    strictEvidence: Boolean(config.fieldRulesEngineEnforceEvidence),
    evidencePack: runtimeEvidencePack,
    extractedValues: normalizedFields,
    componentReviewQueue,
    identityObservations,
  });

  const provenanceAdjusted = applyGateFailuresToProvenance({
    runtimeGateResult,
    fieldsBelowPassTarget,
    criticalFieldsBelowPassTarget,
    criticalFieldSet,
    provenance,
    ensureProvenanceFieldFn,
  });
  fieldsBelowPassTarget = provenanceAdjusted.fieldsBelowPassTarget;
  criticalFieldsBelowPassTarget = provenanceAdjusted.criticalFieldsBelowPassTarget;

  const { enumSuggestions, componentSuggestions } = partitionCurationSuggestions(runtimeGateResult.curation_suggestions || []);
  let curationSuggestionResult = null;
  if (enumSuggestions.length > 0) {
    try {
      curationSuggestionResult = await appendEnumCurationSuggestionsFn({
        config,
        category,
        productId,
        runId,
        suggestions: enumSuggestions,
      });
      logger?.info?.('runtime_curation_suggestions_persisted', {
        category,
        productId,
        runId,
        appended_count: curationSuggestionResult.appended_count,
        total_count: curationSuggestionResult.total_count,
      });
    } catch (error) {
      logger?.warn?.('runtime_curation_suggestions_failed', {
        category,
        productId,
        runId,
        message: error.message,
      });
    }
  }

  if (componentSuggestions.length > 0) {
    try {
      const compResult = await appendComponentCurationSuggestionsFn({
        config,
        category,
        productId,
        runId,
        suggestions: componentSuggestions,
      });
      logger?.info?.('runtime_component_suggestions_persisted', {
        category,
        productId,
        runId,
        appended_count: compResult.appended_count,
        total_count: compResult.total_count,
      });
    } catch (error) {
      logger?.warn?.('runtime_component_suggestions_failed', {
        category,
        productId,
        runId,
        message: error.message,
      });
    }
  }

  if (componentReviewQueue.length > 0) {
    try {
      const reviewResult = await appendComponentReviewItemsFn({
        config,
        category,
        productId,
        runId,
        items: componentReviewQueue,
      });
      logger?.info?.('component_review_items_persisted', {
        category,
        productId,
        runId,
        appended_count: reviewResult.appended_count,
        total_count: reviewResult.total_count,
      });
    } catch (error) {
      logger?.warn?.('component_review_items_failed', {
        category,
        productId,
        runId,
        message: error.message,
      });
    }
  }

  if (identityObservations.length > 0) {
    try {
      const obsResult = await appendComponentIdentityObservationsFn({
        config,
        category,
        productId,
        runId,
        observations: identityObservations,
      });
      logger?.info?.('component_identity_observations_persisted', {
        category,
        productId,
        runId,
        appended_count: obsResult.appended_count,
        total_count: obsResult.total_count,
      });
    } catch (error) {
      logger?.warn?.('component_identity_observations_failed', {
        category,
        productId,
        runId,
        message: error.message,
      });
    }
  }

  return {
    runtimeGateResult,
    normalizedFields: runtimeGateResult.fields,
    fieldsBelowPassTarget,
    criticalFieldsBelowPassTarget,
    curationSuggestionResult,
  };
}
