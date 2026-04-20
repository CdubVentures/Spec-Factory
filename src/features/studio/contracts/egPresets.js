// WHY: SSOT for EG-compatible field rule presets.
// Colors and editions are always EG-formatted in every category.
// This module defines the locked field shapes and the lock/editable path lists
// that the GUI uses for read-only rendering.
//
// O(1): Adding a new EG-locked field = add one builder + register in EG_PRESET_REGISTRY.
// Everything else (locked keys, toggles, scaffolding, backfill, compile injection,
// server-side lock, frontend toggle UI) derives automatically.
//
// Builders accept an optional `ctx` object for dynamic data injection.
// Currently: ctx.colorNames (from color_registry DB table).
// Adding new dynamic data = add to ctx. No if-blocks.
// No fallback color lists — DB is always seeded at boot via seedColorRegistry().

// ── Editable paths (which dot-paths are user-editable on locked fields) ──────

export const EG_EDITABLE_PATHS = Object.freeze([
  'ui.aliases',
  'search_hints.domain_hints',
  'search_hints.content_types',
  'search_hints.query_terms',
  'ui.tooltip_md',
]);

// ── Field rule builders ──────────────────────────────────────────────────────
// WHY: ctx.colorNames comes from appDb.listColors() (DB is SSOT).
// If ctx is absent, reasoning_note uses an empty list — the DB is always
// seeded before any studio route runs, so this only affects bare unit tests.

export function buildEgColorFieldRule(ctx) {
  const colorNames = ctx?.colorNames ?? [];
  const colors = ctx?.colors ?? [];
  return {
    key: 'colors',
    // WHY: Colors is a variant-GENERATOR (CEF), not a variant-dependent attribute.
    // Each color IS a variant identity — talking about "colors of variant X" is
    // tautological. Published to product.json.fields.colors as a list, not to
    // variant_fields[vid].colors. Only variant-attribute fields (release_date,
    // discontinued, per-variant sku/price) get variant_dependent: true.
    variant_dependent: false,
    contract: {
      type: 'string',
      shape: 'list',
      list_rules: { dedupe: true, sort: 'none', item_union: 'winner_only' },
    },
    parse: {
      delimiters: [',', '/', '|', ';'],
      token_map: {
        grey: 'gray',
        // WHY: Normalize modifier-last → modifier-first (matches CSS --color-light-X / --color-dark-X)
        'gray-light': 'light-gray',
        'blue-light': 'light-blue',
        'green-light': 'light-green',
        'pink-light': 'light-pink',
        'red-light': 'light-red',
        'blue-dark': 'dark-blue',
        'green-dark': 'dark-green',
        'red-dark': 'dark-red',
        // WHY: Normalize natural language → canonical form
        'light gray': 'light-gray',
        'light grey': 'light-gray',
        'dark blue': 'dark-blue',
        'dark green': 'dark-green',
        'dark red': 'dark-red',
        'light blue': 'light-blue',
        'light green': 'light-green',
        'light pink': 'light-pink',
        'light red': 'light-red',
      },
    },
    enum_policy: 'closed',
    enum: {
      policy: 'closed',
      new_value_policy: { accept_if_evidence: true, mark_needs_curation: false },
    },
    // WHY: vocab.known_values populated from ctx.colorNames (color registry).
    // Prevents categoryCompile.js:285 from downgrading 'closed' to 'open_prefer_known'.
    vocab: {
      mode: 'closed',
      allow_new: false,
      known_values: colorNames,
    },
    priority: {
      required_level: 'expected',
      availability: 'expected',
      difficulty: 'easy',
      effort: 3,
    },
    evidence: {
      min_evidence_refs: 1,
      tier_preference: ['tier1', 'tier2', 'tier3'],
    },
    ai_assist: {
      reasoning_note: '',
    },
    ui: {
      label: 'Colors',
      group: 'general',
      tooltip_md: 'EG-compatible colorway tokens. Lowercase + hyphens only. Multi-color variants use "+" (e.g. black+red). Must match canonical EG palette. Normalize grey→gray.',
    },
    search_hints: {
      domain_hints: ['eloshapes.com', 'bestbuy.com', 'amazon.com', 'mousespecs.org'],
      content_types: ['product_page', 'spec_sheet'],
      query_terms: ['colors', 'color options', 'available colors', 'colorways'],
    },
  };
}

export function buildEgEditionFieldRule(ctx) {
  return {
    key: 'editions',
    // WHY: Editions is a variant-GENERATOR (CEF) — same reasoning as colors.
    // An edition IS a variant identity, not an attribute attached to variants.
    variant_dependent: false,
    contract: {
      type: 'string',
      shape: 'list',
      list_rules: { dedupe: true, sort: 'none', item_union: 'winner_only' },
    },
    parse: {
      delimiters: [','],
      token_map: {},
    },
    enum_policy: 'open',
    enum: {
      policy: 'open',
      new_value_policy: { accept_if_evidence: true, mark_needs_curation: true },
    },
    consumers: {
      'enum.match.format_hint': { review: false },
    },
    priority: {
      required_level: 'optional',
      availability: 'sometimes',
      difficulty: 'easy',
      effort: 3,
    },
    evidence: {
      min_evidence_refs: 1,
      tier_preference: ['tier1', 'tier2', 'tier3'],
    },
    ai_assist: {
      reasoning_note: '',
    },
    ui: {
      label: 'Editions',
      group: 'general',
      tooltip_md: 'EG-compatible edition slugs. Kebab-case only (lowercase, hyphens, no spaces). Examples: cyberpunk-2077-edition, sf6-chun-li, wilderness.',
    },
    search_hints: {
      domain_hints: [],
      content_types: ['product_page'],
      query_terms: ['special edition', 'limited edition', 'editions', 'collaboration', 'limited colorway'],
    },
  };
}

// WHY: Scalar date field. Accepted formats mirror canonical release_date def
// in category_authority field_studio_maps. No token_map or vocab — dates
// validate by format, not by closed vocabulary.
export function buildEgReleaseDateFieldRule(ctx) {
  return {
    key: 'release_date',
    variant_dependent: true,
    contract: {
      type: 'date',
      shape: 'scalar',
      list_rules: {},
    },
    parse: {
      delimiters: [],
      accepted_formats: ['YYYY-MM-DD', 'YYYY-MM', 'YYYY', 'MMM YYYY', 'Month YYYY'],
      range_separators: [],
      unit: null,
    },
    enum_policy: 'open',
    enum: {
      policy: 'open',
      new_value_policy: { accept_if_evidence: true, mark_needs_curation: false },
    },
    priority: {
      required_level: 'expected',
      availability: 'sometimes',
      difficulty: 'medium',
      effort: 4,
    },
    evidence: {
      min_evidence_refs: 1,
      tier_preference: ['tier1', 'tier2', 'tier3'],
    },
    ai_assist: {
      reasoning_note: '',
    },
    ui: {
      label: 'Release Date',
      group: 'general',
      tooltip_md: 'First date the product was available for purchase. Accept YYYY-MM-DD, YYYY-MM, YYYY, MMM YYYY, or Month YYYY. If not provable with evidence, output unk with unknown_reason.',
    },
    search_hints: {
      domain_hints: ['mousespecs.org', 'eloshapes.com', 'pcpartpicker.com', 'techpowerup.com'],
      content_types: ['product_page', 'review'],
      query_terms: ['release date', 'launch date', 'available since', 'announced'],
      query_templates: [
        '{brand} {model} release date',
        '{brand} {model} launch date',
        '{brand} {model} available since',
        '"{model}" release date',
      ],
    },
  };
}

// WHY: Scalar string field — per-variant manufacturer part number (MPN).
// No accepted_formats: MPN formats vary wildly per manufacturer (alphanumeric,
// hyphens, slashes). Evidence-gated open enum. The LLM prompt (Stage 2 SKF
// adapter) targets MPN semantically; retailer SKUs (Amazon ASIN, Best Buy SKU)
// are explicitly out of scope.
export function buildEgSkuFieldRule(ctx) {
  return {
    key: 'sku',
    variant_dependent: true,
    contract: {
      type: 'string',
      shape: 'scalar',
      list_rules: {},
    },
    parse: {
      delimiters: [],
      accepted_formats: [],
      range_separators: [],
      unit: null,
    },
    enum_policy: 'open',
    enum: {
      policy: 'open',
      new_value_policy: { accept_if_evidence: true, mark_needs_curation: false },
    },
    priority: {
      required_level: 'required',
      availability: 'sometimes',
      difficulty: 'hard',
      effort: 5,
    },
    evidence: {
      min_evidence_refs: 1,
      tier_preference: ['tier1', 'tier2', 'tier3'],
    },
    ai_assist: {
      reasoning_note: '',
    },
    ui: {
      label: 'SKU',
      group: 'general',
      tooltip_md: 'Manufacturer Part Number (MPN) for this specific variant. Prefer the code the manufacturer assigns on their product page. Retailer SKUs (Amazon ASIN, Best Buy SKU) are NOT the MPN. If no MPN is provable, emit unk with unknown_reason.',
    },
    search_hints: {
      domain_hints: [],
      content_types: ['product_page', 'spec_sheet'],
      query_terms: ['part number', 'mpn', 'model number', 'product code'],
      query_templates: [
        '{brand} {model} part number',
        '{brand} {model} MPN',
        '"{model}" part number',
      ],
    },
  };
}

// ── Registry (SSOT — add new EG-locked fields here) ─────────────────────────
// O(1): one entry here = auto-locked, auto-seeded, auto-backfilled, auto-compiled.

export const EG_PRESET_REGISTRY = Object.freeze({
  colors: buildEgColorFieldRule,
  editions: buildEgEditionFieldRule,
  release_date: buildEgReleaseDateFieldRule,
  sku: buildEgSkuFieldRule,
});

// ── Derived constants (never maintain manually — derived from registry) ──────

export const EG_LOCKED_KEYS = Object.freeze(Object.keys(EG_PRESET_REGISTRY));

export const EG_DEFAULT_TOGGLES = Object.freeze(
  Object.fromEntries(EG_LOCKED_KEYS.map((k) => [k, true]))
);

// ── Registry helpers ─────────────────────────────────────────────────────────

export function buildAllEgDefaults(ctx) {
  return Object.fromEntries(
    Object.entries(EG_PRESET_REGISTRY).map(([k, builder]) => [k, builder(ctx)])
  );
}

export function getEgPresetForKey(key, ctx) {
  const builder = EG_PRESET_REGISTRY[key];
  return builder ? builder(ctx) : null;
}

// WHY: Generic editable-path preserver. When replacing a locked field with its
// preset (toggle ON, sanitize on save), user-editable paths must carry over.
// Uses EG_EDITABLE_PATHS so adding a new editable path is O(1).
export function preserveEgEditablePaths(current, preset) {
  const merged = JSON.parse(JSON.stringify(preset));
  for (const dotPath of EG_EDITABLE_PATHS) {
    const [section, property] = dotPath.split('.');
    const val = current?.[section]?.[property];
    if (val !== undefined) {
      if (!merged[section]) merged[section] = {};
      merged[section][property] = val;
    }
  }
  return merged;
}

// ── Toggle / lock helpers ────────────────────────────────────────────────────

export function resolveEgLockedKeys(egToggles) {
  if (!egToggles || typeof egToggles !== 'object') return [];
  return EG_LOCKED_KEYS.filter((k) => egToggles[k] === true);
}

// ── Query helpers ────────────────────────────────────────────────────────────

export function isEgLockedField(fieldKey) {
  return EG_LOCKED_KEYS.includes(fieldKey);
}

export function isEgEditablePath(path) {
  return EG_EDITABLE_PATHS.includes(path);
}

// ── Server-side lock enforcement ─────────────────────────────────────────────
// WHY: The save API must enforce locked field integrity. For any locked key,
// non-editable paths are reset to the preset; editable paths are preserved.

export function sanitizeEgLockedOverrides(fieldOverrides, egToggles, ctx) {
  if (!fieldOverrides || typeof fieldOverrides !== 'object') return fieldOverrides;
  const sanitized = { ...fieldOverrides };
  const activeKeys = resolveEgLockedKeys(egToggles || EG_DEFAULT_TOGGLES);
  for (const k of activeKeys) {
    if (!sanitized[k]) continue;
    sanitized[k] = preserveEgEditablePaths(sanitized[k], EG_PRESET_REGISTRY[k](ctx));
  }
  return sanitized;
}
