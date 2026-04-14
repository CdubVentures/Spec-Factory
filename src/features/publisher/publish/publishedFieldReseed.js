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

      // WHY: The published value in product.json may be a merge (set_union) of multiple
      // candidates. It is derived state, not a candidate itself. On reseed, we find the
      // real contributing candidates and mark THEM resolved — never create a ghost row
      // from the merged published value.
      const existing = specDb.getFieldCandidate(productId, fieldKey, serialized);
      if (existing) {
        specDb.markFieldCandidateResolved(productId, fieldKey, serialized);
      } else if (Array.isArray(fieldEntry.linked_candidates) && fieldEntry.linked_candidates.length > 0) {
        // WHY: Published value is a merge — no single candidate matches exactly.
        // Use linked_candidates to find the real contributing candidates and mark them resolved.
        for (const linked of fieldEntry.linked_candidates) {
          // WHY: Source-centric linked_candidates have source_id — resolve by that first.
          if (linked.source_id) {
            const srcRow = specDb.getFieldCandidateBySourceId?.(productId, fieldKey, linked.source_id);
            if (srcRow) {
              specDb.markFieldCandidateResolved(productId, fieldKey, srcRow.value);
              continue;
            }
          }
          // Legacy fallback: resolve by value match
          if (linked.value) {
            const linkedSerialized = typeof linked.value === 'string' ? linked.value : serializeValue(linked.value);
            const linkedRow = specDb.getFieldCandidate(productId, fieldKey, linkedSerialized);
            if (linkedRow) {
              specDb.markFieldCandidateResolved(productId, fieldKey, linkedSerialized);
            }
          }
        }
      } else if (fieldEntry.source === 'manual_override') {
        // WHY: Manual overrides are their own candidate — always reseed.
        // Preserve source_id from product.json sources[] when available.
        const manualSourceId = sources[0]?.source_id || `manual-${productId}-reseed-${Date.now()}`;
        specDb.insertFieldCandidate({
          productId,
          fieldKey,
          sourceId: manualSourceId,
          sourceType: 'manual_override',
          value: serialized,
          unit: null,
          confidence,
          model: '',
          validationJson: { valid: true, repairs: [], rejections: [] },
          metadataJson: { source: 'manual_override' },
          status: 'resolved',
        });
      }
      // WHY: If no exact match AND no linked_candidates AND not manual override,
      // skip — don't create a ghost candidate from derived/merged state.

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
