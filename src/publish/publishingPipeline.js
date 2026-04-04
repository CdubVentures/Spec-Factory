import { createFieldRulesEngine } from '../engine/fieldRulesEngine.js';
import { applyRuntimeFieldRules } from '../engine/runtimeGate.js';
import { ruleBlockPublishUnk, ruleEvidenceRequired } from '../engine/ruleAccessors.js';
import {
  nowIso,
  normalizeCategory,
  normalizeFieldKey,
  normalizeToken,
  isObject,
  toArray,
  hasKnownValue,
  coerceOutputValue
} from './publishPrimitives.js';
import { readJson } from './publishStorageAdapter.js';
import {
  slug,
  stableSpecFieldOrder,
  readOverrideDoc,
  listApprovedOverrideProductIds,
  mergeOverrideValue,
  computeDiffRows,
  coverageFromSpecs,
  evidenceWarningsForRecord,
  buildUnknowns,
  sourceCountFromProvenance,
  summarizeConfidenceFromMetadata,
  buildSpecsWithMetadata
} from './publishSpecBuilders.js';
import {
  readLatestArtifacts,
  readPublishedCurrent,
  readPublishedProductChangelog,
  writePublishedProductFiles,
  writeCategoryIndexAndChangelog,
  writeBulkExports
} from './publishProductWriter.js';

export function checkPublishBlockers({ engine, fields = {} }) {
  if (!engine) {
    return { blocked: false, publish_blocked_fields: [] };
  }
  const blocked = [];
  for (const field of engine.getAllFieldKeys()) {
    const rule = engine.getFieldRule(field);
    if (!ruleBlockPublishUnk(rule || {})) {
      continue;
    }
    if (!hasKnownValue(fields[field])) {
      blocked.push({
        field,
        reason: rule?.priority?.publish_gate_reason || rule?.publish_gate_reason || 'missing_required'
      });
    }
  }
  return {
    blocked: blocked.length > 0,
    publish_blocked_fields: blocked
  };
}

const ALLOWED_PUBLISH_GATES = ['none', 'identity_complete', 'required_complete', 'evidence_complete', 'all_validations_pass', 'strict'];

function hasEvidenceProvenance(fieldProvenance) {
  if (!fieldProvenance || typeof fieldProvenance !== 'object') {
    return false;
  }
  if (Array.isArray(fieldProvenance.evidence) && fieldProvenance.evidence.length > 0) {
    return true;
  }
  if (fieldProvenance.url || fieldProvenance.snippet_id) {
    return true;
  }
  return false;
}

export function evaluatePublishGate({
  engine,
  fields = {},
  provenance = {},
  runtimeGate = {},
  gate
}) {
  const effectiveGate = gate || engine?.getPublishGate?.() || 'required_complete';
  if (!effectiveGate || effectiveGate === 'none') {
    return { pass: true, gate: effectiveGate, blockers: [] };
  }

  const blockers = [];
  const gateChecks = {
    identity_complete: ['identity_complete'],
    required_complete: ['identity_complete', 'required_complete'],
    evidence_complete: ['identity_complete', 'required_complete', 'evidence_complete'],
    all_validations_pass: ['identity_complete', 'required_complete', 'evidence_complete', 'all_validations_pass'],
    strict: ['identity_complete', 'required_complete', 'evidence_complete', 'all_validations_pass', 'strict']
  };
  const checks = gateChecks[effectiveGate] || gateChecks.required_complete;

  if (checks.includes('identity_complete')) {
    for (const { key } of (engine?.getFieldsByRequiredLevel?.('identity') || [])) {
      if (!hasKnownValue(fields[key])) {
        blockers.push({ field: key, gate_check: 'identity_complete', reason: 'missing_identity_field' });
      }
    }
  }

  if (checks.includes('required_complete')) {
    for (const { key } of (engine?.getRequiredFields?.() || [])) {
      if (blockers.some((b) => b.field === key)) {
        continue;
      }
      if (!hasKnownValue(fields[key])) {
        blockers.push({ field: key, gate_check: 'required_complete', reason: 'missing_required_field' });
      }
    }
  }

  if (checks.includes('evidence_complete')) {
    for (const field of (engine?.getAllFieldKeys?.() || [])) {
      const rule = engine.getFieldRule(field);
      if (!ruleEvidenceRequired(rule || {})) {
        continue;
      }
      if (!hasKnownValue(fields[field])) {
        continue;
      }
      if (!hasEvidenceProvenance(provenance[field])) {
        blockers.push({ field, gate_check: 'evidence_complete', reason: 'missing_evidence' });
      }
    }
  }

  if (checks.includes('all_validations_pass')) {
    for (const failure of toArray(runtimeGate?.failures)) {
      if (blockers.some((b) => b.field === failure.field)) {
        continue;
      }
      blockers.push({
        field: failure.field,
        gate_check: 'all_validations_pass',
        reason: failure.reason_code || 'validation_failed'
      });
    }
  }

  if (checks.includes('strict')) {
    for (const warning of toArray(runtimeGate?.warnings)) {
      if (blockers.some((b) => b.field === warning.field && b.gate_check === 'strict')) {
        continue;
      }
      blockers.push({
        field: warning.field,
        gate_check: 'strict',
        reason: warning.reason_code || 'cross_validation_warning'
      });
    }
  }

  return {
    pass: blockers.length === 0,
    gate: effectiveGate,
    blockers
  };
}

async function publishSingleProduct({ storage, config, category, productId, specDb = null }) {
  const latest = await readLatestArtifacts(storage, category, productId, specDb);
  const override = await readOverrideDoc({ config, category, productId, specDb });
  const reviewStatus = normalizeToken(override.payload?.review_status || '');
  const overrides = reviewStatus === 'approved' && isObject(override.payload?.overrides)
    ? override.payload.overrides
    : {};

  const mergedFields = { ...latest.normalized.fields };
  const mergedProvenance = { ...latest.provenance };
  for (const [rawField, overrideRow] of Object.entries(overrides)) {
    const field = normalizeFieldKey(rawField);
    if (!field) {
      continue;
    }
    const value = String(overrideRow?.override_value ?? overrideRow?.value ?? '').trim();
    if (!value) {
      continue;
    }
    mergedFields[field] = value;
    mergedProvenance[field] = mergeOverrideValue({
      existing: mergedProvenance[field],
      override: overrideRow,
      field
    });
  }

  const engine = await createFieldRulesEngine(category, {
    config,
    consumerSystem: 'indexlab'
  });
  const fieldOrder = engine.getAllFieldKeys();
  const migratedInput = engine.applyKeyMigrations(mergedFields);
  const runtimeGate = applyRuntimeFieldRules({
    engine,
    fields: migratedInput,
    provenance: mergedProvenance,
    fieldOrder,
    enforceEvidence: false,
    strictEvidence: false,
    evidencePack: null
  });

  // Gate 1: Data quality — always active (normalization / cross-validation / evidence failures)
  if ((runtimeGate.failures || []).length > 0) {
    return {
      ok: false,
      product_id: productId,
      reason: 'validation_failed_after_merge',
      runtime_gate: runtimeGate,
      required_missing_fields: []
    };
  }

  // Gate 2: Category-level publish gate (enum policy: none → identity_complete → ... → strict)
  const gateResult = evaluatePublishGate({
    engine,
    fields: runtimeGate.fields,
    provenance: mergedProvenance,
    runtimeGate
  });
  if (!gateResult.pass) {
    return {
      ok: false,
      product_id: productId,
      reason: 'publish_gate_blocked',
      publish_gate: gateResult.gate,
      publish_gate_blockers: gateResult.blockers,
      runtime_gate: runtimeGate
    };
  }

  // Gate 3: Per-field block_publish_when_unk overrides
  const publishBlockers = checkPublishBlockers({ engine, fields: runtimeGate.fields });
  if (publishBlockers.blocked) {
    return {
      ok: false,
      product_id: productId,
      reason: 'publish_blocked_unk_fields',
      publish_blocked_fields: publishBlockers.publish_blocked_fields,
      runtime_gate: runtimeGate
    };
  }

  const specs = {};
  for (const field of fieldOrder) {
    specs[field] = coerceOutputValue(runtimeGate.fields[field]);
  }
  for (const field of Object.keys(runtimeGate.fields || {})) {
    if (!Object.prototype.hasOwnProperty.call(specs, field)) {
      specs[field] = coerceOutputValue(runtimeGate.fields[field]);
    }
  }

  const specsWithMetadata = buildSpecsWithMetadata({
    engine,
    fields: runtimeGate.fields,
    provenance: mergedProvenance,
    fieldOrder: stableSpecFieldOrder(specs)
  });

  const identity = isObject(latest.normalized.identity) ? latest.normalized.identity : {};
  const identityRecord = {
    brand: String(identity.brand || '').trim(),
    base_model: String(identity.base_model || '').trim(),
    model: String(identity.model || '').trim(),
    variant: String(identity.variant || '').trim(),
    full_name: String(`${identity.brand || ''} ${identity.base_model || identity.model || ''} ${identity.variant || ''}`).replace(/\s+/g, ' ').trim(),
    slug: slug(`${identity.brand || ''}-${identity.base_model || identity.model || ''}-${identity.variant || ''}`)
  };

  const coverage = coverageFromSpecs(specs, stableSpecFieldOrder(specs));
  const unknowns = buildUnknowns(specs, latest.summary);
  const warnings = evidenceWarningsForRecord(runtimeGate.fields, mergedProvenance);

  const fullRecord = {
    product_id: productId,
    category,
    published_version: '0.0.0',
    published_at: nowIso(),
    field_rules_version: String(engine?.keyMigrations?.version || '1.0.0'),
    identity: identityRecord,
    specs,
    specs_with_metadata: specsWithMetadata,
    unknowns,
    metrics: {
      coverage: coverage.coverage,
      avg_confidence: summarizeConfidenceFromMetadata(specsWithMetadata),
      sources_used: sourceCountFromProvenance(mergedProvenance),
      human_overrides: Object.keys(overrides).length,
      last_crawled: String(latest.summary.generated_at || nowIso())
    },
    provenance: mergedProvenance,
    publish_validation: {
      runtime_failures: runtimeGate.failures || [],
      runtime_warnings: runtimeGate.warnings || [],
      required_missing_fields: [],
      publish_gate: gateResult.gate,
      evidence_warnings: warnings
    }
  };

  const previous = await readPublishedCurrent(storage, category, productId);
  const changes = computeDiffRows(previous?.specs || {}, fullRecord.specs || {});
  const written = await writePublishedProductFiles({
    storage,
    category,
    productId,
    fullRecord,
    previousRecord: previous,
    changes,
    warnings
  });

  return {
    ok: true,
    product_id: productId,
    changed: written.changed,
    published_version: written.published_version,
    change_count: written.change_count,
    warnings: written.warnings
  };
}

export async function publishProducts({
  storage,
  config = {},
  category,
  productIds = [],
  allApproved = false,
  format = 'all',
  specDb = null,
}) {
  const normalizedCategory = normalizeCategory(category || '');
  if (!normalizedCategory) {
    throw new Error('publish requires --category <category>');
  }

  const explicitIds = (productIds || []).map((value) => String(value || '').trim()).filter(Boolean);
  const approvedIds = allApproved
    ? await listApprovedOverrideProductIds({ config, category: normalizedCategory, specDb })
    : [];
  const targets = [...new Set([...explicitIds, ...approvedIds])];

  const results = [];
  let published = 0;
  let blocked = 0;

  for (const productId of targets) {
    try {
      const row = await publishSingleProduct({
        storage,
        config,
        category: normalizedCategory,
        productId,
        specDb,
      });
      results.push(row);
      if (row.ok) {
        published += 1;
      } else {
        blocked += 1;
      }
    } catch (error) {
      blocked += 1;
      results.push({
        ok: false,
        product_id: productId,
        reason: error.message || 'publish_failed'
      });
    }
  }

  const indexInfo = await writeCategoryIndexAndChangelog(storage, normalizedCategory);
  const exportInfo = await writeBulkExports(storage, normalizedCategory, format);

  return {
    category: normalizedCategory,
    processed_count: targets.length,
    published_count: published,
    blocked_count: blocked,
    results,
    index_key: indexInfo.index_key,
    changelog_key: indexInfo.changelog_key,
    exports: exportInfo
  };
}

export async function readPublishedProvenance({
  storage,
  category,
  productId,
  field = '',
  full = false
}) {
  const normalizedCategory = normalizeCategory(category);
  const payload = await readJson(storage, [normalizedCategory, 'published', productId, 'provenance.json']);
  if (!isObject(payload)) {
    throw new Error(`published_provenance_not_found:${normalizedCategory}:${productId}`);
  }

  if (full) {
    return {
      category: normalizedCategory,
      product_id: productId,
      full: true,
      ...payload
    };
  }

  const normalizedField = normalizeFieldKey(field);
  if (!normalizedField) {
    throw new Error('provenance requires --field <field> or --full');
  }
  const start = Date.now();
  const row = payload.fields?.[normalizedField] || null;
  return {
    category: normalizedCategory,
    product_id: productId,
    field: normalizedField,
    provenance: row,
    query_time_ms: Date.now() - start
  };
}

export async function readPublishedChangelog({ storage, category, productId }) {
  const normalizedCategory = normalizeCategory(category);
  const payload = await readPublishedProductChangelog(storage, normalizedCategory, productId);
  return {
    category: normalizedCategory,
    product_id: productId,
    entries: payload.entries || []
  };
}

export { runAccuracyBenchmarkReport, buildAccuracyTrend, buildSourceHealth, buildLlmMetrics } from './publishAnalytics.js';

