// WHY: IDX runtime badge system. Derives everything from idxBadgeRegistry.js (SSOT).
// Adding a new IDX badge = one entry in idxBadgeRegistry.js. This file auto-adapts.

import { resolveConsumerGate } from '../../../field-rules/consumerGate.js';
import { IDX_BADGE_REGISTRY, IDX_FIELD_PATHS, buildExtractor } from '../../../field-rules/idxBadgeRegistry.js';
import { isObject, normalizeText } from '../../../shared/primitives.js';

// ── Derived lookup (from registry SSOT) ──────────────────────────────

const FIELD_PATH_LOOKUP = new Map(
  IDX_BADGE_REGISTRY.map((e) => [e.path, { ...e, extractor: buildExtractor(e) }])
);

// ── Surface specs (which IDX fields each pipeline surface reads) ─────

const SEARCH_RUNTIME_FIELDS = IDX_FIELD_PATHS;

const PREFETCH_SURFACE_SPECS = {
  needset: {
    label: 'NeedSet',
    fields: IDX_FIELD_PATHS,
  },
  search_profile: {
    label: 'Search Profile',
    fields: IDX_FIELD_PATHS,
  },
  brand_resolver: {
    label: 'Brand Resolver',
    fields: [],
  },
  search_planner: {
    label: 'Search Planner',
    fields: SEARCH_RUNTIME_FIELDS,
  },
  query_journey: {
    label: 'Query Journey',
    fields: SEARCH_RUNTIME_FIELDS,
  },
  search_results: {
    label: 'Search Results',
    fields: SEARCH_RUNTIME_FIELDS,
  },
  serp_selector: {
    label: 'SERP Selector',
    fields: [],
  },
  domain_classifier: {
    label: 'Domain Classifier',
    fields: [],
  },
};

// ── Core functions ───────────────────────────────────────────────────

function fieldRulesMap(fieldRulesPayload = {}) {
  if (isObject(fieldRulesPayload?.fields)) {
    return fieldRulesPayload.fields;
  }
  return isObject(fieldRulesPayload) ? fieldRulesPayload : {};
}

export function hasMeaningfulValue(rule = {}, fieldPath = '') {
  const entry = FIELD_PATH_LOOKUP.get(fieldPath);
  return entry ? entry.extractor(rule) : false;
}

function buildBadgesForFields(fieldRulesPayload = {}, fieldPaths = [], surfaceLabel = '') {
  const rules = Object.values(fieldRulesMap(fieldRulesPayload)).filter((rule) => isObject(rule));
  const badges = [];

  for (const fieldPath of fieldPaths) {
    const configuredRules = rules.filter((rule) => hasMeaningfulValue(rule, fieldPath));
    const hasActiveRule = configuredRules.length > 0
      && configuredRules.some((rule) => resolveConsumerGate(rule, fieldPath, 'indexlab').enabled);
    badges.push({
      field_path: fieldPath,
      label: `idx.${fieldPath}`,
      state: hasActiveRule ? 'active' : 'off',
      tooltip: buildRuntimeIdxTooltip({
        fieldPath,
        surfaceLabel,
        active: hasActiveRule,
      }),
    });
  }

  return badges;
}

export function buildRuntimeIdxTooltip({
  fieldPath = '',
  surfaceLabel = '',
  active = true,
} = {}) {
  const doc = FIELD_PATH_LOOKUP.get(fieldPath) || {
    section: 'Field Studio',
    key: fieldPath,
    on: 'This runtime stage uses the configured IDX rule for this field.',
    off: 'This runtime stage ignores the field-specific IDX rule for this field.',
  };
  const label = `idx.${fieldPath}`;
  const surface = normalizeText(surfaceLabel) || 'this runtime surface';

  return [
    label,
    `This feature is enabled in Key Navigation > ${doc.section} > ${doc.key}.`,
    `Surface: ${surface}`,
    '',
    `Status: ${active ? 'ON' : 'OFF'}`,
    `When ON: ${doc.on}`,
    `When OFF: ${doc.off}`,
  ].join('\n');
}

export function buildRuntimeIdxBadgesBySurface(fieldRulesPayload = {}) {
  return Object.fromEntries(
    Object.entries(PREFETCH_SURFACE_SPECS).map(([surface, spec]) => [
      surface,
      buildBadgesForFields(fieldRulesPayload, spec.fields, spec.label),
    ])
  );
}

// WHY: Derives LLM worker field paths from PREFETCH_SURFACE_SPECS (SSOT).
// Unknown tabs fall back to SEARCH_RUNTIME_FIELDS (the real pipeline fields).
function llmWorkerFieldPaths(worker = {}) {
  const prefetchTab = normalizeText(worker?.prefetch_tab);
  const spec = PREFETCH_SURFACE_SPECS[prefetchTab];
  return spec ? spec.fields : SEARCH_RUNTIME_FIELDS;
}

const WORKER_POOL_FIELD_MAP = {
  search: { fields: SEARCH_RUNTIME_FIELDS, label: 'Search Worker' },
  fetch:  { fields: SEARCH_RUNTIME_FIELDS, label: 'Fetch Worker' },
};

export function buildRuntimeIdxBadgesForWorker({ fieldRulesPayload = {}, worker = {} } = {}) {
  const pool = normalizeText(worker?.pool).toLowerCase();
  if (pool === 'llm') {
    return buildBadgesForFields(fieldRulesPayload, llmWorkerFieldPaths(worker), 'LLM');
  }
  const mapping = WORKER_POOL_FIELD_MAP[pool];
  return mapping ? buildBadgesForFields(fieldRulesPayload, mapping.fields, mapping.label) : [];
}
