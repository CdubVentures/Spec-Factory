import fs from 'node:fs';
import path from 'node:path';
import { defaultProductRoot } from '../config/runtimeArtifactRoots.js';

const SCOPE_BY_MODULE_CLASS = Object.freeze({
  variantGenerator: 'product',
  variantFieldProducer: 'variant',
  variantArtifactProducer: 'variant_mode',
  productFieldProducer: 'field_key',
});

const KIND_ALIASES = Object.freeze({
  url: 'url',
  urls: 'url',
  query: 'query',
  queries: 'query',
  all: 'all',
});

export function resolveDiscoveryHistoryScope(module) {
  return SCOPE_BY_MODULE_CLASS[module?.moduleClass] || 'product';
}

function normalizeScope(scope) {
  if (!scope) return 'product';
  if (scope === 'variant+mode') return 'variant_mode';
  return scope;
}

function normalizeKind(kind) {
  const normalized = KIND_ALIASES[String(kind || 'all').trim()];
  if (!normalized) {
    throw new Error(`discovery history scrub kind "${kind}" is not valid`);
  }
  return normalized;
}

function validScopesForModule(module) {
  const moduleScope = resolveDiscoveryHistoryScope(module);
  if (moduleScope === 'field_key') return new Set(['product', 'field_key']);
  if (moduleScope === 'variant_mode') return new Set(['product', 'variant', 'variant_mode']);
  if (moduleScope === 'variant') return new Set(['product', 'variant']);
  return new Set(['product']);
}

function assertValidRequest({ module, request }) {
  if (!module?.filePrefix) throw new Error('discovery history scrub requires module.filePrefix');
  const scope = normalizeScope(request?.scope);
  const kind = normalizeKind(request?.kind);
  const validScopes = validScopesForModule(module);
  if (!validScopes.has(scope)) {
    throw new Error(`scope "${scope}" is not valid for ${module.id || 'finder'} discovery history`);
  }
  if (scope === 'variant' && !request?.variantId && !request?.variantKey) {
    throw new Error('variant discovery history scrub requires variantId or variantKey');
  }
  if (scope === 'variant_mode') {
    if (!request?.variantId && !request?.variantKey) {
      throw new Error('variant_mode discovery history scrub requires variantId or variantKey');
    }
    if (!request?.mode) {
      throw new Error('variant_mode discovery history scrub requires mode');
    }
  }
  if (scope === 'field_key' && !request?.fieldKey) {
    throw new Error('field_key discovery history scrub requires fieldKey');
  }
  return { scope, kind };
}

function readFinderJson({ productRoot, productId, filePrefix }) {
  try {
    const filePath = path.join(productRoot, productId, `${filePrefix}.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeFinderJson({ productRoot, productId, filePrefix, data }) {
  const filePath = path.join(productRoot, productId, `${filePrefix}.json`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function canReadSqlRuns(sqlStore) {
  return typeof sqlStore?.listRuns === 'function';
}

function canUpdateSqlRunJson(sqlStore) {
  return typeof sqlStore?.updateRunJson === 'function';
}

function readSqlHistory({ sqlStore, productId }) {
  if (!canReadSqlRuns(sqlStore)) {
    return { hasSqlHistory: false, runs: [], summary: null };
  }
  const runs = sqlStore.listRuns(productId);
  const summary = typeof sqlStore?.get === 'function'
    ? sqlStore.get(productId)
    : null;
  const normalizedRuns = Array.isArray(runs) ? runs : [];
  return {
    hasSqlHistory: normalizedRuns.length > 0 || Boolean(summary),
    runs: normalizedRuns,
    summary,
  };
}

function normalizeRunForMirror(run) {
  const cloned = cloneJson(run) || {};
  delete cloned.category;
  delete cloned.product_id;
  delete cloned.selected_json;
  delete cloned.prompt_json;
  delete cloned.response_json;
  return cloned;
}

function sortRuns(runs) {
  return [...runs].sort((a, b) => (Number(a?.run_number) || 0) - (Number(b?.run_number) || 0));
}

function buildMirrorDoc({ existingDoc, productId, summary, runs }) {
  const sortedRuns = sortRuns(runs);
  const latestRun = sortedRuns[sortedRuns.length - 1] || null;
  const maxRunNumber = sortedRuns.reduce(
    (max, run) => Math.max(max, Number(run?.run_number) || 0),
    0,
  );
  const existingNextRunNumber = Number(existingDoc?.next_run_number) || 0;
  const base = existingDoc
    ? { ...existingDoc }
    : {
      product_id: summary?.product_id || productId || '',
      category: summary?.category || '',
      selected: {},
    };

  return {
    ...base,
    product_id: base.product_id || summary?.product_id || productId || '',
    category: base.category || summary?.category || '',
    last_ran_at: latestRun?.ran_at || summary?.latest_ran_at || base.last_ran_at || '',
    run_count: sortedRuns.length,
    next_run_number: Math.max(existingNextRunNumber, maxRunNumber + 1, 1),
    runs: sortedRuns,
  };
}

function scrubRuns({ runs, scope, request, kind }) {
  const affectedRunNumbers = [];
  const touchedRuns = [];
  let urlsRemoved = 0;
  let queriesRemoved = 0;

  const scrubbedRuns = runs.map((sourceRun) => {
    const run = normalizeRunForMirror(sourceRun);
    if (!runMatchesScope(run, scope, request)) return run;
    const runResult = scrubRun(run, kind);
    if (!runResult.changed) return run;
    urlsRemoved += runResult.urlsRemoved;
    queriesRemoved += runResult.queriesRemoved;
    affectedRunNumbers.push(run.run_number);
    touchedRuns.push(run);
    return run;
  });

  return {
    changed: affectedRunNumbers.length > 0,
    affectedRunNumbers,
    touchedRuns,
    scrubbedRuns,
    urlsRemoved,
    queriesRemoved,
  };
}

function writeSqlRunUpdates({ sqlStore, productId, touchedRuns }) {
  if (!canUpdateSqlRunJson(sqlStore)) return;
  for (const run of touchedRuns) {
    sqlStore.updateRunJson(productId, run.run_number, {
      selected: run.selected || {},
      response: run.response || {},
    });
  }
}

function variantMatches(response, request) {
  if (!response) return false;
  if (request.variantId && response.variant_id === request.variantId) return true;
  if (request.variantKey && response.variant_key === request.variantKey) return true;
  return false;
}

function fieldKeyMatches(response, request) {
  if (!response) return false;
  if (response.primary_field_key === request.fieldKey) return true;
  if (!request.includePassengerSessions) return false;
  const results = response.results;
  return Boolean(results && Object.prototype.hasOwnProperty.call(results, request.fieldKey));
}

function runMatchesScope(run, scope, request) {
  if (scope === 'product') return true;
  const response = run?.response || {};
  if (scope === 'variant') return variantMatches(response, request);
  if (scope === 'variant_mode') {
    // WHY: PIF now partitions discovery history by run_scope_key (pools like
    // priority-view / view:top / loop-view / loop-hero / hero), but the scrub
    // wire format keeps `request.mode` as the discriminator field. New runs
    // carry run_scope_key; legacy runs only have `response.mode` (e.g. 'view'
    // / 'hero'). Prefer the finer pool key when present.
    const bucketKey = response.run_scope_key || response.mode;
    return variantMatches(response, request) && bucketKey === request.mode;
  }
  if (scope === 'field_key') return fieldKeyMatches(response, request);
  return false;
}

function discoveryLogsForResponse(response) {
  if (!response || typeof response !== 'object') return [];
  return [
    response.discovery_log,
    response.discovery?.discovery_log,
  ].filter((log) => log && typeof log === 'object');
}

function scrubLog(log, kind) {
  let urlsRemoved = 0;
  let queriesRemoved = 0;
  let changed = false;

  if ((kind === 'url' || kind === 'all') && Array.isArray(log.urls_checked) && log.urls_checked.length > 0) {
    urlsRemoved = log.urls_checked.length;
    log.urls_checked = [];
    changed = true;
  }
  if ((kind === 'query' || kind === 'all') && Array.isArray(log.queries_run) && log.queries_run.length > 0) {
    queriesRemoved = log.queries_run.length;
    log.queries_run = [];
    changed = true;
  }

  return { changed, urlsRemoved, queriesRemoved };
}

function scrubRun(run, kind) {
  let changed = false;
  let urlsRemoved = 0;
  let queriesRemoved = 0;
  for (const log of discoveryLogsForResponse(run?.response)) {
    const result = scrubLog(log, kind);
    changed = changed || result.changed;
    urlsRemoved += result.urlsRemoved;
    queriesRemoved += result.queriesRemoved;
  }
  return { changed, urlsRemoved, queriesRemoved };
}

export function scrubFinderDiscoveryHistory({
  productId,
  productRoot,
  module,
  specDb,
  request = {},
}) {
  const { scope, kind } = assertValidRequest({ module, request });
  const root = productRoot || defaultProductRoot();
  const doc = readFinderJson({ productRoot: root, productId, filePrefix: module.filePrefix });
  const emptyResult = {
    ok: true,
    finderId: module.id || '',
    productId,
    scope,
    kind,
    runsTouched: 0,
    urlsRemoved: 0,
    queriesRemoved: 0,
    affectedRunNumbers: [],
  };

  const sqlStore = specDb?.getFinderStore?.(module.id);
  const sqlHistory = readSqlHistory({ sqlStore, productId });
  if (!doc && !sqlHistory.hasSqlHistory) return emptyResult;

  const sourceRuns = sqlHistory.hasSqlHistory
    ? sqlHistory.runs
    : (Array.isArray(doc?.runs) ? doc.runs : []);
  const scrubbed = scrubRuns({ runs: sourceRuns, scope, request, kind });

  if (scrubbed.changed && sqlHistory.hasSqlHistory && !canUpdateSqlRunJson(sqlStore)) {
    throw new Error(`discovery history scrub requires SQL updateRunJson for ${module.id || 'finder'}`);
  }

  if (scrubbed.changed) {
    writeSqlRunUpdates({ sqlStore, productId, touchedRuns: scrubbed.touchedRuns });
    const mirrorDoc = buildMirrorDoc({
      existingDoc: doc,
      productId,
      summary: sqlHistory.summary,
      runs: scrubbed.scrubbedRuns,
    });
    writeFinderJson({ productRoot: root, productId, filePrefix: module.filePrefix, data: mirrorDoc });
  }

  return {
    ...emptyResult,
    runsTouched: scrubbed.affectedRunNumbers.length,
    urlsRemoved: scrubbed.urlsRemoved,
    queriesRemoved: scrubbed.queriesRemoved,
    affectedRunNumbers: scrubbed.affectedRunNumbers,
  };
}
