// WHY: SSOT for EG-compatible field rule presets.
// Colors and editions are always EG-formatted in every category.
// This module defines the locked field shapes, canonical color palette,
// and the lock/editable path lists that the GUI uses for read-only rendering.
//
// O(1): Adding a new EG-locked field = add one builder + register in EG_PRESET_REGISTRY.
// Everything else (locked keys, toggles, scaffolding, backfill, compile injection,
// server-side lock, frontend toggle UI) derives automatically.

// ── Canonical EG color palette (atomic names only, no "+" multi-colors) ──────

export const EG_CANONICAL_COLORS = Object.freeze([
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange',
  'pink', 'purple', 'gray', 'teal', 'cyan', 'indigo', 'violet',
  'magenta', 'gold', 'silver', 'lime', 'rose',
  // light variants (modifier-first: matches CSS --color-light-X)
  'light-gray', 'light-blue', 'light-green', 'light-pink', 'light-red',
  // dark variants (modifier-first: matches CSS --color-dark-X)
  'dark-blue', 'dark-green', 'dark-red',
]);

// ── Editable paths (which dot-paths are user-editable on locked fields) ──────

export const EG_EDITABLE_PATHS = Object.freeze([
  'ui.aliases',
  'search_hints.domain_hints',
  'search_hints.content_types',
  'search_hints.query_terms',
  'ui.tooltip_md',
]);

// ── Field rule builders ──────────────────────────────────────────────────────

export function buildEgColorFieldRule() {
  return {
    key: 'colors',
    contract: {
      type: 'string',
      shape: 'list',
      list_rules: { dedupe: true, sort: 'none', min_items: 0, max_items: 100, item_union: 'set_union' },
      unknown_token: 'unk',
      unknown_reason_required: true,
    },
    parse: {
      template: 'list_of_tokens_delimited',
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
    enum_policy: 'open',
    enum: {
      policy: 'open',
      match: { strategy: 'exact' },
      new_value_policy: { accept_if_evidence: true, mark_needs_curation: false },
    },
    priority: {
      required_level: 'expected',
      availability: 'expected',
      difficulty: 'easy',
      effort: 3,
      publish_gate: false,
    },
    evidence: {
      required: true,
      min_evidence_refs: 1,
      conflict_policy: 'resolve_by_tier_else_unknown',
      tier_preference: ['tier1', 'tier2', 'tier3'],
    },
    ai_assist: {
      mode: 'advisory',
      model_strategy: 'auto',
      max_calls: 1,
      max_tokens: 4096,
      reasoning_note: 'Return colors as a list of variant strings. Each variant is either a single canonical color (e.g. "black", "light-gray") or multiple canonical colors joined by "+" (e.g. "black+red", "white+orange+blue"). Each atom must be lowercase with hyphens only. Modifier-first naming: "light-blue" not "blue-light", "dark-green" not "green-dark". Valid atoms: black, white, red, blue, green, yellow, orange, pink, purple, gray, teal, cyan, gold, silver, light-gray, light-blue, dark-blue, dark-green, etc. Do not return hex codes, RGB values, uppercase, or spaces within atoms. Normalize grey to gray.',
    },
    ui: {
      label: 'Colors',
      group: 'general',
      input_control: 'token_list',
      tooltip_md: 'EG-compatible colorway tokens. Lowercase + hyphens only. Multi-color variants use "+" (e.g. black+red). Must match canonical EG palette. Normalize grey→gray.',
    },
    search_hints: {
      domain_hints: ['eloshapes.com', 'bestbuy.com', 'amazon.com', 'mousespecs.org'],
      content_types: ['product_page', 'spec_sheet'],
      query_terms: ['colors', 'color options', 'available colors', 'colorways'],
    },
  };
}

export function buildEgEditionFieldRule() {
  return {
    key: 'editions',
    contract: {
      type: 'string',
      shape: 'list',
      list_rules: { dedupe: true, sort: 'none', min_items: 0, max_items: 50, item_union: 'set_union' },
      unknown_token: 'unk',
      unknown_reason_required: true,
    },
    parse: {
      template: 'list_of_tokens_delimited',
      delimiters: [','],
      token_map: {},
    },
    enum_policy: 'open',
    enum: {
      policy: 'open',
      match: { strategy: 'exact' },
      new_value_policy: { accept_if_evidence: true, mark_needs_curation: true },
    },
    priority: {
      required_level: 'optional',
      availability: 'sometimes',
      difficulty: 'easy',
      effort: 3,
      publish_gate: false,
    },
    evidence: {
      required: true,
      min_evidence_refs: 1,
      conflict_policy: 'resolve_by_tier_else_unknown',
      tier_preference: ['tier1', 'tier2', 'tier3'],
    },
    ai_assist: {
      mode: 'advisory',
      model_strategy: 'auto',
      max_calls: 1,
      max_tokens: 4096,
      reasoning_note: 'Return editions as kebab-case slugs. Lowercase, hyphens only, no spaces. Examples: cyberpunk-2077-edition, sf6-chun-li, wilderness. Do not return display names or title case.',
    },
    ui: {
      label: 'Editions',
      group: 'general',
      input_control: 'token_list',
      tooltip_md: 'EG-compatible edition slugs. Kebab-case only (lowercase, hyphens, no spaces). Examples: cyberpunk-2077-edition, sf6-chun-li, wilderness.',
    },
    search_hints: {
      domain_hints: [],
      content_types: ['product_page'],
      query_terms: ['special edition', 'limited edition', 'editions', 'collaboration', 'limited colorway'],
    },
  };
}

// ── Registry (SSOT — add new EG-locked fields here) ─────────────────────────
// O(1): one entry here = auto-locked, auto-seeded, auto-backfilled, auto-compiled.

export const EG_PRESET_REGISTRY = Object.freeze({
  colors: buildEgColorFieldRule,
  editions: buildEgEditionFieldRule,
});

// ── Derived constants (never maintain manually — derived from registry) ──────

export const EG_LOCKED_KEYS = Object.freeze(Object.keys(EG_PRESET_REGISTRY));

export const EG_DEFAULT_TOGGLES = Object.freeze(
  Object.fromEntries(EG_LOCKED_KEYS.map((k) => [k, true]))
);

// ── Registry helpers ─────────────────────────────────────────────────────────

export function buildAllEgDefaults() {
  return Object.fromEntries(
    Object.entries(EG_PRESET_REGISTRY).map(([k, builder]) => [k, builder()])
  );
}

export function getEgPresetForKey(key) {
  const builder = EG_PRESET_REGISTRY[key];
  return builder ? builder() : null;
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

export function sanitizeEgLockedOverrides(fieldOverrides, egToggles) {
  if (!fieldOverrides || typeof fieldOverrides !== 'object') return fieldOverrides;
  const sanitized = { ...fieldOverrides };
  const activeKeys = resolveEgLockedKeys(egToggles || EG_DEFAULT_TOGGLES);
  for (const k of activeKeys) {
    if (!sanitized[k]) continue;
    sanitized[k] = preserveEgEditablePaths(sanitized[k], EG_PRESET_REGISTRY[k]());
  }
  return sanitized;
}
