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

    buildGetResponse: (row, selected, runs, onCooldown) => ({
      product_id: row.product_id,
      category: row.category,
      colors: row.colors,
      editions: row.editions,
      default_color: row.default_color,
      cooldown_until: row.cooldown_until,
      on_cooldown: onCooldown,
      run_count: row.run_count,
      last_ran_at: row.latest_ran_at,
      selected,
      runs,
      color_details: selected.color_names || {},
      edition_details: selected.editions || {},
    }),

    buildResultMeta: (result) => ({
      colorsFound: Array.isArray(result.colors) ? result.colors.length : 0,
      editionsFound: result.editions ? Object.keys(result.editions).length : 0,
    }),
  })(ctx);
}
