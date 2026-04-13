/**
 * Color & Edition Finder — route handler (thin config).
 *
 * Delegates to the generic finder route handler. CEF-specific parts:
 * - routePrefix, moduleType, phase, fieldKeys
 * - specDb method bindings
 * - custom GET response shape (color_details, edition_details)
 * - custom result meta for data-change events
 */

import { createFinderRouteHandler } from '../../../core/finder/finderRoutes.js';

export function registerColorEditionFinderRoutes(ctx) {
  return createFinderRouteHandler({
    routePrefix: 'color-edition-finder',
    moduleType: 'cef',
    phase: 'colorFinder',
    fieldKeys: ['colors', 'editions'],

    runFinder: ctx.runColorEditionFinder,
    deleteRun: ctx.deleteColorEditionFinderRun,
    deleteAll: ctx.deleteColorEditionFinderAll,

    getOne: (specDb, pid) => specDb.getFinderStore('colorEditionFinder').get(pid),
    listByCategory: (specDb, cat) => specDb.getFinderStore('colorEditionFinder').listByCategory(cat),
    listRuns: (specDb, pid) => specDb.getFinderStore('colorEditionFinder').listRuns(pid),
    upsertSummary: (specDb, row) => specDb.getFinderStore('colorEditionFinder').upsert(row),
    deleteOneSql: (specDb, pid) => specDb.getFinderStore('colorEditionFinder').remove(pid),
    deleteRunSql: (specDb, pid, rn) => specDb.getFinderStore('colorEditionFinder').removeRun(pid, rn),
    deleteAllRunsSql: (specDb, pid) => specDb.getFinderStore('colorEditionFinder').removeAllRuns(pid),

    skipSelectedOnDelete: true,
    candidateSourceType: 'cef',

    buildGetResponse: (row, selected, runs, onCooldown, { specDb, productId } = {}) => {
      // WHY: Published values come from the summary table (DB).
      // Candidate rows are evidence (which sources submitted what), not the published truth.
      const publishedColors = Array.isArray(row.colors) ? row.colors : [];
      const publishedEditions = Array.isArray(row.editions) ? row.editions : [];

      const colorRows = specDb?.getFieldCandidatesByProductAndField?.(productId, 'colors') || [];
      const editionRows = specDb?.getFieldCandidatesByProductAndField?.(productId, 'editions') || [];

      const shapeCandidateRow = (r) => ({
        candidate_id: r.id,
        value: r.value,
        confidence: r.confidence,
        source_count: r.source_count,
        sources: Array.isArray(r.sources_json) ? r.sources_json : [],
        status: r.status,
        metadata: r.metadata_json || {},
        submitted_at: r.submitted_at,
      });

      return {
        product_id: row.product_id,
        category: row.category,
        cooldown_until: row.cooldown_until,
        on_cooldown: onCooldown,
        run_count: row.run_count,
        last_ran_at: row.latest_ran_at,
        // Published values from summary table + detail from latest run
        published: {
          colors: publishedColors,
          editions: publishedEditions,
          default_color: row.default_color || publishedColors[0] || '',
          color_names: selected.color_names || {},
          edition_details: selected.editions || {},
        },
        // All candidates with evidence chains, sorted by confidence desc
        candidates: {
          colors: colorRows.map(shapeCandidateRow).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
          editions: editionRows.map(shapeCandidateRow).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
        },
        // Deprecated: kept for backward compat during transition
        colors: row.colors,
        editions: row.editions,
        default_color: row.default_color,
        selected,
        color_details: selected.color_names || {},
        edition_details: selected.editions || {},
        runs,
      };
    },

    buildResultMeta: (result) => ({
      colorsFound: Array.isArray(result.colors) ? result.colors.length : 0,
      editionsFound: result.editions ? Object.keys(result.editions).length : 0,
    }),
  })(ctx);
}
