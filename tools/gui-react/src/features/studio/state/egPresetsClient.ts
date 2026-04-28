// WHY: Client-side mirror of backend EG presets (src/features/studio/contracts/egPresets.js).
// Used by the EG toggle in KeyNavigatorTab to populate field values when toggling ON.
// The backend remains SSOT — these are applied optimistically, then validated on save.
//
// Builders accept optional ctx for dynamic data (colorNames from registry).
// No fallback color lists — DB is SSOT, always seeded at boot.

import type { FieldRule } from '../../../types/studio.ts';

interface EgPresetCtx {
  readonly colorNames?: readonly string[];
}

function buildColorReasoningNote(colorNames: readonly string[]): string {
  // WHY: Derive prefixes dynamically from registered names. O(1) — adding vivid-, pastel-
  // etc. auto-discovers new prefixes. No hardcoded prefix list.
  const nameSet = new Set(colorNames);
  const prefixMap = new Map<string, Set<string>>();
  const unprefixed: string[] = [];

  for (const n of colorNames) {
    const dashIdx = n.indexOf('-');
    if (dashIdx > 0) {
      const prefix = n.slice(0, dashIdx);
      const base = n.slice(dashIdx + 1);
      if (nameSet.has(base)) {
        if (!prefixMap.has(prefix)) prefixMap.set(prefix, new Set());
        prefixMap.get(prefix)!.add(base);
      }
    }
    if (!n.includes('-')) unprefixed.push(n);
  }

  const basesWithVariants: string[] = [];
  const standalone: string[] = [];
  for (const n of unprefixed) {
    let hasVariant = false;
    for (const [, bases] of prefixMap) {
      if (bases.has(n)) { hasVariant = true; break; }
    }
    if (hasVariant) basesWithVariants.push(n);
    else standalone.push(n);
  }

  const orphans: string[] = [];
  for (const n of colorNames) {
    const dashIdx = n.indexOf('-');
    if (dashIdx > 0 && !nameSet.has(n.slice(dashIdx + 1))) orphans.push(n);
  }

  const parts: string[] = [];
  const prefixes = [...prefixMap.keys()].sort();
  if (basesWithVariants.length > 0 && prefixes.length > 0) {
    const prefixList = prefixes.map((p) => `${p}-`).join(', ');
    parts.push(`Base colors (also valid with prefixes ${prefixList}): ${basesWithVariants.join(', ')}`);
  }
  if (standalone.length > 0) parts.push(`Other colors: ${standalone.join(', ')}`);
  if (orphans.length > 0) parts.push(`Additional variants: ${orphans.join(', ')}`);

  return `Return colors as a list of variant strings. Each variant is either a single canonical color (e.g. "black", "light-gray") or multiple canonical colors joined by "+" (e.g. "black+red", "white+orange+blue"). Each atom must be lowercase with hyphens only. Modifier-first naming: "light-blue" not "blue-light", "dark-green" not "green-dark". ${parts.join('. ')}. Do not return hex codes, RGB values, uppercase, or spaces within atoms. Normalize grey to gray.`;
}

export function buildEgColorPreset(ctx?: EgPresetCtx): FieldRule {
  const colorNames = ctx?.colorNames ?? [];
  return {
    key: 'colors',
    variant_dependent: false,
    contract: {
      type: 'string',
      shape: 'list',
      list_rules: { dedupe: true, sort: 'none', item_union: 'set_union' },
    },
    parse: {

      delimiters: [',', '/', '|', ';'],
      token_map: {
        grey: 'gray',
        'gray-light': 'light-gray',
        'blue-light': 'light-blue',
        'green-light': 'light-green',
        'pink-light': 'light-pink',
        'red-light': 'light-red',
        'blue-dark': 'dark-blue',
        'green-dark': 'dark-green',
        'red-dark': 'dark-red',
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
      match: { strategy: 'exact' },
      new_value_policy: { accept_if_evidence: true, mark_needs_curation: false },
    },
    priority: {
      required_level: 'expected',
      availability: 'expected',
      difficulty: 'easy',
    },
    evidence: {
      min_evidence_refs: 1,
      tier_preference: ['tier1', 'tier2', 'tier3'],
    },
    ai_assist: {
      reasoning_note: buildColorReasoningNote(colorNames),
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

export function buildEgEditionPreset(ctx?: EgPresetCtx): FieldRule {
  return {
    key: 'editions',
    variant_dependent: false,
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
      match: { strategy: 'exact' },
      new_value_policy: { accept_if_evidence: true, mark_needs_curation: true },
    },
    priority: {
      required_level: 'optional',
      availability: 'sometimes',
      difficulty: 'easy',
    },
    evidence: {
      min_evidence_refs: 1,
      tier_preference: ['tier1', 'tier2', 'tier3'],
    },
    ai_assist: {
      reasoning_note: 'Return editions as kebab-case slugs. Lowercase, hyphens only, no spaces. Examples: cyberpunk-2077-edition, sf6-chun-li, wilderness. Do not return display names or title case.',
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

export function buildEgReleaseDatePreset(_ctx?: EgPresetCtx): FieldRule {
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
      token_map: {},
    },
    enum_policy: 'open',
    enum: {
      policy: 'open',
      match: { strategy: 'exact' },
      new_value_policy: { accept_if_evidence: true, mark_needs_curation: false },
    },
    priority: {
      required_level: 'expected',
      availability: 'sometimes',
      difficulty: 'medium',
    },
    evidence: {
      min_evidence_refs: 1,
      tier_preference: ['tier1', 'tier2', 'tier3'],
    },
    ai_assist: {
      reasoning_note: 'Return the release date in one of the accepted formats: YYYY-MM-DD (preferred), YYYY-MM (e.g. "2024-03"), YYYY, MMM YYYY (e.g. "Jan 2024"), or "Month YYYY" (e.g. "January 2024"). Do not return date ranges, relative phrases like "Q1 2024", seasons, or vague terms like "early 2024". If the exact date is not provable from evidence, emit unk with unknown_reason.',
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
    },
  };
}

export function buildEgSkuPreset(_ctx?: EgPresetCtx): FieldRule {
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
      token_map: {},
    },
    enum_policy: 'open',
    enum: {
      policy: 'open',
      match: { strategy: 'exact' },
      new_value_policy: { accept_if_evidence: true, mark_needs_curation: false },
    },
    priority: {
      required_level: 'required',
      availability: 'sometimes',
      difficulty: 'hard',
    },
    evidence: {
      min_evidence_refs: 1,
      tier_preference: ['tier1', 'tier2', 'tier3'],
    },
    ai_assist: {
      reasoning_note: 'Return the manufacturer part number (MPN) for this specific variant — the code the manufacturer uses to identify this color/edition. Do NOT return retailer SKUs (Amazon ASIN, Best Buy SKU) — those are retailer-assigned, not the MPN. Prefer manufacturer product pages as the source. If no MPN is provable from evidence, emit unk with unknown_reason.',
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
    },
  };
}

const EG_PRESET_BUILDERS: Record<string, (ctx?: EgPresetCtx) => FieldRule> = {
  colors: buildEgColorPreset,
  editions: buildEgEditionPreset,
  release_date: buildEgReleaseDatePreset,
  sku: buildEgSkuPreset,
};

export const EG_PRESET_KEYS: readonly string[] = Object.freeze(Object.keys(EG_PRESET_BUILDERS));
export const EG_TOGGLEABLE_KEY_SET: ReadonlySet<string> = new Set(EG_PRESET_KEYS);

export function getEgPresetForKey(key: string, ctx?: EgPresetCtx): FieldRule | null {
  const builder = EG_PRESET_BUILDERS[key];
  return builder ? builder(ctx) : null;
}
