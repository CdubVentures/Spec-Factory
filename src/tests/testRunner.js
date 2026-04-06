// WHY: Processes test mode source results through the full field rules pipeline:
// consensus → normalization → cross-validation → traffic light → artifact persistence.

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
  storage,
  config,
  job,
  sourceResults,
  category,
  specDb = null,
  fieldRules = null,
  knownValues = null,
  componentDBs = null,
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
  }

  // Step 4: Apply runtime field rules (normalize + cross-validate + evidence gate)
  const curationQueue = [];
  const componentReviewQueue = [];
  const identityObservations = [];
  const gateResult = applyRuntimeFieldRules({
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

  // Step 5: Build traffic light (update provenance values after normalization)
  for (const field of fieldOrder) {
    if (provenance[field]) provenance[field].value = gateResult.fields[field];
  }
  const trafficLight = buildTrafficLight({ fieldOrder, provenance });

  // Step 6: Compute summary metrics
  const total = fieldOrder.length;
  const coverage = total > 0
    ? (trafficLight.counts.green + trafficLight.counts.yellow) / total
    : 0;

  const requiredFields = compiledRules?.required_fields || [];
  const requiredPopulated = requiredFields.filter(f => hasKnownValue(gateResult.fields[f])).length;
  const completeness = requiredFields.length > 0
    ? requiredPopulated / requiredFields.length
    : 1;

  const confidenceValues = fieldOrder
    .map(f => provenance[f]?.confidence || 0)
    .filter(c => c > 0);
  const confidence = confidenceValues.length > 0
    ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
    : 0;

  const missingRequired = requiredFields.filter(f => !hasKnownValue(gateResult.fields[f]));
  const crossValidationFailures = gateResult.failures.filter(f => f.stage === 'cross_validate');

  const summary = {
    productId,
    runId,
    category,
    confidence,
    coverage_overall: coverage,
    completeness_required: completeness,
    traffic_light: trafficLight,
    missing_required_fields: missingRequired,
    constraint_analysis: {
      contradictionCount: crossValidationFailures.length,
      violations: crossValidationFailures,
    },
    runtime_engine: {
      applied: gateResult.applied,
      failures: gateResult.failures,
      warnings: gateResult.warnings,
      changes: gateResult.changes,
      curation_suggestions_count: curationQueue.length,
      identity_observations_count: identityObservations.length,
    },
  };

  // Step 7: Persist artifacts to storage
  const normalized = {
    identity: job.identityLock || {},
    fields: gateResult.fields,
  };
  const latestBase = storage.resolveOutputKey(category, productId, 'latest');
  await storage.writeObject(
    `${latestBase}/normalized.json`,
    JSON.stringify(normalized, null, 2),
  );
  await storage.writeObject(
    `${latestBase}/summary.json`,
    JSON.stringify(summary, null, 2),
  );
  await storage.writeObject(
    `${latestBase}/provenance.json`,
    JSON.stringify(provenance, null, 2),
  );

  // Step 8: Persist curation suggestions to specDb
  if (specDb) {
    const componentSuggestions = curationQueue.filter(s => s.suggestion_type === 'new_component');
    const enumSuggestions = curationQueue.filter(s => !s.suggestion_type || s.suggestion_type !== 'new_component');
    await appendComponentCurationSuggestions({ category, productId, runId, suggestions: componentSuggestions, specDb });
    await appendEnumCurationSuggestions({ category, productId, runId, suggestions: enumSuggestions, specDb });
  }

  // Step 9: Return real results
  return {
    productId,
    runId,
    testCase: job._testCase || null,
    confidence,
    coverage,
    completeness,
    validated: true,
    trafficLight: trafficLight.counts,
    constraintConflicts: crossValidationFailures.length,
    missingRequired,
    curationSuggestions: curationQueue.length,
    runtimeFailures: gateResult.failures.length,
    durationMs: Date.now() - startTime,
  };
}
