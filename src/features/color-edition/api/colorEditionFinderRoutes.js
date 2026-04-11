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

    getOne: (specDb, pid) => specDb.getColorEditionFinder(pid),
    listByCategory: (specDb, cat) => specDb.listColorEditionFinderByCategory(cat),
    listRuns: (specDb, pid) => specDb.listColorEditionFinderRuns(pid),
    upsertSummary: (specDb, row) => specDb.upsertColorEditionFinder(row),
    deleteOneSql: (specDb, pid) => specDb.deleteColorEditionFinder(pid),
    deleteRunSql: (specDb, pid, rn) => specDb.deleteColorEditionFinderRunByNumber(pid, rn),
    deleteAllRunsSql: (specDb, pid) => specDb.deleteAllColorEditionFinderRuns(pid),

    skipSelectedOnDelete: true,
    candidateSourceType: 'cef',

    buildGetResponse: (row, selected, runs, onCooldown, { specDb, productId } = {}) => {
      // WHY: Published truth comes from field_candidates, not CEF's `selected`.
      // Per-item candidates with sources/confidence are the evidence chain.
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

      const resolvedColors = colorRows.filter(r => r.status === 'resolved');
      const resolvedEditions = editionRows.filter(r => r.status === 'resolved');

      // Derive published values from resolved candidates
      // For set_union list fields: each resolved candidate's array value contributes items
      const publishedColors = [];
      const seenColors = new Set();
      for (const r of resolvedColors) {
        let items;
        try { items = typeof r.value === 'string' ? JSON.parse(r.value) : r.value; }
        catch { items = r.value != null ? [r.value] : []; }
        const arr = Array.isArray(items) ? items : [items];
        for (const c of arr) {
          const key = String(c);
          if (!seenColors.has(key)) { seenColors.add(key); publishedColors.push(c); }
        }
      }

      const publishedEditions = [];
      const seenEditions = new Set();
      for (const r of resolvedEditions) {
        let items;
        try { items = typeof r.value === 'string' ? JSON.parse(r.value) : r.value; }
        catch { items = r.value != null ? [r.value] : []; }
        const arr = Array.isArray(items) ? items : [items];
        for (const e of arr) {
          const key = String(e);
          if (!seenEditions.has(key)) { seenEditions.add(key); publishedEditions.push(e); }
        }
      }

      return {
        product_id: row.product_id,
        category: row.category,
        cooldown_until: row.cooldown_until,
        on_cooldown: onCooldown,
        run_count: row.run_count,
        last_ran_at: row.latest_ran_at,
        // Published truth from field_candidates
        published: {
          colors: publishedColors,
          editions: publishedEditions,
          default_color: publishedColors[0] || '',
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
