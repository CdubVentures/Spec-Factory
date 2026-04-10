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
 * @param {{ category: string, productId: string, fieldKey: string, value: *, confidence: number, sourceMeta: object, fieldRules: object, knownValues: object|null, componentDb: object|null, specDb: object, productRoot: string }} opts
 * @returns {{ status: 'accepted'|'rejected', candidateId: number|null, value: *, validationResult: object }}
 */
export function submitCandidate({
  category, productId, fieldKey,
  value, confidence, sourceMeta,
  fieldRules, knownValues, componentDb, specDb, productRoot,
  repairHistory,
  metadata,
  appDb,
}) {
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

  // --- Source merge ---
  const existing = specDb.getFieldCandidate(productId, fieldKey, serialized);
  const mergedSources = existing ? [...existing.sources_json, sourceEntry] : [sourceEntry];
  const sourceCount = mergedSources.length;
  const maxConfidence = Math.max(confidence, existing?.confidence ?? 0);

  // --- Metadata: merge on conflict, set on new ---
  const hasMetadata = metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0;
  const mergedMetadata = existing
    ? { ...(existing.metadata_json || {}), ...(hasMetadata ? metadata : {}) }
    : (hasMetadata ? metadata : undefined);

  // --- DB write ---
  specDb.upsertFieldCandidate({
    productId, fieldKey, value: serialized, unit: repairedUnit,
    confidence: maxConfidence,
    sourceCount,
    sourcesJson: mergedSources,
    validationJson: validationRecord,
    metadataJson: mergedMetadata || {},
  });

  const candidateRow = specDb.getFieldCandidate(productId, fieldKey, serialized);
  const candidateId = candidateRow?.id ?? null;

  // --- Product.json write ---
  const productDir = path.join(productRoot, productId);
  const productPath = path.join(productDir, 'product.json');
  const productJson = safeReadJson(productPath);

  if (productJson) {
    if (!productJson.candidates) productJson.candidates = {};
    if (!Array.isArray(productJson.candidates[fieldKey])) productJson.candidates[fieldKey] = [];

    const entries = productJson.candidates[fieldKey];
    const matchIdx = entries.findIndex(e => serializeValue(e.value) === serialized);

    if (matchIdx >= 0) {
      entries[matchIdx].sources.push(sourceEntry);
      entries[matchIdx].validation = validationRecord;
      if (repairedUnit) entries[matchIdx].unit = repairedUnit;
      if (hasMetadata) entries[matchIdx].metadata = { ...(entries[matchIdx].metadata || {}), ...metadata };
    } else {
      const entry = { value: repairedValue, unit: repairedUnit, validation: validationRecord, sources: [sourceEntry] };
      if (hasMetadata) entry.metadata = metadata;
      entries.push(entry);
    }

    productJson.updated_at = new Date().toISOString();
    fs.writeFileSync(productPath, JSON.stringify(productJson, null, 2));
  }

  // --- Discovery enums ---
  if (fieldRule?.enum?.policy === 'open_prefer_known') {
    persistDiscoveredValue({ specDb, fieldKey, value: repairedValue, fieldRule });
  }

  return { status: 'accepted', candidateId, value: repairedValue, validationResult };
}
