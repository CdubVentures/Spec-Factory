import fsSync from 'node:fs';

import {
  buildRuntimeOpsSummary,
  buildRuntimeOpsWorkers,
  buildRuntimeOpsDocuments,
  buildRuntimeOpsDocumentDetail,
  buildRuntimeOpsMetricsRail,
  buildExtractionFields,
  buildFallbackEvents,
  buildQueueState,
  buildWorkerDetail,
  buildPipelineFlow,
  buildWorkerScreenshots,
  buildPreFetchPhases,
  buildLlmCallsDashboard,
} from './builders/runtimeOpsDataBuilders.js';
import { toInt } from '../../../api/helpers/valueNormalizers.js';
import { projectFieldRulesForConsumer, resolveConsumerGate } from '../../../field-rules/consumerGate.js';
import {
  buildRuntimeIdxBadgesBySurface,
  buildRuntimeIdxBadgesForWorker,
} from '../runtime/idxRuntimeMetadata.js';

function normalizeProfileQuery(value) {
  return String(value || '').trim().toLowerCase();
}

function escapeSvgText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shouldSynthesizeRuntimeProofFrame(worker = {}) {
  const pool = String(worker?.pool || '').trim();
  const fetchMode = String(worker?.fetch_mode || '').trim();
  const state = String(worker?.state || '').trim();
  return (
    pool === 'fetch'
    && (fetchMode === 'crawlee' || fetchMode === 'playwright')
    && state !== 'running'
    && state !== 'stuck'
  );
}

function isRunStillActive(processStatus, runId = '') {
  if (typeof processStatus !== 'function') return false;
  try {
    const snapshot = processStatus();
    if (!snapshot || snapshot.running !== true) return false;
    const activeRunId = String(snapshot.run_id || snapshot.runId || '').trim();
    return Boolean(activeRunId) && activeRunId === String(runId || '').trim();
  } catch {
    return false;
  }
}

function resolveInactiveRunMeta(meta = {}, events = [], runId = '', processStatus = null) {
  const rawStatus = String(meta?.status || '').trim().toLowerCase();
  if (rawStatus !== 'running') return meta;
  if (isRunStillActive(processStatus, runId)) return meta;

  let endedAt = String(meta?.ended_at || '').trim();
  let terminalReason = '';
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const row = events[i] || {};
    const ts = String(row?.ts || '').trim();
    if (!endedAt && ts) endedAt = ts;
    if (String(row?.event || '').trim() !== 'error') continue;
    const payload = row?.payload && typeof row.payload === 'object'
      ? row.payload
      : {};
    terminalReason = String(
      payload?.event
      || payload?.reason
      || payload?.code
      || payload?.message
      || ''
    ).trim();
    if (terminalReason) break;
  }

  return {
    ...meta,
    status: terminalReason ? 'failed' : 'completed',
    ended_at: endedAt,
    ...(terminalReason ? { terminal_reason: terminalReason } : {}),
  };
}

function buildSyntheticRuntimeProofFrame({
  runId = '',
  worker = {},
  detail = {},
} = {}) {
  const width = 1280;
  const height = 720;
  const documents = Array.isArray(detail?.documents) ? detail.documents : [];
  const primaryDocument = documents[0] || {};
  const statusCode = primaryDocument?.status_code ?? null;
  const docStatus = String(primaryDocument?.status || '').trim();
  const fetchMode = String(worker?.fetch_mode || 'fetch').trim();
  const currentUrl = String(worker?.current_url || primaryDocument?.url || '').trim();
  const host = String(primaryDocument?.host || '').trim();
  const lastError = String(worker?.last_error || '').trim() || 'No browser frame was captured before this fetch ended.';
  const endedAt = String(primaryDocument?.last_event_ts || worker?.started_at || new Date().toISOString()).trim();
  const statusLabel = statusCode !== null && statusCode !== undefined
    ? `HTTP ${statusCode}`
    : (docStatus ? docStatus.toUpperCase() : 'NO_STATUS');
  const title = `Synthetic proof frame · ${fetchMode}`;
  const lines = [
    currentUrl || '(no url recorded)',
    `Status: ${statusLabel}`,
    host ? `Host: ${host}` : '',
    `Worker: ${String(worker?.worker_id || '').trim() || '(unknown worker)'}`,
    lastError,
    'Reason: browser-backed fetch ended without a retained runtime screenshot.',
  ].filter(Boolean);
  const safeTitle = escapeSvgText(title);
  const safeTimestamp = escapeSvgText(endedAt);
  const lineSvg = lines
    .slice(0, 6)
    .map((line, index) => (
      `<text x="72" y="${188 + (index * 64)}" fill="#d7e1eb" font-size="28" font-family="Consolas, 'Courier New', monospace">${escapeSvgText(line)}</text>`
    ))
    .join('');
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#09111a"/>',
    '<rect x="40" y="40" width="1200" height="640" rx="24" fill="#101a25" stroke="#2d4358" stroke-width="2"/>',
    `<text x="72" y="112" fill="#f8fafc" font-size="42" font-family="Segoe UI, Arial, sans-serif" font-weight="700">${safeTitle}</text>`,
    `<text x="72" y="148" fill="#7dd3fc" font-size="22" font-family="Segoe UI, Arial, sans-serif">Ended ${safeTimestamp}</text>`,
    lineSvg,
    '<text x="72" y="628" fill="#8aa0b5" font-size="22" font-family="Segoe UI, Arial, sans-serif">Runtime Ops generated this proof frame because no retained browser image was available.</text>',
    '</svg>',
  ].join('');

  return {
    run_id: String(runId || '').trim(),
    worker_id: String(worker?.worker_id || '').trim(),
    data: Buffer.from(svg, 'utf8').toString('base64'),
    width,
    height,
    ts: endedAt,
    mime_type: 'image/svg+xml',
    synthetic: true,
  };
}

function readPngDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) {
    return { width: 0, height: 0 };
  }
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    return { width: 0, height: 0 };
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function isJpegStartOfFrameMarker(marker) {
  return marker === 0xc0
    || marker === 0xc1
    || marker === 0xc2
    || marker === 0xc3
    || marker === 0xc5
    || marker === 0xc6
    || marker === 0xc7
    || marker === 0xc9
    || marker === 0xca
    || marker === 0xcb
    || marker === 0xcd
    || marker === 0xce
    || marker === 0xcf;
}

function readJpegDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return { width: 0, height: 0 };
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return { width: 0, height: 0 };
  }
  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let markerOffset = offset + 1;
    while (markerOffset < buffer.length && buffer[markerOffset] === 0xff) {
      markerOffset += 1;
    }
    if (markerOffset >= buffer.length) {
      break;
    }
    const marker = buffer[markerOffset];
    offset = markerOffset + 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 1 >= buffer.length) {
      break;
    }
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      break;
    }
    if (isJpegStartOfFrameMarker(marker) && offset + 7 < buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  return { width: 0, height: 0 };
}

function readImageDimensions(buffer, filename = '') {
  const token = String(filename || '').trim().toLowerCase();
  if (token.endsWith('.png')) {
    return readPngDimensions(buffer);
  }
  return readJpegDimensions(buffer);
}

function buildRuntimeAssetCandidatePaths({ filename, storage, OUTPUT_ROOT, path, runDir = '', runId = '' }) {
  const normalized = String(filename || '').trim().replace(/\\/g, '/');
  if (!normalized) {
    return [];
  }

  const candidates = [];
  const seen = new Set();
  const pushCandidate = (candidatePath) => {
    const token = String(candidatePath || '').trim();
    if (!token) return;
    const resolved = path.resolve(token);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    candidates.push(resolved);
  };

  if (normalized.includes('/')) {
    if (typeof storage?.resolveLocalPath === 'function') {
      pushCandidate(storage.resolveLocalPath(normalized));
    } else if (OUTPUT_ROOT) {
      pushCandidate(path.join(OUTPUT_ROOT, ...normalized.split('/')));
    }

    const runMatch = normalized.match(/(?:^|\/)runs\/([^/]+)\/(.+)$/);
    const archiveRunId = String(runId || runMatch?.[1] || '').trim();
    const relativeRunPath = String(runMatch?.[2] || '').trim();
    if (OUTPUT_ROOT && archiveRunId && relativeRunPath) {
      pushCandidate(path.join(
        OUTPUT_ROOT,
        '_runtime',
        'archived_runs',
        's3',
        archiveRunId,
        'run_output',
        ...relativeRunPath.split('/'),
      ));
      pushCandidate(path.join(
        OUTPUT_ROOT,
        '_runtime',
        'archived_runs',
        's3',
        archiveRunId,
        'latest_snapshot',
        ...relativeRunPath.split('/'),
      ));
    }
    return candidates;
  }

  if (runDir) {
    pushCandidate(path.join(runDir, 'screenshots', normalized));
  }
  return candidates;
}

function createRuntimeScreenshotMetadataResolver({ storage, OUTPUT_ROOT, path }) {
  const cache = new Map();
  return function resolveScreenshotMetadata(filename, context = {}) {
    const key = String(filename || '').trim().replace(/\\/g, '/');
    if (!key) {
      return null;
    }
    if (cache.has(key)) {
      return cache.get(key);
    }
    const eventRunId = String(context?.event?.run_id || context?.event?.runId || '').trim();
    const candidatePaths = buildRuntimeAssetCandidatePaths({
      filename: key,
      storage,
      OUTPUT_ROOT,
      path,
      runId: eventRunId,
    });
    if (candidatePaths.length === 0) {
      cache.set(key, null);
      return null;
    }

    for (const localPath of candidatePaths) {
      try {
        const buffer = fsSync.readFileSync(localPath);
        const dimensions = readImageDimensions(buffer, key);
        const metadata = {
          bytes: buffer.length,
          width: Number(dimensions.width || 0) || 0,
          height: Number(dimensions.height || 0) || 0,
        };
        cache.set(key, metadata);
        return metadata;
      } catch {
        // Try the next candidate.
      }
    }

    cache.set(key, null);
    return null;
  };
}

function normalizeQueryProfileRow(row) {
  if (typeof row === 'string') {
    return { query: row };
  }
  if (!row || typeof row !== 'object') return null;
  return row;
}

function enrichQueryRow(row, byQuery = new Map()) {
  if (!row || typeof row !== 'object') {
    return row;
  }
  const normalized = normalizeProfileQuery(row.query);
  if (!normalized) {
    return row;
  }
  const sourceRow = byQuery.get(normalized);
  if (!sourceRow || typeof sourceRow !== 'object') {
    return row;
  }
  const nextRow = { ...row };
  if (!nextRow.hint_source && sourceRow.hint_source) {
    nextRow.hint_source = String(sourceRow.hint_source || '').trim();
  }
  if ((!nextRow.doc_hint || !String(nextRow.doc_hint || '').trim()) && sourceRow.doc_hint) {
    nextRow.doc_hint = String(sourceRow.doc_hint || '').trim();
  }
  if ((!nextRow.domain_hint || !String(nextRow.domain_hint || '').trim()) && sourceRow.domain_hint) {
    nextRow.domain_hint = String(sourceRow.domain_hint || '').trim();
  }
  if ((!nextRow.source_host || !String(nextRow.source_host || '').trim()) && sourceRow.source_host) {
    nextRow.source_host = String(sourceRow.source_host || '').trim();
  }
  if ((!Array.isArray(nextRow.target_fields) || nextRow.target_fields.length === 0) && Array.isArray(sourceRow.target_fields)) {
    nextRow.target_fields = [...sourceRow.target_fields];
  }
  return nextRow;
}

function toQueryRowLookup(profileOrRows) {
  const rows = [];
  if (Array.isArray(profileOrRows)) {
    rows.push(...profileOrRows);
  } else if (profileOrRows && typeof profileOrRows === 'object') {
    if (Array.isArray(profileOrRows.query_rows)) rows.push(...profileOrRows.query_rows);
    if (Array.isArray(profileOrRows.queries)) rows.push(...profileOrRows.queries);
  }
  const lookup = new Map();
  for (const row of rows) {
    const normalizedRow = normalizeQueryProfileRow(row);
    if (!normalizedRow) continue;
    const normalized = normalizeProfileQuery(normalizedRow.query);
    if (!normalized || lookup.has(normalized)) continue;
    lookup.set(normalized, normalizedRow);
  }
  return lookup;
}

function incrementHintSourceCounts(target, source = '', parseIntValue = toInt) {
  const nextCounts = typeof target === 'object' && target !== null ? { ...target } : {};
  const key = String(source || '').trim();
  if (!key) return nextCounts;
  const normalizeCount = typeof parseIntValue === 'function'
    ? parseIntValue
    : ((value, fallback) => {
      const parsed = Number.parseInt(String(value || ''), 10);
      return Number.isFinite(parsed) ? parsed : (Number.isFinite(fallback) ? fallback : 0);
    });
  nextCounts[key] = (normalizeCount(nextCounts[key], 0) || 0) + 1;
  return nextCounts;
}

function isRuntimeBridgeSource(source = '') {
  return String(source || '')
    .trim()
    .toLowerCase()
    .startsWith('runtime_bridge');
}

function applyPlanProfileFallback(target = '', fallback = '') {
  const normalizedTarget = String(target || '').trim();
  const normalizedFallback = String(fallback || '').trim();
  return normalizedTarget || normalizedFallback;
}

function mergeQueryRowFromPlan(row = {}, planRow = {}) {
  if (!row || typeof row !== 'object' || !planRow || typeof planRow !== 'object') {
    return row;
  }
  const nextRow = { ...row };
  const nextTargetFields = Array.isArray(nextRow.target_fields) ? nextRow.target_fields : [];
  if ((!nextTargetFields || nextTargetFields.length === 0) && Array.isArray(planRow.target_fields)) {
    nextRow.target_fields = [...planRow.target_fields];
  }
  nextRow.hint_source = applyPlanProfileFallback(nextRow.hint_source, planRow.hint_source);
  nextRow.doc_hint = applyPlanProfileFallback(nextRow.doc_hint, planRow.doc_hint);
  nextRow.domain_hint = applyPlanProfileFallback(nextRow.domain_hint, planRow.domain_hint);
  nextRow.source_host = applyPlanProfileFallback(nextRow.source_host, planRow.source_host);
  return nextRow;
}

function mergeSearchProfileRows(runtimeProfile, planProfile, parseIntValue = toInt) {
  const runtimeRows = Array.isArray(runtimeProfile?.query_rows) ? runtimeProfile.query_rows : [];
  const runtimeLookup = toQueryRowLookup(runtimeProfile);
  const byQuery = toQueryRowLookup(planProfile);
  const planRows = Array.from(byQuery.values());

  const mergedRows = [];
  const seen = new Set();
  for (const row of runtimeRows) {
    if (!row || typeof row !== 'object') continue;
    const enrichedRow = enrichQueryRow(row, runtimeLookup);
    const normalized = normalizeProfileQuery(enrichedRow.query);
    const rowSource = String(enrichedRow.hint_source || '').trim();
    const planRow = normalized ? byQuery.get(normalized) : null;
    const merged = {
      ...(planRow && typeof planRow === 'object' ? planRow : {}),
      ...enrichedRow,
      query: String(enrichedRow.query || '').trim(),
      __from_plan_profile: Boolean(planRow)
    };
    const mergedQuery = normalizeProfileQuery(merged.query);
    if (!rowSource || isRuntimeBridgeSource(rowSource)) {
      merged.hint_source = planRow && typeof planRow.hint_source === 'string' ? planRow.hint_source : merged.hint_source;
    }
    if (!merged.doc_hint && planRow && typeof planRow.doc_hint === 'string') {
      merged.doc_hint = planRow.doc_hint;
    }
    if (!merged.domain_hint && planRow && typeof planRow.domain_hint === 'string') {
      merged.domain_hint = planRow.domain_hint;
    }
    if (!merged.source_host && planRow && typeof planRow.source_host === 'string') {
      merged.source_host = planRow.source_host;
    }
    if (planRow && typeof planRow === 'object') {
      const mergedFromPlan = mergeQueryRowFromPlan(merged, planRow);
      Object.assign(merged, {
        hint_source: mergedFromPlan.hint_source,
        doc_hint: mergedFromPlan.doc_hint,
        domain_hint: mergedFromPlan.domain_hint,
        source_host: mergedFromPlan.source_host,
        target_fields: mergedFromPlan.target_fields
      });
    }
    if ((!Array.isArray(merged.target_fields) || merged.target_fields.length === 0) && Array.isArray(planRow?.target_fields)) {
      merged.target_fields = [...planRow.target_fields];
    }
    mergedRows.push(merged);
    if (mergedQuery) seen.add(mergedQuery);
  }

  for (const row of planRows) {
    if (!row || typeof row !== 'object') continue;
    const query = normalizeProfileQuery(row.query);
    if (!query || seen.has(query)) continue;
    mergedRows.push({
      ...row,
      __from_plan_profile: true
    });
    seen.add(query);
  }

  const runtimeCounts = runtimeProfile?.hint_source_counts;
  const planCounts = planProfile?.hint_source_counts;
  let mergedCounts = planCounts && typeof planCounts === 'object'
    ? { ...planCounts }
    : {};
  if (runtimeCounts && typeof runtimeCounts === 'object') {
    Object.assign(mergedCounts, runtimeCounts);
  }
  for (const row of mergedRows) {
    mergedCounts = incrementHintSourceCounts(mergedCounts, row.hint_source, parseIntValue);
  }

  return {
    ...(runtimeProfile && typeof runtimeProfile === 'object' ? runtimeProfile : {}),
    ...(planProfile && typeof planProfile === 'object' ? planProfile : {}),
    query_rows: mergedRows,
    hint_source_counts: mergedCounts
  };
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function readPathValue(target, pathSegments = []) {
  let cursor = target;
  for (const segment of pathSegments) {
    if (!isObject(cursor) || !hasOwn(cursor, segment)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function hasPathValue(target, pathSegments = []) {
  if (!pathSegments.length) return false;
  let cursor = target;
  for (const segment of pathSegments) {
    if (!isObject(cursor) || !hasOwn(cursor, segment)) {
      return false;
    }
    cursor = cursor[segment];
  }
  return true;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function countRuleValues(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeText(entry))
      .filter(Boolean)
      .length;
  }
  return normalizeText(value) ? 1 : 0;
}

function countEffectiveDomainRuleValues(value) {
  const rows = Array.isArray(value) ? value : [value];
  return rows
    .map((entry) => normalizeText(entry).toLowerCase())
    .filter((entry) => entry.includes('.'))
    .length;
}

const FIELD_RULE_GATE_SPECS = [
  { key: 'search_hints.query_terms', name: 'query_terms', path: ['search_hints', 'query_terms'] },
  { key: 'search_hints.domain_hints', name: 'domain_hints', path: ['search_hints', 'domain_hints'] },
  { key: 'search_hints.preferred_content_types', name: 'preferred_content_types', path: ['search_hints', 'preferred_content_types'] },
];

function buildFieldRuleGateCountsFromRules(fieldRulesPayload = {}) {
  const fields = fieldRulesPayload?.fields || fieldRulesPayload?.rules?.fields;
  if (!isObject(fields)) {
    return {};
  }

  const out = {};
  for (const spec of FIELD_RULE_GATE_SPECS) {
    let valueCount = 0;
    let totalValueCount = 0;
    let enabledFieldCount = 0;
    let disabledFieldCount = 0;
    for (const rule of Object.values(fields)) {
      if (!isObject(rule)) continue;
      const gate = resolveConsumerGate(rule, spec.key, 'indexlab');
      const hasPath = hasPathValue(rule, spec.path);
      if (!hasPath && !gate.explicit) {
        continue;
      }
      if (!gate.enabled) {
        disabledFieldCount += 1;
        continue;
      }
      enabledFieldCount += 1;
      const hintValue = readPathValue(rule, spec.path);
      const rawCount = countRuleValues(hintValue);
      const effectiveCount = spec.name === 'domain_hints'
        ? countEffectiveDomainRuleValues(hintValue)
        : rawCount;
      valueCount += effectiveCount;
      totalValueCount += rawCount;
    }
    const status = disabledFieldCount > 0 && enabledFieldCount === 0
      ? 'off'
      : (valueCount > 0 ? 'active' : 'zero');
    const gateRow = {
      value_count: valueCount,
      total_value_count: totalValueCount,
      effective_value_count: valueCount,
      enabled_field_count: enabledFieldCount,
      disabled_field_count: disabledFieldCount,
      status,
    };
    out[spec.key] = gateRow;
  }
  return out;
}

function buildFieldRuleHintCountsByFieldFromRules(fieldRulesPayload = {}) {
  const fields = fieldRulesPayload?.fields || fieldRulesPayload?.rules?.fields;
  if (!isObject(fields)) {
    return {};
  }

  const out = {};
  for (const [fieldKey, rule] of Object.entries(fields)) {
    if (!isObject(rule)) continue;
    const row = {};
    for (const spec of FIELD_RULE_GATE_SPECS) {
      const gate = resolveConsumerGate(rule, spec.key, 'indexlab');
      const hasPath = hasPathValue(rule, spec.path);
      const hintValue = gate.enabled && hasPath
        ? readPathValue(rule, spec.path)
        : undefined;
      const rawValueCount = gate.enabled && hasPath
        ? countRuleValues(hintValue)
        : 0;
      const valueCount = spec.name === 'domain_hints'
        ? countEffectiveDomainRuleValues(hintValue)
        : rawValueCount;
      row[spec.name] = {
        value_count: valueCount,
        total_value_count: rawValueCount,
        effective_value_count: valueCount,
        status: gate.enabled
          ? (valueCount > 0 ? 'active' : 'zero')
          : 'off',
      };
    }
    out[fieldKey] = row;
  }
  return out;
}

function hasFieldRuleGateCounts(profile = {}) {
  if (!isObject(profile)) return false;
  const counts = profile.field_rule_gate_counts;
  if (!isObject(counts)) return false;
  return Object.keys(counts).length > 0;
}

function hasFieldRuleHintCountsByField(profile = {}) {
  if (!isObject(profile)) return false;
  const counts = profile.field_rule_hint_counts_by_field;
  if (!isObject(counts)) return false;
  return Object.keys(counts).length > 0;
}

async function hydrateFieldRuleGateCounts({
  searchProfile,
  fieldRulesPayload,
}) {
  if (
    !isObject(searchProfile)
    || (hasFieldRuleGateCounts(searchProfile) && hasFieldRuleHintCountsByField(searchProfile))
  ) {
    return searchProfile;
  }
  if (!isObject(fieldRulesPayload)) {
    return searchProfile;
  }

  const needsGateCounts = !hasFieldRuleGateCounts(searchProfile);
  const needsByFieldCounts = !hasFieldRuleHintCountsByField(searchProfile);
  const gateCounts = needsGateCounts ? buildFieldRuleGateCountsFromRules(fieldRulesPayload) : null;
  const byFieldCounts = needsByFieldCounts ? buildFieldRuleHintCountsByFieldFromRules(fieldRulesPayload) : null;
  if (
    (gateCounts && Object.keys(gateCounts).length > 0)
    || (byFieldCounts && Object.keys(byFieldCounts).length > 0)
  ) {
    return {
      ...searchProfile,
      ...(gateCounts && Object.keys(gateCounts).length > 0 ? { field_rule_gate_counts: gateCounts } : {}),
      ...(byFieldCounts && Object.keys(byFieldCounts).length > 0 ? { field_rule_hint_counts_by_field: byFieldCounts } : {}),
    };
  }
  return searchProfile;
}

async function loadRuntimeFieldRulesPayload({
  category,
  config,
  safeReadJson,
  path,
}) {
  const normalizedCategory = normalizeText(category).toLowerCase();
  if (!normalizedCategory) {
    return null;
  }
  const helperRoot = path.resolve(
    config?.categoryAuthorityRoot || config?.['helper' + 'FilesRoot'] || 'category_authority'
  );
  const candidatePaths = [
    path.join(helperRoot, normalizedCategory, '_generated', 'field_rules.runtime.json'),
    path.join(helperRoot, normalizedCategory, '_generated', 'field_rules.json'),
  ];

  for (const candidatePath of candidatePaths) {
    const fieldRules = await safeReadJson(candidatePath);
    if (isObject(fieldRules)) {
      return projectFieldRulesForConsumer(fieldRules, 'indexlab');
    }
  }

  return null;
}

export function registerRuntimeOpsRoutes(ctx) {
  const {
    jsonRes,
    toInt,
    INDEXLAB_ROOT,
    OUTPUT_ROOT,
    config,
    storage,
    readIndexLabRunEvents,
    readIndexLabRunSearchProfile,
    readIndexLabRunMeta,
    readIndexLabRunSourceIndexingPackets,
    resolveIndexLabRunDirectory,
    processStatus,
    getLastScreencastFrame,
    safeReadJson,
    safeJoin,
    path,
  } = ctx;

  const resolveScreenshotMetadata = createRuntimeScreenshotMetadataResolver({
    storage,
    OUTPUT_ROOT,
    path,
  });

  return async function handleRuntimeOpsRoutes(parts, params, method, req, res) {
    if (!config.runtimeOpsWorkbenchEnabled) return false;

    if (parts[0] !== 'indexlab' || parts[1] !== 'run' || !parts[2] || parts[3] !== 'runtime') {
      return false;
    }

    if (method !== 'GET') return false;

    const runId = String(parts[2] || '').trim();
    const directRunDir = safeJoin(INDEXLAB_ROOT, runId);
    if (!directRunDir) return jsonRes(res, 400, { error: 'invalid_run_id' });

    const runDir = typeof resolveIndexLabRunDirectory === 'function'
      ? (await resolveIndexLabRunDirectory(runId).catch(() => '')) || directRunDir
      : directRunDir;
    const meta = typeof readIndexLabRunMeta === 'function'
      ? await readIndexLabRunMeta(runId).catch(() => null)
      : await safeReadJson(path.join(runDir, 'run.json'));
    if (!meta) return jsonRes(res, 404, { error: 'run_not_found', run_id: runId });

    const subPath = String(parts[4] || '').trim();
    const events = await readIndexLabRunEvents(runId);
    const resolvedMeta = resolveInactiveRunMeta(meta, events, runId, processStatus);

    if (subPath === 'summary' && !parts[5]) {
      const summary = buildRuntimeOpsSummary(events, resolvedMeta);
      return jsonRes(res, 200, { run_id: runId, ...summary });
    }

    if (subPath === 'workers' && !parts[5]) {
      const fieldRulesPayload = await loadRuntimeFieldRulesPayload({
        category: resolvedMeta?.category,
        config,
        safeReadJson,
        path,
      });
      const sourceIndexingPacketCollection = typeof readIndexLabRunSourceIndexingPackets === 'function'
        ? await readIndexLabRunSourceIndexingPackets(runId).catch(() => null)
        : null;
      const workers = buildRuntimeOpsWorkers(events, {
        sourceIndexingPacketCollection,
      }).map((worker) => ({
        ...worker,
        idx_runtime: buildRuntimeIdxBadgesForWorker({
          fieldRulesPayload,
          worker,
        }),
      }));
      return jsonRes(res, 200, { run_id: runId, workers });
    }

    if (subPath === 'documents' && !parts[5]) {
      const limit = Math.max(1, toInt(params.get('limit'), 50));
      const documents = buildRuntimeOpsDocuments(events, { limit });
      return jsonRes(res, 200, { run_id: runId, documents });
    }

    if (subPath === 'documents' && parts[5]) {
      const docUrl = decodeURIComponent(String(parts[5]));
      const detail = buildRuntimeOpsDocumentDetail(events, docUrl);
      if (!detail) return jsonRes(res, 404, { error: 'document_not_found', url: docUrl });
      return jsonRes(res, 200, { run_id: runId, ...detail });
    }

    if (subPath === 'metrics') {
      const metrics = buildRuntimeOpsMetricsRail(events, resolvedMeta);
      return jsonRes(res, 200, { run_id: runId, ...metrics });
    }

    if (subPath === 'extraction' && parts[5] === 'fields') {
      const round = params.has('round') ? toInt(params.get('round'), null) : null;
      const sourceIndexingPacketCollection = typeof readIndexLabRunSourceIndexingPackets === 'function'
        ? await readIndexLabRunSourceIndexingPackets(runId).catch(() => null)
        : null;
      const sourcePackets = Array.isArray(sourceIndexingPacketCollection)
        ? sourceIndexingPacketCollection
        : (sourceIndexingPacketCollection?.packets || []);
      const fields = buildExtractionFields(events, { round, sourcePackets });
      return jsonRes(res, 200, { run_id: runId, ...fields });
    }

    if (subPath === 'fallbacks' && !parts[5]) {
      const limit = Math.max(1, toInt(params.get('limit'), 200));
      const fallbacks = buildFallbackEvents(events, { limit });
      return jsonRes(res, 200, { run_id: runId, ...fallbacks });
    }

    if (subPath === 'queue' && !parts[5]) {
      const limit = Math.max(1, toInt(params.get('limit'), 200));
      const queue = buildQueueState(events, { limit });
      return jsonRes(res, 200, { run_id: runId, ...queue });
    }

    if (subPath === 'workers' && parts[5]) {
      const workerIdParam = decodeURIComponent(String(parts[5]));
      const sourceIndexingPacketCollection = typeof readIndexLabRunSourceIndexingPackets === 'function'
        ? await readIndexLabRunSourceIndexingPackets(runId).catch(() => null)
        : null;
      const detail = buildWorkerDetail(events, workerIdParam, {
        resolveScreenshotMetadata,
        sourceIndexingPacketCollection,
      });
      return jsonRes(res, 200, { run_id: runId, ...detail });
    }

    if (subPath === 'screencast' && parts[5] && parts[6] === 'last') {
      const workerIdParam = decodeURIComponent(String(parts[5]));
      let frame = typeof getLastScreencastFrame === 'function'
        ? getLastScreencastFrame(runId, workerIdParam)
        : null;
      if (!frame) {
        const persistedFramePath = path.join(runDir, 'runtime_screencast', `${workerIdParam}.json`);
        const persistedFrame = await safeReadJson(persistedFramePath);
        if (persistedFrame && typeof persistedFrame === 'object') {
          frame = persistedFrame.frame && typeof persistedFrame.frame === 'object'
            ? persistedFrame.frame
            : persistedFrame;
        }
      }
      if (!frame) {
        const workers = buildRuntimeOpsWorkers(events, {});
        const worker = Array.isArray(workers)
          ? workers.find((row) => String(row?.worker_id || '').trim() === workerIdParam)
          : null;
        if (worker && shouldSynthesizeRuntimeProofFrame(worker)) {
          const sourceIndexingPacketCollection = typeof readIndexLabRunSourceIndexingPackets === 'function'
            ? await readIndexLabRunSourceIndexingPackets(runId).catch(() => null)
            : null;
          const detail = buildWorkerDetail(events, workerIdParam, {
            resolveScreenshotMetadata,
            sourceIndexingPacketCollection,
          });
          frame = buildSyntheticRuntimeProofFrame({
            runId,
            worker,
            detail,
          });
        }
      }
      if (!frame) {
        return jsonRes(res, 404, {
          error: 'screencast_frame_not_found',
          run_id: runId,
          worker_id: workerIdParam,
        });
      }
      return jsonRes(res, 200, { run_id: runId, worker_id: workerIdParam, frame });
    }

    if (subPath === 'llm-dashboard' && !parts[5]) {
      const dashboard = buildLlmCallsDashboard(events);
      return jsonRes(res, 200, { run_id: runId, ...dashboard });
    }

    if (subPath === 'prefetch' && !parts[5]) {
      const needsetPath = path.join(runDir, 'needset.json');
      const profilePath = path.join(runDir, 'search_profile.json');
      const brandPath = path.join(runDir, 'brand_resolution.json');
      const [needsetArt, profileArt, brandArt, planProfile] = await Promise.all([
        safeReadJson(needsetPath),
        safeReadJson(profilePath),
        safeReadJson(brandPath),
        readIndexLabRunSearchProfile ? readIndexLabRunSearchProfile(runId).catch(() => null) : Promise.resolve(null),
      ]);
      let searchProfile = profileArt && typeof profileArt === 'object'
        ? (planProfile && typeof planProfile === 'object'
          ? mergeSearchProfileRows(profileArt, planProfile, toInt)
          : profileArt)
        : planProfile;
      const fieldRulesPayload = await loadRuntimeFieldRulesPayload({
        category: resolvedMeta?.category,
        config,
        safeReadJson,
        path,
      });
      searchProfile = await hydrateFieldRuleGateCounts({
        searchProfile,
        fieldRulesPayload,
      });
      const artifacts = { needset: needsetArt, search_profile: searchProfile, brand_resolution: brandArt };
      const prefetch = buildPreFetchPhases(events, resolvedMeta, artifacts);
      return jsonRes(res, 200, {
        run_id: runId,
        ...prefetch,
        idx_runtime: buildRuntimeIdxBadgesBySurface(fieldRulesPayload),
      });
    }

    if (subPath === 'pipeline' && !parts[5]) {
      const pipeline = buildPipelineFlow(events);
      return jsonRes(res, 200, { run_id: runId, ...pipeline });
    }

    if (subPath === 'assets' && parts[5]) {
      const encodedFilename = String(parts[5] || '').trim();
      let filename = '';
      try {
        filename = decodeURIComponent(encodedFilename);
      } catch {
        return jsonRes(res, 400, { error: 'invalid_filename' });
      }
      if (!filename || filename.includes('..')) {
        return jsonRes(res, 400, { error: 'invalid_filename' });
      }
      const fs = await import('node:fs');
      if (path.isAbsolute(filename)) {
        return jsonRes(res, 400, { error: 'invalid_filename' });
      }

      const screenshotDir = path.resolve(path.join(runDir, 'screenshots'));
      const outputRootResolved = OUTPUT_ROOT ? path.resolve(OUTPUT_ROOT) : '';
      const candidatePaths = buildRuntimeAssetCandidatePaths({
        filename,
        storage,
        OUTPUT_ROOT,
        path,
        runDir,
        runId,
      }).filter((candidatePath) => (
        candidatePath.startsWith(screenshotDir)
        || (outputRootResolved && candidatePath.startsWith(outputRootResolved))
      ));

      let resolved = '';
      for (const candidatePath of candidatePaths) {
        try {
          await fs.promises.access(candidatePath);
          resolved = candidatePath;
          break;
        } catch {
          // Try the next candidate path.
        }
      }

      if (!resolved) {
        return jsonRes(res, 404, { error: 'file_not_found' });
      }
      const ext = path.extname(filename).toLowerCase();
      const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
      const contentType = mimeMap[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      const stream = fs.createReadStream(resolved);
      stream.pipe(res);
      return true;
    }

    return false;
  };
}
