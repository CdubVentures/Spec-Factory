/**
 * Manual override writer — writes the user's value directly to product.json
 * as a published value. Does NOT touch field_candidates or field_candidate_evidence.
 *
 * WHY: Manual overrides are user input, not extraction output. Candidates and
 * evidence are reserved for pipeline / LLM runs. Per the user directive:
 * "manual override does not affect candidates and evidence, those are from
 * llm runs or the pipeline only not users input."
 *
 * Publishing contract: writes to product.json.fields[fieldKey] (scalar) or
 * product.json.variant_fields[variantId][fieldKey] (variant-scoped) with
 * source='manual_override', confidence=1.0. Mirrors the write shape used by
 * publishCandidate so downstream readers (publisher lock at
 * publishCandidate.js:124-127 / :241-244) see it as an override entry and
 * block pipeline republish until the user clears it.
 */

import fs from 'node:fs';
import path from 'node:path';

function safeReadJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

export function writeManualOverride({
  productRoot, productId, fieldKey,
  value, variantId, reviewer, reason,
}) {
  const productDir = path.join(productRoot, productId);
  const productPath = path.join(productDir, 'product.json');
  const productJson = safeReadJson(productPath);
  if (!productJson) {
    return { status: 'skipped', reason: 'no_product_json' };
  }

  const now = new Date().toISOString();
  const entry = {
    value,
    confidence: 1.0,
    source: 'manual_override',
    resolved_at: now,
    sources: [],
    linked_candidates: [],
    reviewer: reviewer || null,
    reason: reason || null,
  };

  const normalizedVariantId = typeof variantId === 'string' && variantId.length > 0 ? variantId : null;

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

  return {
    status: 'written',
    value,
    variantId: normalizedVariantId,
    resolved_at: now,
  };
}
