import path from 'node:path';
import { nowIso } from '../../../shared/primitives.js';
import { createFieldRulesEngine } from '../../../engine/fieldRulesEngine.js';
import { applyRuntimeFieldRules } from '../../../engine/runtimeGate.js';
import {
  upsertProductInConsolidated,
  readProductFromConsolidated,
  resolveConsolidatedOverridePath,
} from '../../../shared/consolidatedOverrides.js';
import { buildProductReviewPayload } from './reviewGridData.js';
import { isObject, toArray, normalizeToken } from './reviewNormalization.js';
import { toFloat } from '../../../shared/valueNormalizers.js';
import { parseDateMs } from '../../../publish/publishPrimitives.js';
import {
  normalizeField,
  hasKnownValue,
  normalizeComparableValue,
  normalizeOverrideEvidence,
  manualCandidateId,
  extractOverrideValue,
  extractOverrideProvenance,
  removeFieldFromList,
  addFieldToList,
  reviewKeys,
  latestKeys,
  findCandidateRows,
  buildCandidateOverrideEntry,
  buildCandidateMap,
  selectCandidateForValue,
  readReviewProductPayload,
  listOverrideDocs,
  writeStorageJson,
  normalizeQuoteSpan,
} from './overrideHelpers.js';

export function resolveOverrideFilePath({ config = {}, category, productId }) {
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  return path.join(helperRoot, category, '_overrides', `${productId}.overrides.json`);
}

export async function readReviewArtifacts({ storage, category, productId }) {
  const keys = reviewKeys(storage, category, productId);
  let candidates = await storage.readJsonOrNull(keys.candidatesKey);
  let reviewQueue = await storage.readJsonOrNull(keys.reviewQueueKey);
  if (!candidates) {
    candidates = await storage.readJsonOrNull(keys.legacyCandidatesKey);
  }
  if (!reviewQueue) {
    reviewQueue = await storage.readJsonOrNull(keys.legacyReviewQueueKey);
  }
  return {
    keys,
    candidates: candidates || {
      version: 1,
      generated_at: nowIso(),
      category,
      product_id: productId,
      candidate_count: 0,
      field_count: 0,
      items: [],
      by_field: {}
    },
    reviewQueue: reviewQueue || {
      version: 1,
      generated_at: nowIso(),
      category,
      product_id: productId,
      count: 0,
      items: []
    }
  };
}

export async function setOverrideFromCandidate({
  storage,
  config = {},
  category,
  productId,
  field,
  candidateId,
  candidateValue = null,
  candidateScore = null,
  candidateSource = '',
  candidateMethod = '',
  candidateTier = null,
  candidateEvidence = null,
  reviewer = '',
  reason = '',
  specDb = null
}) {
  const normalizedField = normalizeField(field);
  if (!normalizedField) {
    throw new Error('set-override requires a valid --field');
  }
  const targetCandidateId = String(candidateId || '').trim();
  if (!targetCandidateId) {
    throw new Error('set-override requires --candidate-id');
  }

  const review = await readReviewArtifacts({ storage, category, productId });
  const rows = findCandidateRows(review.candidates);
  let candidate = rows.find((row) =>
    normalizeToken(row.candidate_id) === normalizeToken(targetCandidateId)
    && normalizeField(row.field) === normalizedField
  );
  if (!candidate && candidateValue != null && String(candidateValue).trim()) {
    const now = nowIso();
    const fallbackSource = String(candidateSource || '').trim() || 'pipeline';
    const fallbackEvidence = isObject(candidateEvidence) ? candidateEvidence : {};
    candidate = {
      candidate_id: targetCandidateId,
      field: normalizedField,
      value: String(candidateValue).trim(),
      score: Number.isFinite(toFloat(candidateScore, NaN)) ? toFloat(candidateScore, 0) : 0,
      candidate_index: null,
      source_id: String(fallbackEvidence.source_id || fallbackSource).trim() || null,
      source: fallbackSource,
      host: fallbackSource,
      tier: Number.isFinite(toFloat(candidateTier, NaN)) ? toFloat(candidateTier, null) : null,
      method: String(candidateMethod || 'synthetic_candidate_accept').trim(),
      evidence_key: String(fallbackEvidence.url || '').trim() || null,
      evidence: {
        url: String(fallbackEvidence.url || '').trim(),
        retrieved_at: String(fallbackEvidence.retrieved_at || now).trim(),
        snippet_id: String(fallbackEvidence.snippet_id || '').trim() || null,
        snippet_hash: String(fallbackEvidence.snippet_hash || '').trim() || null,
        quote: String(fallbackEvidence.quote || '').trim() || null,
        quote_span: normalizeQuoteSpan(fallbackEvidence.quote_span),
        snippet_text: String(fallbackEvidence.snippet_text || '').trim() || null,
        source_id: String(fallbackEvidence.source_id || fallbackSource).trim() || null
      }
    };
  }
  if (!candidate) {
    throw new Error(`candidate_id '${targetCandidateId}' not found for field '${normalizedField}'`);
  }

  // WHY: Overlap 0d — read from consolidated JSON SSOT before merge
  const existing = await readProductFromConsolidated({ config, category, productId });
  const startedAt = String(existing?.review_started_at || nowIso()).trim();
  const current = isObject(existing) ? existing : {
    category,
    product_id: productId,
    created_at: nowIso(),
    review_started_at: startedAt,
    review_status: 'in_progress',
    overrides: {}
  };
  const setAt = nowIso();
  const entry = buildCandidateOverrideEntry({
    candidate,
    category,
    productId,
    field: normalizedField,
    reviewer,
    reason,
    setAt
  });
  current.category = category;
  current.product_id = productId;
  current.review_started_at = startedAt;
  current.review_status = 'in_progress';
  current.updated_at = nowIso();
  current.overrides = {
    ...(isObject(current.overrides) ? current.overrides : {}),
    [normalizedField]: entry
  };

  // WHY: Overlap 0d — JSON SSOT first, SQL is derived cache
  await upsertProductInConsolidated({ config, category, productId, productEntry: current });
  if (specDb) {
    try {
      specDb.upsertItemFieldState({
        productId,
        fieldKey: normalizedField,
        value: String(candidate.value || '').trim(),
        confidence: 1.0,
        source: 'user',
        acceptedCandidateId: candidate.candidate_id || null,
        overridden: true,
        needsAiReview: false,
        aiReviewComplete: true,
        overrideSource: 'candidate_selection',
        overrideValue: String(candidate.value || '').trim(),
        overrideReason: reason || null,
        overrideProvenance: entry.override_provenance || null,
        overriddenBy: reviewer || null,
        overriddenAt: setAt
      });
      specDb.syncItemListLinkForFieldValue({
        productId,
        fieldKey: normalizedField,
        value: String(candidate.value || '').trim(),
      });
      specDb.upsertProductReviewState({
        productId,
        reviewStatus: 'in_progress',
        reviewStartedAt: startedAt,
      });
    } catch { /* best-effort */ }
  }

  const consolidatedPath = resolveConsolidatedOverridePath({ config, category });
  return {
    override_path: consolidatedPath,
    field: normalizedField,
    candidate_id: candidate.candidate_id,
    value: String(candidate.value || '').trim()
  };
}

export async function setManualOverride({
  storage,
  config = {},
  category,
  productId,
  field,
  value,
  evidence = {},
  reviewer = '',
  reason = '',
  specDb = null
}) {
  const normalizedField = normalizeField(field);
  if (!normalizedField) {
    throw new Error('setManualOverride requires a valid field');
  }
  const nextValue = String(value || '').trim();
  if (!nextValue) {
    throw new Error('setManualOverride requires value');
  }
  const normalizedEvidence = normalizeOverrideEvidence(evidence);
  // WHY: Overlap 0d — read from consolidated JSON SSOT before merge
  const existing = await readProductFromConsolidated({ config, category, productId });
  const startedAt = String(existing?.review_started_at || nowIso()).trim();
  const current = isObject(existing) ? existing : {
    category,
    product_id: productId,
    created_at: nowIso(),
    review_started_at: startedAt,
    review_status: 'in_progress',
    overrides: {}
  };

  const setAt = nowIso();
  current.category = category;
  current.product_id = productId;
  current.review_started_at = startedAt;
  current.review_status = 'in_progress';
  current.updated_at = setAt;
  current.overrides = {
    ...(isObject(current.overrides) ? current.overrides : {}),
    [normalizedField]: {
      field: normalizedField,
      override_source: 'manual_entry',
      candidate_index: null,
      override_value: nextValue,
      override_reason: String(reason || '').trim() || null,
      override_provenance: normalizedEvidence,
      overridden_by: String(reviewer || '').trim() || null,
      overridden_at: setAt,
      validated: null,
      candidate_id: manualCandidateId({
        category,
        productId,
        field: normalizedField,
        value: nextValue,
        evidence: normalizedEvidence,
      }),
      value: nextValue,
      source: {
        host: 'manual-override.local',
        source_id: normalizedEvidence.source_id,
        method: 'manual_override',
        tier: 1,
        evidence_key: normalizedEvidence.url
      },
      set_at: setAt
    }
  };

  // WHY: Overlap 0d — JSON SSOT first, SQL is derived cache
  await upsertProductInConsolidated({ config, category, productId, productEntry: current });
  if (specDb) {
    try {
      specDb.upsertItemFieldState({
        productId,
        fieldKey: normalizedField,
        value: nextValue,
        confidence: 1.0,
        source: 'user',
        acceptedCandidateId: null,
        overridden: true,
        needsAiReview: false,
        aiReviewComplete: true,
        overrideSource: 'manual_entry',
        overrideValue: nextValue,
        overrideReason: reason || null,
        overrideProvenance: normalizedEvidence || null,
        overriddenBy: reviewer || null,
        overriddenAt: setAt
      });
      specDb.syncItemListLinkForFieldValue({
        productId,
        fieldKey: normalizedField,
        value: nextValue,
      });
      specDb.upsertProductReviewState({
        productId,
        reviewStatus: 'in_progress',
        reviewStartedAt: startedAt,
      });
    } catch { /* best-effort */ }
  }

  const consolidatedPath = resolveConsolidatedOverridePath({ config, category });
  return {
    override_path: consolidatedPath,
    field: normalizedField,
    candidate_id: current.overrides[normalizedField].candidate_id,
    value: nextValue
  };
}

export async function approveGreenOverrides({
  storage,
  config = {},
  category,
  productId,
  reviewer = '',
  reason = '',
  specDb = null
}) {
  const review = await readReviewArtifacts({ storage, category, productId });
  const keys = review.keys;
  const payload = await readReviewProductPayload({
    storage,
    config,
    category,
    productId,
    keys
  });
  const rows = findCandidateRows(review.candidates);
  const candidateMap = buildCandidateMap(rows);
  // WHY: Overlap 0d — read from consolidated JSON SSOT before merge
  const existing = await readProductFromConsolidated({ config, category, productId });
  const startedAt = String(existing?.review_started_at || nowIso()).trim();
  const current = isObject(existing) ? existing : {
    category,
    product_id: productId,
    created_at: nowIso(),
    review_started_at: startedAt,
    review_status: 'in_progress',
    overrides: {}
  };
  const overrides = isObject(current.overrides) ? { ...current.overrides } : {};
  const approvedFields = [];
  const skipped = [];

  for (const [fieldRaw, stateRaw] of Object.entries(payload.fields || {})) {
    const field = normalizeField(fieldRaw);
    const state = isObject(stateRaw) ? stateRaw : {};
    const selected = isObject(state.selected) ? state.selected : {};
    const selectedValue = selected.value;
    const color = normalizeToken(selected.color || '');
    const needsReview = Boolean(state.needs_review);

    if (color !== 'green' || needsReview || !hasKnownValue(selectedValue)) {
      skipped.push({
        field,
        reason: 'not_green_or_not_review_ready'
      });
      continue;
    }

    const candidateRows = candidateMap.get(field) || [];
    const candidate = selectCandidateForValue(candidateRows, selectedValue);
    if (!candidate) {
      skipped.push({
        field,
        reason: 'no_matching_candidate'
      });
      continue;
    }
    const setAt = nowIso();
    overrides[field] = buildCandidateOverrideEntry({
      candidate,
      category,
      productId,
      field,
      reviewer,
      reason: String(reason || '').trim() || 'bulk_approve_green',
      setAt
    });
    approvedFields.push(field);
  }

  current.category = category;
  current.product_id = productId;
  current.review_started_at = startedAt;
  current.review_status = 'in_progress';
  current.updated_at = nowIso();
  current.overrides = overrides;

  // WHY: Overlap 0d — JSON SSOT first, SQL is derived cache
  await upsertProductInConsolidated({ config, category, productId, productEntry: current });
  if (approvedFields.length > 0 && specDb) {
    try {
      for (const field of approvedFields) {
        const entry = overrides[field];
        if (!entry) continue;
        specDb.upsertItemFieldState({
          productId,
          fieldKey: field,
          value: entry.override_value || entry.value || '',
          confidence: 1.0,
          source: 'user',
          overridden: true,
          acceptedCandidateId: entry.candidate_id || null,
          overrideSource: 'bulk_approve_green',
          overrideValue: entry.override_value || entry.value || '',
          overrideReason: String(reason || '').trim() || 'bulk_approve_green',
          overrideProvenance: entry.override_provenance || null,
          overriddenBy: reviewer || 'bulk_approve',
          overriddenAt: entry.set_at || nowIso()
        });
      }
    } catch { /* best-effort SQL write */ }
  }

  const consolidatedPath = resolveConsolidatedOverridePath({ config, category });
  return {
    override_path: consolidatedPath,
    approved_count: approvedFields.length,
    skipped_count: skipped.length,
    approved_fields: approvedFields,
    skipped
  };
}

export async function buildReviewMetrics({
  config = {},
  category,
  windowHours = 24,
  specDb = null
}) {
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  const rows = await listOverrideDocs(helperRoot, category, { specDb });
  const now = Date.now();
  const cutoff = now - (Math.max(1, toFloat(windowHours, 24)) * 60 * 60 * 1000);
  let reviewedProducts = 0;
  let inProgressProducts = 0;
  let overridesTotal = 0;
  let reviewTimeTotalSeconds = 0;
  let reviewTimeCount = 0;

  for (const row of rows) {
    const payload = isObject(row.payload) ? row.payload : {};
    const overrides = isObject(payload.overrides) ? payload.overrides : {};
    const overrideCount = Object.keys(overrides).length;
    const reviewedAtMs = parseDateMs(payload.reviewed_at);
    const status = normalizeToken(payload.review_status || '');
    const reviewTimeSeconds = toFloat(payload.review_time_seconds, NaN);

    if (status === 'in_progress') {
      inProgressProducts += 1;
    }

    if (reviewedAtMs >= cutoff && status === 'approved') {
      reviewedProducts += 1;
      overridesTotal += overrideCount;
      if (Number.isFinite(reviewTimeSeconds) && reviewTimeSeconds >= 0) {
        reviewTimeTotalSeconds += reviewTimeSeconds;
        reviewTimeCount += 1;
      }
    }
  }

  const avgReviewTime = reviewTimeCount > 0
    ? (reviewTimeTotalSeconds / reviewTimeCount)
    : 0;
  const safeWindowHours = Math.max(1, toFloat(windowHours, 24));
  const productsPerHour = reviewedProducts / safeWindowHours;
  const overridesPerProduct = reviewedProducts > 0
    ? (overridesTotal / reviewedProducts)
    : 0;

  return {
    category,
    window_hours: safeWindowHours,
    reviewed_products: reviewedProducts,
    in_progress_products: inProgressProducts,
    overrides_total: overridesTotal,
    overrides_per_product: overridesPerProduct,
    average_review_time_seconds: avgReviewTime,
    products_per_hour: productsPerHour
  };
}

export async function finalizeOverrides({
  storage,
  config = {},
  category,
  productId,
  applyOverrides = false,
  saveAsDraft = false,
  reviewer = '',
  specDb = null
}) {
  const consolidatedPath = resolveConsolidatedOverridePath({ config, category });
  // WHY: Overlap 0d — read from consolidated JSON SSOT
  const overrideDoc = await readProductFromConsolidated({ config, category, productId });
  const overrides = isObject(overrideDoc?.overrides) ? overrideDoc.overrides : {};
  const overrideEntries = Object.entries(overrides);
  if (!overrideEntries.length) {
    return {
      applied: false,
      reason: 'no_overrides',
      override_path: consolidatedPath,
      override_count: 0
    };
  }

  const latest = latestKeys(storage, category, productId);
  const normalized = await storage.readJsonOrNull(latest.normalizedKey);
  const provenance = await storage.readJsonOrNull(latest.provenanceKey);
  const summary = await storage.readJsonOrNull(latest.summaryKey);
  if (!normalized || !isObject(normalized.fields)) {
    throw new Error(`latest normalized output not found: ${latest.normalizedKey}`);
  }

  if (!applyOverrides) {
    return {
      applied: false,
      reason: 'apply_overrides_flag_not_set',
      override_path: consolidatedPath,
      override_count: overrideEntries.length,
      pending_fields: overrideEntries.map(([field]) => field)
    };
  }

  const nextNormalized = {
    ...normalized,
    fields: {
      ...normalized.fields
    }
  };
  const nextProvenance = isObject(provenance) ? { ...provenance } : {};
  const nextSummary = isObject(summary) ? { ...summary } : {};
  const nextFieldReasoning = isObject(nextSummary.field_reasoning)
    ? { ...nextSummary.field_reasoning }
    : {};
  const appliedRows = [];

  for (const [field, override] of overrideEntries) {
    const normalizedField = normalizeField(field);
    const value = extractOverrideValue(override);
    if (!normalizedField || !value) {
      continue;
    }

    const previous = String(nextNormalized.fields[normalizedField] ?? 'unk');
    nextNormalized.fields[normalizedField] = value;
    const overrideProvenance = extractOverrideProvenance(override, category, productId, normalizedField);

    const existingProv = isObject(nextProvenance[normalizedField]) ? nextProvenance[normalizedField] : {};
    nextProvenance[normalizedField] = {
      ...existingProv,
      value,
      confidence: 1,
      meets_pass_target: true,
      evidence: [
        {
          url: overrideProvenance.url,
          host: String(override?.source?.host || 'manual-override.local'),
          method: String(override?.source?.method || 'manual_override'),
          keyPath: `overrides.${normalizedField}`,
          tier: 1,
          tierName: 'user_override',
          source_id: overrideProvenance.source_id || '',
          snippet_id: overrideProvenance.snippet_id || '',
          snippet_hash: overrideProvenance.snippet_hash || '',
          quote_span: overrideProvenance.quote_span,
          quote: overrideProvenance.quote,
          retrieved_at: overrideProvenance.retrieved_at
        }
      ],
      override: {
        candidate_id: String(override?.candidate_id || ''),
        set_at: String(override?.set_at || nowIso()),
        override_source: String(override?.override_source || '').trim() || 'manual_override',
        override_reason: String(override?.override_reason || '').trim() || null
      }
    };

    const existingReasoning = isObject(nextFieldReasoning[normalizedField]) ? nextFieldReasoning[normalizedField] : {};
    const existingReasons = toArray(existingReasoning.reasons).filter(Boolean).filter((reason) =>
      !String(reason).startsWith('unknown_')
    );
    nextFieldReasoning[normalizedField] = {
      ...existingReasoning,
      value,
      unknown_reason: null,
      reasons: [...new Set([...existingReasons, 'manual_override'])]
    };

    nextSummary.missing_required_fields = removeFieldFromList(nextSummary.missing_required_fields, normalizedField);
    nextSummary.fields_below_pass_target = removeFieldFromList(nextSummary.fields_below_pass_target, normalizedField);
    nextSummary.critical_fields_below_pass_target = removeFieldFromList(nextSummary.critical_fields_below_pass_target, normalizedField);
    appliedRows.push({
      field: normalizedField,
      previous,
      value,
      candidate_id: String(override?.candidate_id || ''),
      override_source: String(override?.override_source || '').trim() || 'manual_override',
      override_reason: String(override?.override_reason || '').trim() || null
    });
  }

  let runtimeGateResult = {
    applied: false,
    failures: [],
    warnings: [],
    changes: []
  };
  let runtimeEngineReady = false;
  try {
    const runtimeEngine = await createFieldRulesEngine(category, { config });
    runtimeEngineReady = true;
    const migratedInput = runtimeEngine.applyKeyMigrations(nextNormalized.fields);
    runtimeGateResult = applyRuntimeFieldRules({
      engine: runtimeEngine,
      fields: migratedInput,
      provenance: nextProvenance,
      fieldOrder: runtimeEngine.getAllFieldKeys(),
      enforceEvidence: false,
      strictEvidence: false,
      evidencePack: null,
      respectPerFieldEvidence: false
    });
    nextNormalized.fields = runtimeGateResult.fields || nextNormalized.fields;
  } catch {
    runtimeEngineReady = false;
  }

  for (const failure of runtimeGateResult.failures || []) {
    const normalizedField = normalizeField(failure?.field);
    if (!normalizedField) {
      continue;
    }
    const existingReasoning = isObject(nextFieldReasoning[normalizedField]) ? nextFieldReasoning[normalizedField] : {};
    const existingReasons = toArray(existingReasoning.reasons).filter(Boolean);
    nextFieldReasoning[normalizedField] = {
      ...existingReasoning,
      value: 'unk',
      unknown_reason: String(failure.reason_code || 'override_rejected_by_runtime_engine'),
      reasons: [...new Set([...existingReasons, 'override_rejected_by_runtime_engine'])]
    };
    nextSummary.missing_required_fields = addFieldToList(nextSummary.missing_required_fields, normalizedField);
    nextSummary.fields_below_pass_target = addFieldToList(nextSummary.fields_below_pass_target, normalizedField);
    nextSummary.critical_fields_below_pass_target = addFieldToList(
      nextSummary.critical_fields_below_pass_target,
      normalizedField
    );
  }

  if ((runtimeGateResult.failures || []).length > 0 && !saveAsDraft) {
    return {
      applied: false,
      reason: 'runtime_validation_failed',
      override_path: consolidatedPath,
      override_count: overrideEntries.length,
      applied_count: appliedRows.length,
      latest_keys: latest,
      runtime_gate: {
        applied: Boolean(runtimeGateResult.applied),
        failure_count: (runtimeGateResult.failures || []).length,
        warning_count: (runtimeGateResult.warnings || []).length,
        failures: runtimeGateResult.failures || [],
        warnings: runtimeGateResult.warnings || []
      }
    };
  }

  nextSummary.field_reasoning = nextFieldReasoning;
  nextSummary.review_overrides = {
    applied_at: nowIso(),
    override_count: appliedRows.length,
    fields: appliedRows.map((row) => row.field),
    save_as_draft: Boolean(saveAsDraft),
    runtime_engine_ready: runtimeEngineReady,
    runtime_engine_failure_count: (runtimeGateResult.failures || []).length,
    runtime_engine_warning_count: (runtimeGateResult.warnings || []).length
  };

  await Promise.all([
    writeStorageJson(storage, latest.normalizedKey, nextNormalized),
    writeStorageJson(storage, latest.provenanceKey, nextProvenance),
    writeStorageJson(storage, latest.summaryKey, nextSummary)
  ]);

  // Dual-write finalized overrides to SpecDb
  if (specDb) {
    try {
      const tx = specDb.db.transaction(() => {
        for (const row of appliedRows) {
          specDb.upsertItemFieldState({
            productId,
            fieldKey: row.field,
            value: row.value,
            confidence: 1.0,
            source: 'user',
            acceptedCandidateId: row.candidate_id || null,
            overridden: true,
            needsAiReview: false,
            aiReviewComplete: true
          });
          specDb.syncItemListLinkForFieldValue({
            productId,
            fieldKey: row.field,
            value: row.value,
          });
        }
      });
      tx();
      specDb.upsertProductReviewState({
        productId,
        reviewStatus: saveAsDraft ? 'draft' : 'approved',
        reviewedBy: reviewer || null,
        reviewedAt: nowIso(),
      });
    } catch { /* best-effort */ }
  }

  const review = reviewKeys(storage, category, productId);
  const report = {
    version: 1,
    category,
    product_id: productId,
    applied_at: nowIso(),
    applied_count: appliedRows.length,
    applied_fields: appliedRows.map((row) => row.field),
    rows: appliedRows,
    runtime_gate: {
      applied: Boolean(runtimeGateResult.applied),
      failure_count: (runtimeGateResult.failures || []).length,
      warning_count: (runtimeGateResult.warnings || []).length,
      failures: runtimeGateResult.failures || [],
      warnings: runtimeGateResult.warnings || []
    },
    latest_keys: latest
  };
  await writeStorageJson(storage, review.finalizeReportKey, report);
  if (review.legacyReviewBase && review.legacyReviewBase !== review.reviewBase) {
    await writeStorageJson(storage, `${review.legacyReviewBase}/finalize_report.json`, report);
  }

  const reviewedAt = nowIso();
  const startedAtMs = parseDateMs(overrideDoc.review_started_at);
  const reviewedAtMs = parseDateMs(reviewedAt);
  const reviewTimeSeconds = startedAtMs > 0 && reviewedAtMs >= startedAtMs
    ? Math.round((reviewedAtMs - startedAtMs) / 1000)
    : null;
  const nextOverrideDoc = {
    ...(isObject(overrideDoc) ? overrideDoc : {}),
    category,
    product_id: productId,
    review_status: saveAsDraft ? 'draft' : 'approved',
    reviewed_by: String(reviewer || '').trim() || null,
    reviewed_at: reviewedAt,
    review_time_seconds: reviewTimeSeconds,
    updated_at: reviewedAt,
    finalize_report_key: review.finalizeReportKey,
    runtime_gate: {
      applied: Boolean(runtimeGateResult.applied),
      failure_count: (runtimeGateResult.failures || []).length,
      warning_count: (runtimeGateResult.warnings || []).length
    },
    overrides
  };
  // WHY: Overlap 0d — consolidated JSON is SSOT, replaces per-product disk write
  await upsertProductInConsolidated({ config, category, productId, productEntry: nextOverrideDoc });

  return {
    applied: true,
    override_path: consolidatedPath,
    override_count: overrideEntries.length,
    applied_count: appliedRows.length,
    latest_keys: latest,
    finalize_report_key: review.finalizeReportKey,
    applied_fields: appliedRows.map((row) => row.field),
    runtime_gate: {
      applied: Boolean(runtimeGateResult.applied),
      failure_count: (runtimeGateResult.failures || []).length,
      warning_count: (runtimeGateResult.warnings || []).length
    }
  };
}
