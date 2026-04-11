/**
 * Threshold Reconciliation — re-evaluate all candidates against a new confidence threshold.
 *
 * Tightening (threshold raised): unpublish resolved candidates below the new threshold.
 * Loosening (threshold lowered): publish highest-confidence candidates above the new threshold.
 * Manual overrides are never touched.
 *
 * Dual-state: updates both field_candidates SQL status and product.json fields[].
 */

import fs from 'node:fs';
import path from 'node:path';

function safeReadJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function serializeValue(value) {
  if (value == null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// WHY: Candidates use mixed scales (CEF: 0-100, provenance: 0-1).
// Threshold is always 0-1. Normalize before comparing.
function normalizeConfidence(c) {
  if (typeof c !== 'number' || !Number.isFinite(c)) return 0;
  return c > 1 ? c / 100 : c;
}

/**
 * @param {{ specDb: object, category: string, threshold: number, productRoot: string, dryRun?: boolean, onStageAdvance?: (stage: string) => void }} opts
 * @returns {{ unpublished: number, published: number, locked: number, unaffected: number, total_fields: number }}
 */
export function reconcileThreshold({
  specDb, category, threshold, productRoot,
  dryRun = false,
  onStageAdvance,
}) {
  const result = { unpublished: 0, published: 0, locked: 0, unaffected: 0, total_fields: 0 };

  // --- Stage 1: Scanning ---
  if (onStageAdvance) onStageAdvance('Scanning');
  const productIds = specDb.getDistinctCandidateProducts();

  // --- Stage 2: Evaluating ---
  if (onStageAdvance) onStageAdvance('Evaluating');

  for (const productId of productIds) {
    const productDir = path.join(productRoot, productId);
    const productPath = path.join(productDir, 'product.json');
    const productJson = dryRun ? null : safeReadJson(productPath);
    const productFields = dryRun ? null : (productJson ? (productJson.fields || (productJson.fields = {})) : null);

    // Read product.json fields for lock detection even in dry-run
    const dryRunJson = dryRun ? safeReadJson(productPath) : null;
    const dryRunFields = dryRunJson?.fields || {};

    const allCandidates = specDb.getAllFieldCandidatesByProduct(productId);

    // Group by field_key
    const byField = new Map();
    for (const row of allCandidates) {
      if (!byField.has(row.field_key)) byField.set(row.field_key, []);
      byField.get(row.field_key).push(row);
    }

    let productDirty = false;

    for (const [fieldKey, candidates] of byField) {
      result.total_fields++;
      const resolved = candidates.find(c => c.status === 'resolved');

      // --- Lock check: manual override ---
      const jsonField = dryRun ? dryRunFields[fieldKey] : productFields?.[fieldKey];
      const isManualOverride =
        jsonField?.source === 'manual_override' ||
        resolved?.metadata_json?.source === 'manual_override';

      if (isManualOverride) {
        result.locked++;
        continue;
      }

      if (resolved) {
        // TIGHTENING: resolved exists but confidence below new threshold
        if (normalizeConfidence(resolved.confidence) < threshold) {
          if (!dryRun) {
            specDb.demoteResolvedCandidates(productId, fieldKey);
            if (productFields) {
              delete productFields[fieldKey];
              productDirty = true;
            }
          }
          result.unpublished++;
          continue;
        }
        // Resolved and still above threshold — no action
        result.unaffected++;
      } else {
        // LOOSENING: no resolved candidate — find best above threshold
        const best = candidates
          .filter(c => normalizeConfidence(c.confidence) >= threshold)
          .sort((a, b) => normalizeConfidence(b.confidence) - normalizeConfidence(a.confidence))[0];

        if (best) {
          if (!dryRun) {
            const serialized = serializeValue(best.value);
            specDb.markFieldCandidateResolved(productId, fieldKey, serialized);

            if (productFields) {
              const sources = Array.isArray(best.sources_json) ? best.sources_json : [];
              productFields[fieldKey] = {
                value: best.value,
                confidence: best.confidence,
                source: 'pipeline',
                resolved_at: new Date().toISOString(),
                sources,
              };
              productDirty = true;
            }

            // Persist publish result in metadata
            try {
              const row = specDb.getFieldCandidate(productId, fieldKey, serialized);
              if (row) {
                const meta = row.metadata_json && typeof row.metadata_json === 'object' ? { ...row.metadata_json } : {};
                meta.publish_result = { status: 'published', published_at: new Date().toISOString() };
                specDb.upsertFieldCandidate({
                  productId, fieldKey, value: serialized,
                  unit: row.unit, confidence: row.confidence,
                  sourceCount: row.source_count, sourcesJson: row.sources_json,
                  validationJson: row.validation_json, metadataJson: meta,
                  status: 'resolved',
                });
              }
            } catch { /* best-effort metadata update */ }
          }
          result.published++;
        } else {
          result.unaffected++;
        }
      }
    }

    // Write product.json if changed
    if (!dryRun && productDirty && productJson) {
      productJson.updated_at = new Date().toISOString();
      fs.writeFileSync(productPath, JSON.stringify(productJson, null, 2));
    }
  }

  // --- Stage 3: Complete ---
  if (onStageAdvance) onStageAdvance('Complete');

  return result;
}
