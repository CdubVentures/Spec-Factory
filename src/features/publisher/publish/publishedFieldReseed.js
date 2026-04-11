/**
 * Reseed resolved field_candidates from product.json fields[].
 *
 * Registered in seedRegistry.js. When the DB is deleted, this function scans
 * all product.json files and marks matching candidate rows as 'resolved'
 * from the durable JSON SSOT.
 *
 * Follows the rebuildFieldCandidatesFromJson() pattern in candidateReseed.js.
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
 * @param {{ specDb: object, productRoot?: string }} opts
 * @returns {{ found: number, seeded: number, skipped: number, fields_seeded: number }}
 */
export function rebuildPublishedFieldsFromJson({ specDb, productRoot }) {
  const root = productRoot || defaultProductRoot();
  const stats = { found: 0, seeded: 0, skipped: 0, fields_seeded: 0 };

  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return stats;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const productPath = path.join(root, entry.name, 'product.json');
    const data = safeReadJson(productPath);
    stats.found++;

    if (!data || data.category !== specDb.category) {
      stats.skipped++;
      continue;
    }

    const fields = data.fields;
    if (!fields || typeof fields !== 'object') {
      stats.skipped++;
      continue;
    }

    const productId = data.product_id || entry.name;
    let productFieldCount = 0;

    for (const [fieldKey, fieldEntry] of Object.entries(fields)) {
      if (!fieldEntry || fieldEntry.value === undefined) continue;

      const serialized = serializeValue(fieldEntry.value);
      const sources = Array.isArray(fieldEntry.sources) ? fieldEntry.sources : [];
      const confidence = fieldEntry.confidence ?? 0;

      // Try to find existing candidate row and mark it resolved
      const existing = specDb.getFieldCandidate(productId, fieldKey, serialized);
      if (existing) {
        specDb.markFieldCandidateResolved(productId, fieldKey, serialized);
      } else {
        // Upsert with resolved status if no candidate row exists
        specDb.upsertFieldCandidate({
          productId,
          fieldKey,
          value: serialized,
          unit: null,
          confidence,
          sourceCount: sources.length || 1,
          sourcesJson: sources,
          validationJson: { valid: true, repairs: [], rejections: [] },
          metadataJson: fieldEntry.source === 'manual_override'
            ? { source: 'manual_override' }
            : {},
          status: 'resolved',
        });
      }

      productFieldCount++;
    }

    if (productFieldCount > 0) {
      stats.seeded++;
      stats.fields_seeded += productFieldCount;
    } else {
      stats.skipped++;
    }
  }

  return stats;
}
