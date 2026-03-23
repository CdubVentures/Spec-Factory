// WHY: O(1) Feature Scaling — source strategy types and enum options derived
// from the backend contract SSOT. Adding a new tier/authority/discovery method
// = 1 change to sourceRegistry.js. Zero manual updates here.

import {
  TIER_VALUES,
  AUTHORITY_VALUES,
  DISCOVERY_METHOD_VALUES,
  FIELD_COVERAGE_KEYS,
  CRAWL_CONFIG_FIELD_KEYS,
  DISCOVERY_FIELD_KEYS,
  CRAWL_CONFIG_DEFAULTS,
  DISCOVERY_DEFAULTS,
} from '../../../../../../src/features/indexing/discovery/contracts/sourceEntryContract.js';

// WHY: SourceStrategyDraftField lives here (with the draft shape) so that
// updateDraftByPath() can reference it without circular imports.
export type SourceStrategyDraftField =
  | 'host'
  | 'display_name'
  | 'tier'
  | 'authority'
  | 'base_url'
  | 'content_types'
  | 'doc_kinds'
  | 'crawl_config.method'
  | 'crawl_config.rate_limit_ms'
  | 'crawl_config.timeout_ms'
  | 'crawl_config.max_concurrent'
  | 'crawl_config.robots_txt_compliant'
  | 'field_coverage.high'
  | 'field_coverage.medium'
  | 'field_coverage.low'
  | 'discovery.method'
  | 'discovery.source_type'
  | 'discovery.search_pattern'
  | 'discovery.priority'
  | 'discovery.enabled'
  | 'discovery.notes';

// --- Enum option arrays for UI dropdowns (derived from contract) ---

export const TIER_OPTIONS: readonly string[] = TIER_VALUES;
export const AUTHORITY_OPTIONS: readonly string[] = AUTHORITY_VALUES;
export const DISCOVERY_METHOD_OPTIONS: readonly string[] = DISCOVERY_METHOD_VALUES;

// --- Sub-type interfaces derived from contract keys ---

export interface DiscoveryConfig {
  method: string;
  source_type: string;
  search_pattern: string;
  priority: number;
  enabled: boolean;
  notes: string;
}

export interface FieldCoverage {
  high: string[];
  medium: string[];
  low: string[];
}

// WHY: CrawlConfig matches the canonical Zod crawlConfigSchema in sourceRegistry.js.
export interface CrawlConfig {
  method: string;
  rate_limit_ms: number;
  timeout_ms: number;
  max_concurrent?: number;
  robots_txt_compliant: boolean;
}

// WHY: SourceEntry is the API response shape, not the raw Zod schema shape.
// The API adds `sourceId` and maps `pacing` → `crawl_config`.
export interface SourceEntry {
  sourceId: string;
  display_name: string;
  tier: string;
  authority: string;
  base_url: string;
  content_types: string[];
  doc_kinds: string[];
  crawl_config: CrawlConfig;
  field_coverage: FieldCoverage;
  discovery: DiscoveryConfig;
}

export interface SourceEntryEnvelope {
  ok: boolean;
  applied: Partial<SourceEntry>;
  snapshot: SourceEntry | null;
  rejected: Record<string, string>;
}

// WHY: Safe extraction without force-cast. If snapshot exists and has sourceId,
// use it. Otherwise return a minimal valid entry from the applied fields.
export function extractSourceEntryFromEnvelope(response: SourceEntryEnvelope): SourceEntry {
  if (response.snapshot && typeof response.snapshot === 'object' && 'sourceId' in response.snapshot) {
    return response.snapshot;
  }
  // WHY: Fallback — envelope without snapshot means the mutation response
  // didn't include a full snapshot. Return the applied fields as best-effort.
  const fallback: SourceEntry = {
    sourceId: '',
    display_name: '',
    tier: 'tier2_lab',
    authority: 'unknown',
    base_url: '',
    content_types: [],
    doc_kinds: [],
    crawl_config: { method: 'http', rate_limit_ms: 2000, timeout_ms: 12000, robots_txt_compliant: true },
    field_coverage: { high: [], medium: [], low: [] },
    discovery: { ...DISCOVERY_DEFAULTS, method: 'search_first' },
    ...response.applied,
  };
  return fallback;
}

// --- Draft factory derived from contract defaults ---

export interface SourceStrategyDraft {
  host: string;
  display_name: string;
  tier: string;
  authority: string;
  base_url: string;
  content_types: string;
  doc_kinds: string;
  crawl_config: {
    method: string;
    rate_limit_ms: string;
    timeout_ms: string;
    max_concurrent: string;
    robots_txt_compliant: string;
  };
  field_coverage: {
    high: string;
    medium: string;
    low: string;
  };
  discovery: {
    method: string;
    source_type: string;
    search_pattern: string;
    priority: string;
    enabled: string;
    notes: string;
  };
}

export function makeSourceStrategyDraft(): SourceStrategyDraft {
  return {
    host: '',
    display_name: '',
    tier: 'tier2_lab',
    authority: 'unknown',
    base_url: '',
    content_types: '',
    doc_kinds: '',
    crawl_config: {
      method: String(CRAWL_CONFIG_DEFAULTS.method ?? 'http'),
      rate_limit_ms: String(CRAWL_CONFIG_DEFAULTS.rate_limit_ms ?? 2000),
      timeout_ms: String(CRAWL_CONFIG_DEFAULTS.timeout_ms ?? 12000),
      max_concurrent: String(CRAWL_CONFIG_DEFAULTS.max_concurrent ?? 5),
      robots_txt_compliant: String(CRAWL_CONFIG_DEFAULTS.robots_txt_compliant ?? true),
    },
    field_coverage: { high: '', medium: '', low: '' },
    discovery: {
      method: DISCOVERY_METHOD_OPTIONS[1] ?? 'search_first',
      source_type: String(DISCOVERY_DEFAULTS.source_type),
      search_pattern: String(DISCOVERY_DEFAULTS.search_pattern),
      priority: String(DISCOVERY_DEFAULTS.priority),
      enabled: String(DISCOVERY_DEFAULTS.enabled),
      notes: String(DISCOVERY_DEFAULTS.notes),
    },
  };
}

// --- Generic draft updater (replaces 22-case switch) ---

type NestedDraftGroup = 'crawl_config' | 'field_coverage' | 'discovery';

// WHY: All draft values are strings (HTML form inputs). The structure is always
// either top-level (`host`, `tier`) or one-level nested (`crawl_config.method`).
// This single function replaces the 22-case switch in PipelineSettingsPage.
export function updateDraftByPath(
  draft: SourceStrategyDraft,
  path: SourceStrategyDraftField,
  value: string,
): SourceStrategyDraft {
  const dotIdx = path.indexOf('.');
  if (dotIdx === -1) return { ...draft, [path]: value };
  const group = path.slice(0, dotIdx) as NestedDraftGroup;
  const field = path.slice(dotIdx + 1);
  return { ...draft, [group]: { ...draft[group], [field]: value } };
}

// --- Contract alignment ---

// WHY: Runtime array of all valid draft field paths. The alignment test verifies
// this matches the backend contract key arrays (CRAWL_CONFIG_FIELD_KEYS, etc.).
// Adding a field to the Zod schema will cause the alignment test to fail until
// the path is added here.
const TOP_LEVEL_DRAFT_FIELDS: readonly string[] = [
  'host', 'display_name', 'tier', 'authority', 'base_url', 'content_types', 'doc_kinds',
];

export const SOURCE_STRATEGY_DRAFT_FIELD_PATHS: readonly string[] = Object.freeze([
  ...TOP_LEVEL_DRAFT_FIELDS,
  ...CRAWL_CONFIG_FIELD_KEYS.map((k: string) => `crawl_config.${k}`),
  ...FIELD_COVERAGE_KEYS.map((k: string) => `field_coverage.${k}`),
  ...DISCOVERY_FIELD_KEYS.map((k: string) => `discovery.${k}`),
]);
