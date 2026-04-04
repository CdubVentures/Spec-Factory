import fs from 'node:fs/promises';
import path from 'node:path';
import { toInt } from '../../../../shared/valueNormalizers.js';
import { safeJoin, safeReadJson, safeStat } from '../../../../shared/fileHelpers.js';

export function createRunListBuilder({
  getIndexLabRoot,
  isRunStillActive,
  readEvents,
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

  const buildPickerLabel = ({ category = '', productId = '', brand = '', base_model = '', model = '', variant = '', runId = '' } = {}) => {
    const categoryLabel = titleCaseWords(category);
    // WHY: Prefer brand+model+variant from catalog/identity for display. Hex IDs are opaque.
    const productLabel = (brand || model)
      ? [brand, base_model || model, variant].filter(Boolean).join(' ')
      : humanizeProductId({ category, productId });
    const runToken = toRunDisplayToken(runId);
    const lead = [categoryLabel, productLabel].filter(Boolean).join(' • ');
    if (!lead) return runToken;
    return runToken ? `${lead} - ${runToken}` : lead;
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

  // WHY: Walks run subdirectories to compute artifact size + type breakdown.
  // Called once per run per list request (cached by React Query ~15s).
  async function computeRunStorageMetrics(runDir) {
    const breakdown = [];
    let total = 0;
    for (const subdir of ['html', 'screenshots', 'video']) {
      try {
        const files = await fs.readdir(path.join(runDir, subdir));
        const stats = await Promise.all(
          files.map((f) => safeStat(path.join(runDir, subdir, f))),
        );
        let subtotal = 0;
        let count = 0;
        for (const st of stats) {
          if (st) { subtotal += st.size; count += 1; }
        }
        if (count > 0) {
          breakdown.push({ type: subdir, count, size_bytes: subtotal, path: subdir });
          total += subtotal;
        }
      } catch { /* subdir doesn't exist */ }
    }
    const rjStat = await safeStat(path.join(runDir, 'run.json'));
    if (rjStat) total += rjStat.size;
    const rsStat = await safeStat(path.join(runDir, 'run-summary.json'));
    if (rsStat) total += rsStat.size;
    return {
      total_size_bytes: total,
      artifact_breakdown: breakdown,
      computed_at: new Date().toISOString(),
    };
  }

  async function listIndexLabRuns({ limit = 50, category = '', catalogProducts = null } = {}) {
    // WHY: catalogProducts is an optional Map<productId, {brand, model, variant}> for label resolution.
    // With hex-based product IDs, parsing the ID as a slug produces garbage labels.
    const resolveBrandModel = (pid) => {
      if (!catalogProducts) return {};
      const entry = catalogProducts instanceof Map ? catalogProducts.get(pid) : catalogProducts[pid];
      if (!entry) return {};
      return { brand: String(entry.brand || '').trim(), base_model: String(entry.base_model || '').trim(), model: String(entry.model || '').trim(), variant: String(entry.variant || '').trim() };
    };
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
    let dirs = [...runLocations.keys()];
    if (dirs.length === 0) return [];
    // WHY: Sort by mtime of run directory (newest first) so recent live runs
    // aren't cut off by scanLimit when the archived index is large.
    // Wave 5.5 killed run.json — use run-summary.json or the directory itself.
    const mtimeCache = new Map();
    await Promise.all(dirs.map(async (dir) => {
      const loc = runLocations.get(dir);
      const runDir = typeof loc === 'string' ? loc : '';
      if (!runDir) { mtimeCache.set(dir, 0); return; }
      const st = await safeStat(path.join(runDir, 'run-summary.json'))
        || await safeStat(path.join(runDir, 'run.json'))
        || await safeStat(runDir);
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
    let specDb = null;
    if (categoryFilter && typeof getSpecDbReady === 'function') {
      try {
        specDb = await getSpecDbReady(categoryFilter);
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
      // WHY: SQL is the sole source of run metadata. No file fallback.
      const sqlRow = sqlRunMap.get(dir);
      if (sqlRow) {
        const rowCategory = toToken(sqlRow.category);
        if (categoryFilter && rowCategory.toLowerCase() !== categoryFilter) return null;
        const rowRunId = toToken(sqlRow.run_id || dir);
        const rowProductId = toToken(sqlRow.product_id);
        const runDir = safeJoin(getIndexLabRoot(), rowRunId) || '';
        // WHY: products SQL table is the SSOT for brand/model. Catalog JSON is seed-only.
        let brand = '';
        let base_model = '';
        let model = '';
        let variant = '';
        if (specDb) {
          try {
            const product = specDb.getProduct(rowProductId);
            if (product) {
              brand = toToken(product.brand);
              base_model = toToken(product.base_model);
              model = toToken(product.model);
              variant = toToken(product.variant);
            }
          } catch { /* best-effort */ }
        }
        if (!brand) {
          const resolved = resolveBrandModel(rowProductId);
          brand = resolved.brand || '';
          base_model = resolved.base_model || '';
          model = resolved.model || '';
          variant = resolved.variant || '';
        }
        // WHY: Tier 3 — runs for unregistered products (not in products table or catalog).
        // Read identity from run.json as last resort.
        if (!brand && runDir) {
          const fileMeta = await safeReadJson(path.join(runDir, 'run.json'));
          const identity = fileMeta?.identity && typeof fileMeta.identity === 'object' ? fileMeta.identity : {};
          const idBrand = toToken(identity.brand);
          if (idBrand && idBrand.toLowerCase() !== 'unknown') {
            brand = idBrand;
            base_model = toToken(identity.base_model) || '';
            model = toToken(identity.model) || '';
            variant = toToken(identity.variant) || '';
          }
        }
        const metrics = runDir ? await computeRunStorageMetrics(runDir) : { total_size_bytes: 0, artifact_breakdown: [], computed_at: '' };
        const rawStatus = String(sqlRow.status || 'unknown').trim();
        const resolvedStatus = (
          rawStatus.toLowerCase() === 'running' && !isRunStillActive(rowRunId)
        ) ? 'completed' : rawStatus;
        return {
          run_id: rowRunId,
          category: rowCategory,
          product_id: rowProductId,
          brand,
          base_model,
          model,
          variant,
          status: resolvedStatus,
          started_at: String(sqlRow.started_at || '').trim(),
          ended_at: String(sqlRow.ended_at || '').trim(),
          identity_fingerprint: String(sqlRow.identity_fingerprint || '').trim(),
          identity_lock_status: String(sqlRow.identity_lock_status || '').trim(),
          dedupe_mode: String(sqlRow.dedupe_mode || '').trim(),
          stage_cursor: String(sqlRow.stage_cursor || '').trim(),
          startup_ms: normalizeStartupMs(sqlRow.startup_ms || {}),
          events_path: '',
          run_dir: runDir,
          storage_origin: 'local',
          storage_state: resolveStorageState(resolvedStatus),
          size_bytes: metrics.total_size_bytes,
          storage_metrics: metrics,
          picker_label: buildPickerLabel({ category: rowCategory, productId: rowProductId, brand, base_model, model, variant, runId: rowRunId }),
          has_needset: Boolean(sqlRow.needset_summary || sqlRow.has_needset),
          has_search_profile: Boolean(sqlRow.search_profile_summary || sqlRow.has_search_profile),
          counters: sqlRow.counters,
        };
      }

      // WHY: File fallback — when no category filter is provided, SQL lookup
      // never runs (specDb is per-category). Read run.json or run-summary.json
      // from disk so the storage panel can discover all runs across categories.
      const runDir = runLocations.get(dir);
      if (!runDir) return null;
      const meta = await safeReadJson(path.join(runDir, 'run-summary.json'))
        || await safeReadJson(path.join(runDir, 'run.json'));
      if (!meta) return null;
      const run = meta.run && typeof meta.run === 'object' ? meta.run : meta;
      const telemetry = meta.telemetry && typeof meta.telemetry === 'object' ? meta.telemetry : {};
      const teleMeta = telemetry.meta && typeof telemetry.meta === 'object' ? telemetry.meta : {};
      const fileRunId = toToken(run.run_id || dir);
      const fileCategory = toToken(run.category || teleMeta.category);
      const fileProductId = toToken(run.product_id || teleMeta.product_id);
      const fileStatus = toToken(run.status || teleMeta.status || 'unknown');
      const resolvedStatus = (
        fileStatus.toLowerCase() === 'running' && !isRunStillActive(fileRunId)
      ) ? 'completed' : fileStatus;
      const fileCounters = run.counters || teleMeta.counters || {};
      // WHY: identity lives at meta.identity (sibling of run), not run.identity.
      // run.json schema: { run: { run_id, ... }, identity: { brand, model, ... } }
      const identity = meta.identity && typeof meta.identity === 'object' ? meta.identity : {};
      const idBrand = toToken(identity.brand);
      const fileBrand = (idBrand && idBrand.toLowerCase() !== 'unknown') ? idBrand : '';
      const idBaseModel = toToken(identity.base_model);
      const fileBaseModel = fileBrand ? idBaseModel : '';
      const idModel = toToken(identity.model);
      const fileModel = fileBrand ? idModel : '';
      const fileVariant = fileBrand ? toToken(identity.variant) : '';
      const fileMetrics = await computeRunStorageMetrics(runDir);
      return {
        run_id: fileRunId,
        category: fileCategory,
        product_id: fileProductId,
        brand: fileBrand,
        base_model: fileBaseModel,
        model: fileModel,
        variant: fileVariant,
        status: resolvedStatus,
        started_at: toToken(run.started_at || teleMeta.started_at),
        ended_at: toToken(run.ended_at || teleMeta.ended_at),
        identity_fingerprint: toToken(run.identity_fingerprint || teleMeta.identity_fingerprint),
        identity_lock_status: toToken(run.identity_lock_status || teleMeta.identity_lock_status),
        dedupe_mode: toToken(run.dedupe_mode || teleMeta.dedupe_mode),
        stage_cursor: toToken(run.stage_cursor || teleMeta.stage_cursor),
        startup_ms: normalizeStartupMs(teleMeta.startup_ms || {}),
        events_path: '',
        run_dir: runDir,
        storage_origin: 'local',
        storage_state: resolveStorageState(resolvedStatus),
        size_bytes: fileMetrics.total_size_bytes,
        storage_metrics: fileMetrics,
        picker_label: buildPickerLabel({ category: fileCategory, productId: fileProductId, brand: fileBrand, base_model: fileBaseModel, model: fileModel, variant: fileVariant, runId: fileRunId }),
        has_needset: false,
        has_search_profile: false,
        counters: fileCounters,
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
