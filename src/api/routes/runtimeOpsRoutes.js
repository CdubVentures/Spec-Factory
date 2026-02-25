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
} from './runtimeOpsDataBuilders.js';
import { toInt } from '../helpers/requestHelpers.js';
import { resolveConsumerGate } from '../../field-rules/consumerGate.js';

function normalizeProfileQuery(value) {
  return String(value || '').trim().toLowerCase();
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
  category,
  config,
  safeReadJson,
  path,
}) {
  if (
    !isObject(searchProfile)
    || (hasFieldRuleGateCounts(searchProfile) && hasFieldRuleHintCountsByField(searchProfile))
  ) {
    return searchProfile;
  }
  const normalizedCategory = normalizeText(category).toLowerCase();
  if (!normalizedCategory) {
    return searchProfile;
  }
  const helperRoot = path.resolve(config?.helperFilesRoot || 'helper_files');
  const candidatePaths = [
    path.join(helperRoot, normalizedCategory, '_control_plane', 'field_rules_draft.json'),
    path.join(helperRoot, normalizedCategory, '_generated', 'field_rules.json'),
    path.join(helperRoot, normalizedCategory, '_generated', 'field_rules.runtime.json'),
  ];
  for (const candidatePath of candidatePaths) {
    const fieldRules = await safeReadJson(candidatePath);
    if (!isObject(fieldRules)) {
      continue;
    }
    const needsGateCounts = !hasFieldRuleGateCounts(searchProfile);
    const needsByFieldCounts = !hasFieldRuleHintCountsByField(searchProfile);
    const gateCounts = needsGateCounts ? buildFieldRuleGateCountsFromRules(fieldRules) : null;
    const byFieldCounts = needsByFieldCounts ? buildFieldRuleHintCountsByFieldFromRules(fieldRules) : null;
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
  }
  return searchProfile;
}

export function registerRuntimeOpsRoutes(ctx) {
  const {
    jsonRes,
    toInt,
    INDEXLAB_ROOT,
    config,
    readIndexLabRunEvents,
    readIndexLabRunSearchProfile,
    safeReadJson,
    safeJoin,
    path,
  } = ctx;

  return async function handleRuntimeOpsRoutes(parts, params, method, req, res) {
    if (!config.runtimeOpsWorkbenchEnabled) return false;

    if (parts[0] !== 'indexlab' || parts[1] !== 'run' || !parts[2] || parts[3] !== 'runtime') {
      return false;
    }

    if (method !== 'GET') return false;

    const runId = String(parts[2] || '').trim();
    const runDir = safeJoin(INDEXLAB_ROOT, runId);
    if (!runDir) return jsonRes(res, 400, { error: 'invalid_run_id' });

    const runMetaPath = path.join(runDir, 'run.json');
    const meta = await safeReadJson(runMetaPath);
    if (!meta) return jsonRes(res, 404, { error: 'run_not_found', run_id: runId });

    const subPath = String(parts[4] || '').trim();
    const events = await readIndexLabRunEvents(runId);

    if (subPath === 'summary' && !parts[5]) {
      const summary = buildRuntimeOpsSummary(events, meta);
      return jsonRes(res, 200, { run_id: runId, ...summary });
    }

    if (subPath === 'workers' && !parts[5]) {
      const workers = buildRuntimeOpsWorkers(events, {});
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
      const metrics = buildRuntimeOpsMetricsRail(events, meta);
      return jsonRes(res, 200, { run_id: runId, ...metrics });
    }

    if (subPath === 'extraction' && parts[5] === 'fields') {
      const round = params.has('round') ? toInt(params.get('round'), null) : null;
      const fields = buildExtractionFields(events, { round });
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
      const detail = buildWorkerDetail(events, workerIdParam);
      return jsonRes(res, 200, { run_id: runId, ...detail });
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
      searchProfile = await hydrateFieldRuleGateCounts({
        searchProfile,
        category: meta?.category,
        config,
        safeReadJson,
        path,
      });
      const artifacts = { needset: needsetArt, search_profile: searchProfile, brand_resolution: brandArt };
      const prefetch = buildPreFetchPhases(events, meta, artifacts);
      return jsonRes(res, 200, { run_id: runId, ...prefetch });
    }

    if (subPath === 'pipeline' && !parts[5]) {
      const pipeline = buildPipelineFlow(events);
      return jsonRes(res, 200, { run_id: runId, ...pipeline });
    }

    if (subPath === 'assets' && parts[5]) {
      const filename = String(parts[5] || '').trim();
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return jsonRes(res, 400, { error: 'invalid_filename' });
      }
      const fs = await import('node:fs');
      const filePath = path.join(runDir, 'screenshots', filename);
      const resolved = path.resolve(filePath);
      const screenshotDir = path.resolve(path.join(runDir, 'screenshots'));
      if (!resolved.startsWith(screenshotDir)) {
        return jsonRes(res, 400, { error: 'invalid_filename' });
      }
      try {
        await fs.promises.access(filePath);
      } catch {
        return jsonRes(res, 404, { error: 'file_not_found' });
      }
      const ext = path.extname(filename).toLowerCase();
      const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
      const contentType = mimeMap[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      return true;
    }

    return false;
  };
}
