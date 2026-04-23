/**
 * Threshold Reconciliation — re-evaluate all candidates against a new confidence threshold.
 *
 * Delegates the gate logic to evaluateFieldBuckets so reconcile, publish, and
 * republish all apply identical semantics. Manual overrides never touched.
 *
 * Tightening (threshold raised): buckets that no longer qualify are demoted
 *   and the field is removed from product.json.
 * Loosening (threshold lowered): buckets that now qualify are published;
 *   for set_union fields, union of qualifying buckets becomes the new value.
 *
 * Dual-state: updates field_candidates SQL status and product.json fields[].
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildLinkedCandidates, persistPublishResult } from './publishCandidate.js';
import { evaluateFieldBuckets } from './evidenceGate.js';

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
 * @param {{ specDb: object, category: string, threshold: number, productRoot: string, dryRun?: boolean, onStageAdvance?: (stage: string) => void }} opts
 * @returns {{ unpublished: number, published: number, locked: number, unaffected: number, total_fields: number }}
 */
export function reconcileThreshold({
  specDb, category, threshold, productRoot,
  dryRun = false,
  onStageAdvance,
}) {
  const result = { unpublished: 0, published: 0, locked: 0, unaffected: 0, total_fields: 0 };

  const compiled = specDb.getCompiledRules?.();
  const fieldRules = compiled?.fields || {};

  if (onStageAdvance) onStageAdvance('Scanning');
  const productIds = specDb.getDistinctCandidateProducts();

  if (onStageAdvance) onStageAdvance('Evaluating');

  for (const productId of productIds) {
    const productDir = path.join(productRoot, productId);
    const productPath = path.join(productDir, 'product.json');
    const productJson = safeReadJson(productPath);
    const productFields = productJson ? (productJson.fields || (productJson.fields = {})) : {};

    const allCandidates = specDb.getAllFieldCandidatesByProduct(productId);

    const byField = new Map();
    for (const row of allCandidates) {
      if (!byField.has(row.field_key)) byField.set(row.field_key, []);
      byField.get(row.field_key).push(row);
    }

    let productDirty = false;

    for (const [fieldKey, candidates] of byField) {
      result.total_fields++;
      const fieldRule = fieldRules[fieldKey] || null;
      const jsonField = productFields[fieldKey];
      const currentlyPublished = jsonField && jsonField.source !== 'manual_override'
        ? serializeValue(jsonField.value)
        : null;

      if (jsonField?.source === 'manual_override' || candidates.some(c => c.metadata_json?.source === 'manual_override')) {
        result.locked++;
        continue;
      }

      const evalResult = evaluateFieldBuckets({
        specDb, productId, fieldKey, fieldRule, variantId: null, threshold,
      });

      const nowPublishes = evalResult.publishedValue !== undefined;
      const newSerialized = nowPublishes ? serializeValue(evalResult.publishedValue) : null;

      if (!nowPublishes) {
        if (currentlyPublished !== null) {
          if (!dryRun) {
            specDb.demoteResolvedCandidates(productId, fieldKey);
            delete productFields[fieldKey];
            productDirty = true;
          }
          result.unpublished++;
        } else {
          result.unaffected++;
        }
        continue;
      }

      if (currentlyPublished === newSerialized) {
        result.unaffected++;
        continue;
      }

      if (!dryRun) {
        specDb.demoteResolvedCandidates(productId, fieldKey);
        const memberIds = new Set(evalResult.publishedMemberIds);
        if (memberIds.size > 0) {
          const placeholders = Array.from(memberIds).map(() => '?').join(',');
          specDb.db.prepare(
            `UPDATE field_candidates SET status = 'resolved', updated_at = datetime('now')
             WHERE id IN (${placeholders})`
          ).run(...Array.from(memberIds));
        }

        const topMember = candidates.find(c => memberIds.has(c.id))
          || candidates.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
        const sources = topMember?.source_id
          ? [{ source: topMember.source_type || '', source_id: topMember.source_id, model: topMember.model || '', confidence: topMember.confidence ?? 0 }]
          : [];
        const linkedCandidates = buildLinkedCandidates(specDb, productId, fieldKey, evalResult.publishedValue, fieldRule);
        productFields[fieldKey] = {
          value: evalResult.publishedValue,
          confidence: topMember?.confidence ?? 0,
          source: 'pipeline',
          resolved_at: new Date().toISOString(),
          sources,
          linked_candidates: linkedCandidates,
        };
        productDirty = true;
        persistPublishResult(specDb, productId, fieldKey, newSerialized, { status: 'published', published_at: new Date().toISOString() });
      }

      if (currentlyPublished === null) {
        result.published++;
      } else {
        result.published++;
      }
    }

    if (!dryRun && productDirty && productJson) {
      productJson.updated_at = new Date().toISOString();
      fs.writeFileSync(productPath, JSON.stringify(productJson, null, 2));
    }
  }

  if (onStageAdvance) onStageAdvance('Complete');

  return result;
}
