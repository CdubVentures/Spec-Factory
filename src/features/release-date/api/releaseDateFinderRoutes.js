/**
 * Release Date Finder — route handler (thin config).
 *
 * Delegates to the generic finder route handler. RDF-specific parts:
 * - routePrefix, moduleType, phase, fieldKeys ('release_date')
 * - custom POST handler that reads { variant_key } from body (per-variant Run)
 * - buildGetResponse merges SQL candidates with field_candidates for the UI table
 *
 * Candidates flow through the publisher gate, so `candidateSourceType: 'release_date_finder'`
 * enables the generic handler's source-aware candidate cleanup on run delete.
 */

import { createFinderRouteHandler } from '../../../core/finder/finderRoutes.js';
import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import { registerOperation, getOperationSignal, updateStage, updateModelInfo, updateQueueDelay, appendLlmCall, completeOperation, failOperation, cancelOperation, fireAndForget } from '../../../core/operations/index.js';
import { createStreamBatcher } from '../../../core/llm/streamBatcher.js';
import { runReleaseDateFinder } from '../releaseDateFinder.js';
import {
  deleteReleaseDateFinderRun,
  deleteReleaseDateFinderRuns,
  deleteReleaseDateFinderAll,
} from '../releaseDateStore.js';

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

export function registerReleaseDateFinderRoutes(ctx) {
  const store = (specDb) => specDb.getFinderStore('releaseDateFinder');

  const genericHandler = createFinderRouteHandler({
    routePrefix: 'release-date-finder',
    moduleType: 'rdf',
    phase: 'releaseDateFinder',
    fieldKeys: ['release_date'],
    requiredFields: ['release_date'],

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

    candidateSourceType: 'release_date_finder',

    buildGetResponse: (row, selected, runs, { specDb, productId } = {}) => {
      const candidates = typeof row.candidates === 'string'
        ? JSON.parse(row.candidates || '[]')
        : (row.candidates || []);

      // WHY: Merge publisher-side candidates (field_candidates rows) so the UI can
      // show evidence chain + publish status alongside each per-variant entry.
      const publisherRows = specDb?.getFieldCandidatesByProductAndField?.(productId, 'release_date') || [];
      const byVariantId = new Map();
      for (const r of publisherRows) {
        const key = r.variant_id || '';
        if (!byVariantId.has(key)) byVariantId.set(key, []);
        byVariantId.get(key).push({
          candidate_id: r.id,
          source_id: r.source_id || '',
          source_type: r.source_type || '',
          model: r.model || '',
          value: r.value,
          confidence: r.confidence,
          status: r.status,
          metadata: r.metadata_json || {},
          submitted_at: r.submitted_at,
        });
      }

      const enrichedCandidates = candidates.map((c) => ({
        ...c,
        publisher_candidates: (byVariantId.get(c.variant_id || '') || [])
          .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
      }));

      // Published scalar (if publisher promoted any candidate)
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
    },

    buildResultMeta: (result) => ({
      candidatesFound: Array.isArray(result.candidates) ? result.candidates.length : 0,
      variantsProcessed: result.variants_processed || 0,
    }),
  })(ctx);

  const { jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs, logger } = ctx;

  return async function handleReleaseDateFinderRoutes(parts, params, method, req, res) {
    if (parts[0] !== 'release-date-finder') return false;

    const category = parts[1] || '';
    const productId = parts[2] || '';

    // Custom POST: reads body for { variant_key } to support per-variant Run
    if (method === 'POST' && category && productId && !parts[3]) {
      let op = null;
      let batcher = null;
      try {
        const specDb = getSpecDb(category);
        if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

        const productRow = specDb.getProduct(productId);
        if (!productRow) return jsonRes(res, 404, { error: 'product not found', product_id: productId, category });

        // Field Studio gate
        const compiled = specDb.getCompiledRules?.();
        const rules = compiled?.fields || {};
        if (!rules.release_date) {
          return jsonRes(res, 403, { error: `release-date-finder disabled: field 'release_date' not enabled in field studio` });
        }

        const body = await readJsonBody(req).catch(() => ({}));
        const variantKey = body?.variant_key || null;

        const jsonStrictKey = `_resolvedReleaseDateFinderJsonStrict`;
        const useWriterPhase = config[jsonStrictKey] === false;
        const stages = useWriterPhase
          ? ['Research', 'Writer', 'Validate', 'Publish']
          : ['Discovery', 'Validate', 'Publish'];

        op = registerOperation({
          type: 'rdf',
          category,
          productId,
          productLabel: `${productRow.brand || ''} ${productRow.model || ''}`.trim(),
          variantKey: variantKey || '',
          stages,
        });
        batcher = createStreamBatcher({ operationId: op.id, broadcastWs });
        const signal = getOperationSignal(op.id);

        return fireAndForget({
          res,
          jsonRes,
          op,
          batcher,
          broadcastWs,
          signal,
          emitArgs: {
            event: 'release-date-finder-run',
            category,
            entities: { productIds: [productId] },
            meta: { productId },
          },
          asyncWork: () => runReleaseDateFinder({
            product: {
              product_id: productId,
              category,
              brand: productRow.brand || '',
              model: productRow.model || '',
              base_model: productRow.base_model || '',
              variant: productRow.variant || '',
            },
            appDb,
            specDb,
            config,
            logger: logger || null,
            variantKey,
            signal,
            onStageAdvance: (name) => updateStage({ id: op.id, stageName: name }),
            onModelResolved: (info) => updateModelInfo({ id: op.id, ...info }),
            onStreamChunk: (delta) => { if (delta.reasoning) batcher.push(delta.reasoning); if (delta.content) batcher.push(delta.content); },
            onQueueWait: (ms) => updateQueueDelay({ id: op.id, queueDelayMs: ms }),
            onLlmCallComplete: (call) => appendLlmCall({ id: op.id, call }),
          }),
          completeOperation,
          failOperation,
          cancelOperation,
          emitDataChange,
        });
      } catch (err) {
        if (batcher) batcher.dispose();
        if (op) failOperation({ id: op.id, error: err instanceof Error ? err.message : String(err) });
        const message = err instanceof Error ? err.message : String(err);
        logger?.error?.(`[release-date-finder] POST failed:`, message);
        return jsonRes(res, 500, { error: 'release date finder failed', message });
      }
    }

    // Delegate all other methods (GET, DELETE) to generic handler
    return genericHandler(parts, params, method, req, res);
  };
}
