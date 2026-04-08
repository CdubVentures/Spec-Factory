// WHY: Processes test mode source results through the full field rules pipeline:
// consensus → validation (authority) → repair → DB persistence.
// The publisher validator is the authority for field values and metrics.
// The old engine (applyRuntimeFieldRules) runs only for curation suggestion discovery.

import { buildRunId } from '../shared/primitives.js';
import { buildCandidateFieldMap } from '../features/indexing/orchestration/shared/candidateHelpers.js';
import { createEmptyProvenance } from '../features/indexing/orchestration/shared/provenanceHelpers.js';
import { FieldRulesEngine } from '../engine/fieldRulesEngine.js';
import { applyRuntimeFieldRules } from '../engine/runtimeGate.js';
import { buildTrafficLight } from '../features/indexing/validation/trafficLight.js';
import { hasKnownValue } from '../shared/valueNormalizers.js';
import {
  appendComponentCurationSuggestions,
  appendEnumCurationSuggestions,
} from '../engine/curationSuggestions.js';

export async function runTestProduct({
  config,
  job,
  sourceResults,
  category,
  specDb = null,
  fieldRules = null,
  knownValues = null,
  componentDBs = null,
  aiReview = false,
  logger = null,
  onProgress = null,
  _repairDeps = null,
  _validationOverride = null,
}) {
  const startTime = Date.now();
  const runId = buildRunId();
  const productId = job.productId;

  // Step 1: Collect candidates from all sources and resolve best value per field
  const allCandidates = (sourceResults || []).flatMap(src => src.fieldCandidates || []);
  const resolvedFields = buildCandidateFieldMap(allCandidates);

  // Step 2: Create FieldRulesEngine (DB-first, JSON fallback)
  let engine = null;
  try {
    engine = await FieldRulesEngine.create(category, { specDb });
  } catch {
    // Non-fatal — proceed without engine (no normalization)
  }
  const compiledRules = specDb?.getCompiledRules?.() ?? null;

  // Step 3: Build provenance from source evidence
  const fieldOrder = compiledRules?.field_order || Object.keys(resolvedFields);
  const provenance = createEmptyProvenance(fieldOrder, resolvedFields);

  for (const src of sourceResults || []) {
    for (const cand of src.fieldCandidates || []) {
      if (resolvedFields[cand.field] === undefined) continue;
      const prov = provenance[cand.field];
      if (!prov) continue;
      prov.evidence.push({
        tier: src.tier,
        tierName: src.tierName,
        method: cand.method,
        url: src.url,
        snippet_id: cand.snippetId,
        quote: cand.quote,
        source_id: src.llmEvidencePack?.meta?.source_id || src.host,
      });
      prov.confirmations += 1;
    }
  }

  // Set pass_target and confidence from evidence quality
  for (const field of fieldOrder) {
    const prov = provenance[field];
    if (!prov || prov.evidence.length === 0) continue;
    const ruleEvidence = engine?.getFieldRule?.(field)?.evidence || {};
    prov.pass_target = ruleEvidence.min_evidence_refs || 1;
    prov.meets_pass_target = prov.confirmations >= prov.pass_target;
    const tiers = prov.evidence.map(e => e.tier || 99);
    const bestTier = Math.min(...tiers);
    prov.confidence = bestTier === 1 ? 0.95 : bestTier === 2 ? 0.75 : bestTier === 3 ? 0.5 : 0.2;
    // WHY: Reduce confidence when evidence requirements not met
    if (!prov.meets_pass_target) {
      prov.confidence = Math.min(prov.confidence, 0.5);
    }
  }

  // Step 4a: Apply runtime field rules (curation suggestion discovery ONLY)
  const curationQueue = [];
  const componentReviewQueue = [];
  const identityObservations = [];
  applyRuntimeFieldRules({
    engine,
    fields: resolvedFields,
    provenance,
    fieldOrder,
    enforceEvidence: false,
    curationQueue,
    componentReviewQueue,
    identityObservations,
    extractedValues: resolvedFields,
  });

  // Step 4b: Run publisher validator on raw resolved fields (AUTHORITY)
  let validationResult = _validationOverride || null;
  let repairLog = null;
  if (!_validationOverride) {
    try {
      const { validateRecord } = await import('../features/publisher/validation/validateRecord.js');
      validationResult = validateRecord({
        fields: resolvedFields,
        fieldRules: fieldRules?.fields || {},
        knownValues: knownValues || null,
        componentDbs: componentDBs || null,
        crossRules: compiledRules?.cross_validation_rules || fieldRules?.cross_validation_rules || null,
      });
    } catch {
      // Non-fatal — validator may not be available in all environments
    }
  }

  // Validator output is the working copy for repair + storage
  const workingFields = { ...(validationResult?.fields || resolvedFields) };

  // WHY: Rejected fields must not persist invalid values — set to canonical absence.
  // Repair (if AI on) may restore them; if not, unk is the correct output.
  if (validationResult) {
    for (const [fieldKey, pf] of Object.entries(validationResult.perField)) {
      if (!pf.valid) {
        const fieldRule = (fieldRules?.fields || {})[fieldKey] || null;
        const shape = fieldRule?.contract?.shape || 'scalar';
        workingFields[fieldKey] = shape === 'list' ? [] : shape === 'record' ? {} : 'unk';
      }
    }
  }

  // Step 4c-det: Build deterministic field audit log (no LLM calls)
  // WHY: Shows every field's validation result + the exact prompt that WOULD be sent
  if (!aiReview && validationResult) {
    try {
      const { buildRepairPrompt: buildPrompt } = await import(
        '../features/publisher/repair-adapter/promptBuilder.js'
      );

      // Resolve model from config routing (pure config read, no network)
      let routeModel = null;
      try {
        const { resolveLlmRoute } = await import('../core/llm/client/routing.js');
        const route = resolveLlmRoute(config || {}, { role: 'validate', phase: 'validate' });
        routeModel = route?.model || null;
      } catch { /* config may not have routes */ }

      repairLog = [];
      for (const [fieldKey, perField] of Object.entries(validationResult.perField)) {
        const fieldRule = (fieldRules?.fields || {})[fieldKey] || null;

        if (perField.valid) {
          repairLog.push({
            field: fieldKey, promptId: null, prompt_in: null, response_out: null,
            status: 'valid',
            value_before: perField.value, value_after: perField.value,
            error: null, rejections: [], revalidation: null,
            model: null, cost_usd: null, tokens: null,
          });
        } else {
          const enumData = knownValues?.enums?.[fieldKey] || null;
          const prompt = buildPrompt({
            rejections: perField.rejections, value: perField.value,
            fieldKey, fieldRule, knownValues: enumData,
          });

          repairLog.push({
            field: fieldKey, promptId: prompt?.promptId || null,
            prompt_in: prompt ? { system: prompt.system.slice(0, 500), user: prompt.user } : null,
            response_out: null, status: prompt ? 'pending_llm' : 'prompt_skipped',
            value_before: perField.value, value_after: null,
            error: null,
            rejections: perField.rejections || [], revalidation: null,
            model: prompt ? routeModel : null, cost_usd: null, tokens: null,
          });
        }
      }
    } catch (err) {
      logger?.warn?.('deterministic_audit_failed', { error: err.message });
    }
  }

  // Step 4c: LLM repair on rejected fields (only when AI Review enabled)
  if (aiReview && validationResult && config) {
    try {
      let repairField, repairCrossField, buildRepairPrompt, callLlm;
      // WHY: Intercept onUsage so we can capture cost/model per repair call
      let lastUsage = null;
      if (_repairDeps) {
        ({ repairField, repairCrossField, buildRepairPrompt, callLlm } = _repairDeps);
      } else {
        const { buildLlmCallDeps } = await import('../core/llm/buildLlmCallDeps.js');
        const { createRepairCallLlm } = await import('../features/publisher/repairLlmAdapter.js');
        ({ repairField, repairCrossField } = await import('../features/publisher/repair-adapter/repairField.js'));
        ({ buildRepairPrompt } = await import('../features/publisher/repair-adapter/promptBuilder.js'));
        const baseDeps = buildLlmCallDeps({ config, logger });
        const wrappedDeps = {
          ...baseDeps,
          callRoutedLlmFn: (args) => baseDeps.callRoutedLlmFn({
            ...args,
            onUsage: (usage) => { lastUsage = usage; },
          }),
        };
        callLlm = createRepairCallLlm(wrappedDeps);
      }

      repairLog = [];

      // Per-field repair
      const invalidEntries = Object.entries(validationResult.perField).filter(([, pf]) => !pf.valid);
      const repairTotal = invalidEntries.length;
      let repairIndex = 0;

      for (const [fieldKey, perField] of invalidEntries) {
        const fieldRule = (fieldRules?.fields || {})[fieldKey] || null;
        const enumData = knownValues?.enums?.[fieldKey] || null;

        const prompt = buildRepairPrompt({
          rejections: perField.rejections, value: perField.value,
          fieldKey, fieldRule, knownValues: enumData,
        });

        // WHY: Emit progress before each LLM call so the UI shows each repair happening live
        if (onProgress) {
          onProgress({ phase: 'repair', field: fieldKey, promptId: prompt?.promptId || null, index: repairIndex, total: repairTotal, status: 'calling' });
        }

        const repairResult = await repairField({
          validationResult: perField, fieldKey, fieldRule,
          knownValues: enumData, callLlm,
        });

        const shape = fieldRule?.contract?.shape || 'scalar';
        const unkValue = shape === 'list' ? [] : shape === 'record' ? {} : 'unk';

        if (repairResult.status === 'repaired') {
          workingFields[fieldKey] = repairResult.value;
        } else {
          workingFields[fieldKey] = unkValue;
        }

        // WHY: Capture cost/model from the onUsage interceptor for this call
        const usage = lastUsage;
        lastUsage = null;

        const entry = {
          field: fieldKey,
          promptId: prompt?.promptId || null,
          prompt_in: prompt ? { system: prompt.system.slice(0, 500), user: prompt.user } : null,
          response_out: repairResult.decisions || null,
          status: repairResult.status,
          value_before: perField.value,
          value_after: repairResult.status === 'repaired' ? repairResult.value : unkValue,
          error: repairResult.error || null,
          rejections: perField.rejections || [],
          revalidation: repairResult.revalidation || null,
          model: usage?.model || null,
          cost_usd: usage?.cost_usd ?? null,
          tokens: usage ? (usage.prompt_tokens || 0) + (usage.completion_tokens || 0) : null,
        };
        repairLog.push(entry);

        // WHY: Emit progress after each LLM call so the UI updates immediately
        if (onProgress) {
          onProgress({ phase: 'repair', field: fieldKey, promptId: entry.promptId, index: repairIndex, total: repairTotal, status: entry.status, value_after: entry.value_after });
        }
        repairIndex++;
      }

      // Cross-field repair (P6)
      const crossFailures = validationResult.crossFieldFailures || [];
      if (crossFailures.length > 0) {
        if (onProgress) {
          onProgress({ phase: 'repair', field: 'cross_field', promptId: 'P6', index: repairIndex, total: repairTotal + 1, status: 'calling' });
        }
        const crossResult = await repairCrossField({
          crossFieldFailures: crossFailures,
          fields: workingFields,
          productName: job.productId,
          fieldRules: fieldRules?.fields || {},
          knownValues: knownValues || null,
          componentDbs: componentDBs || null,
          crossRules: compiledRules?.cross_validation_rules || fieldRules?.cross_validation_rules || null,
          callLlm,
        });
        if (crossResult.status === 'repaired' && crossResult.repairs) {
          for (const r of crossResult.repairs) {
            workingFields[r.field] = r.new_value;
          }
        }
        repairLog.push({
          field: 'cross_field',
          promptId: crossResult.promptId,
          prompt_in: null,
          response_out: crossResult.repairs,
          status: crossResult.status,
          value_before: null,
          value_after: null,
          error: crossResult.error || null,
          rejections: crossFailures,
          revalidation: crossResult.revalidation || null,
        });
      }
    } catch (err) {
      logger?.warn?.('repair_pass_failed', { error: err.message });
    }
  }

  // Step 5: Build traffic light (validator output drives provenance values)
  for (const field of fieldOrder) {
    if (provenance[field]) provenance[field].value = workingFields[field];
  }
  const trafficLight = buildTrafficLight({ fieldOrder, provenance });

  // Step 6: Compute summary metrics (all from validator output)
  const total = fieldOrder.length;
  const coverage = total > 0
    ? (trafficLight.counts.green + trafficLight.counts.yellow) / total
    : 0;

  // WHY: Derive requiredFields from fieldRules (not compiledRules which may be empty for test categories)
  const requiredFields = Object.entries(fieldRules?.fields || {})
    .filter(([, r]) => {
      const level = r.required || r.required_level || 'optional';
      return level === 'required' || level === 'critical';
    })
    .map(([k]) => k);
  const requiredPopulated = requiredFields.filter(f => hasKnownValue(workingFields[f])).length;
  const completeness = requiredFields.length > 0
    ? requiredPopulated / requiredFields.length
    : 1;

  const confidenceValues = fieldOrder
    .map(f => provenance[f]?.confidence || 0)
    .filter(c => c > 0);
  const confidence = confidenceValues.length > 0
    ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
    : 0;

  const missingRequired = requiredFields.filter(f => !hasKnownValue(workingFields[f]));
  const crossValidationFailures = validationResult?.crossFieldFailures || [];
  const invalidFieldCount = validationResult
    ? Object.values(validationResult.perField).filter(pf => !pf.valid).length
    : 0;

  // Step 7: Save all test data to field_test table (DB is SSOT — no JSON artifacts)
  if (specDb) {
    const testCase = job._testCase || {};
    const rl = repairLog || [];
    try {
      specDb.upsertFieldTest({
        category,
        product_id: productId,
        scenario_id: testCase.id ?? null,
        scenario_name: testCase.name ?? null,
        scenario_category: testCase.category ?? null,
        scenario_desc: testCase.description ?? null,
        run_id: runId,
        confidence,
        coverage,
        completeness,
        traffic_green: trafficLight.counts.green || 0,
        traffic_yellow: trafficLight.counts.yellow || 0,
        traffic_red: trafficLight.counts.red || 0,
        constraint_conflicts: crossValidationFailures.length,
        missing_required: JSON.stringify(missingRequired),
        curation_suggestions: curationQueue.length,
        runtime_failures: invalidFieldCount,
        duration_ms: Date.now() - startTime,
        fields_json: JSON.stringify(workingFields),
        validation_json: validationResult ? JSON.stringify(validationResult) : null,
        repair_json: rl.length > 0 ? JSON.stringify(rl) : null,
        repair_total: rl.length,
        repair_repaired: rl.filter(r => r.status === 'repaired').length,
        repair_failed: rl.filter(r => r.status === 'still_failed').length,
        repair_rerun: rl.filter(r => r.status === 'rerun_recommended').length,
        repair_skipped: rl.filter(r => r.status === 'prompt_skipped').length,
      });
    } catch (err) {
      logger?.warn?.('field_test_upsert_failed', { error: err.message });
    }
  }

  // Step 8: Persist curation suggestions to specDb
  if (specDb) {
    const componentSuggestions = curationQueue.filter(s => s.suggestion_type === 'new_component');
    const enumSuggestions = curationQueue.filter(s => !s.suggestion_type || s.suggestion_type !== 'new_component');
    await appendComponentCurationSuggestions({ category, productId, runId, suggestions: componentSuggestions, specDb });
    await appendEnumCurationSuggestions({ category, productId, runId, suggestions: enumSuggestions, specDb });
  }

  // Step 9: Return results
  return {
    productId,
    runId,
    testCase: job._testCase || null,
    confidence,
    coverage,
    completeness,
    validated: validationResult?.valid ?? true,
    trafficLight: trafficLight.counts,
    constraintConflicts: crossValidationFailures.length,
    missingRequired,
    curationSuggestions: curationQueue.length,
    runtimeFailures: invalidFieldCount,
    durationMs: Date.now() - startTime,
    repairLog: repairLog ? {
      total: repairLog.length,
      repaired: repairLog.filter(r => r.status === 'repaired').length,
      failed: repairLog.filter(r => r.status === 'still_failed').length,
      rerunRecommended: repairLog.filter(r => r.status === 'rerun_recommended').length,
      promptSkipped: repairLog.filter(r => r.status === 'prompt_skipped').length,
      pendingLlm: repairLog.filter(r => r.status === 'pending_llm').length,
      valid: repairLog.filter(r => r.status === 'valid').length,
      costUsd: repairLog.reduce((sum, r) => sum + (r.cost_usd || 0), 0),
    } : null,
  };
}
