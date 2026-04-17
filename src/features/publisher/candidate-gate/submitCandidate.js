/**
 * Candidate Gate — single entry point for all field value submissions.
 *
 * Every source (CEF, pipeline, review override, CLI) calls this function.
 * Validates via validateField(), then dual-writes to:
 *   1. field_candidates table (SQL projection)
 *   2. product.json candidates[] (durable SSOT)
 *
 * Pure orchestration — no direct DB imports. specDb injected.
 */

import fs from 'node:fs';
import path from 'node:path';
import { validateField } from '../validation/validateField.js';
import { persistDiscoveredValue } from '../persistDiscoveredValues.js';
import { publishCandidate as autoPublish } from '../publish/publishCandidate.js';
import { buildSourceId } from './buildSourceId.js';

function safeReadJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function serializeValue(value) {
  if (value == null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * @param {{ category: string, productId: string, fieldKey: string, value: *, confidence: number, sourceMeta: object, fieldRules: object, knownValues: object|null, componentDb: object|null, specDb: object, productRoot: string, config?: object }} opts
 * @returns {{ status: 'accepted'|'rejected', candidateId: number|null, value: *, validationResult: object, publishResult?: object }}
 */
export function submitCandidate({
  category, productId, fieldKey,
  value, confidence, sourceMeta,
  fieldRules, knownValues, componentDb, specDb, productRoot,
  repairHistory,
  metadata,
  appDb,
  config,
  variantId,
}) {
  // WHY: Normalize falsy variantId (undefined/null/'') to null so SQL stores NULL
  // and the JSON entry omits the key. Truthy strings are the FK anchor for
  // feature-source candidates; deletion cascade keys on this column.
  const normalizedVariantId = variantId || null;
  // --- Guard: identity ---
  if (!productId || !fieldKey) {
    return {
      status: 'rejected',
      candidateId: null,
      value,
      validationResult: { valid: false, value, confidence: 0, repairs: [], rejections: [{ reason_code: 'missing_identity', detail: { productId, fieldKey } }], unknownReason: null, repairPrompt: null },
    };
  }

  // --- Guard: field rule ---
  const fieldRule = fieldRules?.[fieldKey];
  if (!fieldRule) {
    return {
      status: 'rejected',
      candidateId: null,
      value,
      validationResult: { valid: false, value, confidence: 0, repairs: [], rejections: [{ reason_code: 'no_field_rule', detail: { fieldKey } }], unknownReason: null, repairPrompt: null },
    };
  }

  // --- Validate ---
  const perFieldKnown = knownValues?.[fieldKey] || null;
  const validationResult = validateField({ fieldKey, value, fieldRule, knownValues: perFieldKnown, componentDb, appDb });

  // WHY: open_prefer_known unknowns are soft rejections — the value is valid but not
  // in the known list. The candidate gate accepts these (that's the point of the policy).
  // Only hard rejections (shape, type, range, closed enum, etc.) block acceptance.
  const hardRejections = validationResult.rejections.filter(r => r.reason_code !== 'unknown_enum_prefer_known');
  if (hardRejections.length > 0) {
    return { status: 'rejected', candidateId: null, value: validationResult.value, validationResult };
  }

  // --- Build entries ---
  const repairedValue = validationResult.value;
  const repairedUnit = validationResult.unit || null;
  const serialized = serializeValue(repairedValue);
  const sourceEntry = { ...sourceMeta, confidence, submitted_at: new Date().toISOString() };
  // WHY: Filter out no-op repairs where before === after (template dispatch may log these)
  const actualRepairs = validationResult.repairs.filter(r => {
    if (Array.isArray(r.before) && Array.isArray(r.after)) {
      return JSON.stringify(r.before) !== JSON.stringify(r.after);
    }
    return r.before !== r.after;
  });
  const validationRecord = { valid: true, repairs: actualRepairs, rejections: validationResult.rejections };

  // WHY: If the source ran LLM repair before submitting, preserve the full repair context
  // so the publisher GUI can show prompt ID, decisions, and reasoning.
  if (repairHistory) {
    validationRecord.llmRepair = {
      promptId: repairHistory.promptId ?? null,
      status: repairHistory.status ?? null,
      decisions: repairHistory.decisions ?? null,
    };
  }

  // --- Source identity ---
  const sourceId = buildSourceId(sourceMeta, productId);
  const sourceType = String(sourceMeta.source || '').trim();
  const sourceModel = String(sourceMeta.model || '').trim();
  const hasMetadata = metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0;

  // --- DB write (source-centric: one row per extraction, immutable) ---
  specDb.insertFieldCandidate({
    productId, fieldKey,
    sourceId,
    sourceType,
    value: serialized,
    unit: repairedUnit,
    confidence,
    model: sourceModel,
    validationJson: validationRecord,
    metadataJson: hasMetadata ? metadata : {},
    variantId: normalizedVariantId,
  });

  const candidateRow = specDb.getFieldCandidateBySourceId(productId, fieldKey, sourceId);
  const candidateId = candidateRow?.id ?? null;

  // --- Product.json write (source-centric: flat entries, no source merge) ---
  const productDir = path.join(productRoot, productId);
  const productPath = path.join(productDir, 'product.json');
  const productJson = safeReadJson(productPath);

  if (productJson) {
    if (!productJson.candidates) productJson.candidates = {};
    if (!Array.isArray(productJson.candidates[fieldKey])) productJson.candidates[fieldKey] = [];

    const entry = {
      value: repairedValue,
      source_id: sourceId,
      source_type: sourceType,
      confidence,
      model: sourceModel,
      unit: repairedUnit,
      validation: validationRecord,
    };
    if (hasMetadata) entry.metadata = metadata;
    if (normalizedVariantId) entry.variant_id = normalizedVariantId;
    // WHY: Mirror SQL UNIQUE(source_id, variant_id_key) — same source_id with
    // a different variant_id is a distinct candidate, not a duplicate.
    const alreadyExists = productJson.candidates[fieldKey].some(e =>
      e.source_id === sourceId && (e.variant_id || null) === normalizedVariantId
    );
    if (!alreadyExists) {
      productJson.candidates[fieldKey].push(entry);
    }

    productJson.updated_at = new Date().toISOString();
    fs.writeFileSync(productPath, JSON.stringify(productJson, null, 2));
  }

  // --- Discovery enums ---
  if (fieldRule?.enum?.policy === 'open_prefer_known') {
    persistDiscoveredValue({ specDb, fieldKey, value: repairedValue, fieldRule });
  }

  // --- Auto-publish ---
  let publishResult = null;
  if (config) {
    publishResult = autoPublish({
      specDb, category, productId, fieldKey,
      candidateRow: candidateRow || { id: candidateId },
      value: repairedValue, unit: repairedUnit,
      confidence,
      config, fieldRule, productRoot,
    });
  }

  return { status: 'accepted', candidateId, value: repairedValue, validationResult, publishResult };
}
