/**
 * Hard-reject a candidate whose LLM self-declared confidence conflicts with
 * its evidence pool. Cascades the delete through every layer that stores a
 * trace of the candidate so a re-run starts with a clean slate:
 *
 *   1. field_candidates (SQL) — row deleted; field_candidate_evidence cascades
 *      via FK ON DELETE CASCADE.
 *   2. product.json.fields[] / variant_fields[vid][fk] (JSON) — re-evaluated
 *      via republishField. If the remaining bucket still qualifies, the
 *      published value stays; otherwise the field un-publishes. Linked
 *      candidates and sources are rebuilt from surviving rows.
 *   3. {finder}.json runs[] + discovery_log (JSON) — when the candidate came
 *      from a primary finder run (keyFinder with primary_field_key === fieldKey,
 *      or any RDF/SKU per-variant run), the run is deleted so its cached URLs
 *      and queries don't short-circuit the next LLM call.
 *   4. {finder}_finder + {finder}_finder_runs (SQL) — runs row removed,
 *      summary re-upserted so the panel's GET reflects the wipe immediately.
 *
 * Passenger keyFinder candidates leave layers 3 + 4 intact — the run's
 * discovery_log belongs to its own primary field.
 *
 * @param {{ specDb: object, productId: string, fieldKey: string, candidateId: number, sourceId?: string, sourceType?: string, productRoot?: string, config?: object }} opts
 * @returns {{ status: 'purged'|'noop', candidateId?: number, runScrub?: object, republish?: object }}
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseFinderRunSourceId } from '../candidate-gate/buildSourceId.js';
import { deleteScalarFinderRunByNumber } from '../../../core/finder/scalarFinderVariantCleaner.js';
import { scrubKeyFinderRunIfPrimary } from '../../key/keyStore.js';
import { republishField } from './republishField.js';

const SCALAR_FINDER_SOURCE_TYPES = new Set(['release_date_finder', 'sku_finder']);

function safeReadJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

export function purgeInconsistentCandidate({ specDb, productId, fieldKey, candidateId, sourceId, sourceType, productRoot, config }) {
  if (!specDb || !candidateId) return { status: 'noop' };
  const existing = specDb.db.prepare(
    'SELECT id, variant_id FROM field_candidates WHERE id = ?'
  ).get(candidateId);
  if (!existing) return { status: 'noop' };

  const variantId = existing.variant_id || null;

  specDb.db.prepare('DELETE FROM field_candidates WHERE id = ?').run(candidateId);

  let republish;
  if (productRoot) {
    const productPath = path.join(productRoot, productId, 'product.json');
    const productJson = safeReadJson(productPath);
    if (productJson) {
      republish = republishField({
        specDb, productId, fieldKey,
        config: config || {},
        productJson,
        variantId,
      });
      if (republish?.status !== 'unchanged') {
        productJson.updated_at = new Date().toISOString();
        fs.writeFileSync(productPath, JSON.stringify(productJson, null, 2));
      }
    }
  }

  const parsed = sourceId ? parseFinderRunSourceId(sourceId) : null;
  let runScrub;
  if (parsed && sourceType) {
    if (sourceType === 'key_finder') {
      runScrub = scrubKeyFinderRunIfPrimary({
        productId, productRoot, fieldKey, runNumber: parsed.runNumber,
      });
    } else if (SCALAR_FINDER_SOURCE_TYPES.has(sourceType)) {
      runScrub = deleteScalarFinderRunByNumber({
        specDb, productId, productRoot, fieldKey, runNumber: parsed.runNumber,
      });
    }
  }

  return { status: 'purged', candidateId, runScrub, republish };
}
