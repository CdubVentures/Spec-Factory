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

// ── Dynamic reasoning note builder ──────────────────────────────────────────

function buildColorReasoningNote(colorNames, colors) {
  // WHY: Full extraction guidance for color discovery — used by both the
  // extraction pipeline and the Color & Edition Finder. This is the SSOT
  // for how LLMs should discover, match, and format product colors.
  //
  // O(1): adding vivid-red, pastel-blue, etc. auto-discovers "vivid-", "pastel-" as prefixes.
  // No hardcoded prefix list. The registry IS the config.

  const nameSet = new Set(colorNames);
  const prefixMap = new Map(); // prefix → Set<base>
  const unprefixed = []; // names with no hyphen (potential bases)

  // Pass 1: identify all names that look like {prefix}-{base}
  for (const n of colorNames) {
    const dashIdx = n.indexOf('-');
    if (dashIdx > 0) {
      const prefix = n.slice(0, dashIdx);
      const base = n.slice(dashIdx + 1);
      if (nameSet.has(base)) {
        if (!prefixMap.has(prefix)) prefixMap.set(prefix, new Set());
        prefixMap.get(prefix).add(base);
      }
    }
    if (!n.includes('-')) {
      unprefixed.push(n);
    }
  }

  // Pass 2: bases = unprefixed names that have at least one prefixed variant
  const basesWithVariants = [];
  const standalone = [];
  for (const n of unprefixed) {
    let hasVariant = false;
    for (const [, bases] of prefixMap) {
      if (bases.has(n)) { hasVariant = true; break; }
    }
    if (hasVariant) basesWithVariants.push(n);
    else standalone.push(n);
  }

  // Pass 3: orphans = prefixed names whose base is NOT registered
  const orphans = [];
  for (const n of colorNames) {
    const dashIdx = n.indexOf('-');
    if (dashIdx > 0) {
      const base = n.slice(dashIdx + 1);
      if (!nameSet.has(base)) orphans.push(n);
    }
  }

  // Build prefix summary
  const parts = [];
  const prefixes = [...prefixMap.keys()].sort();
  if (basesWithVariants.length > 0 && prefixes.length > 0) {
    const prefixList = prefixes.map((p) => `${p}-`).join(', ');
    parts.push(`Base colors (also valid with prefixes ${prefixList}): ${basesWithVariants.join(', ')}`);
  }
  if (standalone.length > 0) {
    parts.push(`Other colors: ${standalone.join(', ')}`);
  }
  if (orphans.length > 0) {
    parts.push(`Additional variants: ${orphans.join(', ')}`);
  }

  // Build registered color list with hex values for visual matching
  const colorEntries = Array.isArray(colors) ? colors : [];
  const colorListStr = colorEntries.length > 0
    ? colorEntries.map(c => `${c.name} (${c.hex})`).join(', ')
    : colorNames.join(', ');

  return [
    'Discover every color variant this product is or has been available in.',
    'Check the manufacturer product page (color selectors, variant dropdowns, "available in" sections), major retailers (Amazon, Best Buy, Newegg), and review/spec databases. Include discontinued and regional variants.',
    '',
    'Each color is either a single atom ("black", "light-gray") or multiple atoms joined by "+" in dominant visual order.',
    'Dominant means the color with the most surface area — "black+red" means mostly black with red accents.',
    'The first color in the array is the most common / default variant (the one shown on the product\'s main marketing page).',
    '',
    'Formatting rules:',
    '- lowercase only, hyphens between words',
    '- Modifier-first: "light-blue" not "blue-light", "dark-green" not "green-dark"',
    '- Normalize "grey" to "gray"',
    '- Translate marketing names to the nearest registered color. "Midnight" → "black", "Arctic" → "white", "Thunderbolt Yellow" → "yellow". Never use marketing names as atoms.',
    '',
    parts.join('. ') + '.',
    '',
    `Registered colors with hex values: ${colorListStr}`,
    '',
    'Match product colors to registered colors by visual similarity using the hex values above. If a registered color\'s hex is close to the product\'s actual color, use the registered name.',
    'If no registered color is a reasonable visual match, use the nearest registered color by hex similarity. Do not invent new color names.',
  ].join('\n');
}

// ── Field rule builders ──────────────────────────────────────────────────────
// WHY: ctx.colorNames comes from appDb.listColors() (DB is SSOT).
// If ctx is absent, reasoning_note uses an empty list — the DB is always
// seeded before any studio route runs, so this only affects bare unit tests.

export function buildEgColorFieldRule(ctx) {
  const colorNames = ctx?.colorNames ?? [];
  const colors = ctx?.colors ?? [];
  return {
    key: 'colors',
    contract: {
      type: 'string',
      shape: 'list',
      list_rules: { dedupe: true, sort: 'none', item_union: 'set_union' },
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
      reasoning_note: buildColorReasoningNote(colorNames, colors),
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
    contract: {
      type: 'string',
      shape: 'list',
      list_rules: { dedupe: true, sort: 'none', item_union: 'set_union' },
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
      reasoning_note: [
        'Discover every special, limited, or collaboration edition of this product.',
        'Check the manufacturer product page, retailers, and community forums. Include discontinued and limited-run editions.',
        '',
        'Each edition has its own color variant(s). When you find an edition, identify the colors it comes in — those colors must appear in the colors array using the same atom rules (registered atoms, "+"-joined, dominant-first). Every edition adds at least one color entry to the product\'s color list.',
        '',
        'Formatting: return editions as kebab-case slugs. Lowercase, hyphens only, no spaces.',
        'Examples: launch-edition, cyberpunk-2077-edition, sf6-chun-li, wilderness, halo-infinite-edition.',
        'Do not return display names or title case.',
        'If an edition has a unique color not in the registered list, map it to the nearest registered color by hex similarity.',
      ].join('\n'),
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
