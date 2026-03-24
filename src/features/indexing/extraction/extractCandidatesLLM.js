import { configInt, configValue } from '../../../shared/settingsAccessor.js';
import { normalizeWhitespace } from '../../../utils/common.js';
import { normalizeFieldList } from '../../../utils/fieldKeys.js';
import { buildFieldBatches, resolveBatchModel } from './fieldBatching.js';
import { LLMCache } from '../../../core/llm/client/llmCache.js';
import { hasAnyLlmApiKey, resolvePhaseModel } from '../../../core/llm/client/routing.js';
import { prepareBatchPromptContext } from './batchPromptContext.js';
import {
  selectBatchEvidence,
  uniqueTokens
} from './batchEvidenceSelection.js';
import { executeExtractionBatch } from './executeExtractionBatch.js';
import { hasKnownValue } from '../../../shared/valueNormalizers.js';
import {
  buildCompletedPhase08BatchRow,
  buildPhase08ExtractionPayload,
  createEmptyPhase08,
  mergePhase08FieldContexts,
  mergePhase08PrimeRows
} from './phase08Extraction.js';
import { invokeExtractionModel } from './invokeExtractionModel.js';
import { runExtractionVerification } from './runExtractionVerification.js';
import { ruleAiMode } from '../../../engine/ruleAccessors.js';

export { buildPromptFieldContracts } from './batchPromptContext.js';

function dedupeFieldCandidates(fieldCandidates = []) {
  const seen = new Set();
  const out = [];
  for (const row of fieldCandidates || []) {
    const refs = Array.isArray(row?.evidenceRefs)
      ? [...new Set(row.evidenceRefs.map((item) => String(item || '').trim()).filter(Boolean))]
      : [];
    const key = [
      String(row?.field || '').trim(),
      String(row?.value || '').trim(),
      String(row?.method || '').trim(),
      String(row?.keyPath || '').trim(),
      refs.sort((a, b) => a.localeCompare(b)).join(',')
    ].join('|');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      ...row,
      evidenceRefs: refs
    });
  }
  return out;
}

function parseModelLadder(value = '') {
  return uniqueTokens(
    String(value || '')
      .split(/->|,|;/)
      .map((row) => String(row || '').trim())
      .filter(Boolean)
  );
}

function toBooleanPolicy(value, fallback) {
  if (value === undefined || value === null) return Boolean(fallback);
  return Boolean(value);
}

function scoreBatchPolicyRow(row = {}) {
  const effort = Number.parseInt(String(row?.effort ?? 0), 10) || 0;
  const minRefs = Number.parseInt(String(row?.llm_output_min_evidence_refs_required ?? 1), 10) || 1;
  return (effort * 100) + minRefs;
}

function resolveBatchRoutePolicy({
  routeMatrixPolicy = null,
  batchFields = []
} = {}) {
  const policy = routeMatrixPolicy && typeof routeMatrixPolicy === 'object'
    ? routeMatrixPolicy
    : {};
  const fieldPolicyByKey = policy?.field_policy_by_key && typeof policy.field_policy_by_key === 'object'
    ? policy.field_policy_by_key
    : {};
  const matchedRows = (batchFields || [])
    .map((field) => String(field || '').trim())
    .filter(Boolean)
    .map((field) => fieldPolicyByKey[field])
    .filter((row) => row && typeof row === 'object');
  const dominantRow = matchedRows
    .slice()
    .sort((a, b) => scoreBatchPolicyRow(b) - scoreBatchPolicyRow(a))[0]
    || (policy?.field_policy_default && typeof policy.field_policy_default === 'object' ? policy.field_policy_default : null)
    || policy;
  const merged = {
    ...policy,
    ...(dominantRow || {})
  };
  const rowMinRefs = Number.parseInt(
    String(
      merged?.llm_output_min_evidence_refs_required
      ?? policy?.llm_output_min_evidence_refs_required
      ?? 1
    ),
    10
  ) || 1;
  const policyMinRefs = Number.parseInt(
    String(policy?.min_evidence_refs_effective ?? 1),
    10
  ) || 1;
  return {
    ...merged,
    llm_output_min_evidence_refs_required: Math.max(1, rowMinRefs),
    min_evidence_refs_effective: Math.max(1, rowMinRefs, policyMinRefs),
    route_models: parseModelLadder(merged?.model_ladder_today || ''),
    single_source_data: toBooleanPolicy(merged?.single_source_data, true),
    all_source_data: toBooleanPolicy(merged?.all_source_data, false),
    enable_websearch: toBooleanPolicy(merged?.enable_websearch, true),
    all_sources_confidence_repatch: toBooleanPolicy(merged?.all_sources_confidence_repatch, false),
    studio_key_navigation_sent_in_extract_review: toBooleanPolicy(merged?.studio_key_navigation_sent_in_extract_review, true),
    studio_contract_rules_sent_in_extract_review: toBooleanPolicy(merged?.studio_contract_rules_sent_in_extract_review, true),
    studio_extraction_guidance_sent_in_extract_review: toBooleanPolicy(merged?.studio_extraction_guidance_sent_in_extract_review, true),
    studio_tooltip_or_description_sent_when_present: toBooleanPolicy(merged?.studio_tooltip_or_description_sent_when_present, true),
    studio_enum_options_sent_when_present: toBooleanPolicy(merged?.studio_enum_options_sent_when_present, true),
    studio_component_variance_constraints_sent_in_component_review: toBooleanPolicy(merged?.studio_component_variance_constraints_sent_in_component_review, true),
    studio_parse_template_sent_direct_in_extract_review: toBooleanPolicy(merged?.studio_parse_template_sent_direct_in_extract_review, true),
    studio_ai_mode_difficulty_effort_sent_direct_in_extract_review: toBooleanPolicy(merged?.studio_ai_mode_difficulty_effort_sent_direct_in_extract_review, true),
    studio_required_level_sent_in_extract_review: toBooleanPolicy(merged?.studio_required_level_sent_in_extract_review, true),
    studio_component_entity_set_sent_when_component_field: toBooleanPolicy(merged?.studio_component_entity_set_sent_when_component_field, true),
    studio_evidence_policy_sent_direct_in_extract_review: toBooleanPolicy(merged?.studio_evidence_policy_sent_direct_in_extract_review, true),
    studio_variance_policy_sent_in_component_review: toBooleanPolicy(merged?.studio_variance_policy_sent_in_component_review, true),
    studio_constraints_sent_in_component_review: toBooleanPolicy(merged?.studio_constraints_sent_in_component_review, true),
    studio_send_booleans_prompted_to_model: toBooleanPolicy(merged?.studio_send_booleans_prompted_to_model, false),
    insufficient_evidence_action: String(merged?.insufficient_evidence_action || 'threshold_unmet').trim() || 'threshold_unmet'
  };
}

function collectRequiredFilled(fieldCandidates = [], requiredFieldSet = new Set()) {
  const filled = new Set();
  for (const row of fieldCandidates || []) {
    const field = String(row?.field || '').trim();
    if (!field || !requiredFieldSet.has(field) || !hasKnownValue(row?.value)) {
      continue;
    }
    filled.add(field);
  }
  return filled;
}

function shouldRunVerifyExtraction(llmContext = {}) {
  return Boolean(llmContext?.verification?.enabled && !llmContext?.verification?.done);
}

export async function extractCandidatesLLM({
  job,
  categoryConfig,
  evidencePack,
  goldenExamples = [],
  targetFields = null,
  config,
  logger,
  llmContext = {},
  componentDBs = {},
  knownValues = {},
  specDb = null
}) {
  if (!hasAnyLlmApiKey(config)) {
    return {
      identityCandidates: {},
      fieldCandidates: [],
      conflicts: [],
      notes: ['LLM disabled'],
      phase08: createEmptyPhase08()
    };
  }

  const effectiveFieldOrder = Array.isArray(targetFields) && targetFields.length
    ? targetFields
    : (categoryConfig.fieldOrder || []);
  const fieldRules = categoryConfig?.fieldRules?.fields || {};

  // Flatten knownValues { enums: { field: { values: [...] } } } into { field: [...] }
  const kvEnums = (knownValues && typeof knownValues === 'object' && knownValues.enums) ? knownValues.enums : {};
  const knownValuesFlat = {};
  for (const [k, v] of Object.entries(kvEnums)) {
    if (v && Array.isArray(v.values)) knownValuesFlat[k] = v.values;
  }
  const maxBatchCount = configInt(config, 'llmMaxBatchesPerProduct');
  const batches = buildFieldBatches({
    targetFields: effectiveFieldOrder,
    fieldRules,
    maxBatches: maxBatchCount
  });
  const usableBatches = batches.length > 0
    ? batches.slice(0, maxBatchCount)
    : [{
      id: 'misc',
      fields: effectiveFieldOrder,
      difficulty: { easy: 0, medium: effectiveFieldOrder.length, hard: 0, instrumented: 0 }
    }];

  const cache = new LLMCache({
      specDb,
      cacheDir: config.llmExtractionCacheDir || '.specfactory_tmp/llm_cache',
      defaultTtlMs: configInt(config, 'llmExtractionCacheTtlMs')
    });
  let cacheHits = 0;
  const routeMatrixPolicy = llmContext?.route_matrix_policy || llmContext?.routeMatrixPolicy || null;

  const invokeModel = async (options = {}) => invokeExtractionModel({
    ...options,
    config,
    logger,
    job: {
      ...job,
      category: job.category || categoryConfig.category || ''
    },
    llmContext,
    evidencePack
  });

  try {
    let aggregateIdentity = {};
    let aggregateCandidates = [];
    let aggregateConflicts = [];
    let aggregateNotes = [];
    let phase08FieldContexts = {};
    let phase08PrimeRows = [];
    const phase08BatchRows = [];
    let phase08BatchErrorCount = 0;

    for (const batch of usableBatches) {
      const batchStartedAt = Date.now();
      const batchFields = normalizeFieldList(batch.fields || [], {
        fieldOrder: effectiveFieldOrder
      });
      if (!batchFields.length) {
        continue;
      }

      const batchRoutePolicy = resolveBatchRoutePolicy({
        routeMatrixPolicy,
        batchFields
      });
      const scoped = selectBatchEvidence({
        evidencePack,
        batchFields,
        config,
        routePolicy: batchRoutePolicy
      });
      const preparedBatch = prepareBatchPromptContext({
        job,
        categoryConfig,
        batchFields,
        scopedEvidencePack: scoped,
        batchRoutePolicy,
        config,
        componentDBs,
        knownValuesMap: knownValuesFlat,
        goldenExamples,
        contextOptions: {
          maxPrimePerField: 3,
          maxPrimeRows: 24,
          maxParseExamples: 2,
          maxComponentEntities: 120,
          maxEnumOptions: 80
        }
      });
      const { validRefs, fieldSet, contextMatrix, minEvidenceRefsByField, promptEvidence, userPayload } = preparedBatch;
      phase08FieldContexts = mergePhase08FieldContexts(phase08FieldContexts, contextMatrix.fields || {});
      phase08PrimeRows = mergePhase08PrimeRows(phase08PrimeRows, contextMatrix?.prime_sources?.rows || []);
      const modelRoute = resolveBatchModel({
        batch,
        config,
        forcedHighFields: llmContext?.forcedHighFields || [],
        fieldRules
      });
      const routeModels = Array.isArray(batchRoutePolicy?.route_models) ? batchRoutePolicy.route_models : [];
      const routePrimaryModel = String(routeModels[0] || '').trim();
      // WHY: Phase-level extraction override — if reasoning is forced at phase level, override batch-level decision
      const phaseReasoningForced = Boolean(config._resolvedExtractionUseReasoning);
      const effectiveReasoningMode = phaseReasoningForced || modelRoute.reasoningMode;
      const model = routePrimaryModel || (
        effectiveReasoningMode
          ? (resolvePhaseModel(config, 'extraction') || String(configValue(config, 'llmModelReasoning')) || modelRoute.model)
          : (resolvePhaseModel(config, 'extraction') || modelRoute.model || String(configValue(config, 'llmModelPlan')))
      );
      // WHY: Phase override token cap takes precedence, then route policy, then batch model route
      const phaseMaxTokens = Math.max(0, Number(config._resolvedExtractionMaxOutputTokens || 0));
      const routeMaxTokens = Math.max(0, Number.parseInt(String(batchRoutePolicy?.max_tokens || 0), 10) || 0);
      const batchModelMaxTokens = Number(modelRoute.maxTokens || 0);
      const tokenCandidates = [phaseMaxTokens, routeMaxTokens, batchModelMaxTokens].filter((t) => t > 0);
      const effectiveMaxTokens = tokenCandidates.length > 0 ? Math.min(...tokenCandidates) : 0;
      if (!Array.isArray(scoped.snippets) || scoped.snippets.length === 0) {
        logger?.info?.('llm_extract_batch_skipped_no_signal', {
          productId: job.productId,
          batch: batch.id,
          field_count: batchFields.length,
          route_key: batchRoutePolicy?.route_key || null
        });
        aggregateNotes.push(`Batch ${batch.id} skipped: no relevant evidence snippets.`);
        phase08BatchRows.push({
          batch_id: String(batch.id || ''),
          status: 'skipped_no_signal',
          route_reason: String(modelRoute.reason || ''),
          model: String(model || ''),
          target_field_count: batchFields.length,
          snippet_count: 0,
          reference_count: 0,
          raw_candidate_count: 0,
          accepted_candidate_count: 0,
          dropped_missing_refs: 0,
          dropped_invalid_refs: 0,
          dropped_evidence_verifier: 0,
          min_refs_satisfied_count: 0,
          min_refs_total: 0,
          elapsed_ms: Math.max(0, Date.now() - batchStartedAt)
        });
        continue;
      }
      logger?.info?.('llm_extract_batch_prompt_profile', {
        productId: job.productId,
        batch: batch.id,
        model,
        route_reason: modelRoute.reason,
        route_key: batchRoutePolicy?.route_key || null,
        route_single_source_data: Boolean(batchRoutePolicy?.single_source_data),
        route_all_source_data: Boolean(batchRoutePolicy?.all_source_data),
        route_enable_websearch: Boolean(batchRoutePolicy?.enable_websearch),
        route_insufficient_evidence_action: batchRoutePolicy?.insufficient_evidence_action || 'threshold_unmet',
        target_field_count: batchFields.length,
        reference_count: promptEvidence.references.length,
        snippet_count: promptEvidence.snippets.length,
        snippet_chars_total: promptEvidence.snippets.reduce(
          (sum, row) => sum + String(row?.text || '').length,
          0
        ),
        visual_asset_count: Array.isArray(scoped?.visual_assets) ? scoped.visual_assets.length : 0,
        prime_source_rows: Number(contextMatrix?.prime_sources?.rows?.length || 0),
        payload_chars: JSON.stringify(userPayload).length
      });
      const scopedInvocationEvidencePack = {
        ...evidencePack,
        references: Array.isArray(evidencePack?.references)
          ? evidencePack.references
          : scoped.references,
        snippets: Array.isArray(evidencePack?.snippets)
          ? evidencePack.snippets
          : scoped.snippets,
        visual_assets: (Array.isArray(scoped.visual_assets) && scoped.visual_assets.length > 0)
          ? scoped.visual_assets
          : (Array.isArray(evidencePack?.visual_assets) ? evidencePack.visual_assets : [])
      };

      const cacheKey = cache?.getCacheKey({
        model,
        prompt: {
          batch: batch.id,
          reason: modelRoute.reason
        },
        evidence: {
          fields: batchFields,
          snippets: (scoped.snippets || []).map((row) => ({
            id: row.id,
            snippet_hash: row.snippet_hash || ''
          }))
        },
        extra: {
          productId: job.productId || '',
          runId: llmContext.runId || '',
          routeKey: batchRoutePolicy?.route_key || '',
          routeModelLadder: batchRoutePolicy?.model_ladder_today || '',
          routeSingleSourceData: Boolean(batchRoutePolicy?.single_source_data),
          routeAllSourceData: Boolean(batchRoutePolicy?.all_source_data),
          routeEnableWebsearch: Boolean(batchRoutePolicy?.enable_websearch),
          routeInsufficientEvidenceAction: batchRoutePolicy?.insufficient_evidence_action || 'threshold_unmet'
        }
      });

      const repatchEnabled = Boolean(batchRoutePolicy?.all_sources_confidence_repatch);
      const repatchModel = String(
        routeModels[1]
          || (effectiveReasoningMode ? '' : (resolvePhaseModel(config, 'extraction') || String(configValue(config, 'llmModelReasoning'))))
      ).trim();
      const repatchReason = `${modelRoute.reason}_repatch`;
      const primaryRequest = {
        model,
        routeRole: modelRoute.routeRole || 'extract',
        reasoningMode: Boolean(effectiveReasoningMode),
        reason: modelRoute.reason,
        maxTokens: effectiveMaxTokens,
        usageTracker: null,
        userPayload,
        promptEvidence,
        fieldSet,
        validRefs,
        minEvidenceRefsByField,
        scopedEvidencePack: scopedInvocationEvidencePack,
        routeMatrixPolicy: batchRoutePolicy
      };
      const repatchRequest = repatchEnabled && repatchModel && repatchModel !== model
        ? {
          ...primaryRequest,
          model: repatchModel,
          reasoningMode: true,
          reason: repatchReason
        }
        : null;
      let sanitized = null;

      try {
        const executionResult = await executeExtractionBatch({
          batchId: String(batch.id || ''),
          productId: job.productId || '',
          cache,
          cacheKey,
          providerPinEnabled: Boolean(config.llmForceRoleModelProvider),
          logger,
          invokeModel,
          primaryRequest,
          repatchRequest
        });
        sanitized = executionResult.sanitized;
        if (executionResult.cacheHit) {
          cacheHits += 1;
        }
        aggregateNotes.push(...(executionResult.notes || []));
      } catch (error) {
        phase08BatchErrorCount += 1;
        phase08BatchRows.push({
          batch_id: String(batch.id || ''),
          status: 'failed',
          route_reason: String(modelRoute.reason || ''),
          model: String(model || ''),
          target_field_count: batchFields.length,
          snippet_count: Number(promptEvidence.snippets.length || 0),
          reference_count: Number(promptEvidence.references.length || 0),
          raw_candidate_count: 0,
          accepted_candidate_count: 0,
          dropped_missing_refs: 0,
          dropped_invalid_refs: 0,
          dropped_evidence_verifier: 0,
          min_refs_satisfied_count: 0,
          min_refs_total: 0,
          elapsed_ms: Math.max(0, Date.now() - batchStartedAt),
          error: String(error?.message || 'llm_extract_batch_failed')
        });
        aggregateNotes.push(`Batch ${batch.id} failed: ${error?.message || 'unknown error'}.`);
        logger?.warn?.('llm_extract_batch_failed', {
          productId: job.productId,
          batch: batch.id,
          model,
          reason: modelRoute.reason,
          message: error?.message || 'unknown_error'
        });
        continue;
      }

      const batchElapsedMs = Math.max(0, Date.now() - batchStartedAt);
      const completedBatchRow = buildCompletedPhase08BatchRow({
        batchId: batch.id,
        routeReason: modelRoute.reason,
        model,
        batchFields,
        promptEvidence,
        sanitized,
        minEvidenceRefsByField,
        elapsedMs: batchElapsedMs
      });
      phase08BatchRows.push(completedBatchRow);
      logger?.info?.('llm_extract_batch_outcome', {
        productId: job.productId,
        batch: batch.id,
        model,
        status: 'completed',
        raw_candidate_count: Number(completedBatchRow.raw_candidate_count || 0),
        accepted_candidate_count: Number(completedBatchRow.accepted_candidate_count || 0),
        dropped_missing_refs: Number(completedBatchRow.dropped_missing_refs || 0),
        dropped_invalid_refs: Number(completedBatchRow.dropped_invalid_refs || 0),
        dropped_evidence_verifier: Number(completedBatchRow.dropped_evidence_verifier || 0),
        min_refs_satisfied_count: Number(completedBatchRow.min_refs_satisfied_count || 0),
        min_refs_total: Number(completedBatchRow.min_refs_total || 0),
        elapsed_ms: batchElapsedMs
      });

      // Stamp model attribution on each candidate
      for (const cand of sanitized.fieldCandidates || []) {
        cand.llm_extract_model = model || String(configValue(config, 'llmModelPlan'));
        cand.llm_extract_provider = String(configValue(config, 'llmProvider'));
      }

      aggregateIdentity = {
        ...aggregateIdentity,
        ...sanitized.identityCandidates
      };
      aggregateCandidates.push(...(sanitized.fieldCandidates || []));
      aggregateConflicts.push(...(sanitized.conflicts || []));
      aggregateNotes.push(...(sanitized.notes || []));
    }

    const primary = {
      identityCandidates: aggregateIdentity,
      fieldCandidates: dedupeFieldCandidates(aggregateCandidates),
      conflicts: aggregateConflicts,
      notes: aggregateNotes
    };
    primary.phase08 = buildPhase08ExtractionPayload({
      batchRows: phase08BatchRows,
      batchErrorCount: phase08BatchErrorCount,
      fieldContexts: phase08FieldContexts,
      primeRows: phase08PrimeRows
    });
    if (cacheHits > 0) {
      primary.notes.push(`LLM cache hits: ${cacheHits}.`);
    }

    if (shouldRunVerifyExtraction(llmContext) && usableBatches.length > 0) {
      llmContext.verification.done = true;
      const verificationResult = await runExtractionVerification({
        job,
        categoryConfig,
        usableBatches,
        fieldRules,
        effectiveFieldOrder,
        evidencePack,
        config,
        logger,
        llmContext,
        componentDBs,
        knownValuesFlat,
        goldenExamples,
        routeMatrixPolicy,
        invokeModel,
        hasKnownValueFn: hasKnownValue,
        resolveBatchRoutePolicyFn: resolveBatchRoutePolicy
      });
      if (verificationResult?.reportKey) {
        llmContext.verification.report_key = verificationResult.reportKey;
      }
    }

    logger?.info?.('llm_extract_completed', {
      model: resolvePhaseModel(config, 'extraction') || String(configValue(config, 'llmModelPlan')),
      candidate_count: primary.fieldCandidates.length,
      conflict_count: primary.conflicts.length,
      batch_count: usableBatches.length,
      cache_hits: cacheHits
    });

    return primary;
  } catch (error) {
    logger?.warn?.('llm_extract_failed', { message: error.message });
    return {
      identityCandidates: {},
      fieldCandidates: [],
      conflicts: [],
      notes: ['LLM extraction failed'],
      phase08: createEmptyPhase08()
    };
  }
}
