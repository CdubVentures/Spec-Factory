// WHY: Pure source-strategy document helpers. SQL is the runtime source when a
// SpecDb is available; sources.json remains the rebuild mirror/fallback.

import fs from 'node:fs/promises';
import path from 'node:path';

// WHY: O(1) — DISCOVERY_DEFAULTS and SOURCE_ENTRY_MUTABLE_KEYS now derived
// from the canonical Zod schema via sourceEntryContract.
export {
  DISCOVERY_DEFAULTS,
  sourceEntryMutableKeys,
} from '../pipeline/shared/contracts/sourceEntryContract.js';
import { DISCOVERY_DEFAULTS, sourceEntryMutableKeys } from '../pipeline/shared/contracts/sourceEntryContract.js';
import { normalizeHost } from '../pipeline/shared/hostParser.js';

// WHY: Frozen Set for backward compat — existing callers expect a Set, not a function.
export const SOURCE_ENTRY_MUTABLE_KEYS = Object.freeze(sourceEntryMutableKeys());

// WHY: Derived from Zod schema — O(1), auto-includes new object-typed fields.
// Parse a populated entry to discover which fields resolve to plain objects.
import { sourceEntrySchema } from '../pipeline/shared/sourceRegistry.js';

const _probeParsed = sourceEntrySchema.parse({
  host: '_probe', tier: 'tier2_lab',
  crawl_config: {}, discovery: {}, field_coverage: {}, health: {},
});
const OBJECT_TYPED_KEYS = new Set(
  Object.keys(_probeParsed).filter(key => {
    const val = _probeParsed[key];
    return val !== null && typeof val === 'object' && !Array.isArray(val);
  })
);

/**
 * Validate a source entry patch against the whitelist.
 * Returns { accepted, rejected } where rejected maps key → reason string.
 *
 * @param {object|null|undefined} patch
 * @returns {{ accepted: Record<string, unknown>, rejected: Record<string, string> }}
 */
export function validateSourceEntryPatch(patch) {
  const accepted = {};
  const rejected = {};
  if (!patch || typeof patch !== 'object') return { accepted, rejected };
  for (const [key, value] of Object.entries(patch)) {
    if (!SOURCE_ENTRY_MUTABLE_KEYS.has(key)) {
      rejected[key] = 'unknown_key';
      continue;
    }
    if (OBJECT_TYPED_KEYS.has(key) && value !== undefined) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        rejected[key] = 'invalid_type_expected_object';
        continue;
      }
    }
    accepted[key] = value;
  }
  return { accepted, rejected };
}

// WHY: manufacturer tier removed — Brand Resolver is the sole source of manufacturer domains per product.
const TIER_TO_APPROVED_ROLE = {
  tier2_lab: 'lab',
  tier3_retailer: 'retailer',
  tier4_community: 'database',
  tier5_aggregator: 'database',
};

/**
 * Derive host from base_url or sourceId key.
 */
function hostFromEntry(sourceId, entry) {
  if (entry.base_url) {
    try {
      return normalizeHost(new URL(entry.base_url).hostname);
    } catch { /* fallback */ }
  }
  return sourceId.replace(/_/g, '.');
}

/**
 * Generate a sourceId from a hostname string.
 */
export function generateSourceId(host) {
  return String(host || '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Read sources.json for a category. Returns default structure if missing.
 */
export async function readSourcesFile(root, category) {
  const filePath = path.join(root, category, 'sources.json');
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { category, version: '1.0.0', approved: {}, denylist: [], sources: {} };
    }
    throw error;
  }
}

function hasRebuildableSourceContent(data) {
  return Object.keys(data?.sources || {}).length > 0
    || Object.keys(data?.approved || {}).length > 0
    || (Array.isArray(data?.denylist) && data.denylist.length > 0);
}

export async function readSourcesDocument({ root, category, specDb = null } = {}) {
  if (specDb?.hasSourceStrategyDocument?.(category)) {
    return specDb.getSourceStrategyDocument(category);
  }
  const data = await readSourcesFile(root, category);
  if (specDb?.replaceSourceStrategyDocument && hasRebuildableSourceContent(data)) {
    return specDb.replaceSourceStrategyDocument(data, category);
  }
  return data;
}

/**
 * Atomic write: write to .tmp then rename.
 */
export async function writeSourcesFile(root, category, data) {
  const dir = path.join(root, category);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, 'sources.json');
  const tmpPath = filePath + '.tmp';
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await fs.rename(tmpPath, filePath);
}

export async function writeSourcesDocument({ root, category, data, specDb = null } = {}) {
  if (specDb?.replaceSourceStrategyDocument) {
    specDb.replaceSourceStrategyDocument(data, category);
  }
  await writeSourcesFile(root, category, data);
  return data;
}

/**
 * Recompute `approved` from the sources object (tier-based grouping).
 */
export function deriveApprovedFromSources(sources) {
  const approved = { lab: [], database: [], retailer: [] };
  for (const [sourceId, entry] of Object.entries(sources)) {
    const role = TIER_TO_APPROVED_ROLE[entry.tier];
    if (!role || !approved[role]) continue;
    const host = hostFromEntry(sourceId, entry);
    if (host && !approved[role].includes(host)) {
      approved[role].push(host);
    }
  }
  return approved;
}

function resolveDiscovery(entry) {
  if (entry.discovery && typeof entry.discovery === 'object') {
    return { ...DISCOVERY_DEFAULTS, ...entry.discovery };
  }
  return { ...DISCOVERY_DEFAULTS };
}

/**
 * List source entries with derived host metadata, sorted by priority DESC.
 */
export function listSourceEntries(data) {
  const sources = data.sources || {};
  return Object.entries(sources)
    .map(([sourceId, entry]) => ({
      sourceId,
      host: hostFromEntry(sourceId, entry),
      ...entry,
      discovery: resolveDiscovery(entry),
    }))
    .sort((a, b) => (b.discovery.priority ?? 50) - (a.discovery.priority ?? 50));
}

/**
 * Add a source entry. Returns new data with approved recomputed.
 */
export function addSourceEntry(data, sourceId, entry) {
  if (data.sources[sourceId]) {
    throw new Error(`source "${sourceId}" already exists`);
  }
  const newSources = { ...data.sources, [sourceId]: entry };
  return {
    ...data,
    sources: newSources,
    approved: deriveApprovedFromSources(newSources),
  };
}

/**
 * Patch a source entry. Merges discovery sub-object shallowly.
 * Returns new data with approved recomputed.
 */
export function updateSourceEntry(data, sourceId, patch) {
  const existing = data.sources[sourceId];
  if (!existing) {
    throw new Error(`source "${sourceId}" not found`);
  }
  const { discovery: discoveryPatch, ...restPatch } = patch;
  const mergedDiscovery = discoveryPatch
    ? { ...resolveDiscovery(existing), ...discoveryPatch }
    : existing.discovery;

  const updated = { ...existing, ...restPatch };
  if (mergedDiscovery) updated.discovery = mergedDiscovery;

  const newSources = { ...data.sources, [sourceId]: updated };
  return {
    ...data,
    sources: newSources,
    approved: deriveApprovedFromSources(newSources),
  };
}

/**
 * Remove a source entry. Returns new data with approved recomputed.
 */
export function removeSourceEntry(data, sourceId) {
  if (!data.sources[sourceId]) {
    throw new Error(`source "${sourceId}" not found`);
  }
  const { [sourceId]: _removed, ...rest } = data.sources;
  return {
    ...data,
    sources: rest,
    approved: deriveApprovedFromSources(rest),
  };
}
