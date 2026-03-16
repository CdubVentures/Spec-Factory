// WHY: Single source of truth for sources.json file I/O and pure-function
// mutations. Routes and orchestration helpers consume these instead of SQLite.

import fs from 'node:fs/promises';
import path from 'node:path';

export const DISCOVERY_DEFAULTS = Object.freeze({
  method: 'manual',
  source_type: '',
  search_pattern: '',
  priority: 50,
  enabled: true,
  notes: '',
});

const TIER_TO_APPROVED_ROLE = {
  tier1_manufacturer: 'manufacturer',
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
      return new URL(entry.base_url).hostname.replace(/^www\./, '');
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

/**
 * Recompute `approved` from the sources object (tier-based grouping).
 */
export function deriveApprovedFromSources(sources) {
  const approved = { manufacturer: [], lab: [], database: [], retailer: [] };
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

/**
 * Merge promoted manufacturer entries into sources data.
 * Does NOT overwrite existing entries. Recomputes approved block.
 *
 * @param {object} data - sourcesData (category sources.json shape)
 * @param {Map<string, object>} promotedMap - Map<host, promotedEntry> from promoteFromBrandResolution
 * @returns {object} new sourcesData with promoted entries injected
 */
export function mergeManufacturerPromotions(data, promotedMap) {
  if (!promotedMap || promotedMap.size === 0) {
    return data;
  }
  const newSources = { ...data.sources };
  for (const [, entry] of promotedMap) {
    const sourceId = entry._sourceId;
    if (!sourceId || newSources[sourceId]) continue;
    const { _sourceId, ...rest } = entry;
    newSources[sourceId] = rest;
  }
  return {
    ...data,
    sources: newSources,
    approved: deriveApprovedFromSources(newSources),
  };
}
