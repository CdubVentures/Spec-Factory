/**
 * Hard-reject a candidate whose LLM self-declared confidence conflicts with
 * its evidence pool. Deletes the candidate row (cascades field_candidate_evidence
 * via FK ON DELETE CASCADE) AND, when the candidate came from a primary run
 * for a registered finder, scrubs that run's history so a re-run starts
 * clean (discovery_log.urls_checked / queries_run go away with the run).
 *
 * Primary vs passenger:
 *   - keyFinder: `run.response.primary_field_key === fieldKey` → primary;
 *     delete the run. Otherwise the candidate rode as a passenger on another
 *     field's run — leave the run intact (its discovery_log belongs to its
 *     own primary).
 *   - RDF / SKU: one field per run (variantScalarFieldProducer), so any
 *     matching candidate IS the primary producer. Delete the run.
 *
 * @param {{ specDb: object, productId: string, fieldKey: string, candidateId: number, sourceId?: string, sourceType?: string, productRoot?: string }} opts
 * @returns {{ status: 'purged'|'noop', candidateId?: number, runScrub?: object }}
 */
import { parseFinderRunSourceId } from '../candidate-gate/buildSourceId.js';
import { deleteScalarFinderRunByNumber } from '../../../core/finder/scalarFinderVariantCleaner.js';
import { scrubKeyFinderRunIfPrimary } from '../../key/keyStore.js';

const SCALAR_FINDER_SOURCE_TYPES = new Set(['release_date_finder', 'sku_finder']);

export function purgeInconsistentCandidate({ specDb, productId, fieldKey, candidateId, sourceId, sourceType, productRoot }) {
  if (!specDb || !candidateId) return { status: 'noop' };
  const existing = specDb.db.prepare('SELECT id FROM field_candidates WHERE id = ?').get(candidateId);
  if (!existing) return { status: 'noop' };

  specDb.db.prepare('DELETE FROM field_candidates WHERE id = ?').run(candidateId);

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

  return { status: 'purged', candidateId, runScrub };
}
