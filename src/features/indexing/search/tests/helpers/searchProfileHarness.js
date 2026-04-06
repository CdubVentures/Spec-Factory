import {
  buildDeterministicAliases,
  buildSearchProfile,
  determineQueryModes,
  buildTier1Queries,
  buildTier2Queries,
  buildTier3Queries,
} from '../../../pipeline/searchProfile/queryBuilder.js';
import { normalizeQueryRows } from '../../../pipeline/searchPlanner/queryPlanner.js';

export {
  buildDeterministicAliases,
  buildSearchProfile,
  determineQueryModes,
  buildTier1Queries,
  buildTier2Queries,
  buildTier3Queries,
  normalizeQueryRows,
};

export function makeJob(overrides = {}) {
  return {
    category: 'mouse',
    productId: 'mouse-razer-viper-v3-pro',
    identityLock: {
      brand: 'Razer',
      base_model: 'Viper V3 Pro',
      model: 'Viper V3 Pro',
      variant: '',
      ...overrides.identityLock,
    },
    ...overrides,
  };
}

export function makeCategoryConfig(overrides = {}) {
  return {
    category: 'mouse',
    fieldOrder: ['weight', 'sensor', 'dpi', 'polling_rate', 'click_latency', 'switch', 'connection', 'battery_hours', 'lift'],
    sourceHosts: [
      { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer' },
      { host: 'rtings.com', tierName: 'lab', role: 'lab' },
      { host: 'techpowerup.com', tierName: 'lab', role: 'lab' },
    ],
    searchTemplates: [],
    fieldRules: {
      fields: {
        weight: {
          required_level: 'critical',
          search_hints: {
            query_terms: ['weight grams'],
            domain_hints: ['razer.com'],
            content_types: ['spec'],
          },
          ui: { tooltip_md: 'Weight in grams without cable' },
        },
        sensor: {
          required_level: 'critical',
          search_hints: {
            query_terms: ['optical sensor model'],
            content_types: ['teardown_review', 'lab_review'],
          },
        },
        click_latency: {
          required_level: 'required',
          search_hints: {
            query_terms: ['click latency ms', 'end to end latency'],
            domain_hints: ['rtings.com'],
            content_types: ['lab_review', 'benchmark'],
          },
        },
      },
    },
    ...overrides,
  };
}

export function makeSeedStatus(overrides = {}) {
  return {
    specs_seed: { is_needed: false },
    source_seeds: {},
    ...overrides,
  };
}

export function makeFocusGroup(overrides = {}) {
  return {
    key: overrides.key || 'dimensions',
    label: overrides.label || 'Dimensions',
    group_search_worthy: overrides.group_search_worthy ?? true,
    productivity_score: overrides.productivity_score ?? 50,
    group_description_long: overrides.group_description_long || 'physical dimensions length width height',
    normalized_key_queue: overrides.normalized_key_queue || ['length', 'width', 'height'],
    unresolved_field_keys: overrides.unresolved_field_keys || overrides.normalized_key_queue || ['length', 'width', 'height'],
    field_keys: overrides.field_keys || overrides.normalized_key_queue || ['length', 'width', 'height'],
    satisfied_field_keys: overrides.satisfied_field_keys || [],
    query_terms_union: overrides.query_terms_union || [],
    domain_hints_union: overrides.domain_hints_union || [],
    content_types_union: overrides.content_types_union || [],
    domains_tried_union: overrides.domains_tried_union || [],
    aliases_union: overrides.aliases_union || [],
    total_field_count: overrides.total_field_count ?? 3,
    resolved_field_count: overrides.resolved_field_count ?? 0,
    coverage_ratio: overrides.coverage_ratio ?? 0,
  };
}
