/**
 * SKU Finder — thin route config. All POST/GET/DELETE + /loop flow through the
 * generic handler via parseVariantKey + loop opts. SKF-bespoke: `buildGetResponse`
 * merges `field_candidates` into per-variant rows so the UI table shows evidence
 * chain + publish status.
 */

import { createFinderRouteHandler } from '../../../core/finder/finderRoutes.js';
import { FINDER_MODULE_MAP } from '../../../core/finder/finderModuleRegistry.js';
import { runSkuFinder, runSkuFinderLoop } from '../skuFinder.js';
import { compileSkuFinderPreviewPrompt } from '../skuFinderPreviewPrompt.js';
import {
  deleteSkuFinderRun,
  deleteSkuFinderRuns,
  deleteSkuFinderAll,
} from '../skuStore.js';

function buildSkfGetResponse(row, selected, runs, { specDb, productId } = {}) {
  const candidates = typeof row.candidates === 'string'
    ? JSON.parse(row.candidates || '[]')
    : (row.candidates || []);

  const publisherRows = specDb?.getFieldCandidatesByProductAndField?.(productId, 'sku') || [];
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
  const publishedRow = specDb?.getResolvedFieldCandidate?.(productId, 'sku') || null;

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

export function registerSkuFinderRoutes(ctx) {
  const store = (specDb) => specDb.getFinderStore('skuFinder');
  return createFinderRouteHandler({
    routePrefix: 'sku-finder',
    moduleId: 'skuFinder',
    moduleType: 'skf',
    phase: 'skuFinder',
    fieldKeys: FINDER_MODULE_MAP.skuFinder.fieldKeys,
    requiredFields: FINDER_MODULE_MAP.skuFinder.requiredFields,
    candidateSourceType: FINDER_MODULE_MAP.skuFinder.candidateSourceType,
    parseVariantKey: true,
    loop: { orchestrator: runSkuFinderLoop },
    preview: { compilePrompt: compileSkuFinderPreviewPrompt },
    runFinder: runSkuFinder,
    deleteRun: deleteSkuFinderRun,
    deleteRuns: deleteSkuFinderRuns,
    deleteAll: deleteSkuFinderAll,
    getOne: (specDb, pid) => store(specDb).get(pid),
    listByCategory: (specDb, cat) => store(specDb).listByCategory(cat),
    listRuns: (specDb, pid) => store(specDb).listRuns(pid),
    upsertSummary: (specDb, row) => store(specDb).upsert(row),
    deleteOneSql: (specDb, pid) => store(specDb).remove(pid),
    deleteRunSql: (specDb, pid, rn) => store(specDb).removeRun(pid, rn),
    deleteAllRunsSql: (specDb, pid) => store(specDb).removeAllRuns(pid),
    buildGetResponse: buildSkfGetResponse,
    buildResultMeta: (result) => ({
      candidatesFound: Array.isArray(result.candidates) ? result.candidates.length : 0,
      variantsProcessed: result.variants_processed || 0,
    }),
  })(ctx);
}
