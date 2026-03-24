/**
 * Discovery Helpers
 *
 * Extracted from searchDiscovery.js (Phase 4A of structural decomposition).
 * Contains 10 helper functions: 6 pure, 4 with I/O (storage reads/writes).
 */
import { extractRootDomain } from '../../../../utils/common.js';
import { toPosixKey } from '../../../../s3/storage.js';
import { INPUT_KEY_PREFIX } from '../../../../shared/storageKeyPrefixes.js';
import { normalizeHost } from './discoveryIdentity.js';

// ---------------------------------------------------------------------------
// runWithConcurrency — generic concurrency pool
// ---------------------------------------------------------------------------

export async function runWithConcurrency(items = [], concurrency = 1, worker) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return [];
  }
  const limit = Math.max(1, Number.parseInt(String(concurrency || 1), 10) || 1);
  const output = new Array(list.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) {
        return;
      }
      output[index] = await worker(list[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, () => runWorker()));
  return output;
}

// ---------------------------------------------------------------------------
// mergeLearningStoreHintsIntoLexicon — merges learning anchors into lexicon
// ---------------------------------------------------------------------------

export function mergeLearningStoreHintsIntoLexicon(lexicon = {}, storeHints = null) {
  if (!storeHints || !storeHints.anchorsByField) return lexicon;
  const merged = { ...lexicon, fields: { ...(lexicon.fields || {}) } };
  for (const [field, anchors] of Object.entries(storeHints.anchorsByField)) {
    if (!Array.isArray(anchors) || anchors.length === 0) continue;
    const existing = merged.fields[field] || {};
    const synonyms = { ...(existing.synonyms || {}) };
    for (const anchor of anchors) {
      if (anchor.decayStatus === 'expired') continue;
      const phrase = String(anchor.phrase || '').trim().toLowerCase();
      if (!phrase || phrase.length < 3) continue;
      const weight = anchor.decayStatus === 'decayed' ? 1 : 3;
      synonyms[phrase] = { count: (synonyms[phrase]?.count || 0) + weight };
    }
    merged.fields[field] = { ...existing, synonyms };
  }
  return merged;
}

// ---------------------------------------------------------------------------
// loadLearningArtifacts — async storage reads for learning data
// ---------------------------------------------------------------------------

export async function loadLearningArtifacts({
  storage,
  category
}) {
  const base = storage.resolveOutputKey('_learning', category);
  const [lexicon, queryTemplates, fieldYield] = await Promise.all([
    storage.readJsonOrNull(`${base}/field_lexicon.json`),
    storage.readJsonOrNull(`${base}/query_templates.json`),
    storage.readJsonOrNull(`${base}/field_yield.json`)
  ]);
  return {
    lexicon: lexicon || {},
    queryTemplates: queryTemplates || {},
    fieldYield: fieldYield || {}
  };
}

// ---------------------------------------------------------------------------
// buildSearchProfileKeys — resolves storage keys for search profile artifacts
// ---------------------------------------------------------------------------

export function buildSearchProfileKeys({
  storage,
  config,
  category,
  productId,
  runId
}) {
  const inputKey = toPosixKey(
    INPUT_KEY_PREFIX,
    '_discovery',
    category,
    `${runId}.search_profile.json`
  );
  const runKey = category && productId && runId
    ? storage.resolveOutputKey(category, productId, 'runs', runId, 'analysis', 'search_profile.json')
    : null;
  const latestKey = category && productId
    ? storage.resolveOutputKey(category, productId, 'latest', 'search_profile.json')
    : null;
  return {
    inputKey,
    runKey,
    latestKey
  };
}

// ---------------------------------------------------------------------------
// writeSearchProfileArtifacts — writes search profile to storage
// ---------------------------------------------------------------------------

export async function writeSearchProfileArtifacts({
  storage,
  payload,
  keys = {}
}) {
  const body = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
  const uniqueKeys = [...new Set([keys.inputKey, keys.runKey, keys.latestKey].filter(Boolean))];
  await Promise.all(
    uniqueKeys.map((key) =>
      storage.writeObject(key, body, { contentType: 'application/json' })
    )
  );
}

// ---------------------------------------------------------------------------
// buildQueryAttemptStats — aggregates search attempt statistics
// ---------------------------------------------------------------------------

export function buildQueryAttemptStats(rows = []) {
  const byQuery = new Map();
  for (const row of rows || []) {
    const query = String(row?.query || '').trim();
    if (!query) {
      continue;
    }
    if (!byQuery.has(query)) {
      byQuery.set(query, {
        query,
        attempts: 0,
        result_count: 0,
        providers: [],
        frontier_cache: false
      });
    }
    const bucket = byQuery.get(query);
    bucket.attempts += 1;
    bucket.result_count += Math.max(0, Number.parseInt(String(row?.result_count || 0), 10) || 0);
    const provider = String(row?.provider || '').trim();
    if (provider && !bucket.providers.includes(provider)) {
      bucket.providers.push(provider);
    }
    const reasonCode = String(row?.reason_code || '').trim();
    if (reasonCode === 'frontier_query_cache') {
      bucket.frontier_cache = true;
    }
  }
  return [...byQuery.values()].sort((a, b) => b.result_count - a.result_count || a.query.localeCompare(b.query));
}

// ---------------------------------------------------------------------------
// resolveSearchProfileCaps — preserves the public cap contract for discovery
// ---------------------------------------------------------------------------

export function resolveSearchProfileCaps() {
  return {
    deterministicAliasCap: 6,
    llmAliasValidationCap: 12,
    llmFieldTargetQueriesCap: 3,
    llmDocHintQueriesCap: 3,
    dedupeQueriesCap: 24,
  };
}


// ---------------------------------------------------------------------------
// normalizeTriageScore — extracts best available score from a row
// ---------------------------------------------------------------------------

export function normalizeTriageScore(row) {
  const candidates = [
    row?.rerank_score,
    row?.score,
    row?.score_det
  ];
  for (const value of candidates) {
    const parsed = Number.parseFloat(String(value ?? ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// normalizeSourceEntryDiscovery — fills defaults for discovery metadata
// ---------------------------------------------------------------------------

export function normalizeSourceEntryDiscovery(discovery) {
  if (discovery && typeof discovery === 'object') {
    return {
      method: 'manual',
      source_type: '',
      search_pattern: '',
      priority: 50,
      enabled: true,
      notes: '',
      ...discovery,
    };
  }
  return {
    method: 'manual',
    source_type: '',
    search_pattern: '',
    priority: 50,
    enabled: true,
    notes: '',
  };
}

// ---------------------------------------------------------------------------
// resolveEnabledSourceEntries — filters and normalizes source entries
// ---------------------------------------------------------------------------

export function resolveEnabledSourceEntries({
  sourceEntries = null,
} = {}) {
  const entries = Array.isArray(sourceEntries) ? sourceEntries : [];
  return entries
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      ...entry,
      discovery: normalizeSourceEntryDiscovery(entry.discovery),
    }))
    .filter((entry) => entry.discovery.enabled !== false);
}

// ---------------------------------------------------------------------------
// ensureCategorySourceLookups — hydrates derived host lookup structures
// ---------------------------------------------------------------------------

export function ensureCategorySourceLookups(categoryConfig = {}) {
  const sourceHosts = Array.isArray(categoryConfig?.sourceHosts)
    ? [...categoryConfig.sourceHosts]
    : [];
  const sourceHostMap = categoryConfig?.sourceHostMap instanceof Map
    ? new Map(categoryConfig.sourceHostMap)
    : new Map();
  for (const row of sourceHosts) {
    const host = normalizeHost(row?.host);
    if (!host || sourceHostMap.has(host)) continue;
    sourceHostMap.set(host, { ...row, host });
  }

  const approvedRootDomains = categoryConfig?.approvedRootDomains instanceof Set
    ? new Set(categoryConfig.approvedRootDomains)
    : new Set();
  for (const row of sourceHosts) {
    const host = normalizeHost(row?.host);
    if (!host) continue;
    approvedRootDomains.add(extractRootDomain(host));
  }

  return {
    ...categoryConfig,
    sourceHosts,
    sourceHostMap,
    approvedRootDomains,
    sourceRegistry: categoryConfig?.sourceRegistry && typeof categoryConfig.sourceRegistry === 'object'
      ? categoryConfig.sourceRegistry
      : {},
  };
}
