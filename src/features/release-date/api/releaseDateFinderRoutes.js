/**
 * Release Date Finder — thin route config. All POST/GET/DELETE + /loop flow
 * through the generic handler via parseVariantKey + loop opts. RDF-bespoke:
 * `buildGetResponse` merges `field_candidates` into per-variant rows so the
 * UI table shows evidence chain + publish status.
 */

import { createFinderRouteHandler } from '../../../core/finder/finderRoutes.js';
import { FINDER_MODULE_MAP } from '../../../core/finder/finderModuleRegistry.js';
import { runReleaseDateFinder, runReleaseDateFinderLoop } from '../releaseDateFinder.js';
import { compileReleaseDateFinderPreviewPrompt } from '../releaseDateFinderPreviewPrompt.js';
import {
  deleteReleaseDateFinderRun,
  deleteReleaseDateFinderRuns,
  deleteReleaseDateFinderAll,
} from '../releaseDateStore.js';

function buildRdfGetResponse(row, selected, runs, { specDb, productId } = {}) {
  const candidates = typeof row.candidates === 'string'
    ? JSON.parse(row.candidates || '[]')
    : (row.candidates || []);

  const publisherRows = specDb?.getFieldCandidatesByProductAndField?.(productId, 'release_date') || [];
  const byVariantId = new Map();
  for (const r of publisherRows) {
    const list = byVariantId.get(r.variant_id || '') || [];
    list.push({
      candidate_id: r.id, source_id: r.source_id || '', source_type: r.source_type || '',
      model: r.model || '', value: r.value, confidence: r.confidence, status: r.status,
      metadata: r.metadata_json || {}, submitted_at: r.submitted_at,
    });
    byVariantId.set(r.variant_id || '', list);
  }
  const enrichedCandidates = candidates.map((c) => ({
    ...c,
    publisher_candidates: (byVariantId.get(c.variant_id || '') || [])
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
  }));
  const publishedRow = specDb?.getResolvedFieldCandidate?.(productId, 'release_date') || null;

  return {
    product_id: row.product_id,
    category: row.category,
    run_count: row.run_count,
    last_ran_at: row.latest_ran_at,
    candidates: enrichedCandidates,
    candidate_count: row.candidate_count || enrichedCandidates.length,
    published_value: publishedRow?.value || '',
    published_confidence: publishedRow?.confidence ?? null,
    selected,
    runs,
  };
}

export function registerReleaseDateFinderRoutes(ctx) {
  const store = (specDb) => specDb.getFinderStore('releaseDateFinder');
  return createFinderRouteHandler({
    routePrefix: 'release-date-finder',
    moduleId: 'releaseDateFinder',
    moduleType: 'rdf',
    phase: 'releaseDateFinder',
    fieldKeys: ['release_date'],
    requiredFields: ['release_date'],
    candidateSourceType: FINDER_MODULE_MAP.releaseDateFinder.candidateSourceType,
    parseVariantKey: true,
    loop: { orchestrator: runReleaseDateFinderLoop },
    preview: { compilePrompt: compileReleaseDateFinderPreviewPrompt },
    runFinder: runReleaseDateFinder,
    deleteRun: deleteReleaseDateFinderRun,
    deleteRuns: deleteReleaseDateFinderRuns,
    deleteAll: deleteReleaseDateFinderAll,
    getOne: (specDb, pid) => store(specDb).get(pid),
    listByCategory: (specDb, cat) => store(specDb).listByCategory(cat),
    listRuns: (specDb, pid) => store(specDb).listRuns(pid),
    upsertSummary: (specDb, row) => store(specDb).upsert(row),
    deleteOneSql: (specDb, pid) => store(specDb).remove(pid),
    deleteRunSql: (specDb, pid, rn) => store(specDb).removeRun(pid, rn),
    deleteAllRunsSql: (specDb, pid) => store(specDb).removeAllRuns(pid),
    buildGetResponse: buildRdfGetResponse,
    buildResultMeta: (result) => ({
      candidatesFound: Array.isArray(result.candidates) ? result.candidates.length : 0,
      variantsProcessed: result.variants_processed || 0,
    }),
  })(ctx);
}
