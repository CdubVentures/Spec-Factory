/**
 * Finder Module Registry — SSOT for all finder modules.
 *
 * O(1): add one entry here → DDL, SQL store, routes, reseed, operations
 * tracker, frontend types, phase schema preview, indexing lab panel,
 * and module settings sections are all derived automatically.
 *
 * Each entry declares everything the system needs to auto-wire a finder
 * module: identity, DB schema, route config, LLM phase, field keys,
 * and UI metadata.
 *
 * Module taxonomy (`moduleClass`):
 *   - 'variantGenerator'        Produces variants + the item default (e.g. CEF).
 *                               Upstream of all sub-features; has no `variantSource`.
 *   - 'variantFieldProducer'    Iterates an upstream generator's variants, does one
 *                               LLM search per variant, emits `field_candidates` rows
 *                               (per-variant + one item-default). Requires `variantSource`
 *                               and `perVariantAttemptBudget`. Example: release date, SKU,
 *                               discontinued, price, affiliate links.
 *   - 'variantArtifactProducer' Iterates an upstream generator's variants, produces
 *                               non-field artifacts (e.g. PIF → images). Requires
 *                               `variantSource`. Has no `field_candidates` output.
 */

export const FINDER_MODULES = Object.freeze([
  {
    // Identity
    id: 'colorEditionFinder',
    routePrefix: 'color-edition-finder',
    moduleClass: 'variantGenerator',
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
      { name: 'cooldown_until', type: 'TEXT', default: "''" },
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

    // JSON store config
    filePrefix: 'color_edition',

    // Reseed: key for the surface in seedRegistry + rebuild function in DI deps
    reseedKey: 'color_edition',
    rebuildFnKey: 'rebuildColorEditionFinderFromJson',

    // Per-category settings (typed schema; drives DDL + UI renderer).
    // WHY: Prompt templates are edited in LLM Config (not Pipeline Settings),
    // so they're `hidden: true` — the settings table still stores them.
    settingsSchema: [
      { key: 'discoveryPromptTemplate', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'identityCheckPromptTemplate', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'urlHistoryEnabled', type: 'bool', default: false,
        uiLabel: 'URL history', uiGroup: 'Discovery History',
        uiTip: 'When on, prior run URLs are injected into the prompt so the LLM can avoid re-crawling them. Product-scoped for CEF. Off by default.' },
      { key: 'queryHistoryEnabled', type: 'bool', default: false,
        uiLabel: 'Query history', uiGroup: 'Discovery History',
        uiTip: 'When on, prior run search queries are injected into the prompt. Off by default — queries rot faster than URLs.' },
    ],

    // LLM phase schema (codegen: phaseSchemaRegistry.generated.js)
    promptBuilderExport: 'buildColorEditionFinderPrompt',
    responseSchemaExport: 'colorEditionFinderResponseSchema',

    // Data-change events: suffix → extra domains beyond routePrefix.
    // Standard 3 (run, run-deleted, deleted) always included.
    // WHY: color-registry because CEF discovers new colors.
    // WHY: review + product on run lifecycle — CEF writes field_candidates
    // for colors/editions; without these, the review grid stays stale until reload.
    dataChangeEvents: {
      'run': ['color-registry', 'review', 'product'],
      'run-deleted': ['review', 'product'],
      'deleted': ['review', 'product'],
      'variant-deleted': ['review', 'product', 'product-image-finder', 'publisher'],
    },

    // Module Settings (codegen: moduleSettingsSections.generated.ts)
    settingsLabel: 'Color & Edition Finder',
    settingsSubtitle: 'CEF module settings',
    settingsTip: 'Per-category settings for the Color & Edition Finder discovery module.',
    iconName: 'palette',
  },
  {
    // Identity
    id: 'productImageFinder',
    routePrefix: 'product-image-finder',
    moduleClass: 'variantArtifactProducer',
    variantSource: 'colorEditionFinder',
    moduleType: 'pif',
    moduleLabel: 'PIF',
    chipStyle: 'sf-chip-info',

    // DB schema (summary table — custom columns per module)
    tableName: 'product_image_finder',
    runsTableName: 'product_image_finder_runs',
    summaryColumns: [
      { name: 'images', type: 'TEXT', default: "'[]'" },
      { name: 'image_count', type: 'INTEGER', default: '0' },
      { name: 'carousel_slots', type: 'TEXT', default: "'{}'" },
      { name: 'eval_state', type: 'TEXT', default: "'{}'" },
      // WHY: SQL projection of doc.evaluations[] — runtime GET must read SQL, not JSON.
      { name: 'evaluations', type: 'TEXT', default: "'[]'" },
    ],
    summaryIndexes: [],

    // PIF doesn't populate field candidates — images are artifacts, not spec fields
    fieldKeys: [],
    requiredFields: [],

    // LLM phase
    phase: 'imageFinder',

    // JSON store config
    filePrefix: 'product_images',

    // Reseed
    reseedKey: 'product_images',
    rebuildFnKey: 'rebuildProductImageFinderFromJson',

    // Per-category settings (typed schema; drives DDL + UI renderer).
    // Widget-backed entries reference named widgets registered in the GUI;
    // widgetProps.childKeys declare any sibling keys the widget composes.
    settingsSchema: [
      // Carousel strategy — viewBudget widget owns viewAttemptBudget + viewAttemptBudgets
      { key: 'satisfactionThreshold', type: 'int', default: 3, min: 1, max: 20,
        uiLabel: 'Satisfaction Threshold', uiGroup: 'Carousel Strategy (Loop Run)',
        uiTip: 'Quality images per view required before that view is "satisfied"' },
      { key: 'viewBudget', type: 'string', default: '', allowEmpty: true,
        widget: 'viewBudget', uiLabel: 'View Budget', uiGroup: 'Carousel Strategy (Loop Run)',
        uiTip: 'Active views + per-view attempt budgets. Empty = category defaults.',
        widgetProps: { childKeys: ['viewAttemptBudget', 'viewAttemptBudgets'] } },
      { key: 'viewAttemptBudget', type: 'int', default: 5, min: 1, max: 50,
        uiLabel: 'Default View Attempt Budget', uiGroup: 'Carousel Strategy (Loop Run)' },
      { key: 'viewAttemptBudgets', type: 'string', default: '', allowEmpty: true,
        uiLabel: 'Per-View Attempt Budgets (JSON)', uiGroup: 'Carousel Strategy (Loop Run)' },
      { key: 'reRunBudget', type: 'int', default: 1, min: 0, max: 5,
        uiLabel: 'Re-run Budget', uiGroup: 'Carousel Strategy (Loop Run)',
        uiTip: 'Extra LLM calls per view when re-looping an already-satisfied variant. 0 = skip.' },

      // Hero slots
      { key: 'heroEnabled', type: 'bool', default: true,
        uiLabel: 'Hero Slots Enabled', uiGroup: 'Hero Slots' },
      { key: 'heroCount', type: 'int', default: 3, min: 1, max: 20, disabledBy: 'heroEnabled',
        uiLabel: 'Hero Count', uiGroup: 'Hero Slots' },
      { key: 'heroAttemptBudget', type: 'int', default: 3, min: 1, max: 20, disabledBy: 'heroEnabled',
        uiLabel: 'Hero Attempt Budget', uiGroup: 'Hero Slots' },

      // Views — widget-managed priority list (JSON blob)
      { key: 'viewConfig', type: 'string', default: '', allowEmpty: true,
        widget: 'viewConfig', uiLabel: 'View Configuration', uiGroup: 'Views (Single Run)',
        uiTip: 'Priority order and descriptions per view. Empty = category defaults.' },

      // Prompt hints — secondary views mentioned in the ADDITIONAL section per run type.
      // Single run = one LLM call searching all priority views at once.
      // Loop run = per-view focused calls driven by carousel strategy.
      { key: 'singleRunSecondaryHints', type: 'string', default: '', allowEmpty: true,
        widget: 'viewHintsList', uiLabel: 'Single Run Secondary Hints', uiGroup: 'Prompt Hints',
        uiTip: 'Views mentioned in the ADDITIONAL section of single-run prompts (besides the priority views). Empty = none.' },
      { key: 'loopRunSecondaryHints', type: 'string', default: '', allowEmpty: true,
        widget: 'viewHintsList', uiLabel: 'Loop Run Secondary Hints', uiGroup: 'Prompt Hints',
        uiTip: 'Views mentioned in the ADDITIONAL section of loop-run prompts (besides the focus view). Empty = none.' },

      // Image quality — flat primitives + optional per-view widget
      { key: 'minWidth', type: 'int', default: 800, min: 100, max: 8000,
        uiLabel: 'Min Width', uiGroup: 'Image Quality' },
      { key: 'minHeight', type: 'int', default: 600, min: 100, max: 8000,
        uiLabel: 'Min Height', uiGroup: 'Image Quality' },
      { key: 'minFileSize', type: 'int', default: 50000, min: 1000, max: 50000000,
        uiLabel: 'Min File Size (bytes)', uiGroup: 'Image Quality' },
      { key: 'viewQualityConfig', type: 'string', default: '', allowEmpty: true,
        widget: 'viewQualityGrid', uiLabel: 'Per-View Quality', uiGroup: 'Image Quality',
        uiTip: 'Per-view overrides of the quality thresholds. Empty = category defaults.' },

      // Vision evaluator
      { key: 'evalEnabled', type: 'bool', default: true,
        uiLabel: 'Vision Evaluator Enabled', uiGroup: 'Vision Evaluation' },
      { key: 'evalThumbSize', type: 'int', default: 768, min: 256, max: 2048, disabledBy: 'evalEnabled',
        widget: 'evalThumbSize',
        uiLabel: 'Eval Thumbnail Size', uiGroup: 'Vision Evaluation',
        uiTip: '512px tile boundary — 768 uses 4 tiles like 1024. Larger = more detail but more tokens.' },
      { key: 'evalHeroCount', type: 'int', default: 3, min: 1, max: 20, disabledBy: 'evalEnabled',
        uiLabel: 'Eval Hero Count', uiGroup: 'Vision Evaluation' },

      // RMBG — niche performance knob, kept at the bottom
      { key: 'rmbgConcurrency', type: 'int', default: 0, min: 0, max: 32,
        uiLabel: 'RMBG Concurrency', uiGroup: 'RMBG',
        uiTip: '0 = auto-detect from system RAM; >0 = fixed ONNX slot count' },

      // Search prompts — edited in LLM Config, persisted here for the runtime
      { key: 'viewPromptOverride', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'heroPromptOverride', type: 'string', default: '', allowEmpty: true, hidden: true },
      // Eval prompts + per-view criteria — edited in LLM Config, persisted here for the runtime
      { key: 'evalPromptOverride', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'heroEvalPromptOverride', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'evalViewCriteria_top', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'evalViewCriteria_bottom', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'evalViewCriteria_left', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'evalViewCriteria_right', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'evalViewCriteria_front', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'evalViewCriteria_rear', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'evalViewCriteria_sangle', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'evalViewCriteria_angle', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'heroEvalCriteria', type: 'string', default: '', allowEmpty: true, hidden: true },

      // Per-view per-role discovery prompt text — edited in LLM Config under Category → View tabs.
      // Empty string = fall back to per-category default (see viewPromptDefaults.js).
      { key: 'loopViewPrompt_top', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'loopViewPrompt_bottom', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'loopViewPrompt_left', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'loopViewPrompt_right', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'loopViewPrompt_front', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'loopViewPrompt_rear', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'loopViewPrompt_sangle', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'loopViewPrompt_angle', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'priorityViewPrompt_top', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'priorityViewPrompt_bottom', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'priorityViewPrompt_left', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'priorityViewPrompt_right', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'priorityViewPrompt_front', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'priorityViewPrompt_rear', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'priorityViewPrompt_sangle', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'priorityViewPrompt_angle', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'additionalViewPrompt_top', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'additionalViewPrompt_bottom', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'additionalViewPrompt_left', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'additionalViewPrompt_right', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'additionalViewPrompt_front', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'additionalViewPrompt_rear', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'additionalViewPrompt_sangle', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'additionalViewPrompt_angle', type: 'string', default: '', allowEmpty: true, hidden: true },

      // Universal discovery history (shared with CEF/RDF). Scope: variant + mode.
      { key: 'urlHistoryEnabled', type: 'bool', default: false,
        uiLabel: 'URL history', uiGroup: 'Discovery History',
        uiTip: 'When on, prior run URLs are injected into the prompt so the LLM can avoid re-crawling them. Scoped per variant per mode (view/hero). Off by default.' },
      { key: 'queryHistoryEnabled', type: 'bool', default: false,
        uiLabel: 'Query history', uiGroup: 'Discovery History',
        uiTip: 'When on, prior run search queries are injected into the prompt. Scoped per variant per mode. Off by default — queries rot faster than URLs.' },
    ],


    // LLM phase schema (codegen: phaseSchemaRegistry.generated.js)
    promptBuilderExport: 'buildProductImageFinderPrompt',
    responseSchemaExport: 'productImageFinderResponseSchema',

    // Data-change events: suffix → extra domains beyond routePrefix.
    // Standard 3 (run, run-deleted, deleted) always included.
    dataChangeEvents: {
      'run': [],
      'run-deleted': [],
      'deleted': [],
      'loop': [],
      'image-processed': [],
      'image-deleted': [],
      'batch-processed': [],
      'evaluate': [],
    },

    // Module Settings (codegen: moduleSettingsSections.generated.ts)
    settingsLabel: 'Product Image Finder',
    settingsSubtitle: 'PIF module settings',
    settingsTip: 'Per-category settings for the Product Image Finder: view angles and image quality.',
    iconName: 'image',
  },
  {
    // Identity
    id: 'releaseDateFinder',
    routePrefix: 'release-date-finder',
    moduleClass: 'variantFieldProducer',
    variantSource: 'colorEditionFinder',
    moduleType: 'rdf',
    moduleLabel: 'RDF',
    chipStyle: 'sf-chip-warning',

    // Scalar field producer declarative config — drives registerScalarFinder
    // wiring. Future scalar finders (sku, pricing, msrp, discontinued, upc)
    // copy these 4 fields and inherit the full backend stack via a single
    // `registerScalarFinder` call in the feature file.
    valueKey: 'release_date',
    valueType: 'date',
    candidateSourceType: 'release_date_finder',
    logPrefix: 'rdf',

    // DB schema (summary table — custom columns per module)
    tableName: 'release_date_finder',
    runsTableName: 'release_date_finder_runs',
    summaryColumns: [
      // WHY: Per-variant selected candidates projected from JSON for fast UI GET.
      // Each entry: { variant_id, variant_key, variant_label, value, confidence, sources, ran_at, run_number }
      { name: 'candidates', type: 'TEXT', default: "'[]'" },
      { name: 'candidate_count', type: 'INTEGER', default: '0' },
      { name: 'cooldown_until', type: 'TEXT', default: "''" },
    ],
    summaryIndexes: [
      { name: 'idx_rdf_cooldown', columns: ['cooldown_until'] },
    ],

    // Fields this finder populates (publisher-owned — RDF submits candidates via submitCandidate)
    fieldKeys: ['release_date'],

    // Field Studio gate: release_date must be enabled in eg_toggles
    requiredFields: ['release_date'],

    // LLM phase (reference to llmPhaseDefs entry)
    phase: 'releaseDateFinder',

    // JSON store config
    filePrefix: 'release_date',

    // Reseed
    reseedKey: 'release_date',
    rebuildFnKey: 'rebuildReleaseDateFinderFromJson',

    // Per-category settings. variantFieldProducer requires perVariantAttemptBudget.
    // WHY: Prompt templates are edited in LLM Config (not Pipeline Settings),
    // so they're `hidden: true` — the settings table still stores them.
    settingsSchema: [
      { key: 'discoveryPromptTemplate', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'perVariantAttemptBudget', type: 'int', default: 3, min: 1, max: 5,
        uiLabel: 'Per-Variant Attempt Budget', uiGroup: 'Discovery',
        uiTip: 'Max LLM calls per variant when looping. 1 = single shot. Higher values retry on low confidence / missing evidence until the candidate reaches the publisher gate (or LLM returns a definitive unknown). Only applies to the "Loop" / "Loop All" buttons; plain "Run" is always single-shot.' },

      // WHY: No local confidence gate here. publishConfidenceThreshold (global
      // Publisher setting) is the single source of truth for confidence gating
      // across ALL finders. Don't copy-paste a per-finder minConfidence into
      // future variantFieldProducer modules — let the publisher decide.

      // Universal discovery history (shared with CEF/PIF). Scope: per variant.
      { key: 'urlHistoryEnabled', type: 'bool', default: false,
        uiLabel: 'URL history', uiGroup: 'Discovery History',
        uiTip: 'When on, prior run URLs are injected into the prompt so the LLM can avoid re-crawling them. Variant-scoped for RDF. Off by default.' },
      { key: 'queryHistoryEnabled', type: 'bool', default: false,
        uiLabel: 'Query history', uiGroup: 'Discovery History',
        uiTip: 'When on, prior run search queries are injected into the prompt. Off by default — queries rot faster than URLs.' },
    ],

    // LLM phase schema (codegen: phaseSchemaRegistry.generated.js)
    promptBuilderExport: 'buildReleaseDateFinderPrompt',
    responseSchemaExport: 'releaseDateFinderResponseSchema',
    // Editorial GET response schema — drives types.generated.ts + hooks codegen
    // (Phase 3). Opt-in per finder: CEF/PIF don't declare one → codegen skips them.
    getResponseSchemaExport: 'releaseDateFinderGetResponseSchema',

    // Generic scalar finder panel display config (Phase 5).
    // WHY: GenericScalarFinderPanel reads these from the generated registry to
    // render header title + tooltip + KPI label. SSOT for scalar-finder display
    // strings — future scalar finders (sku, pricing, msrp, discontinued, upc)
    // declare the same 3 fields and inherit the full panel.
    panelTitle: 'Release Date Finder',
    panelTip: 'Discovers per-variant first-availability release dates via web search. Candidates flow through the publisher gate.',
    valueLabelPlural: 'Release Dates',

    // Data-change events: suffix → extra domains beyond routePrefix.
    // WHY: RDF writes field_candidates via submitCandidate, so review + product + publisher
    // must refresh on run lifecycle events (same contract as CEF).
    dataChangeEvents: {
      'run': ['review', 'product', 'publisher'],
      'run-deleted': ['review', 'product', 'publisher'],
      'deleted': ['review', 'product', 'publisher'],
      'loop': ['review', 'product', 'publisher'],
    },

    // Module Settings (codegen: moduleSettingsSections.generated.ts)
    settingsLabel: 'Release Date Finder',
    settingsSubtitle: 'RDF module settings',
    settingsTip: 'Per-category settings for the Release Date Finder: per-variant discovery of first-availability dates.',
    iconName: 'calendar',
  },
]);

// WHY: O(1) lookup by id for runtime use (SpecDb, route wiring, etc.)
export const FINDER_MODULE_MAP = Object.freeze(
  Object.fromEntries(FINDER_MODULES.map(m => [m.id, m]))
);

// Pure helpers — shared between `deriveFinderPaths` callers. Derivations below
// are byte-equivalent to previously-authored registry string fields; we fold
// them into a single function so new finders declare `id` once and inherit the
// full wiring contract (backend route file + registrar + frontend panel path +
// schema filename).
function pascalCase(id) {
  return id ? id[0].toUpperCase() + id.slice(1) : '';
}

function camelToKebab(s) {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
}

function kebabToCamel(s) {
  return s.split('-').map((w, i) => i === 0 ? w : pascalCase(w)).join('');
}

function stripFinderSuffix(id) {
  return id.endsWith('Finder') ? id.slice(0, -'Finder'.length) : id;
}

/**
 * Derive the path + export strings for a finder module from its `id`.
 *
 * Replaces previously-authored registry fields (`featurePath`, `routeFile`,
 * `registrarExport`, `panelFeaturePath`, `panelExport`) + the schema-module
 * filename special case in `generateFinderTypes.js`. All derived values are
 * byte-identical to what the 3 existing entries used to author verbatim.
 *
 * Pure function — does not read the registry.
 *
 * @param {string} id — finder module id (camelCase, e.g. 'releaseDateFinder')
 * @returns {{
 *   featurePath: string,        // backend folder under src/features/
 *   routeFile: string,          // backend api/{routeFile}.js filename (no .js)
 *   registrarExport: string,    // named export inside {routeFile}.js
 *   panelFeaturePath: string,   // frontend folder under tools/gui-react/src/features/
 *   panelExport: string,        // panel React component named export
 *   schemaModule: string,       // schema filename under src/features/{featurePath}/{schemaModule}.js
 *   adapterModule: string,      // LLM adapter filename under src/features/{featurePath}/{adapterModule}.js
 * }}
 */
export function deriveFinderPaths(id) {
  const pascalId = pascalCase(id);
  const stripped = stripFinderSuffix(id);
  const featurePath = camelToKebab(stripped);
  const camelStem = kebabToCamel(featurePath);
  return {
    featurePath,
    routeFile: `${id}Routes`,
    registrarExport: `register${pascalId}Routes`,
    panelFeaturePath: camelToKebab(id),
    panelExport: `${pascalId}Panel`,
    schemaModule: `${camelStem}Schema`,
    adapterModule: `${camelStem}LlmAdapter`,
  };
}

// WHY: O(1) lookup by routePrefix for route matching
export const FINDER_MODULE_BY_PREFIX = Object.freeze(
  Object.fromEntries(FINDER_MODULES.map(m => [m.routePrefix, m]))
);

/**
 * Derived data-change event → domain map for all finder modules.
 * Each event key is `${routePrefix}-${suffix}`, domains always include routePrefix.
 *
 * Consumed by:
 * - Backend: dataChangeContract.js (spread into DATA_CHANGE_EVENT_DOMAIN_MAP)
 * - Frontend: invalidationResolver.js (spread into DATA_CHANGE_EVENT_DOMAIN_FALLBACK)
 */
export const FINDER_DATA_CHANGE_EVENTS = Object.freeze(
  Object.fromEntries(
    FINDER_MODULES.flatMap((mod) => {
      const events = mod.dataChangeEvents || {};
      return Object.entries(events).map(([suffix, extraDomains]) => [
        `${mod.routePrefix}-${suffix}`,
        [mod.routePrefix, ...(Array.isArray(extraDomains) ? extraDomains : [])],
      ]);
    }),
  ),
);

/**
 * Derived set of data-change domains for all finder modules.
 * Each module's routePrefix is a domain.
 */
export const FINDER_DATA_CHANGE_DOMAINS = Object.freeze(
  FINDER_MODULES.map((mod) => mod.routePrefix),
);

/**
 * O(1) lookup: find the finder module that owns a given field key.
 *
 * @param {string} fieldKey
 * @returns {object|null} the module entry, or null if no module lists the field
 */
export function getFinderModuleForField(fieldKey) {
  if (!fieldKey || typeof fieldKey !== 'string') return null;
  for (const mod of FINDER_MODULES) {
    if (Array.isArray(mod.fieldKeys) && mod.fieldKeys.includes(fieldKey)) return mod;
  }
  return null;
}

/**
 * True when a field's published state is per-variant.
 *
 * Authored value wins: if the compiled field rule declares `variant_dependent`
 * as a boolean, that value is returned. Otherwise, fall back to module-class
 * derivation (variantFieldProducer → true, everything else → false).
 *
 * The authored path is the SSOT — EG preset builders emit variant_dependent=true
 * for colors/editions/release_date, and Field Rules Studio lets non-EG fields
 * opt in via the Contract panel toggle. The module-class fallback keeps
 * legacy/bare callers (tests, pre-compile lookups) working without a specDb.
 *
 * @param {string} fieldKey
 * @param {object} [specDb] — optional specDb with getCompiledRules(); when present,
 *   the authored field-rule value is used if declared.
 * @returns {boolean}
 */
export function isVariantDependentField(fieldKey, specDb) {
  if (specDb && typeof specDb.getCompiledRules === 'function') {
    const rules = specDb.getCompiledRules();
    const authored = rules?.fields?.[fieldKey]?.variant_dependent;
    if (typeof authored === 'boolean') return authored;
  }
  const mod = getFinderModuleForField(fieldKey);
  return mod?.moduleClass === 'variantFieldProducer';
}
