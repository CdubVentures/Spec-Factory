// ── Seed Registry ────────────────────────────────────────────────────────────
// WHY: Single source of truth for all seed surfaces in the system.
// A new dev opens this file and sees every surface, its scope, tables, and
// data-flow direction. Category + reseed surfaces are engine-dispatched.
// Global surfaces are documented here as metadata only (not dispatched).
//
// IMPORT RULES: This file imports NOTHING from seed.js, seedEngine.js,
// src/features/, src/pipeline/, or src/app/api/. Zero external imports.
// Category and reseed surfaces use factory + DI to avoid circular deps.

// ── Global surfaces (metadata only — not engine-dispatched) ─────────────────

export const GLOBAL_SURFACES = Object.freeze([
  {
    key: 'brands',
    label: 'Brand Registry',
    scope: 'global',
    db: 'app.sqlite',
    tables: ['brands', 'brand_categories', 'brand_renames'],
    source: 'category_authority/_global/brand_registry.json',
    dataFlow: 'json-authoritative → SQL cache on boot; SQL-primary at runtime',
    hashGated: true,
    hashKey: 'brand_registry',
    calledFrom: 'src/app/api/bootstrap/createBootstrapSessionLayer.js',
    seederFile: 'src/db/appDbSeed.js',
  },
  {
    key: 'settings',
    label: 'User Settings',
    scope: 'global',
    db: 'app.sqlite',
    tables: ['settings', 'studio_maps'],
    source: '.workspace/global/user-settings.json',
    dataFlow: 'json → SQL on boot; SQL-primary at runtime; JSON is fallback mirror',
    hashGated: true,
    hashKey: 'user_settings',
    calledFrom: 'src/app/api/bootstrap/createBootstrapSessionLayer.js',
    seederFile: 'src/db/appDbSeed.js',
  },
  {
    key: 'colors',
    label: 'Color Registry',
    scope: 'global',
    db: 'app.sqlite',
    tables: ['color_registry'],
    source: 'category_authority/_global/color_registry.json',
    dataFlow: 'json → SQL (with fallback to EG_DEFAULT_COLORS, 77 entries)',
    hashGated: true,
    hashKey: 'color_registry',
    calledFrom: 'src/app/api/bootstrap/createBootstrapSessionLayer.js',
    seederFile: 'src/features/color-registry/colorRegistrySeed.js',
  },
]);

// ── Category surface factory (engine-dispatched, hard-fail) ─────────────────

export function buildCategorySurfaces(steps) {
  return [
    {
      key: 'components',
      label: 'Components',
      scope: 'category',
      dependsOn: [],
      tables: ['component_identity', 'component_aliases', 'component_values'],
      before: (ctx) => steps.reconcileComponentDbRows(ctx.db, ctx.fieldRules),
      execute: (ctx) => steps.seedComponents(ctx.db, ctx.fieldRules),
      after: null,
      summarize: (result, beforeResult) => ({
        components_seeded: result.identityCount,
        removed_identity_rows: beforeResult?.removed_identity_rows ?? 0,
        removed_value_rows: beforeResult?.removed_value_rows ?? 0,
        removed_alias_rows: beforeResult?.removed_alias_rows ?? 0,
        removed_item_component_link_rows: beforeResult?.removed_item_component_link_rows ?? 0,
        removed_key_review_rows: beforeResult?.removed_key_review_rows ?? 0,
      }),
    },
    {
      key: 'component_overrides',
      label: 'Component Overrides',
      scope: 'category',
      dependsOn: ['components'],
      tables: ['component_identity', 'component_values'],
      before: (ctx) => steps.reconcileComponentOverrideRows(ctx.db, ctx.config, ctx.category),
      execute: (ctx) => steps.seedComponentOverrides(ctx.db, ctx.config, ctx.category),
      after: null,
      summarize: (result, beforeResult) => ({
        component_overrides_seeded: result.overrideCount,
        removed_override_value_rows: beforeResult?.removed_override_value_rows ?? 0,
        removed_alias_rows: beforeResult?.removed_alias_rows ?? 0,
        reset_review_status_rows: beforeResult?.reset_review_status_rows ?? 0,
      }),
    },
    {
      key: 'lists',
      label: 'List Values',
      scope: 'category',
      dependsOn: [],
      tables: ['list_values'],
      before: (ctx) => steps.reconcileListSeedRows(ctx.db, ctx.fieldRules, ctx.config, ctx.category),
      execute: (ctx) => steps.seedListValues(ctx.db, ctx.fieldRules, ctx.config, ctx.category),
      after: null,
      summarize: (result, beforeResult) => ({
        list_values_seeded: result.count,
        removed_list_value_rows: beforeResult?.removed_list_value_rows ?? 0,
      }),
    },
    {
      key: 'products',
      label: 'Products',
      scope: 'category',
      dependsOn: ['components', 'lists'],
      tables: ['item_field_state', 'item_component_links', 'item_list_links'],
      before: null,
      execute: (ctx) => steps.seedProducts(ctx.db, ctx.config, ctx.category, ctx.fieldRules, ctx.fieldMeta),
      after: null,
      summarize: (result) => ({
        products_seeded: result.productCount,
      }),
    },
    {
      key: 'backfill_links',
      label: 'Component Link Backfill',
      scope: 'category',
      dependsOn: ['products'],
      tables: ['item_component_links'],
      before: null,
      execute: (ctx) => steps.backfillComponentLinks(ctx.db, ctx.fieldMeta, ctx.fieldRules),
      after: null,
      summarize: (result) => ({
        component_links_backfilled: result.backfilled,
      }),
    },
    {
      key: 'source_key_review',
      label: 'Source & Key Review',
      scope: 'category',
      dependsOn: ['products', 'backfill_links'],
      tables: ['key_review_state', 'key_review_runs', 'key_review_run_sources', 'key_review_audit'],
      before: null,
      execute: (ctx) => steps.seedSourceAndKeyReview(ctx.db, ctx.category, ctx.fieldMeta),
      after: null,
      summarize: (result) => ({
        key_review_states_seeded: result.keyReviewStateCount,
        key_review_audit_seeded: result.keyReviewAuditCount,
        key_review_runs_seeded: result.keyReviewRunCount,
      }),
    },
  ];
}

// ── Reseed surface factory (runtime-dispatched, best-effort) ────────────────

export function buildReseedSurfaces(deps) {
  return [
    {
      key: 'checkpoint',
      label: 'Checkpoints',
      scope: 'reseed',
      tables: [
        'products', 'product_queue', 'runs', 'product_runs',
        'run_artifacts', 'crawl_sources', 'url_crawl_ledger',
        'query_cooldowns', 'screenshots', 'videos',
      ],
      shouldRun: (ctx) => Boolean(ctx.indexLabRoot),
      execute: (ctx) => deps.scanAndSeedCheckpoints({
        specDb: ctx.db,
        indexLabRoot: ctx.indexLabRoot,
        productRoot: ctx.productRoot,
      }),
      formatLog: (category, result) =>
        result.runs_seeded > 0
          ? `${category}: ${result.runs_seeded} runs re-seeded from checkpoints`
          : '',
    },
    {
      key: 'color_edition',
      label: 'Color Edition',
      scope: 'reseed',
      tables: ['color_edition_finder', 'color_edition_finder_runs'],
      shouldRun: null,
      execute: (ctx) => deps.rebuildColorEditionFinderFromJson({
        specDb: ctx.db,
        productRoot: ctx.productRoot,
      }),
      formatLog: (category, result) =>
        result.seeded > 0
          ? `${category}: ${result.seeded} color editions re-seeded`
          : '',
    },
    {
      key: 'llm_route_matrix',
      label: 'LLM Route Matrix',
      scope: 'reseed',
      tables: ['llm_route_matrix'],
      shouldRun: null,
      execute: (ctx) => deps.rebuildLlmRouteMatrixFromJson({
        specDb: ctx.db,
        helperRoot: ctx.helperRoot,
      }),
      formatLog: (category, result) =>
        result.reseeded > 0
          ? `${category}: ${result.reseeded} LLM route rows re-seeded`
          : '',
    },
    {
      key: 'overrides',
      label: 'Consolidated Overrides',
      scope: 'reseed',
      tables: ['item_field_state', 'product_review_state'],
      shouldRun: null,
      execute: (ctx) => deps.reseedOverridesFromJson({
        specDb: ctx.db,
        helperRoot: ctx.helperRoot,
      }),
      formatLog: (category, result) =>
        result.reseeded
          ? `${category}: overrides re-seeded (${result.productCount} products) — field_rules_signature invalidated for full re-seed`
          : '',
    },
    {
      key: 'field_key_order',
      label: 'Field Key Order',
      scope: 'reseed',
      tables: ['field_key_order'],
      shouldRun: null,
      execute: (ctx) => deps.reseedFieldKeyOrderFromJson({
        specDb: ctx.db,
        helperRoot: ctx.helperRoot,
      }),
      formatLog: (category, result) =>
        result.reseeded
          ? `${category}: field_key_order re-seeded (${result.count} keys)`
          : '',
    },
    {
      key: 'field_studio_map',
      label: 'Field Studio Map',
      scope: 'reseed',
      tables: ['field_studio_map', 'list_values'],
      shouldRun: null,
      execute: (ctx) => deps.reseedFieldStudioMapFromJson({
        specDb: ctx.db,
        helperRoot: ctx.helperRoot,
      }),
      formatLog: (category, result) =>
        result.reseeded
          ? `${category}: field_studio_map re-seeded${result.manualRemoved > 0 ? ` (${result.manualRemoved} stale manual enums removed)` : ''}`
          : '',
    },
  ];
}

// ── Utilities ────────────────────────────────────────────────────────────────

// WHY: Kahn's algorithm — returns surfaces ordered so every entry appears
// after all entries it depends on. Throws on circular dependencies.
export function topologicalSort(surfaces) {
  if (surfaces.length === 0) return [];

  const byKey = new Map(surfaces.map(s => [s.key, s]));
  const inDegree = new Map(surfaces.map(s => [s.key, 0]));
  const dependents = new Map(surfaces.map(s => [s.key, []]));

  for (const surface of surfaces) {
    for (const dep of (surface.dependsOn || [])) {
      inDegree.set(surface.key, (inDegree.get(surface.key) || 0) + 1);
      const list = dependents.get(dep) || [];
      list.push(surface.key);
      dependents.set(dep, list);
    }
  }

  const queue = surfaces
    .filter(s => inDegree.get(s.key) === 0)
    .map(s => s.key);

  const sorted = [];
  while (queue.length > 0) {
    const key = queue.shift();
    sorted.push(byKey.get(key));
    for (const dependent of (dependents.get(key) || [])) {
      const newDegree = inDegree.get(dependent) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) queue.push(dependent);
    }
  }

  if (sorted.length !== surfaces.length) {
    throw new Error('Circular dependency detected among seed surfaces');
  }

  return sorted;
}

export function getSurfaceByKey(surfaces, key) {
  return surfaces.find(s => s.key === key);
}
