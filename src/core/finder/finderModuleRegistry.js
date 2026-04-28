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
 *   - 'productFieldProducer'    Runs once per product across many fields dynamically
 *                               (compiled `field_rules`). Not per-variant. Writes
 *                               `field_candidates` for any key it resolves. Example:
 *                               the universal per-key finder.
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

    // Settings scope: 'global' = one shared config in app.sqlite + _global/ JSON.
    // 'category' = per-category SQL table + per-category JSON. CEF settings are
    // the same for every category today (audit confirmed); flattening to global
    // removes per-category storage overhead.
    settingsScope: 'global',

    // Settings schema (typed; drives DDL + UI renderer).
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
      'variant-deleted': ['review', 'product', 'product-image-finder', 'release-date-finder', 'sku-finder', 'publisher'],
      'variants-deleted-all': ['review', 'product', 'product-image-finder', 'release-date-finder', 'sku-finder', 'publisher'],
    },

    // Module Settings (codegen: moduleSettingsSections.generated.ts)
    settingsLabel: 'Color & Edition Finder',
    settingsSubtitle: 'CEF module settings',
    settingsTip: 'Global settings for the Color & Edition Finder discovery module.',
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

    // Settings scope: 'category' — PIF genuinely varies by category (mouse vs
    // keyboard view angles, descriptions, per-view budgets). Stays per-category.
    settingsScope: 'category',

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
        uiLabel: 'Default View Attempt Budget', uiGroup: 'Carousel Strategy (Loop Run)',
        uiTip: 'Max LLM calls per view on the first Loop. Each call targets one priority view; images for other views are kept as side-catches. A view stops when it collects Satisfaction Threshold quality images OR this budget is exhausted. Plain "Run" ignores this — Run is single-shot across all priority views.' },
      { key: 'viewAttemptBudgets', type: 'string', default: '', allowEmpty: true,
        uiLabel: 'Per-View Attempt Budgets (JSON)', uiGroup: 'Carousel Strategy (Loop Run)',
        uiTip: 'JSON overrides per view (e.g. {"top":8,"left":3}). Any view not listed falls back to Default View Attempt Budget.' },
      { key: 'reRunBudget', type: 'int', default: 1, min: 0, max: 5,
        uiLabel: 'Re-run Budget', uiGroup: 'Carousel Strategy (Loop Run)',
        uiTip: 'Extra LLM calls per view when you click Loop again on an already-satisfied variant. 0 = skip satisfied views entirely (no LLM call); Loop moves straight to unsatisfied views or hero. 1+ = allow N more targeted calls per satisfied view to fill gaps. Ignored on the first Loop.' },
      { key: 'carouselScoredViews', type: 'string', default: '', allowEmpty: true,
        widget: 'carouselScoring', uiLabel: 'Carousel Views', uiGroup: 'Carousel Scoring',
        uiTip: 'Check target views for the scored carousel denominator; placeholders can fill extra view slots.',
        widgetProps: { childKeys: ['carouselOptionalViews', 'carouselExtraTarget'] } },
      { key: 'carouselOptionalViews', type: 'string', default: '', allowEmpty: true,
        uiLabel: 'Carousel Placeholder Views', uiGroup: 'Carousel Scoring',
        uiTip: 'Canonical view placeholders that can fill/overfill the carousel count without increasing the scored-view denominator.' },
      { key: 'carouselExtraTarget', type: 'int', default: 3, min: 0, max: 20,
        uiLabel: 'Additional Image Target', uiGroup: 'Carousel Scoring',
        uiTip: 'Inner-ring target for additional non-scored carousel images. Filled extras can exceed this target.' },

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
      // Priority View Run = one LLM call searching all viewConfig priority views at once.
      // Individual View Run = one LLM call targeting a single specific view.
      // Loop Run = per-focus-view calls driven by the carousel strategy.
      { key: 'singleRunSecondaryHints', type: 'string', default: '', allowEmpty: true,
        widget: 'viewHintsList', uiLabel: 'Priority View Run Secondary Hints', uiGroup: 'Prompt Hints',
        uiTip: 'Views mentioned in the ADDITIONAL section when the Priority View button runs (besides the priority views from View Configuration). Empty = none.' },
      { key: 'individualViewRunSecondaryHints', type: 'string', default: '', allowEmpty: true,
        widget: 'viewHintsList', uiLabel: 'Individual View Run Secondary Hints', uiGroup: 'Prompt Hints',
        uiTip: 'Views mentioned in the ADDITIONAL section when one of the per-view buttons (Top, Bottom, ...) runs (besides the focus view itself). Empty = none.' },
      { key: 'loopRunSecondaryHints', type: 'string', default: '', allowEmpty: true,
        widget: 'viewHintsList', uiLabel: 'Loop Run Secondary Hints', uiGroup: 'Prompt Hints',
        uiTip: 'Views mentioned in the ADDITIONAL section per Loop iteration (besides the focus view). Empty = none.' },

      // Image quality — flat primitives + optional per-view widget
      // PIF prompt memory - accepted image context and validation outcome history.
      { key: 'priorityViewRunImageHistoryEnabled', type: 'bool', default: false,
        uiLabel: 'Priority View Run Image History', uiGroup: 'Image History',
        uiTip: 'Inject accepted image history for the variant into Priority View Run prompts. Exact duplicates are discouraged, but better versions, alternate crops, and different useful angles remain welcome.' },
      { key: 'individualViewRunImageHistoryEnabled', type: 'bool', default: false,
        uiLabel: 'Individual View Run Image History', uiGroup: 'Image History',
        uiTip: 'Inject accepted image history for the variant into per-view button prompts. Exact duplicates are discouraged without blocking better versions or alternate angles.' },
      { key: 'loopRunImageHistoryEnabled', type: 'bool', default: false,
        uiLabel: 'Loop Run Image History', uiGroup: 'Image History',
        uiTip: 'Inject accepted image history for the variant into Loop prompts across view and hero iterations.' },
      { key: 'priorityViewRunLinkValidationEnabled', type: 'bool', default: false,
        uiLabel: 'Priority View Run Link Validation', uiGroup: 'Link Validation',
        uiTip: 'Inject the link-validation checklist and known candidate outcomes into Priority View Run prompts.' },
      { key: 'individualViewRunLinkValidationEnabled', type: 'bool', default: false,
        uiLabel: 'Individual View Run Link Validation', uiGroup: 'Link Validation',
        uiTip: 'Inject the link-validation checklist and known candidate outcomes into per-view button prompts.' },
      { key: 'loopRunLinkValidationEnabled', type: 'bool', default: false,
        uiLabel: 'Loop Run Link Validation', uiGroup: 'Link Validation',
        uiTip: 'Inject the link-validation checklist and known candidate outcomes into Loop prompts across view and hero iterations.' },

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
      'run': ['catalog'],
      'run-deleted': ['catalog'],
      'deleted': ['catalog'],
      'loop': ['catalog'],
      'image-processed': ['catalog'],
      'image-deleted': ['catalog'],
      'batch-processed': ['catalog'],
      'evaluate': ['catalog'],
      'carousel-updated': ['catalog'],
    },

    // Module Settings (codegen: moduleSettingsSections.generated.ts)
    settingsLabel: 'Product Image Finder',
    settingsSubtitle: 'PIF module settings',
    settingsTip: 'Per-category settings for the Product Image Finder: view angles and image quality.',
    // ^ PIF stays per-category — mouse view angles differ from keyboard etc.
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

    // Settings scope: 'global'. RDF settings are the same for every category
    // (per-variant attempt budget, history toggles).
    settingsScope: 'global',

    // Settings schema. variantFieldProducer requires perVariantAttemptBudget.
    // WHY: Prompt templates are edited in LLM Config (not Pipeline Settings),
    // so they're `hidden: true` — the settings table still stores them.
    settingsSchema: [
      { key: 'discoveryPromptTemplate', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'perVariantAttemptBudget', type: 'int', default: 3, min: 1, max: 5,
        uiLabel: 'Per-Variant Attempt Budget', uiGroup: 'Discovery',
        uiTip: 'Max LLM calls per variant on the first Loop. 1 = single shot. Higher values retry until either (a) the publisher gate publishes the candidate, or (b) the LLM returns a definitive "unknown" with a reason. Only applies to "Loop" / "Loop All"; plain "Run" is always single-shot.' },
      { key: 'reRunBudget', type: 'int', default: 1, min: 0, max: 5,
        uiLabel: 'Re-run Budget', uiGroup: 'Discovery',
        uiTip: 'Extra LLM calls per variant when you click Loop again on an already-resolved variant. 0 = skip resolved variants entirely (no LLM call). 1+ = allow N more attempts to refine the date with new evidence. "Already-resolved" means the publisher has accepted a release_date for that variant. Ignored on the first Loop.' },

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
    // WHY: Scalar finders declare defaultTemplateExport so codegen can emit
    // FINDER_SCALAR_DEFAULT_TEMPLATES — the phase-registry overlay is derived
    // from this map via buildScalarFinderPromptTemplates (no hand-written block).
    defaultTemplateExport: 'RDF_DEFAULT_TEMPLATE',
    // WHY: Parameterized source-guidance + variant-disambiguation globals are
    // auto-composed by buildScalarFinderPromptTemplates. Every variant-scoped
    // scalar finder declares both slot-bag exports; registration throws if
    // either is missing.
    sourceVariantGuidanceSlotsExport: 'RDF_SOURCE_VARIANT_GUIDANCE_SLOTS',
    variantDisambiguationSlotsExport: 'RDF_VARIANT_DISAMBIGUATION_SLOTS',
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
    settingsTip: 'Global settings for the Release Date Finder: per-variant discovery of first-availability dates.',
    iconName: 'calendar',
  },
  {
    // Identity
    id: 'skuFinder',
    routePrefix: 'sku-finder',
    moduleClass: 'variantFieldProducer',
    variantSource: 'colorEditionFinder',
    moduleType: 'skf',
    catalogKey: 'sku',
    moduleLabel: 'SKF',
    chipStyle: 'sf-chip-success',

    // Scalar field producer declarative config — drives registerScalarFinder.
    valueKey: 'sku',
    valueType: 'string',
    candidateSourceType: 'sku_finder',
    logPrefix: 'skf',

    // DB schema (summary table — custom columns per module)
    tableName: 'sku_finder',
    runsTableName: 'sku_finder_runs',
    summaryColumns: [
      // WHY: Per-variant selected candidates projected from JSON for fast UI GET.
      // Each entry: { variant_id, variant_key, variant_label, value, confidence, sources, ran_at, run_number }
      { name: 'candidates', type: 'TEXT', default: "'[]'" },
      { name: 'candidate_count', type: 'INTEGER', default: '0' },
      { name: 'cooldown_until', type: 'TEXT', default: "''" },
    ],
    summaryIndexes: [
      { name: 'idx_skf_cooldown', columns: ['cooldown_until'] },
    ],

    // Fields this finder populates (publisher-owned — SKF submits candidates via submitCandidate)
    fieldKeys: ['sku'],

    // Field Studio gate: sku must be enabled in eg_toggles
    requiredFields: ['sku'],

    // LLM phase (reference to llmPhaseDefs entry)
    phase: 'skuFinder',

    // JSON store config
    filePrefix: 'sku',

    // Reseed
    reseedKey: 'sku',
    rebuildFnKey: 'rebuildSkuFinderFromJson',

    // Settings scope: 'global'. SKU mirrors RDF — same knobs, same flatten.
    settingsScope: 'global',

    // Settings schema. Mirrors RDF settings surface one-for-one.
    settingsSchema: [
      { key: 'discoveryPromptTemplate', type: 'string', default: '', allowEmpty: true, hidden: true },
      { key: 'perVariantAttemptBudget', type: 'int', default: 3, min: 1, max: 5,
        uiLabel: 'Per-Variant Attempt Budget', uiGroup: 'Discovery',
        uiTip: 'Max LLM calls per variant on the first Loop. 1 = single shot. Higher values retry until either (a) the publisher gate publishes the candidate, or (b) the LLM returns a definitive "unknown" with a reason. Only applies to "Loop" / "Loop All"; plain "Run" is always single-shot.' },
      { key: 'reRunBudget', type: 'int', default: 1, min: 0, max: 5,
        uiLabel: 'Re-run Budget', uiGroup: 'Discovery',
        uiTip: 'Extra LLM calls per variant when you click Loop again on an already-resolved variant. 0 = skip resolved variants entirely (no LLM call). 1+ = allow N more attempts to refine the MPN with new evidence. "Already-resolved" means the publisher has accepted a sku for that variant. Ignored on the first Loop.' },

      // Universal discovery history (shared with CEF/PIF/RDF). Scope: per variant.
      { key: 'urlHistoryEnabled', type: 'bool', default: false,
        uiLabel: 'URL history', uiGroup: 'Discovery History',
        uiTip: 'When on, prior run URLs are injected into the prompt so the LLM can avoid re-crawling them. Variant-scoped for SKF. Off by default.' },
      { key: 'queryHistoryEnabled', type: 'bool', default: false,
        uiLabel: 'Query history', uiGroup: 'Discovery History',
        uiTip: 'When on, prior run search queries are injected into the prompt. Off by default — queries rot faster than URLs.' },
    ],

    // LLM phase schema (codegen: phaseSchemaRegistry.generated.js)
    promptBuilderExport: 'buildSkuFinderPrompt',
    responseSchemaExport: 'skuFinderResponseSchema',
    // WHY: see releaseDateFinder for the defaultTemplateExport contract.
    defaultTemplateExport: 'SKF_DEFAULT_TEMPLATE',
    sourceVariantGuidanceSlotsExport: 'SKU_SOURCE_VARIANT_GUIDANCE_SLOTS',
    variantDisambiguationSlotsExport: 'SKU_VARIANT_DISAMBIGUATION_SLOTS',
    getResponseSchemaExport: 'skuFinderGetResponseSchema',

    // Generic scalar finder panel display config.
    panelTitle: 'SKU Finder',
    panelTip: 'Discovers per-variant manufacturer part numbers (MPNs) via web search. Candidates flow through the publisher gate with evidence validation.',
    valueLabelPlural: 'SKUs',

    // Data-change events: suffix → extra domains beyond routePrefix.
    dataChangeEvents: {
      'run': ['review', 'product', 'publisher'],
      'run-deleted': ['review', 'product', 'publisher'],
      'deleted': ['review', 'product', 'publisher'],
      'loop': ['review', 'product', 'publisher'],
    },

    // Module Settings (codegen: moduleSettingsSections.generated.ts)
    settingsLabel: 'SKU Finder',
    settingsSubtitle: 'SKF module settings',
    settingsTip: 'Global settings for the SKU Finder: per-variant discovery of manufacturer part numbers (MPNs).',
    iconName: 'hash',
  },
  {
    // Identity
    id: 'keyFinder',
    routePrefix: 'key-finder',
    moduleClass: 'productFieldProducer',
    // No variantSource — keyFinder runs once per product across many fields.
    moduleType: 'kf',
    moduleLabel: 'KF',
    chipStyle: 'sf-chip-accent',

    // Candidate source metadata. valueKey is dynamic (set per candidate at runtime).
    candidateSourceType: 'key_finder',
    logPrefix: 'kf',

    // DB schema (summary is minimal — runs table carries the per-key detail)
    tableName: 'key_finder',
    runsTableName: 'key_finder_runs',
    summaryColumns: [
      { name: 'last_run_id', type: 'INTEGER', default: '0' },
      { name: 'cooldown_until', type: 'TEXT', default: "''" },
    ],
    summaryIndexes: [
      { name: 'idx_key_cooldown', columns: ['cooldown_until'] },
    ],

    // Fields this finder populates — DYNAMIC per category (resolved from compiled
    // field_rules at runtime). Empty at registration time; Phase 3 orchestrator
    // discovers the active keys per category.
    fieldKeys: [],

    // LLM phase (reference to llmPhaseDefs entry)
    phase: 'keyFinder',

    // JSON store config
    filePrefix: 'key_finder',

    // Reseed
    reseedKey: 'key_finder',
    rebuildFnKey: 'rebuildKeyFinderFromJson',

    // Settings scope: 'global'. keyFinder budget scoring + bundling + history
    // are product-scoped knobs; no evidence of category-specific divergence.
    settingsScope: 'global',

    // Settings schema — budget scoring + bundling + discovery history.
    settingsSchema: [
      // Prompt template — hidden; edited in LLM Config Key Finder tab
      { key: 'discoveryPromptTemplate', type: 'string', default: '', allowEmpty: true, hidden: true },

      // Budget scoring formula (axis sum + variant scaling, clamped by floor)
      { key: 'budgetRequiredPoints', type: 'intMap',
        keys: ['mandatory', 'non_mandatory'],
        keyLabels: { mandatory: 'Mandatory', non_mandatory: 'Non-mandatory' },
        default: { mandatory: 2, non_mandatory: 1 },
        min: 0, max: 20,
        uiLabel: 'Required level points', uiGroup: 'Budget Scoring',
        uiTip: 'Points contributed by each required-level tier when computing a key\u2019s attempt budget.' },
      { key: 'budgetAvailabilityPoints', type: 'intMap',
        keys: ['always', 'sometimes', 'rare'],
        keyLabels: { always: 'Always', sometimes: 'Sometimes', rare: 'Rare' },
        default: { always: 1, sometimes: 2, rare: 3 },
        min: 0, max: 20,
        uiLabel: 'Availability points', uiGroup: 'Budget Scoring',
        uiTip: 'Points contributed by how often sources carry this field (rarer fields earn more retries).' },
      { key: 'budgetDifficultyPoints', type: 'intMap',
        keys: ['easy', 'medium', 'hard', 'very_hard'],
        keyLabels: { easy: 'Easy', medium: 'Medium', hard: 'Hard', very_hard: 'Very hard' },
        default: { easy: 1, medium: 2, hard: 3, very_hard: 4 },
        min: 0, max: 20,
        uiLabel: 'Difficulty points', uiGroup: 'Budget Scoring',
        uiTip: 'Points contributed by extraction difficulty (harder reasoning earns more attempts).' },
      { key: 'budgetVariantPointsPerExtra', type: 'float', default: 0.25, min: 0, max: 10,
        uiLabel: 'Family points per extra', uiGroup: 'Budget Scoring',
        uiTip: 'Points added to the per-key attempt budget for each product-family member beyond the first. Product family is brand + base_model; CEF color/edition variants do not affect this count. Raw budget accrues the fractional value; final attempts = ceil(raw).' },
      { key: 'budgetFloor', type: 'int', default: 3, min: 1, max: 20,
        uiLabel: 'Budget floor', uiGroup: 'Budget Scoring',
        uiTip: 'Minimum per-key attempts, regardless of axis sum.' },
      { key: 'reloopRunBudget', type: 'int', default: 1, min: 0, max: 10,
        uiLabel: 'Re-loop budget (on already-published key)', uiGroup: 'Budget Scoring',
        uiTip: 'When Loop is clicked on a primary that is already published, attempts is capped to this value. Passengers still pack per the bundling knobs — this is the "Run + passengers with budget 1" shortcut. Set to 0 to disable the shortcut entirely; Loop on a published key returns final_status="skipped_resolved".' },
      { key: 'budgetPreviewDisplay', type: 'string', default: '', allowEmpty: true,
        widget: 'keyFinderBudgetPreview',
        uiLabel: 'Live preview', uiGroup: 'Budget Scoring', uiRightPanel: true,
        uiTip: 'Computed attempt budgets for every difficulty × availability combination, split by required-level tier.' },

      // Bundling (Loop / Smart Loop honor these when bundlingEnabled=true).
      // Per-key Run is always solo when alwaysSoloRun=true (default) — see §6.1.
      { key: 'bundlingEnabled', type: 'bool', default: false,
        uiLabel: 'Bundling', uiGroup: 'Bundling',
        uiTip: 'Pack same-group passenger keys onto the primary call during Loop / Smart Loop. Off = single-key calls only.' },
      { key: 'alwaysSoloRun', type: 'bool', default: true,
        uiLabel: 'Always solo Run', uiGroup: 'Bundling',
        uiTip: 'When ON (default), per-key Run never packs passengers regardless of bundlingEnabled — that is the focused-key-run contract. Turn OFF to restore legacy bundled-Run behavior. Loop-mode ignores this knob and always packs when bundlingEnabled=true.' },
      { key: 'groupBundlingOnly', type: 'bool', default: true,
        uiLabel: 'Group bundling only', uiGroup: 'Bundling',
        uiTip: 'When ON, passengers must share the primary\u2019s group. When OFF, bundling may reach across groups.' },
      { key: 'bundlingPassengerCost', type: 'intMap',
        keys: ['easy', 'medium', 'hard', 'very_hard'],
        keyLabels: { easy: 'Easy', medium: 'Medium', hard: 'Hard', very_hard: 'Very hard' },
        default: { easy: 1, medium: 2, hard: 4, very_hard: 8 },
        min: 0, max: 64,
        uiLabel: 'Passenger cost', uiGroup: 'Bundling',
        uiTip: 'Base point cost to carry a passenger of each difficulty before family-size surcharge.' },
      { key: 'bundlingPassengerVariantCostPerExtra', type: 'float', default: 0.25, min: 0, max: 10,
        uiLabel: 'Passenger family cost per extra', uiGroup: 'Bundling',
        uiTip: 'Additional passenger-cost points added for each product-family member beyond the first. Product family is brand + base_model; CEF color/edition variants do not affect this count. Example: easy base cost 1 plus 0.25 means family size 2 costs 1.25, size 3 costs 1.5, size 4 costs 1.75.' },
      { key: 'bundlingPoolPerPrimary', type: 'intMap',
        keys: ['easy', 'medium', 'hard', 'very_hard'],
        keyLabels: { easy: 'Easy primary', medium: 'Medium primary', hard: 'Hard primary', very_hard: 'Very hard primary' },
        default: { easy: 6, medium: 4, hard: 2, very_hard: 1 },
        min: 0, max: 32,
        uiLabel: 'Primary pool', uiGroup: 'Bundling',
        uiTip: 'Passenger-point budget each primary can carry. Higher = more passengers allowed; 0 = solo only.' },
      { key: 'passengerDifficultyPolicy', type: 'enum', default: 'less_or_equal',
        allowed: ['less_or_equal', 'same_only', 'any_but_very_hard', 'any_but_hard_very_hard'],
        optionLabels: {
          less_or_equal: 'Same or easier than primary',
          same_only: 'Same difficulty as primary',
          any_but_very_hard: 'Any except very hard',
          any_but_hard_very_hard: 'Any except hard and very hard',
        },
        uiLabel: 'Passenger difficulty', uiGroup: 'Bundling',
        uiTip: 'Which passenger difficulties are eligible to ride along with the primary key.' },
      { key: 'passengerExcludeAtConfidence', type: 'int', default: 95, min: 0, max: 100,
        uiLabel: 'Exclude passengers at confidence ≥', uiGroup: 'Bundling',
        uiTip: '"Good enough" exclusion. When > 0 AND Min evidence > 0, peers whose top candidate confidence is at or above this threshold AND meets the evidence minimum are dropped from the passenger pool. Below either threshold, peers keep retrying. 0 = disabled (only published peers are dropped).' },
      { key: 'passengerExcludeMinEvidence', type: 'int', default: 3, min: 0, max: 50,
        uiLabel: 'Exclude passengers min evidence', uiGroup: 'Bundling',
        uiTip: 'Companion to "Exclude passengers at confidence ≥". Evidence count (substantive, excluding identity_only refs) that a peer\u2019s top candidate must reach alongside the confidence threshold to be excluded. Both knobs must be > 0 for the exclusion rule to engage.' },
      { key: 'bundlingSortAxisOrder', type: 'string', default: 'difficulty,required_level,availability',
        widget: 'bundlingSortAxisOrder',
        uiLabel: 'Bulk and bundling sort order', uiGroup: 'Bundling',
        uiTip: 'Drag to reorder how passenger keys are packed and how Run Group, Run All Groups, Loop Group, and Loop All Groups dispatch keys. Each axis sorts ascending within itself (difficulty: easy < medium < hard < very_hard; required_level: mandatory < non_mandatory; availability: always < sometimes < rare). The first row is most significant. Default: difficulty first ("easy wins first"), required_level as tiebreaker, availability last. currentRides + field_key remain deterministic tiebreakers for passenger packing.' },
      { key: 'bundlingOverlapCapEasy', type: 'int', default: 2, min: 0, max: 32,
        uiLabel: 'Overlap cap — easy', uiGroup: 'Bundling',
        uiTip: 'Max concurrent passenger rides for easy peers before the packer skips them. Prevents wasting budget by sending the same easy key out as passenger on many simultaneous calls. 0 = never pack this tier as passenger.' },
      { key: 'bundlingOverlapCapMedium', type: 'int', default: 4, min: 0, max: 32,
        uiLabel: 'Overlap cap — medium', uiGroup: 'Bundling',
        uiTip: 'Max concurrent passenger rides for medium peers.' },
      { key: 'bundlingOverlapCapHard', type: 'int', default: 6, min: 0, max: 32,
        uiLabel: 'Overlap cap — hard', uiGroup: 'Bundling',
        uiTip: 'Max concurrent passenger rides for hard peers.' },
      { key: 'bundlingOverlapCapVeryHard', type: 'int', default: 0, min: 0, max: 32,
        uiLabel: 'Overlap cap — very hard', uiGroup: 'Bundling',
        uiTip: 'Max concurrent rides for very_hard peers. 0 = uncapped (distinct from easy/medium/hard where 0 means never pack). Very_hard peers are expensive; re-harvesting is always net-positive.' },

      // Context Injection — each knob independently toggles a distinct prompt slot
      { key: 'componentInjectionEnabled', type: 'bool', default: true,
        uiLabel: 'Component values', uiGroup: 'Context Injection',
        uiTip: 'Inject a per-key relation pointer ("this key belongs to the sensor component" / "this key IS the sensor component identity") for the primary + each passenger. The resolved component inventory itself is always on \u2014 this only toggles the per-key pointer.' },
      { key: 'knownFieldsInjectionEnabled', type: 'bool', default: true,
        uiLabel: 'Known fields', uiGroup: 'Context Injection',
        uiTip: 'Inject already-published non-component field values on this product as a shared context block.' },
      { key: 'searchHintsInjectionEnabled', type: 'bool', default: true,
        uiLabel: 'Search hints', uiGroup: 'Context Injection',
        uiTip: 'Inject domain_hints + query_terms for the PRIMARY key only (passengers inherit the primary session).' },

      // Discovery history — per-key scope, primary only (passengers inherit the primary's search session)
      { key: 'urlHistoryEnabled', type: 'bool', default: true,
        uiLabel: 'URL history', uiGroup: 'Discovery History (primary key only)',
        uiTip: 'Inject prior-run URLs for the PRIMARY key so the LLM avoids re-crawling them. Per-key scope for keyFinder (different from RDF/SKU variant scope). Passengers inherit the primary\u2019s search session and do not get their own URL history dumps.' },
      { key: 'queryHistoryEnabled', type: 'bool', default: true,
        uiLabel: 'Query history', uiGroup: 'Discovery History (primary key only)',
        uiTip: 'Inject prior-run search queries for the PRIMARY key. Passengers inherit the primary\u2019s search session.' },
    ],

    // LLM phase schema (codegen: phaseSchemaRegistry.generated.js)
    promptBuilderExport: 'buildKeyFinderPrompt',
    responseSchemaExport: 'keyFinderResponseSchema',
    // WHY: Registers in FINDER_SCALAR_DEFAULT_TEMPLATES so the prompt template is
    // editable in LLM Config via the generic scalar-finder overlay.
    defaultTemplateExport: 'KEY_FINDER_DEFAULT_TEMPLATE',

    // Panel display strings (Indexing Lab)
    panelTitle: 'Key Finder',
    panelTip: 'Universal per-key extractor. Tier model routing + budget scoring + opt-in bundling driven by compiled field rules.',
    valueLabelPlural: 'Keys',

    dataChangeEvents: {
      'run': ['review', 'product', 'publisher'],
      'loop': ['review', 'product', 'publisher'],
      'run-deleted': ['review', 'product', 'publisher'],
      'field-deleted': ['review', 'product', 'publisher'],
      'deleted': ['review', 'product', 'publisher'],
    },

    // Module Settings (codegen: moduleSettingsSections.generated.ts)
    settingsLabel: 'Key Finder',
    settingsSubtitle: 'KF module settings',
    settingsTip: 'Global budget scoring, bundling, and discovery-history toggles for the universal Key Finder.',
    iconName: 'key',
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
 * - Backend: eventRegistry.js (spread into EVENT_REGISTRY)
 * - Frontend: invalidationResolver.js (re-exported from EVENT_REGISTRY)
 */
const STANDARD_FINDER_DATA_CHANGE_EVENTS = Object.freeze({
  'discovery-history-scrubbed': [],
});

export const FINDER_DATA_CHANGE_EVENTS = Object.freeze(
  Object.fromEntries(
    FINDER_MODULES.flatMap((mod) => {
      const events = { ...STANDARD_FINDER_DATA_CHANGE_EVENTS, ...(mod.dataChangeEvents || {}) };
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
