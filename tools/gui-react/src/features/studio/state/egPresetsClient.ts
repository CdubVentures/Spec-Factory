// WHY: Client-side mirror of backend EG presets (src/features/studio/contracts/egPresets.js).
// Used by the EG toggle in KeyNavigatorTab to populate field values when toggling ON.
// The backend remains SSOT — these are applied optimistically, then validated on save.

import type { FieldRule } from '../../../types/studio.ts';

export function buildEgColorPreset(): FieldRule {
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

export function buildEgEditionPreset(): FieldRule {
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

const EG_PRESET_BUILDERS: Record<string, () => FieldRule> = {
  colors: buildEgColorPreset,
  editions: buildEgEditionPreset,
};

// O(1): Derived from registry — consumers import these instead of hardcoding keys.
export const EG_PRESET_KEYS: readonly string[] = Object.freeze(Object.keys(EG_PRESET_BUILDERS));
export const EG_TOGGLEABLE_KEY_SET: ReadonlySet<string> = new Set(EG_PRESET_KEYS);

export function getEgPresetForKey(key: string): FieldRule | null {
  const builder = EG_PRESET_BUILDERS[key];
  return builder ? builder() : null;
}
