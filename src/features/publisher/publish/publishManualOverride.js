/**
 * Publish a manual override — creates/upserts a candidate row with override
 * metadata, marks it resolved, and writes to product.json fields[].
 *
 * Manual overrides always publish with confidence 1.0 and lock the field
 * from future auto-publish until the override is deleted.
 *
 * Dual-state: JSON SSOT (product.json fields[]) + SQL projection (field_candidates.status).
 */

import fs from 'node:fs';
import path from 'node:path';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';

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
 * @param {{ specDb: object, category: string, productId: string, fieldKey: string, value: *, unit?: string|null, reviewer?: string, reason?: string, evidence?: object, productRoot?: string }} opts
 * @returns {{ status: 'published', value: *, source: 'manual_override' }}
 */
export function publishManualOverride({
  specDb, category, productId, fieldKey,
  value, unit,
  reviewer, reason, evidence,
  productRoot,
}) {
  const root = productRoot || defaultProductRoot();
  const serialized = serializeValue(value);
  const now = new Date().toISOString();

  // --- SQL: demote previous winner, insert override candidate as resolved ---
  const sourceId = `manual-${productId}-${Date.now()}`;
  specDb.demoteResolvedCandidates(productId, fieldKey);
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
  });

  // --- JSON: write to product.json fields[] ---
  const productDir = path.join(root, productId);
  const productPath = path.join(productDir, 'product.json');
  const productJson = safeReadJson(productPath);

  if (productJson) {
    if (!productJson.fields) productJson.fields = {};
    productJson.fields[fieldKey] = {
      value,
      confidence: 1.0,
      source: 'manual_override',
      resolved_at: now,
      sources: [{ source: 'manual_override', source_id: sourceId, reviewer: reviewer || null }],
    };
    productJson.updated_at = now;
    fs.writeFileSync(productPath, JSON.stringify(productJson, null, 2));
  }

  return { status: 'published', value, source: 'manual_override' };
}
