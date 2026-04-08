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
  const validationResult = validateField({ fieldKey, value, fieldRule, knownValues: perFieldKnown, componentDb });

  // WHY: open_prefer_known unknowns are soft rejections — the value is valid but not
  // in the known list. The candidate gate accepts these (that's the point of the policy).
  // Only hard rejections (shape, type, range, closed enum, etc.) block acceptance.
  const hardRejections = validationResult.rejections.filter(r => r.reason_code !== 'unknown_enum_prefer_known');
  if (hardRejections.length > 0) {
    return { status: 'rejected', candidateId: null, value: validationResult.value, validationResult };
  }

  // --- Build entries ---
  const repairedValue = validationResult.value;
  const serialized = serializeValue(repairedValue);
  const sourceEntry = { ...sourceMeta, confidence, submitted_at: new Date().toISOString() };
  const validationRecord = { valid: true, repairs: validationResult.repairs, rejections: validationResult.rejections };

  // --- Source merge ---
  const existing = specDb.getFieldCandidate(productId, fieldKey, serialized);
  const mergedSources = existing ? [...existing.sources_json, sourceEntry] : [sourceEntry];
  const sourceCount = mergedSources.length;
  const maxConfidence = Math.max(confidence, existing?.confidence ?? 0);

  // --- DB write ---
  specDb.upsertFieldCandidate({
    productId, fieldKey, value: serialized,
    confidence: maxConfidence,
    sourceCount,
    sourcesJson: mergedSources,
    validationJson: validationRecord,
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
    } else {
      entries.push({ value: repairedValue, validation: validationRecord, sources: [sourceEntry] });
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
