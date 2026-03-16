import { normalizeFieldList } from '../../../utils/fieldKeys.js';
import { appendLlmVerificationReport } from '../validation/verificationReport.js';
import { prepareBatchPromptContext } from './batchPromptContext.js';
import { selectBatchEvidence } from './batchEvidenceSelection.js';
import { ruleAiMode } from '../../../engine/ruleAccessors.js';

function buildScopedInvocationEvidencePack({
  evidencePack = {},
  scopedEvidencePack = {}
} = {}) {
  return {
    ...evidencePack,
    references: Array.isArray(evidencePack?.references)
      ? evidencePack.references
      : scopedEvidencePack.references,
    snippets: Array.isArray(evidencePack?.snippets)
      ? evidencePack.snippets
      : scopedEvidencePack.snippets,
    visual_assets: (Array.isArray(scopedEvidencePack?.visual_assets) && scopedEvidencePack.visual_assets.length > 0)
      ? scopedEvidencePack.visual_assets
      : (Array.isArray(evidencePack?.visual_assets) ? evidencePack.visual_assets : [])
  };
}

function collectRequiredFilled(fieldCandidates = [], requiredFieldSet = new Set(), hasKnownValueFn = () => false) {
  const filled = new Set();
  for (const row of fieldCandidates || []) {
    const field = String(row?.field || '').trim();
    if (!field || !requiredFieldSet.has(field) || !hasKnownValueFn(row?.value)) {
      continue;
    }
    filled.add(field);
  }
  return filled;
}

function buildVerificationBatches({
  usableBatches = [],
  fieldRules = {},
  aggressiveVerifyMode = false,
  config = {}
} = {}) {
  const verifyBatchLimit = aggressiveVerifyMode
    ? Math.max(1, Number.parseInt(String(config.llmVerifyAggressiveBatchCount || 3), 10) || 3)
    : 1;

  return usableBatches
    .filter((batch) => {
      const fields = batch.fields || [];
      const allAdvisory = fields.length > 0 && fields.every((field) => {
        const rule = fieldRules[field];
        return rule && typeof rule === 'object' && ruleAiMode(rule) === 'advisory';
      });
      return !allAdvisory;
    })
    .sort((a, b) => {
      const aHasJudge = (a.fields || []).some((field) => {
        const rule = fieldRules[field];
        return rule && typeof rule === 'object' && ruleAiMode(rule) === 'judge';
      });
      const bHasJudge = (b.fields || []).some((field) => {
        const rule = fieldRules[field];
        return rule && typeof rule === 'object' && ruleAiMode(rule) === 'judge';
      });
      if (aHasJudge !== bHasJudge) {
        return aHasJudge ? -1 : 1;
      }
      return 0;
    })
    .slice(0, verifyBatchLimit);
}

export async function runExtractionVerification({
  job,
  categoryConfig,
  usableBatches = [],
  fieldRules = {},
  effectiveFieldOrder = [],
  evidencePack = {},
  config = {},
  logger = null,
  llmContext = {},
  componentDBs = {},
  knownValuesFlat = {},
  goldenExamples = [],
  routeMatrixPolicy = null,
  budgetGuard = null,
  invokeModel,
  hasKnownValueFn,
  resolveBatchRoutePolicyFn,
  selectBatchEvidenceFn = selectBatchEvidence,
  prepareBatchPromptContextFn = prepareBatchPromptContext,
  appendVerificationReportFn = appendLlmVerificationReport
} = {}) {
  const aggressiveVerifyMode =
    String(llmContext?.mode || '').toLowerCase() === 'aggressive' &&
    String(llmContext?.verification?.trigger || '').toLowerCase() === 'aggressive_always';
  const verifyBatches = buildVerificationBatches({
    usableBatches,
    fieldRules,
    aggressiveVerifyMode,
    config
  });
  const usageFast = { prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 };
  const usageReason = { prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 };
  const fastModel = String(config.llmModelFast || config.llmModelPlan || '').trim();
  const reasonModel = String(config.llmModelExtract || '').trim();
  const requiredSet = new Set(normalizeFieldList(categoryConfig.requiredFields || [], {
    fieldOrder: categoryConfig.fieldOrder || []
  }));
  const fastRequiredFields = new Set();
  const reasonRequiredFields = new Set();
  const verifyBatchStats = [];
  let fastConflictCount = 0;
  let reasonConflictCount = 0;
  let fastCandidateCount = 0;
  let reasonCandidateCount = 0;

  try {
    for (const verifyBatch of verifyBatches) {
      const verifyFields = normalizeFieldList(verifyBatch.fields || [], {
        fieldOrder: effectiveFieldOrder
      });
      if (!verifyFields.length) {
        continue;
      }
      const verifyRoutePolicy = resolveBatchRoutePolicyFn({
        routeMatrixPolicy,
        batchFields: verifyFields
      });
      const verifyScoped = selectBatchEvidenceFn({
        evidencePack,
        batchFields: verifyFields,
        config,
        routePolicy: verifyRoutePolicy
      });
      const verifyPreparedBatch = prepareBatchPromptContextFn({
        job,
        categoryConfig,
        batchFields: verifyFields,
        scopedEvidencePack: verifyScoped,
        batchRoutePolicy: verifyRoutePolicy,
        config,
        componentDBs,
        knownValuesMap: knownValuesFlat,
        goldenExamples,
        contextOptions: {
          maxPrimePerField: 2,
          maxPrimeRows: 16,
          maxParseExamples: 2,
          maxComponentEntities: 80,
          maxEnumOptions: 60
        }
      });
      const verifyRefs = verifyPreparedBatch.validRefs;
      const verifyFieldSet = verifyPreparedBatch.fieldSet;
      const verifyPromptEvidence = verifyPreparedBatch.promptEvidence;
      const verifyPayload = verifyPreparedBatch.userPayload;
      const verifyInvocationEvidencePack = buildScopedInvocationEvidencePack({
        evidencePack,
        scopedEvidencePack: verifyScoped
      });

      let fastResult = null;
      let reasonResult = null;

      if (fastModel) {
        const canFastCall = budgetGuard?.canCall?.({
          reason: 'verify_extract_fast',
          essential: false
        }) || { allowed: true };
        if (canFastCall.allowed) {
          fastResult = await invokeModel({
            model: fastModel,
            routeRole: 'plan',
            reasoningMode: false,
            reason: 'verify_extract_fast',
            usageTracker: usageFast,
            userPayload: verifyPayload,
            promptEvidence: verifyPromptEvidence,
            fieldSet: verifyFieldSet,
            validRefs: verifyRefs,
            scopedEvidencePack: verifyInvocationEvidencePack,
            routeMatrixPolicy: verifyRoutePolicy
          });
        }
      }

      if (reasonModel) {
        const canReasonCall = budgetGuard?.canCall?.({
          reason: 'verify_extract_reason',
          essential: false
        }) || { allowed: true };
        if (canReasonCall.allowed) {
          reasonResult = await invokeModel({
            model: reasonModel,
            routeRole: 'extract',
            reasoningMode: true,
            reason: 'verify_extract_reason',
            usageTracker: usageReason,
            userPayload: verifyPayload,
            promptEvidence: verifyPromptEvidence,
            fieldSet: verifyFieldSet,
            validRefs: verifyRefs,
            scopedEvidencePack: verifyInvocationEvidencePack,
            routeMatrixPolicy: verifyRoutePolicy
          });
        }
      }

      const fastSet = collectRequiredFilled(fastResult?.fieldCandidates || [], requiredSet, hasKnownValueFn);
      for (const field of fastSet) {
        fastRequiredFields.add(field);
      }
      const reasonSet = collectRequiredFilled(reasonResult?.fieldCandidates || [], requiredSet, hasKnownValueFn);
      for (const field of reasonSet) {
        reasonRequiredFields.add(field);
      }
      fastConflictCount += (fastResult?.conflicts || []).length;
      reasonConflictCount += (reasonResult?.conflicts || []).length;
      fastCandidateCount += (fastResult?.fieldCandidates || []).length;
      reasonCandidateCount += (reasonResult?.fieldCandidates || []).length;

      verifyBatchStats.push({
        batch_id: String(verifyBatch.id || ''),
        field_count: verifyFields.length,
        fast_required_filled_count: fastSet.size,
        reason_required_filled_count: reasonSet.size
      });
    }

    if (verifyBatchStats.length === 0) {
      return {
        reportKey: null,
        verifyBatchStats
      };
    }

    const fastRequired = fastRequiredFields.size;
    const reasonRequired = reasonRequiredFields.size;
    const reportKey = await appendVerificationReportFn({
      storage: llmContext.storage,
      category: job.category || categoryConfig.category || '',
      entry: {
        ts: new Date().toISOString(),
        category: job.category || categoryConfig.category || '',
        productId: job.productId || '',
        runId: llmContext.runId || '',
        round: llmContext.round || 0,
        source_url: evidencePack?.meta?.url || '',
        trigger: llmContext?.verification?.trigger || 'sampling',
        fast_model: fastModel || null,
        reason_model: reasonModel || null,
        verify_batch_count: verifyBatchStats.length,
        verify_batches: verifyBatchStats,
        fast_required_filled_count: fastRequired,
        reason_required_filled_count: reasonRequired,
        fast_conflict_count: fastConflictCount,
        reason_conflict_count: reasonConflictCount,
        fast_candidate_count: fastCandidateCount,
        reason_candidate_count: reasonCandidateCount,
        fast_cost_usd: Number(usageFast.cost_usd || 0),
        reason_cost_usd: Number(usageReason.cost_usd || 0),
        better_model: reasonRequired > fastRequired
          ? 'reason_model'
          : fastRequired > reasonRequired
            ? 'fast_model'
            : 'tie'
      }
    });

    logger?.info?.('llm_verify_report_written', {
      productId: job.productId,
      runId: llmContext.runId,
      report_key: reportKey,
      fast_model: fastModel,
      reason_model: reasonModel,
      verify_batch_count: verifyBatchStats.length,
      fast_required_filled_count: fastRequired,
      reason_required_filled_count: reasonRequired
    });

    return {
      reportKey,
      verifyBatchStats
    };
  } catch (verifyError) {
    logger?.warn?.('llm_verify_failed', {
      productId: job.productId,
      message: verifyError.message
    });
    return {
      reportKey: null,
      verifyBatchStats: []
    };
  }
}
