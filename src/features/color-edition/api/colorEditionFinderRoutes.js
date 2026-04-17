/**
 * Color & Edition Finder — route handler (thin config).
 *
 * Delegates to the generic finder route handler. CEF-specific parts:
 * - routePrefix, moduleType, phase, fieldKeys
 * - specDb method bindings
 * - custom GET response shape (color_details, edition_details)
 * - custom result meta for data-change events
 * - variant deletion endpoint (DELETE .../variants/:variantId)
 */

import { createFinderRouteHandler } from '../../../core/finder/finderRoutes.js';
import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';
import { deriveColorNamesFromVariants, derivePublishedFromVariants, deleteAllVariants, deleteVariant } from '../variantLifecycle.js';
import { runColorEditionFinder } from '../colorEditionFinder.js';
import { deleteColorEditionFinderRun, deleteColorEditionFinderAll } from '../colorEditionStore.js';

export function registerColorEditionFinderRoutes(ctx) {
  const { jsonRes, getSpecDb, broadcastWs } = ctx;

  const genericHandler = createFinderRouteHandler({
    routePrefix: 'color-edition-finder',
    moduleType: 'cef',
    phase: 'colorFinder',
    fieldKeys: ['colors', 'editions'],

    runFinder: runColorEditionFinder,
    deleteRun: deleteColorEditionFinderRun,
    deleteAll: deleteColorEditionFinderAll,

    getOne: (specDb, pid) => specDb.getFinderStore('colorEditionFinder').get(pid),
    listByCategory: (specDb, cat) => specDb.getFinderStore('colorEditionFinder').listByCategory(cat),
    listRuns: (specDb, pid) => specDb.getFinderStore('colorEditionFinder').listRuns(pid),
    upsertSummary: (specDb, row) => specDb.getFinderStore('colorEditionFinder').upsert(row),
    updateBookkeeping: (specDb, pid, vals) => specDb.getFinderStore('colorEditionFinder').updateBookkeeping(pid, vals),
    deleteOneSql: (specDb, pid) => specDb.getFinderStore('colorEditionFinder').remove(pid),
    deleteRunSql: (specDb, pid, rn) => specDb.getFinderStore('colorEditionFinder').removeRun(pid, rn),
    deleteAllRunsSql: (specDb, pid) => specDb.getFinderStore('colorEditionFinder').removeAllRuns(pid),

    customStages: ['Discovery', 'Validate', 'Identity', 'Confirm'],
    skipSelectedOnDelete: true,
    candidateSourceType: 'cef',

    // WHY: After run deletion strips candidates and republishField runs,
    // re-derive published colors/editions from the variants table (SSOT).
    // Without this, published state temporarily reverts to candidate set_union.
    onAfterRunDelete: ({ specDb, productId, productRoot }) => {
      if (specDb.variants) {
        derivePublishedFromVariants({ specDb, productId, productRoot });
      }
    },

    buildGetResponse: (row, selected, runs, { specDb, productId } = {}) => {
      // WHY: Published values come from the summary table (DB).
      // Candidate rows are evidence (which sources submitted what), not the published truth.
      const publishedColors = Array.isArray(row.colors) ? row.colors : [];
      const publishedEditions = Array.isArray(row.editions) ? row.editions : [];

      const colorRows = specDb?.getFieldCandidatesByProductAndField?.(productId, 'colors') || [];
      const editionRows = specDb?.getFieldCandidatesByProductAndField?.(productId, 'editions') || [];

      const shapeCandidateRow = (r) => ({
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

      // WHY: Derive display names from variants (SSOT), not selected (run snapshot).
      // selected shifts when runs are deleted; variants are stable.
      const activeVariants = specDb?.variants?.listActive(productId) || [];
      const { colorNames, editionDetails } = deriveColorNamesFromVariants(activeVariants, publishedColors, publishedEditions);

      return {
        product_id: row.product_id,
        category: row.category,
        run_count: row.run_count,
        last_ran_at: row.latest_ran_at,
        published: {
          colors: publishedColors,
          editions: publishedEditions,
          default_color: row.default_color || publishedColors[0] || '',
          color_names: colorNames,
          edition_details: editionDetails,
        },
        // WHY: Read from variants table (SSOT) instead of summary blob column.
        variant_registry: specDb?.variants?.listByProduct(productId) || [],
        // All candidates with evidence chains, sorted by confidence desc
        candidates: {
          colors: colorRows.map(shapeCandidateRow).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
          editions: editionRows.map(shapeCandidateRow).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
        },
        runs,
      };
    },

    buildResultMeta: (result) => ({
      colorsFound: Array.isArray(result.colors) ? result.colors.length : 0,
      editionsFound: result.editions ? Object.keys(result.editions).length : 0,
    }),
  })(ctx);

  // WHY: Wrap generic handler to intercept variant-specific routes.
  // Generic handler returns false for unrecognized paths, so variant
  // routes are checked after.
  return async function handleCefRoutes(parts, params, method, req, res) {
    const handled = await genericHandler(parts, params, method, req, res);
    if (handled !== false) return handled;

    // ── DELETE /color-edition-finder/:category/:productId/variants — delete ALL variants
    if (parts[0] === 'color-edition-finder' && method === 'DELETE' && parts[3] === 'variants' && !parts[4]) {
      const category = parts[1] || '';
      const productId = parts[2] || '';

      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

      const result = deleteAllVariants({
        specDb, productId,
        productRoot: defaultProductRoot(),
      });

      emitDataChange({
        broadcastWs,
        event: 'color-edition-finder-variants-deleted-all',
        category,
        entities: { productIds: [productId] },
        meta: { productId, deleted: result.deleted },
      });

      return jsonRes(res, 200, result);
    }

    // ── DELETE /color-edition-finder/:category/:productId/variants/:variantId
    if (parts[0] === 'color-edition-finder' && method === 'DELETE' && parts[3] === 'variants' && parts[4]) {
      const category = parts[1] || '';
      const productId = parts[2] || '';
      const variantId = parts[4];

      const specDb = getSpecDb(category);
      if (!specDb) return jsonRes(res, 503, { error: 'specDb not ready' });

      const result = deleteVariant({
        specDb, productId, variantId,
        productRoot: defaultProductRoot(),
      });

      emitDataChange({
        broadcastWs,
        event: 'color-edition-finder-variant-deleted',
        category,
        entities: { productIds: [productId] },
        meta: { productId, variantId, deleted: result.deleted },
      });

      return jsonRes(res, 200, result);
    }

    return false;
  };
}
