/**
 * Finder Module Registry — SSOT for all finder modules.
 *
 * O(1): add one entry here → DDL, SQL store, routes, reseed, operations
 * tracker, and frontend types are all derived automatically.
 *
 * Each entry declares everything the system needs to auto-wire a finder
 * module: identity, DB schema, route config, LLM phase, field keys,
 * and UI metadata.
 */

export const FINDER_MODULES = Object.freeze([
  {
    // Identity
    id: 'colorEditionFinder',
    routePrefix: 'color-edition-finder',
    moduleType: 'cef',
    moduleLabel: 'CEF',
    chipStyle: 'sf-chip-accent',

    // DB schema (summary table — custom columns per module)
    tableName: 'color_edition_finder',
    runsTableName: 'color_edition_finder_runs',
    summaryColumns: [
      { name: 'colors', type: 'TEXT', default: "'[]'" },
      { name: 'editions', type: 'TEXT', default: "'[]'" },
      { name: 'default_color', type: 'TEXT', default: "''" },
    ],
    summaryIndexes: [
      { name: 'idx_cef_cooldown', columns: ['cooldown_until'] },
    ],

    // Fields this finder populates (for candidate cleanup on delete-all)
    fieldKeys: ['colors', 'editions'],

    // Field Studio gate: ALL listed fields must be enabled in eg_toggles
    // for this module to be active. If any are disabled, module is disabled.
    requiredFields: ['colors', 'editions'],

    // LLM phase (reference to existing llmPhaseDefs entry)
    phase: 'colorFinder',

    // Feature module paths (for auto-wiring routes + orchestrator)
    featurePath: 'color-edition',
    routeFile: 'colorEditionFinderRoutes',
    contextFile: 'colorEditionFinderRouteContext',
    registrarExport: 'registerColorEditionFinderRoutes',
    contextExport: 'createColorEditionFinderRouteContext',

    // JSON store config
    filePrefix: 'color_edition',

    // Reseed: key for the surface in seedRegistry + rebuild function in DI deps
    reseedKey: 'color_edition',
    rebuildFnKey: 'rebuildColorEditionFinderFromJson',

    // Per-category settings (stored in {tableName}_settings table)
    settingsDefaults: {},
  },
  {
    // Identity
    id: 'productImageFinder',
    routePrefix: 'product-image-finder',
    moduleType: 'pif',
    moduleLabel: 'PIF',
    chipStyle: 'sf-chip-info',

    // DB schema (summary table — custom columns per module)
    tableName: 'product_image_finder',
    runsTableName: 'product_image_finder_runs',
    summaryColumns: [
      { name: 'images', type: 'TEXT', default: "'[]'" },
      { name: 'image_count', type: 'INTEGER', default: '0' },
    ],
    summaryIndexes: [
      { name: 'idx_pif_cooldown', columns: ['cooldown_until'] },
    ],

    // PIF doesn't populate field candidates — images are artifacts, not spec fields
    fieldKeys: [],
    requiredFields: [],

    // LLM phase
    phase: 'imageFinder',

    // Feature module paths (for auto-wiring)
    featurePath: 'product-image',
    routeFile: 'productImageFinderRoutes',
    contextFile: 'productImageFinderRouteContext',
    registrarExport: 'registerProductImageFinderRoutes',
    contextExport: 'createProductImageFinderRouteContext',

    // JSON store config
    filePrefix: 'product_images',

    // Reseed
    reseedKey: 'product_images',
    rebuildFnKey: 'rebuildProductImageFinderFromJson',

    // Per-category settings (stored in {tableName}_settings table)
    settingsDefaults: { view1: 'top', view2: 'left' },
  },
]);

// WHY: O(1) lookup by id for runtime use (SpecDb, route wiring, etc.)
export const FINDER_MODULE_MAP = Object.freeze(
  Object.fromEntries(FINDER_MODULES.map(m => [m.id, m]))
);

// WHY: O(1) lookup by routePrefix for route matching
export const FINDER_MODULE_BY_PREFIX = Object.freeze(
  Object.fromEntries(FINDER_MODULES.map(m => [m.routePrefix, m]))
);
