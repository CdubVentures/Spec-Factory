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
} from '../../../../../../src/features/indexing/pipeline/shared/contracts/sourceEntryContract.js';

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

// --- Form entry: typed form state (no all-string draft) ---

// WHY: Form state = SourceEntry minus sourceId, plus derived `host` field.
// All values are natively typed (numbers, booleans, arrays). No stringification.
// String↔typed conversion happens at the individual input level, not form state.
export type SourceFormEntry = Omit<SourceEntry, 'sourceId'> & { host: string };

export type SourceFormEntryField =
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

type FormEntryValue = string | number | boolean | string[];
type NestedFormGroup = 'crawl_config' | 'field_coverage' | 'discovery';

export function resolveSourceHost(baseUrl: string, fallback: string): string {
  const trimmed = String(baseUrl || '').trim();
  if (!trimmed) return fallback;
  try {
    return new URL(trimmed).hostname;
  } catch {
    return fallback;
  }
}

export function defaultSourceFormEntry(): SourceFormEntry {
  return {
    host: '',
    display_name: '',
    tier: 'tier2_lab',
    authority: 'unknown',
    base_url: '',
    content_types: [],
    doc_kinds: [],
    crawl_config: {
      method: String(CRAWL_CONFIG_DEFAULTS.method ?? 'http'),
      rate_limit_ms: Number(CRAWL_CONFIG_DEFAULTS.rate_limit_ms ?? 2000),
      timeout_ms: Number(CRAWL_CONFIG_DEFAULTS.timeout_ms ?? 12000),
      max_concurrent: Number(CRAWL_CONFIG_DEFAULTS.max_concurrent ?? 5),
      robots_txt_compliant: CRAWL_CONFIG_DEFAULTS.robots_txt_compliant !== false,
    },
    field_coverage: { high: [], medium: [], low: [] },
    discovery: {
      method: DISCOVERY_METHOD_OPTIONS[1] ?? 'search_first',
      source_type: String(DISCOVERY_DEFAULTS.source_type ?? ''),
      search_pattern: String(DISCOVERY_DEFAULTS.search_pattern ?? ''),
      priority: Number(DISCOVERY_DEFAULTS.priority ?? 50),
      enabled: DISCOVERY_DEFAULTS.enabled !== false,
      notes: String(DISCOVERY_DEFAULTS.notes ?? ''),
    },
  };
}

export function entryToFormEntry(entry: SourceEntry): SourceFormEntry {
  const sourceIdFallback = String(entry.sourceId || '').replace(/_/g, '.');
  return {
    host: resolveSourceHost(entry.base_url, sourceIdFallback),
    display_name: entry.display_name || '',
    tier: entry.tier || 'tier2_lab',
    authority: entry.authority || 'unknown',
    base_url: entry.base_url || '',
    content_types: entry.content_types || [],
    doc_kinds: entry.doc_kinds || [],
    crawl_config: {
      method: entry.crawl_config?.method || 'http',
      rate_limit_ms: entry.crawl_config?.rate_limit_ms ?? 2000,
      timeout_ms: entry.crawl_config?.timeout_ms ?? 12000,
      max_concurrent: entry.crawl_config?.max_concurrent ?? 5,
      robots_txt_compliant: entry.crawl_config?.robots_txt_compliant ?? true,
    },
    field_coverage: {
      high: entry.field_coverage?.high || [],
      medium: entry.field_coverage?.medium || [],
      low: entry.field_coverage?.low || [],
    },
    discovery: {
      method: entry.discovery?.method || 'search_first',
      source_type: entry.discovery?.source_type || '',
      search_pattern: entry.discovery?.search_pattern || '',
      priority: entry.discovery?.priority ?? 50,
      enabled: entry.discovery?.enabled ?? true,
      notes: entry.discovery?.notes || '',
    },
  };
}

export function formEntryToPayload(form: SourceFormEntry): Partial<SourceEntry> & { host: string } {
  const host = String(form.host || '').trim();
  return {
    host,
    display_name: String(form.display_name || '').trim() || host,
    tier: form.tier || 'tier2_lab',
    authority: form.authority || 'unknown',
    base_url: form.base_url || `https://${host}`,
    content_types: form.content_types || [],
    doc_kinds: form.doc_kinds || [],
    crawl_config: {
      method: form.crawl_config.method || 'http',
      rate_limit_ms: form.crawl_config.rate_limit_ms,
      timeout_ms: form.crawl_config.timeout_ms,
      max_concurrent: form.crawl_config.max_concurrent,
      robots_txt_compliant: form.crawl_config.robots_txt_compliant,
    },
    field_coverage: {
      high: form.field_coverage.high || [],
      medium: form.field_coverage.medium || [],
      low: form.field_coverage.low || [],
    },
    discovery: {
      method: (form.discovery.method || 'search_first') as 'search_first' | 'manual',
      source_type: form.discovery.source_type || '',
      search_pattern: form.discovery.search_pattern || '',
      priority: form.discovery.priority,
      enabled: form.discovery.enabled,
      notes: form.discovery.notes || '',
    },
  };
}

// WHY: Immutable updater for the form entry. Handles both top-level keys
// and one-level nested paths (e.g., 'crawl_config.method').
export function updateFormEntryByPath(
  entry: SourceFormEntry,
  path: SourceFormEntryField,
  value: FormEntryValue,
): SourceFormEntry {
  const dotIdx = path.indexOf('.');
  if (dotIdx === -1) return { ...entry, [path]: value };
  const group = path.slice(0, dotIdx) as NestedFormGroup;
  const field = path.slice(dotIdx + 1);
  return { ...entry, [group]: { ...entry[group], [field]: value } };
}

// --- Contract alignment ---

const TOP_LEVEL_FORM_FIELDS: readonly string[] = [
  'host', 'display_name', 'tier', 'authority', 'base_url', 'content_types', 'doc_kinds',
];

export const SOURCE_FORM_ENTRY_FIELD_PATHS: readonly string[] = Object.freeze([
  ...TOP_LEVEL_FORM_FIELDS,
  ...CRAWL_CONFIG_FIELD_KEYS.map((k: string) => `crawl_config.${k}`),
  ...FIELD_COVERAGE_KEYS.map((k: string) => `field_coverage.${k}`),
  ...DISCOVERY_FIELD_KEYS.map((k: string) => `discovery.${k}`),
]);
