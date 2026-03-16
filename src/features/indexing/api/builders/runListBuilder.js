import fs from 'node:fs/promises';
import path from 'node:path';
import { toInt } from '../../../../api/helpers/valueNormalizers.js';
import { safeJoin } from '../../../../api/helpers/httpPrimitives.js';
import { safeReadJson, safeStat } from '../../../../api/helpers/fileHelpers.js';

export function createRunListBuilder({
  getIndexLabRoot,
  isRunStillActive,
  readEvents,
  refreshArchivedRunDirIndex,
  materializeArchivedRunLocation,
}) {
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

  async function listIndexLabRuns({ limit = 50 } = {}) {
    const indexLabRoot = getIndexLabRoot();
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
      }
    }
    let dirs = [...runLocations.keys()];
    if (dirs.length === 0) return [];
    dirs.sort((a, b) => String(b).localeCompare(String(a)));
    const scanLimit = Math.max(Math.max(1, toInt(limit, 50)) * 2, 120);
    dirs = dirs.slice(0, scanLimit);

    const rows = [];
    for (const dir of dirs) {
      const runLocation = runLocations.get(dir);
      const runDir = typeof runLocation === 'string'
        ? String(runLocation || '').trim()
        : await materializeArchivedRunLocation(runLocation, dir);
      if (!runDir) continue;
      const runMetaPath = path.join(runDir, 'run.json');
      const runEventsPath = path.join(runDir, 'run_events.ndjson');
      const runNeedSetPath = path.join(runDir, 'needset.json');
      const runSearchProfilePath = path.join(runDir, 'search_profile.json');
      const meta = await safeReadJson(runMetaPath);
      const stat = await safeStat(runMetaPath) || await safeStat(runEventsPath);
      const needSetStat = await safeStat(runNeedSetPath);
      const searchProfileStat = await safeStat(runSearchProfilePath);
      const eventRows = await readEvents(dir, 6000);
      const eventSummary = summarizeEvents(eventRows);
      const rawStatus = String(meta?.status || 'unknown').trim();
      const resolvedStatus = (
        rawStatus.toLowerCase() === 'running' && !isRunStillActive(String(meta?.run_id || dir).trim())
      ) ? 'completed' : rawStatus;
      const useEventDerivedCounters = rawStatus.toLowerCase() === 'running' && resolvedStatus !== rawStatus;
      const hasMetaCounters = meta?.counters && typeof meta.counters === 'object';
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
      rows.push({
        run_id: String(meta?.run_id || dir).trim(),
        category: String(meta?.category || '').trim(),
        product_id: String(meta?.product_id || eventSummary.productId || '').trim(),
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
        has_needset: hasNeedSet,
        has_search_profile: hasSearchProfile,
        counters: (!useEventDerivedCounters && hasMetaCounters) ? meta.counters : eventSummary.counters
      });
    }

    rows.sort((a, b) => {
      const aMs = Date.parse(String(a.started_at || ''));
      const bMs = Date.parse(String(b.started_at || ''));
      return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
    });
    return rows.slice(0, Math.max(1, toInt(limit, 50)));
  }

  return { listIndexLabRuns };
}
