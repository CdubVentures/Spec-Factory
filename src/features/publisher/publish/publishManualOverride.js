/**
 * Publish a manual override — creates a resolved SQL runtime row with override
 * metadata and mirrors to product.json fields/variant_fields.
 *
 * Manual overrides always publish with confidence 1.0 and lock the field
 * from future auto-publish until the override is deleted.
 *
 * Dual-state: SQL runtime projection first + product.json mirror for rebuild/audit.
 */

import fs from 'node:fs';
import path from 'node:path';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';
import { buildManualOverrideCandidateId } from '../../../utils/candidateIdentifier.js';

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
 * @param {{ specDb: object, category: string, productId: string, fieldKey: string, value: *, unit?: string|null, variantId?: string|null, reviewer?: string, reason?: string, evidence?: object, productRoot?: string }} opts
 * @returns {{ status: 'published', value: *, source: 'manual_override', sourceId: string, variantId: string|null, jsonMirrored: boolean }}
 */
export function publishManualOverride({
  specDb, category, productId, fieldKey,
  value, unit, variantId,
  reviewer, reason, evidence,
  productRoot,
}) {
  const root = productRoot || defaultProductRoot();
  const serialized = serializeValue(value);
  const now = new Date().toISOString();
  const normalizedVariantId = typeof variantId === 'string' && variantId.trim() !== ''
    ? variantId.trim()
    : null;

  // --- SQL: demote previous winner, insert override candidate as resolved ---
  const sourceId = buildManualOverrideCandidateId({
    category,
    productId,
    fieldKey,
    value: serialized,
    evidenceUrl: evidence?.url || '',
    evidenceQuote: evidence?.quote || '',
  });
  specDb.demoteResolvedCandidates(productId, fieldKey, normalizedVariantId);
  specDb.insertFieldCandidate({
    productId,
    fieldKey,
    sourceId,
    sourceType: 'manual_override',
    value: serialized,
    unit: unit ?? null,
    confidence: 1.0,
    model: '',
    validationJson: { valid: true, repairs: [], rejections: [] },
    metadataJson: {
      source: 'manual_override',
      reviewer: reviewer || null,
      reason: reason || null,
      evidence: evidence || null,
    },
    status: 'resolved',
    variantId: normalizedVariantId,
  });

  // --- JSON: mirror to product.json for rebuild/audit ---
  const productDir = path.join(root, productId);
  const productPath = path.join(productDir, 'product.json');
  const productJson = safeReadJson(productPath);
  let jsonMirrored = false;

  if (productJson) {
    const entry = {
      value,
      confidence: 1.0,
      source: 'manual_override',
      resolved_at: now,
      sources: [{ source: 'manual_override', source_id: sourceId, reviewer: reviewer || null }],
    };
    if (normalizedVariantId) {
      if (!productJson.variant_fields) productJson.variant_fields = {};
      if (!productJson.variant_fields[normalizedVariantId]) productJson.variant_fields[normalizedVariantId] = {};
      productJson.variant_fields[normalizedVariantId][fieldKey] = entry;
    } else {
      if (!productJson.fields) productJson.fields = {};
      productJson.fields[fieldKey] = entry;
    }
    productJson.updated_at = now;
    fs.writeFileSync(productPath, JSON.stringify(productJson, null, 2));
    jsonMirrored = true;
  }

  return {
    status: 'published',
    value,
    source: 'manual_override',
    sourceId,
    variantId: normalizedVariantId,
    jsonMirrored,
  };
}
