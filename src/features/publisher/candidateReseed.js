/**
 * Rebuild field_candidates table from product.json candidates[].
 *
 * Registered as a reseed surface in seedRegistry.js. When the DB is deleted,
 * this function scans all product.json files and rehydrates the field_candidates
 * table from the durable JSON SSOT.
 *
 * Follows the rebuildColorEditionFinderFromJson() pattern.
 */

import fs from 'node:fs';
import path from 'node:path';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

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
 * @returns {{ found: number, seeded: number, skipped: number, candidates_seeded: number }}
 */
export function rebuildFieldCandidatesFromJson({ specDb, productRoot }) {
  const root = productRoot || defaultProductRoot();
  const stats = { found: 0, seeded: 0, skipped: 0, candidates_seeded: 0 };

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

    const candidates = data.candidates;
    if (!candidates || typeof candidates !== 'object') {
      stats.skipped++;
      continue;
    }

    const productId = data.product_id || entry.name;
    let productCandidateCount = 0;

    for (const [fieldKey, candidateArray] of Object.entries(candidates)) {
      if (!Array.isArray(candidateArray)) continue;

      for (const candidate of candidateArray) {
        const serialized = serializeValue(candidate.value);

        // WHY: Detect format — new entries have source_id, old entries have sources array.
        if (candidate.source_id) {
          // New format: one row per source, insert directly
          specDb.insertFieldCandidate({
            productId,
            fieldKey,
            sourceId: candidate.source_id,
            sourceType: candidate.source_type || '',
            value: serialized,
            unit: candidate.unit ?? null,
            confidence: candidate.confidence ?? 0,
            model: candidate.model || '',
            validationJson: candidate.validation ?? {},
            metadataJson: candidate.metadata ?? {},
            variantId: candidate.variant_id || null,
          });
          // WHY: Project evidence_refs from metadata JSON into the relational
          // table so tier/confidence queries work after a DB-deleted rebuild.
          const row = specDb.getFieldCandidateBySourceId(productId, fieldKey, candidate.source_id);
          if (row?.id && Array.isArray(candidate.metadata?.evidence_refs) && candidate.metadata.evidence_refs.length > 0) {
            specDb.replaceFieldCandidateEvidence?.(row.id, candidate.metadata.evidence_refs);
          }
          productCandidateCount++;
        } else {
          // Old format: sources array → upsert with legacy path (backward compat)
          const sources = Array.isArray(candidate.sources) ? candidate.sources : [];
          const maxConfidence = sources.reduce((max, s) => Math.max(max, s.confidence ?? 0), 0);

          // WHY: Also seed source_id via insertFieldCandidate for old entries that have
          // enough info to derive a synthetic source_id. Fall back to upsert for ambiguous cases.
          if (sources.length === 1 && sources[0].source && (sources[0].run_id || sources[0].run_number != null)) {
            const src = sources[0];
            const syntheticId = src.run_number != null
              ? `${src.source}-${productId}-${src.run_number}`
              : `${src.source}-${src.run_id}`;
            specDb.insertFieldCandidate({
              productId,
              fieldKey,
              sourceId: syntheticId,
              sourceType: src.source || '',
              value: serialized,
              unit: candidate.unit ?? null,
              confidence: maxConfidence,
              model: src.model || '',
              validationJson: candidate.validation ?? {},
              metadataJson: candidate.metadata ?? {},
              variantId: candidate.variant_id || null,
            });
          } else {
            specDb.upsertFieldCandidate({
              productId,
              fieldKey,
              value: serialized,
              unit: candidate.unit ?? null,
              confidence: maxConfidence,
              sourceCount: sources.length,
              sourcesJson: sources,
              validationJson: candidate.validation ?? {},
            });
          }
          productCandidateCount++;
        }
      }
    }

    if (productCandidateCount > 0) {
      stats.seeded++;
      stats.candidates_seeded += productCandidateCount;
    } else {
      stats.skipped++;
    }
  }

  return stats;
}
