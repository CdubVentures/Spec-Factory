import fs from 'node:fs/promises';
import path from 'node:path';
import { toInt } from '../../../../shared/valueNormalizers.js';
import { safeJoin, safeReadJson, safeStat } from '../../../../shared/fileHelpers.js';
import { buildArchivedS3CacheRoot } from './archivedRunLocationHelpers.js';

export function createRunListBuilder({
  getIndexLabRoot,
  isRunStillActive,
  readEvents,
  refreshArchivedRunDirIndex,
  materializeArchivedRunLocation,
  readArchivedS3RunMetaOnly = async () => null,
  getSpecDbReady = null,
}) {
  const toToken = (value) => String(value || '').trim();

  const titleCaseWords = (value = '') => {
    const words = toToken(value).split(/\s+/).filter(Boolean);
    return words.map((word) => {
      if (/\d/.test(word)) {
        return word.toUpperCase();
      }
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }).join(' ');
  };

  const humanizeProductId = ({ category = '', productId = '' } = {}) => {
    const categoryToken = toToken(category).toLowerCase();
    let productToken = toToken(productId);
    if (categoryToken && productToken.toLowerCase().startsWith(`${categoryToken}-`)) {
      productToken = productToken.slice(categoryToken.length + 1);
    }
    const humanized = titleCaseWords(productToken.replace(/[_-]+/g, ' '));
    return humanized || titleCaseWords(categoryToken);
  };

  const toRunDisplayToken = (runId = '') => {
    const token = toToken(runId);
    if (!token) return '';
    if (token.length <= 5) return token;
    const segments = token.split(/[^A-Za-z0-9]+/).filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const segment = toToken(segments[i]);
      if (segment.length >= 5) {
        return segment.slice(-5);
      }
    }
    return token.slice(-5);
  };

  const buildPickerLabel = ({ category = '', productId = '', runId = '' } = {}) => {
    const categoryLabel = titleCaseWords(category);
    const productLabel = humanizeProductId({ category, productId });
    const runToken = toRunDisplayToken(runId);
    const lead = [categoryLabel, productLabel].filter(Boolean).join(' • ');
    if (!lead) return runToken;
    return runToken ? `${lead} - ${runToken}` : lead;
  };

  const resolveStorageOrigin = (runLocation) => {
    if (typeof runLocation === 'string') return 'local';
    const type = toToken(runLocation?.type).toLowerCase();
    if (type === 's3') return 's3';
    return 'local';
  };

  const resolveStorageState = (status = '') => {
    const token = toToken(status).toLowerCase();
    return token === 'running' || token === 'starting'
      ? 'live'
      : 'stored';
  };

  const summarizeEvents = (events = []) => {
    const counters = {
      pages_checked: 0,
      fetched_ok: 0,
      fetched_404: 0,
      fetched_blocked: 0,
      fetched_error: 0,
      parse_completed: 0,
      indexed_docs: 0,
      fields_filled: 0
    };
    let productId = '';
    let startedAt = '';
    let endedAt = '';
    for (const row of events) {
      if (!row || typeof row !== 'object') continue;
      const ts = String(row.ts || '').trim();
      if (ts) {
        if (!startedAt) startedAt = ts;
        endedAt = ts;
      }
      if (!productId) {
        productId = String(row.product_id || '').trim();
      }
      const stage = String(row.stage || '').trim();
      const event = String(row.event || '').trim();
      const payload = row.payload && typeof row.payload === 'object'
        ? row.payload
        : {};
      const scope = String(payload.scope || '').trim();
      if (stage === 'fetch' && event === 'fetch_started' && scope === 'url') {
        counters.pages_checked += 1;
      } else if (stage === 'fetch' && event === 'fetch_finished' && scope === 'url') {
        const statusClass = String(payload.status_class || 'error').trim();
        if (statusClass === 'ok') counters.fetched_ok += 1;
        else if (statusClass === '404') counters.fetched_404 += 1;
        else if (statusClass === 'blocked') counters.fetched_blocked += 1;
        else counters.fetched_error += 1;
      } else if (stage === 'parse' && event === 'parse_finished' && scope === 'url') {
        counters.parse_completed += 1;
      } else if (stage === 'index' && event === 'index_finished' && scope === 'url') {
        counters.indexed_docs += 1;
        counters.fields_filled += Number.parseInt(String(payload.count || 0), 10) || 0;
      }
    }
    return { productId, startedAt, endedAt, counters };
  };

  const normalizeStartupMs = (value) => {
    const input = value && typeof value === 'object' ? value : {};
    const parseMetric = (field) => {
      if (!(field in input)) return null;
      const raw = Number.parseInt(String(input[field] ?? ''), 10);
      return Number.isFinite(raw) ? Math.max(0, raw) : null;
    };
    return {
      first_event: parseMetric('first_event'),
      search_started: parseMetric('search_started'),
      fetch_started: parseMetric('fetch_started'),
      parse_started: parseMetric('parse_started'),
      index_started: parseMetric('index_started')
    };
  };

  async function listIndexLabRuns({ limit = 50, category = '' } = {}) {
    const indexLabRoot = getIndexLabRoot();
    const categoryFilter = toToken(category).toLowerCase();
    const runLocations = new Map();
    try {
      const entries = await fs.readdir(indexLabRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const token = String(entry.name || '').trim();
        const runDir = safeJoin(indexLabRoot, token);
        if (!token || !runDir) continue;
        runLocations.set(token, runDir);
      }
    } catch {
      // ignore missing live run root
    }
    const archivedIndex = await refreshArchivedRunDirIndex(false);
    for (const [runId, runLocation] of archivedIndex.entries()) {
      if (!runLocations.has(runId)) {
        runLocations.set(runId, runLocation);
      } else if (!isRunStillActive(runId)) {
        // WHY: Archived entry carries richer storage metadata (type: 's3' or 'local').
        // For completed runs, prefer the archived entry so resolveStorageOrigin
        // returns the correct storage type instead of always 'local' from a string path.
        runLocations.set(runId, runLocation);
      }
    }
    let dirs = [...runLocations.keys()];
    if (dirs.length === 0) return [];
    // WHY: Sort by mtime of run.json (newest first) so recent live runs
    // aren't cut off by scanLimit when the archived index is large.
    const mtimeCache = new Map();
    await Promise.all(dirs.map(async (dir) => {
      const loc = runLocations.get(dir);
      const runDir = typeof loc === 'string' ? loc : '';
      if (!runDir) { mtimeCache.set(dir, 0); return; }
      const st = await safeStat(path.join(runDir, 'run.json'));
      mtimeCache.set(dir, st?.mtimeMs ?? 0);
    }));
    dirs.sort((a, b) => (mtimeCache.get(b) ?? 0) - (mtimeCache.get(a) ?? 0));
    const scanLimit = Math.max(Math.max(1, toInt(limit, 50)) * 2, 120);
    if (!categoryFilter) {
      dirs = dirs.slice(0, scanLimit);
    }

    // WHY: SQL fast path — one query replaces N async safeReadJson() calls.
    // Only when category is known (specDb is per-category).
    let sqlRunMap = new Map();
    if (categoryFilter && typeof getSpecDbReady === 'function') {
      try {
        const specDb = await getSpecDbReady(categoryFilter);
        if (specDb) {
          const sqlRows = specDb.getRunsByCategory(categoryFilter, scanLimit);
          for (const row of sqlRows) {
            if (row.run_id) sqlRunMap.set(row.run_id, row);
          }
        }
      } catch { /* best-effort: fall back to file I/O */ }
    }

    // WHY: Process runs concurrently instead of sequentially.
    // Each run requires at least 1 async read (safeReadJson for run.json).
    // With 120 runs that's 120 serial round-trips — parallelizing cuts
    // wall-clock time dramatically.
    async function processRun(dir) {
      const runLocation = runLocations.get(dir);
      const storageOrigin = resolveStorageOrigin(runLocation);
      const isS3Location = runLocation && typeof runLocation === 'object' && runLocation.type === 's3';

      // S3 archived run: try metadata-only read first.
      if (isS3Location) {
        const s3Meta = await readArchivedS3RunMetaOnly(runLocation, dir);
        const s3Status = String(s3Meta?.status || '').trim().toLowerCase();
        const s3HasCounters = s3Meta?.counters && typeof s3Meta.counters === 'object';
        const s3HasArtifactReadiness = Boolean(
          s3Meta?.artifacts?.has_needset
          || s3Meta?.artifacts?.has_search_profile
          || s3Meta?.needset
          || s3Meta?.search_profile
        );
        if (s3Meta && s3HasCounters && s3Status !== 'running' && s3HasArtifactReadiness) {
          const rowCategory = toToken(s3Meta.category);
          if (categoryFilter && rowCategory.toLowerCase() !== categoryFilter) return null;
          const rowRunId = toToken(s3Meta.run_id || dir);
          const rowProductId = toToken(s3Meta.product_id);
          const resolvedStatus = String(s3Meta.status || 'unknown').trim();
          return {
            run_id: rowRunId,
            category: rowCategory,
            product_id: rowProductId,
            status: resolvedStatus,
            started_at: String(s3Meta.started_at || '').trim(),
            ended_at: String(s3Meta.ended_at || '').trim(),
            identity_fingerprint: String(s3Meta.identity_fingerprint || '').trim(),
            identity_lock_status: String(s3Meta.identity_lock_status || '').trim(),
            dedupe_mode: String(s3Meta.dedupe_mode || '').trim(),
            phase_cursor: String(s3Meta.phase_cursor || '').trim(),
            startup_ms: normalizeStartupMs(s3Meta.startup_ms),
            events_path: '',
            run_dir: path.join(buildArchivedS3CacheRoot(rowRunId), 'indexlab'),
            storage_origin: storageOrigin,
            storage_state: resolveStorageState(resolvedStatus),
            picker_label: buildPickerLabel({ category: rowCategory, productId: rowProductId, runId: rowRunId }),
            has_needset: Boolean(s3Meta.artifacts?.has_needset || s3Meta.needset),
            has_search_profile: Boolean(s3Meta.artifacts?.has_search_profile || s3Meta.search_profile),
            counters: s3Meta.counters,
          };
        }
        // Metadata insufficient — fall through to full materialization.
      }

      // SQL fast path for runs with complete metadata in the runs table
      const sqlRow = sqlRunMap.get(dir);
      if (sqlRow && sqlRow.counters && typeof sqlRow.counters === 'object'
          && Object.keys(sqlRow.counters).length > 0) {
        const rowCategory = toToken(sqlRow.category);
        if (categoryFilter && rowCategory.toLowerCase() !== categoryFilter) return null;
        const rowRunId = toToken(sqlRow.run_id || dir);
        const rowProductId = toToken(sqlRow.product_id);
        const rawStatus = String(sqlRow.status || 'unknown').trim();
        const resolvedStatus = (
          rawStatus.toLowerCase() === 'running' && !isRunStillActive(rowRunId)
        ) ? 'completed' : rawStatus;
        return {
          run_id: rowRunId,
          category: rowCategory,
          product_id: rowProductId,
          status: resolvedStatus,
          started_at: String(sqlRow.started_at || '').trim(),
          ended_at: String(sqlRow.ended_at || '').trim(),
          identity_fingerprint: String(sqlRow.identity_fingerprint || '').trim(),
          identity_lock_status: String(sqlRow.identity_lock_status || '').trim(),
          dedupe_mode: String(sqlRow.dedupe_mode || '').trim(),
          phase_cursor: String(sqlRow.phase_cursor || '').trim(),
          startup_ms: normalizeStartupMs(sqlRow.startup_ms || {}),
          events_path: '',
          run_dir: safeJoin(getIndexLabRoot(), rowRunId) || '',
          storage_origin: storageOrigin,
          storage_state: resolveStorageState(resolvedStatus),
          picker_label: buildPickerLabel({ category: rowCategory, productId: rowProductId, runId: rowRunId }),
          has_needset: Boolean(sqlRow.needset_summary || sqlRow.has_needset),
          has_search_profile: Boolean(sqlRow.search_profile_summary || sqlRow.has_search_profile),
          counters: sqlRow.counters,
        };
      }

      const runDir = typeof runLocation === 'string'
        ? String(runLocation || '').trim()
        : await materializeArchivedRunLocation(runLocation, dir);
      if (!runDir) return null;
      const runMetaPath = path.join(runDir, 'run.json');
      const runEventsPath = path.join(runDir, 'run_events.ndjson');
      const runNeedSetPath = path.join(runDir, 'needset.json');
      const runSearchProfilePath = path.join(runDir, 'search_profile.json');
      const meta = await safeReadJson(runMetaPath);
      const rawStatus = String(meta?.status || 'unknown').trim();
      const resolvedStatus = (
        rawStatus.toLowerCase() === 'running' && !isRunStillActive(String(meta?.run_id || dir).trim())
      ) ? 'completed' : rawStatus;
      const hasMetaCounters = meta?.counters && typeof meta.counters === 'object';
      const needsEvents = rawStatus.toLowerCase() === 'running' || !hasMetaCounters;
      const needSetStat = await safeStat(runNeedSetPath);
      const searchProfileStat = await safeStat(runSearchProfilePath);
      const hasNeedSet = Boolean(
        meta?.artifacts?.has_needset
        || meta?.needset
        || needSetStat
      );
      const hasSearchProfile = Boolean(
        meta?.artifacts?.has_search_profile
        || meta?.search_profile
        || searchProfileStat
      );

      // Skip expensive event reading + stat calls when run.json
      // already carries counters and the run is not active.
      if (!needsEvents) {
        const rowCategory = toToken(meta?.category);
        if (categoryFilter && rowCategory.toLowerCase() !== categoryFilter) return null;
        const rowRunId = toToken(meta?.run_id || dir);
        const rowProductId = toToken(meta?.product_id);
        return {
          run_id: rowRunId,
          category: rowCategory,
          product_id: rowProductId,
          status: String(resolvedStatus || 'unknown').trim(),
          started_at: String(meta?.started_at || '').trim(),
          ended_at: String(meta?.ended_at || '').trim(),
          identity_fingerprint: String(meta?.identity_fingerprint || '').trim(),
          identity_lock_status: String(meta?.identity_lock_status || '').trim(),
          dedupe_mode: String(meta?.dedupe_mode || '').trim(),
          phase_cursor: String(meta?.phase_cursor || '').trim(),
          startup_ms: normalizeStartupMs(meta?.startup_ms),
          events_path: runEventsPath,
          run_dir: runDir,
          storage_origin: storageOrigin,
          storage_state: resolveStorageState(resolvedStatus),
          picker_label: buildPickerLabel({ category: rowCategory, productId: rowProductId, runId: rowRunId }),
          has_needset: hasNeedSet,
          has_search_profile: hasSearchProfile,
          counters: meta.counters,
        };
      }

      const stat = await safeStat(runMetaPath) || await safeStat(runEventsPath);
      const rowCategory = toToken(meta?.category);
      const eventRows = await readEvents(meta?.run_id || dir, 6000, { category: rowCategory });
      const eventSummary = summarizeEvents(eventRows);
      if (categoryFilter && rowCategory.toLowerCase() !== categoryFilter) return null;
      const rowRunId = toToken(meta?.run_id || dir);
      const rowProductId = toToken(meta?.product_id || eventSummary.productId);
      const useEventDerivedCounters = rawStatus.toLowerCase() === 'running' && resolvedStatus !== rawStatus;
      return {
        run_id: rowRunId,
        category: rowCategory,
        product_id: rowProductId,
        status: String(resolvedStatus || 'unknown').trim(),
        started_at: String(meta?.started_at || eventSummary.startedAt || stat?.mtime?.toISOString?.() || '').trim(),
        ended_at: String(meta?.ended_at || (resolvedStatus !== 'running' ? eventSummary.endedAt : '') || '').trim(),
        identity_fingerprint: String(meta?.identity_fingerprint || '').trim(),
        identity_lock_status: String(meta?.identity_lock_status || '').trim(),
        dedupe_mode: String(meta?.dedupe_mode || '').trim(),
        phase_cursor: String(meta?.phase_cursor || '').trim(),
        startup_ms: normalizeStartupMs(meta?.startup_ms),
        events_path: runEventsPath,
        run_dir: runDir,
        storage_origin: storageOrigin,
        storage_state: resolveStorageState(resolvedStatus),
        picker_label: buildPickerLabel({
          category: rowCategory,
          productId: rowProductId,
          runId: rowRunId,
        }),
        has_needset: hasNeedSet,
        has_search_profile: hasSearchProfile,
        counters: (!useEventDerivedCounters && hasMetaCounters) ? meta.counters : eventSummary.counters,
      };
    }

    const settled = await Promise.allSettled(dirs.map((dir) => processRun(dir)));
    const rows = settled
      .filter((r) => r.status === 'fulfilled' && r.value != null)
      .map((r) => r.value);

    rows.sort((a, b) => {
      const aMs = Date.parse(String(a.started_at || ''));
      const bMs = Date.parse(String(b.started_at || ''));
      return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
    });
    return rows.slice(0, Math.max(1, toInt(limit, 50)));
  }

  return { listIndexLabRuns };
}
