import { normalizeFieldList } from '../../../../utils/fieldKeys.js';
import { validateCandidatesLLM } from '../../validation/validateCandidatesLLM.js';
import { hasKnownFieldValue } from '../shared/candidateHelpers.js';
import { ensureProvenanceField } from '../shared/provenanceHelpers.js';

export async function runLlmValidatorPhase({
  config = {},
  job = {},
  normalized = { fields: {} },
  provenance = {},
  categoryConfig = { criticalFieldSet: new Set() },
  learnedConstraints = {},
  fieldOrder = [],
  logger = null,
  llmContext = {},
  criticDecisions = { reject: [] },
  identityProvisional = false,
  fieldsBelowPassTarget = [],
  criticalFieldsBelowPassTarget = [],
  llmValidatorDecisions = { enabled: false, accept: [], reject: [], unknown: [] },
  normalizeFieldListFn = normalizeFieldList,
  validateCandidatesLLMFn = validateCandidatesLLM,
  hasKnownFieldValueFn = hasKnownFieldValue,
  ensureProvenanceFieldFn = ensureProvenanceField,
} = {}) {
  const uncertainFieldsForValidator = normalizeFieldListFn([
    ...(fieldsBelowPassTarget || []),
    ...(criticalFieldsBelowPassTarget || []),
    ...((criticDecisions.reject || []).map((row) => row.field).filter(Boolean)),
  ], {
    fieldOrder,
  });
  const shouldRunLlmValidator =
    Boolean(config.llmEnabled && config.llmApiKey)
    && uncertainFieldsForValidator.length > 0
    && (
      (criticDecisions.reject || []).length > 0
      || (criticalFieldsBelowPassTarget || []).length > 0
      || identityProvisional
    );
  let nextFieldsBelowPassTarget = fieldsBelowPassTarget;
  let nextCriticalFieldsBelowPassTarget = criticalFieldsBelowPassTarget;

  if (!shouldRunLlmValidator) {
    return {
      uncertainFieldsForValidator,
      shouldRunLlmValidator,
      llmValidatorDecisions,
      fieldsBelowPassTarget: nextFieldsBelowPassTarget,
      criticalFieldsBelowPassTarget: nextCriticalFieldsBelowPassTarget,
    };
  }

  llmValidatorDecisions = await validateCandidatesLLMFn({
    job,
    normalized,
    provenance,
    categoryConfig,
    constraints: learnedConstraints,
    uncertainFields: uncertainFieldsForValidator,
    config,
    logger,
    llmContext,
  });
  if ((llmValidatorDecisions.accept || []).length > 0) {
    const belowSet = new Set(fieldsBelowPassTarget || []);
    const criticalSet = new Set(criticalFieldsBelowPassTarget || []);
    for (const row of llmValidatorDecisions.accept || []) {
      if (!row?.field || !hasKnownFieldValueFn(row.value)) {
        continue;
      }
      normalized.fields[row.field] = row.value;
      const bucket = ensureProvenanceFieldFn(provenance, row.field, row.value);
      bucket.value = row.value;
      bucket.confirmations = Math.max(1, Number.parseInt(String(bucket.confirmations || 0), 10) || 0);
      bucket.approved_confirmations = Math.max(1, Number.parseInt(String(bucket.approved_confirmations || 0), 10) || 0);
      bucket.pass_target = Math.max(1, Number.parseInt(String(bucket.pass_target || 1), 10) || 1);
      bucket.meets_pass_target = true;
      bucket.confidence = Math.max(Number(bucket.confidence || 0), Number(row.confidence || 0.8));
      bucket.evidence = [
        ...(Array.isArray(bucket.evidence) ? bucket.evidence : []),
        {
          url: 'llm://validator',
          host: 'llm.local',
          rootDomain: 'llm.local',
          tier: 2,
          tierName: 'database',
          method: 'llm_validate',
          keyPath: `llm.validate.${row.field}`,
          approvedDomain: false,
          reason: row.reason,
        },
      ];
      belowSet.delete(row.field);
      criticalSet.delete(row.field);
    }
    nextFieldsBelowPassTarget = [...belowSet];
    nextCriticalFieldsBelowPassTarget = [...criticalSet];
  }
  if ((llmValidatorDecisions.reject || []).length > 0) {
    const belowSet = new Set(nextFieldsBelowPassTarget || []);
    const criticalSet = new Set(nextCriticalFieldsBelowPassTarget || []);
    for (const row of llmValidatorDecisions.reject || []) {
      if (!row?.field) {
        continue;
      }
      belowSet.add(row.field);
      if (categoryConfig.criticalFieldSet.has(row.field)) {
        criticalSet.add(row.field);
      }
    }
    nextFieldsBelowPassTarget = [...belowSet];
    nextCriticalFieldsBelowPassTarget = [...criticalSet];
  }

  return {
    uncertainFieldsForValidator,
    shouldRunLlmValidator,
    llmValidatorDecisions,
    fieldsBelowPassTarget: nextFieldsBelowPassTarget,
    criticalFieldsBelowPassTarget: nextCriticalFieldsBelowPassTarget,
  };
}
