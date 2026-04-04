import { nowIso } from '../shared/primitives.js';
import { publishProducts } from './publishingPipeline.js';
import { hasKnownValue } from '../shared/valueNormalizers.js';
import { normalizeToken } from '../shared/primitives.js';
import { parseDateMs } from './publishPrimitives.js';
import { outputKey, readJson, writeJson, writeText, listOutputKeys } from './publishStorageAdapter.js';

function normalizeCategory(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toPosix(...parts) {
  return parts.filter(Boolean).join('/').replace(/\\/g, '/').replace(/\/+/g, '/');
}


function parseJsonLines(text = '') {
  const rows = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    try {
      rows.push(JSON.parse(line));
    } catch {
      // ignore malformed lines in drift snapshots
    }
  }
  return rows;
}

function finalModernKey(parts = []) {
  return toPosix('final', ...parts);
}

function finalLegacyKey(storage, parts = []) {
  return storage.resolveOutputKey('final', ...parts);
}

function inferProductIdFromPublishedKey(key = '') {
  const normalized = String(key || '').replace(/\\/g, '/');
  const match = normalized.match(/\/published\/([^/]+)\/current\.json$/i);
  return match ? match[1] : '';
}

async function listPublishedCurrentKeys(storage, category) {
  const keys = await listOutputKeys(storage, [category, 'published']);
  return keys.filter((key) => String(key || '').replace(/\\/g, '/').endsWith('/current.json')).sort();
}

function hostFromUrl(url = '') {
  try {
    return new URL(String(url || '')).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function sourceHashIdentity(row = {}) {
  const sourceId = String(row.source_id || '').trim().toLowerCase();
  if (sourceId) {
    return sourceId;
  }
  const host = String(row.host || hostFromUrl(row.url)).trim().toLowerCase();
  if (host) {
    return host;
  }
  return String(row.url || '').trim().toLowerCase();
}

function normalizeSourceHashRows(rows = []) {
  const out = {};
  for (const row of rows || []) {
    const tier = Number.parseInt(String(row.tier ?? ''), 10);
    if (Number.isFinite(tier) && tier > 2) {
      continue;
    }
    const key = sourceHashIdentity(row);
    if (!key) {
      continue;
    }
    const pageHash = String(row.page_content_hash || '').trim();
    const textHash = String(row.text_hash || '').trim();
    if (!pageHash && !textHash) {
      continue;
    }
    const ts = String(row.ts || row.timestamp || '').trim() || nowIso();
    const current = out[key] || null;
    if (current && parseDateMs(current.last_seen_at) > parseDateMs(ts)) {
      continue;
    }
    out[key] = {
      key,
      source_id: String(row.source_id || '').trim() || null,
      host: String(row.host || hostFromUrl(row.url)).trim() || null,
      url: String(row.url || '').trim() || null,
      tier: Number.isFinite(tier) ? tier : null,
      page_content_hash: pageHash || null,
      text_hash: textHash || null,
      last_seen_at: ts
    };
  }
  return out;
}

function diffSourceHashes(previous = {}, current = {}) {
  const keys = [...new Set([...Object.keys(previous || {}), ...Object.keys(current || {})])]
    .sort((a, b) => a.localeCompare(b));
  const changes = [];
  for (const key of keys) {
    const left = previous?.[key] || null;
    const right = current?.[key] || null;
    if (JSON.stringify(left) === JSON.stringify(right)) {
      continue;
    }
    changes.push({
      key,
      before: left,
      after: right
    });
  }
  return changes;
}

async function readSourceHistoryRows(storage, category, productId) {
  const parts = [category, productId, 'evidence', 'sources.jsonl'];
  const candidates = [
    finalModernKey(parts),
    finalLegacyKey(storage, parts)
  ];
  for (const key of candidates) {
    const text = await storage.readTextOrNull(key);
    if (!text) {
      continue;
    }
    return parseJsonLines(text);
  }
  return [];
}

function coerceComparable(value) {
  if (value === null || value === undefined) {
    return 'unk';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((row) => coerceComparable(row));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, row] of Object.entries(value || {})) {
      out[key] = coerceComparable(row);
    }
    return out;
  }
  const text = String(value).trim();
  if (!text) {
    return 'unk';
  }
  const lower = text.toLowerCase();
  if (lower === 'true') {
    return true;
  }
  if (lower === 'false') {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const parsed = Number.parseFloat(text);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return text;
}

function comparePublishedVsLatest(publishedSpecs = {}, latestFields = {}) {
  const keys = [...new Set([...Object.keys(publishedSpecs || {}), ...Object.keys(latestFields || {})])]
    .sort((a, b) => a.localeCompare(b));
  const out = [];
  for (const field of keys) {
    const publishedValue = coerceComparable(publishedSpecs?.[field]);
    const latestValue = coerceComparable(latestFields?.[field]);
    if (JSON.stringify(publishedValue) === JSON.stringify(latestValue)) {
      continue;
    }
    out.push({
      field,
      published: publishedValue,
      latest: latestValue
    });
  }
  return out;
}

function collectEvidenceFailures(fields = {}, provenance = {}) {
  const failures = [];
  for (const [field, value] of Object.entries(fields || {})) {
    if (!hasKnownValue(value)) {
      continue;
    }
    const row = provenance?.[field] || {};
    const evidence = Array.isArray(row.evidence) && row.evidence.length > 0
      ? (row.evidence[0] || {})
      : {};
    if (!String(evidence.url || '').trim()) {
      failures.push({ field, code: 'missing_evidence_url' });
    }
    if (!String(evidence.quote || '').trim()) {
      failures.push({ field, code: 'missing_evidence_quote' });
    }
    if (!String(evidence.snippet_hash || '').trim()) {
      failures.push({ field, code: 'missing_snippet_hash' });
    }
  }
  return failures;
}

function reportDateKey() {
  return nowIso().slice(0, 10);
}

async function persistDriftReport(storage, category, report = {}) {
  const dateKey = reportDateKey();
  await writeJson(storage, [category, '_drift_report.json'], report);
  await writeJson(storage, [category, 'reports', `drift_${dateKey}.json`], report);
}

async function readLatestArtifacts(storage, category, productId, specDb = null) {
  // WHY: SQL is sole source. File reads removed — validation stage will populate specDb.
  const normalized = specDb?.getNormalizedForProduct?.(productId) || null;
  const provenance = specDb?.getProvenanceForProduct?.(category, productId) || {};
  const summary = specDb?.getSummaryForProduct?.(productId) || null;
  return { normalized, provenance, summary };
}

export async function scanAndEnqueueDriftedProducts({
  storage,
  config = {},
  category,
  maxProducts = 250,
  queueOnChange = true,
  specDb = null,
}) {
  const normalizedCategory = normalizeCategory(category || '');
  if (!normalizedCategory) {
    throw new Error('drift scan requires category');
  }
  const keys = await listPublishedCurrentKeys(storage, normalizedCategory);
  const selected = keys.slice(0, Math.max(1, Number.parseInt(String(maxProducts || 250), 10) || 250));
  const seenProducts = new Set();
  const rows = [];
  let seededCount = 0;
  let driftDetectedCount = 0;
  let queuedCount = 0;

  for (const key of selected) {
    const productId = inferProductIdFromPublishedKey(key);
    if (!productId || seenProducts.has(productId)) {
      continue;
    }
    seenProducts.add(productId);
    const current = await storage.readJsonOrNull(key);
    if (!current || typeof current !== 'object') {
      continue;
    }

    const sourceRows = await readSourceHistoryRows(storage, normalizedCategory, productId);
    const snapshot = normalizeSourceHashRows(sourceRows);
    if (Object.keys(snapshot).length === 0) {
      rows.push({
        product_id: productId,
        status: 'skipped_no_hash_snapshot',
        changes: []
      });
      continue;
    }

    const stateParts = [normalizedCategory, 'published', productId, 'drift_state.json'];
    const previousState = await readJson(storage, stateParts);
    const previousSnapshot = (previousState && typeof previousState.source_hashes === 'object')
      ? previousState.source_hashes
      : null;

    if (!previousSnapshot) {
      seededCount += 1;
      await writeJson(storage, stateParts, {
        version: 1,
        category: normalizedCategory,
        product_id: productId,
        seeded_at: nowIso(),
        checked_at: nowIso(),
        source_hashes: snapshot,
        last_changes: []
      });
      rows.push({
        product_id: productId,
        status: 'baseline_seeded',
        changes: []
      });
      continue;
    }

    const changes = diffSourceHashes(previousSnapshot, snapshot);
    if (changes.length === 0) {
      await writeJson(storage, stateParts, {
        ...(previousState || {}),
        checked_at: nowIso(),
        source_hashes: snapshot
      });
      rows.push({
        product_id: productId,
        status: 'no_drift',
        changes: []
      });
      continue;
    }

    driftDetectedCount += 1;
    const status = 'drift_detected';
    await writeJson(storage, stateParts, {
      ...(previousState || {}),
      checked_at: nowIso(),
      source_hashes: snapshot,
      last_changes: changes
    });
    rows.push({
      product_id: productId,
      status,
      changes
    });
  }

  const report = {
    report_type: 'drift_scan',
    category: normalizedCategory,
    generated_at: nowIso(),
    scanned_count: rows.length,
    baseline_seeded_count: seededCount,
    drift_detected_count: driftDetectedCount,
    queued_count: queuedCount,
    queue_on_change: Boolean(queueOnChange),
    products: rows
  };
  await persistDriftReport(storage, normalizedCategory, report);
  return report;
}

export async function reconcileDriftedProduct({
  storage,
  config = {},
  category,
  productId,
  autoRepublish = true,
  publishFn = publishProducts,
  specDb = null,
}) {
  const normalizedCategory = normalizeCategory(category || '');
  const normalizedProductId = String(productId || '').trim();
  if (!normalizedCategory || !normalizedProductId) {
    throw new Error('drift reconcile requires category and productId');
  }

  const published = await readJson(storage, [normalizedCategory, 'published', normalizedProductId, 'current.json']);
  if (!published || typeof published !== 'object') {
    return {
      category: normalizedCategory,
      product_id: normalizedProductId,
      action: 'missing_published_record',
      changed_fields: [],
      evidence_failures: []
    };
  }

  const latest = await readLatestArtifacts(storage, normalizedCategory, normalizedProductId, specDb);
  const latestFields = latest.normalized?.fields || {};
  if (!latest.normalized || typeof latestFields !== 'object') {
    return {
      category: normalizedCategory,
      product_id: normalizedProductId,
      action: 'missing_latest_artifacts',
      changed_fields: [],
      evidence_failures: []
    };
  }

  const changedFields = comparePublishedVsLatest(published.specs || {}, latestFields);
  const evidenceFailures = collectEvidenceFailures(latestFields, latest.provenance || {});
  let action = 'no_change';
  let publishResult = null;

  if (evidenceFailures.length > 0) {
    action = 'quarantined';
  } else if (changedFields.length > 0) {
    action = 'needs_review';
  } else if (autoRepublish) {
    action = 'auto_republished';
    publishResult = await publishFn({
      storage,
      config,
      category: normalizedCategory,
      productIds: [normalizedProductId],
      allApproved: false,
      format: 'all'
    });
  }

  const outcome = {
    category: normalizedCategory,
    product_id: normalizedProductId,
    generated_at: nowIso(),
    auto_republish_enabled: Boolean(autoRepublish),
    action,
    changed_fields: changedFields,
    evidence_failures: evidenceFailures,
    publish_result: publishResult
  };
  await writeJson(storage, [normalizedCategory, 'published', normalizedProductId, 'drift_reconcile.json'], outcome);
  await writeText(
    storage,
    [normalizedCategory, 'published', normalizedProductId, 'drift_reconcile.log'],
    `${JSON.stringify({ ts: nowIso(), action, changed_fields: changedFields.length, evidence_failures: evidenceFailures.length })}\n`
  );
  return outcome;
}
