import { createStorageManagerHandler } from './storageManagerRoutes.js';
import { createDeletionStore } from '../../../db/stores/deletionStore.js';
import { defaultIndexLabRoot, defaultLocalOutputRoot, defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';
import { computeQueryIndexSummary, computeUrlIndexSummary } from '../pipeline/shared/createQueryIndex.js';
import { computePromptIndexSummary } from '../pipeline/shared/createPromptIndex.js';
import { computeKnobSnapshots } from '../telemetry/knobTelemetryCapture.js';
import { computeProductHistoryMetrics } from '../domain/computeProductHistoryMetrics.js';
import { extractRunFunnelSummary, extractDomainBreakdown, extractFetchErrors, extractExtractionSummary } from '../domain/extractRunFunnelSummary.js';

export function registerIndexlabRoutes(ctx) {
  const {
    jsonRes,
    toInt,
    toFloat,
    safeJoin,
    safeReadJson,
    path,
    INDEXLAB_ROOT,
    processStatus,
    getIndexLabRoot: _getIndexLabRoot,
    getSpecDb,
    readIndexLabRunMeta,
    resolveIndexLabRunDirectory,
    readRunSummaryEvents,
    readIndexLabRunNeedSet,
    readIndexLabRunSearchProfile,
    readIndexLabRunSerpExplorer,
    readIndexLabRunAutomationQueue,
    listIndexLabRuns,
    buildRoundSummaryFromEvents,
    buildSearchHints,
    buildAnchorsSuggestions,
    buildKnownValuesSuggestions,
    evaluateAllSections,
    buildEvidenceReport,
    buildEffectiveSettingsSnapshot,
    buildScreenshotManifestFromEvents,
    // Cross-run analytics (Phase 4B)
    computeCompoundCurve,
    aggregateCrossRunMetrics,
    aggregateHostHealth,
    appDb,
  } = ctx;

  // WHY: Dynamic resolution so run discovery tracks live storage settings.
  const currentIndexLabRoot = () =>
    (typeof _getIndexLabRoot === 'function' ? _getIndexLabRoot() : '') || INDEXLAB_ROOT;

  function isRunStillActive(runId = '') {
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

  function resolveInactiveRunMeta(meta = {}, events = [], runId = '') {
    const rawStatus = String(meta?.status || '').trim().toLowerCase();
    if (rawStatus !== 'running') return meta;
    if (isRunStillActive(runId)) return meta;

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

  // WHY: Storage manager handler — delegates /storage/* routes to a dedicated handler.
  const storageGuardOk = Boolean(ctx.readJsonBody);
  if (!storageGuardOk) {
    process.stderr.write('[indexlab-routes] Storage manager routes disabled: readJsonBody=' +
      typeof ctx.readJsonBody + '\n');
  }

  // WHY: Build deletion store + fsRoots for full cascade deletes.
  // getSpecDb may return null on boot — deletionStore is lazily resolved per-request.
  const storageFsRoots = {
    runs: currentIndexLabRoot(),
    output: ctx.OUTPUT_ROOT || defaultLocalOutputRoot(),
    products: defaultProductRoot(),
  };
  function resolveDeletionStore(category) {
    const cat = String(category || '').trim();
    if (!cat) return null;
    const specDb = typeof getSpecDb === 'function' ? getSpecDb(cat) : null;
    if (!specDb?.db) return null;
    return createDeletionStore({ db: specDb.db, category: specDb.category });
  }

  const basename = (value) => String(value || '').split(/[\\/]/).filter(Boolean).pop() || '';
  const sumBytes = (rows) => rows.reduce((total, row) => total + (Number(row?.size_bytes) || 0), 0);

  function groupArtifactRows(rows = []) {
    const byContentHash = new Map();
    const byUrl = new Map();
    for (const row of rows) {
      const contentHash = String(row?.content_hash || '').trim();
      const url = String(row?.source_url || '').trim();
      if (contentHash) byContentHash.set(contentHash, [...(byContentHash.get(contentHash) || []), row]);
      if (url) byUrl.set(url, [...(byUrl.get(url) || []), row]);
    }
    return { byContentHash, byUrl };
  }

  function artifactRowsForSource(groups, source) {
    const contentHash = String(source?.content_hash || '').trim();
    const url = String(source?.source_url || '').trim();
    return contentHash
      ? (groups.byContentHash.get(contentHash) || [])
      : (groups.byUrl.get(url) || []);
  }

  function normalizeSourcesPage(sourcesPage = {}) {
    return {
      limit: Math.max(1, Number(sourcesPage.limit) || 100),
      offset: Math.max(0, Number(sourcesPage.offset) || 0),
    };
  }

  function readPagedSources({ specDb, runId, page }) {
    if (typeof specDb.countRunSourcesByRunId === 'function') {
      const total = Number(specDb.countRunSourcesByRunId(runId)) || 0;
      if (total > 0 && typeof specDb.getRunSourcesPageByRunId === 'function') {
        return {
          sources: specDb.getRunSourcesPageByRunId(runId, page) || [],
          total,
        };
      }
    }

    if (typeof specDb.countCrawlSourcesByRunId === 'function') {
      const total = Number(specDb.countCrawlSourcesByRunId(runId)) || 0;
      if (total > 0 && typeof specDb.getCrawlSourcesPageByRunId === 'function') {
        return {
          sources: specDb.getCrawlSourcesPageByRunId(runId, page) || [],
          total,
        };
      }
    }

    let rows = typeof specDb.getRunSourcesByRunId === 'function'
      ? specDb.getRunSourcesByRunId(runId) || []
      : specDb.getCrawlSourcesByRunId?.(runId) || [];
    if (rows.length === 0) rows = specDb.getCrawlSourcesByRunId?.(runId) || [];
    return {
      sources: rows.slice(page.offset, page.offset + page.limit),
      total: rows.length,
    };
  }

  function isInsideDirectory(filePath, directory) {
    const relative = path.relative(directory, filePath);
    return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  }

  function htmlCandidatePaths({ runId, source }) {
    const rawPath = String(source?.file_path || '').trim();
    if (!rawPath) return [];
    const filename = path.basename(rawPath);
    const roots = [
      currentIndexLabRoot(),
      defaultIndexLabRoot(),
    ].map((root) => String(root || '').trim()).filter(Boolean);
    const candidates = [];
    if (path.isAbsolute(rawPath)) candidates.push(rawPath);
    for (const root of roots) {
      candidates.push(path.join(root, runId, 'html', filename));
    }
    return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
  }

  async function readStorageRunSourceHtmlArtifact({ runId, meta, contentHash }) {
    const category = String(meta?.category || '').trim();
    if (!category || typeof getSpecDb !== 'function') return null;
    const specDb = getSpecDb(category);
    if (!specDb) return null;
    const source = specDb.getRunSourceByRunIdAndHash?.(runId, contentHash)
      || specDb.getCrawlSourceByRunIdAndHash?.(runId, contentHash);
    if (!source) return null;

    const fs = await import('node:fs/promises');
    const allowedDirs = [
      currentIndexLabRoot(),
      defaultIndexLabRoot(),
    ].map((root) => String(root || '').trim())
      .filter(Boolean)
      .map((root) => path.resolve(path.join(root, runId, 'html')));

    for (const candidate of htmlCandidatePaths({ runId, source })) {
      if (!allowedDirs.some((dir) => isInsideDirectory(candidate, dir))) continue;
      try {
        const content = await fs.readFile(candidate);
        return {
          run_id: runId,
          content_hash: contentHash,
          filename: path.basename(candidate),
          content,
        };
      } catch {
        // Try the next safe candidate.
      }
    }
    return null;
  }

  async function readStorageRunDetailState({ runId, meta, sourcesPage }) {
    const category = String(meta?.category || '').trim();
    if (!category || typeof getSpecDb !== 'function') return null;
    const specDb = getSpecDb(category);
    if (!specDb) return null;
    const page = normalizeSourcesPage(sourcesPage);

    const sourcePage = readPagedSources({ specDb, runId, page });
    const sources = sourcePage.sources;
    const screenshots = typeof specDb.getScreenshotsByRunId === 'function'
      ? specDb.getScreenshotsByRunId(runId) || []
      : [];
    const videos = typeof specDb.getVideosByRunId === 'function'
      ? specDb.getVideosByRunId(runId) || []
      : [];
    if (sources.length === 0 && screenshots.length === 0 && videos.length === 0) return null;

    const screenshotGroups = groupArtifactRows(screenshots);
    const videoGroups = groupArtifactRows(videos);
    const detailSources = sources.map((source) => {
      const sourceScreenshots = artifactRowsForSource(screenshotGroups, source);
      const sourceVideos = artifactRowsForSource(videoGroups, source);
      const video = sourceVideos[0] || null;
      const htmlSize = Number(source.size_bytes) || 0;
      const screenshotSize = sumBytes(sourceScreenshots);
      const videoSize = sumBytes(sourceVideos);
      return {
        url: source.source_url || '',
        final_url: source.final_url || '',
        host: source.host || '',
        content_hash: source.content_hash || '',
        status: Number(source.http_status) || 0,
        doc_kind: source.doc_kind || 'other',
        source_tier: Number(source.source_tier) || 5,
        content_type: source.content_type || '',
        html_file: basename(source.file_path),
        html_path: source.file_path || '',
        html_size: htmlSize,
        screenshot_count: sourceScreenshots.length,
        screenshot_size: screenshotSize,
        video_file: basename(video?.file_path),
        video_size: videoSize,
        worker_id: video?.worker_id || '',
        total_size: htmlSize + screenshotSize + videoSize,
        crawled_at: source.crawled_at || '',
      };
    });

    return {
      identity: {
        product_id: meta.product_id || '',
        category,
        identity_fingerprint: meta.identity_fingerprint || '',
        identity_lock_status: meta.identity_lock_status || '',
        dedupe_mode: meta.dedupe_mode || '',
      },
      sources: detailSources,
      sources_page: {
        limit: page.limit,
        offset: page.offset,
        total: sourcePage.total,
        has_more: page.offset + detailSources.length < sourcePage.total,
      },
    };
  }

  const handleStorageManagerRoutes = storageGuardOk
    ? createStorageManagerHandler({
      jsonRes,
      readJsonBody: ctx.readJsonBody,
      toInt,
      broadcastWs: ctx.broadcastWs || (() => {}),
      listIndexLabRuns,
      resolveIndexLabRunDirectory,
      indexLabRoot: currentIndexLabRoot(),
      outputRoot: ctx.OUTPUT_ROOT || '',
      storage: ctx.storage || null,
      isRunStillActive,
      readRunMeta: readIndexLabRunMeta,
      readRunDetailState: readStorageRunDetailState,
      readRunSourceHtmlArtifact: readStorageRunSourceHtmlArtifact,
      deleteArchivedRun: async (runId) => {
        const fs = await import('node:fs/promises');
        const runDir = safeJoin(currentIndexLabRoot(), runId);
        if (runDir) {
          await fs.default.rm(runDir, { recursive: true, force: true });
        }
        return { ok: true, run_id: runId, deleted_from: 'local' };
      },
      resolveDeletionStore,
      fsRoots: storageFsRoots,
    })
    : null;

  return async function handleIndexlabRoutes(parts, params, method, req, res) {
    // Storage manager routes (/storage/*)
    if (parts[0] === 'storage' && parts[1] !== 'settings' && handleStorageManagerRoutes) {
      const result = await handleStorageManagerRoutes(parts, params, method, req, res);
      if (result !== false) return result;
    }

    // IndexLab runs + event replay
    if (parts[0] === 'indexlab' && parts[1] === 'runs' && method === 'GET') {
      const limit = Math.max(1, toInt(params.get('limit'), 50));
      const category = String(params.get('category') || '').trim();
      const rows = await listIndexLabRuns({ limit, category });
      return jsonRes(res, 200, {
        root: currentIndexLabRoot(),
        runs: rows
      });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && !parts[3] && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const directRunDir = safeJoin(currentIndexLabRoot(), runId);
      if (!directRunDir) return jsonRes(res, 400, { error: 'invalid_run_id' });
      const runDir = typeof resolveIndexLabRunDirectory === 'function'
        ? (await resolveIndexLabRunDirectory(runId).catch(() => '')) || directRunDir
        : directRunDir;
      const meta = await readIndexLabRunMeta(runId).catch(() => null);
      if (!meta) return jsonRes(res, 404, { error: 'run_not_found', run_id: runId });
      const events = await readRunSummaryEvents(runId, 2000, { category: meta?.category });
      return jsonRes(res, 200, resolveInactiveRunMeta(meta, events, runId));
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'events' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const limit = Math.max(1, toInt(params.get('limit'), 2000));
      const evtMeta = typeof readIndexLabRunMeta === 'function' ? await readIndexLabRunMeta(runId).catch(() => null) : null;
      const rows = await readRunSummaryEvents(runId, limit, { category: evtMeta?.category });
      return jsonRes(res, 200, {
        run_id: runId,
        count: rows.length,
        events: rows
      });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'needset' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const needset = await readIndexLabRunNeedSet(runId);
      if (!needset) {
        return jsonRes(res, 404, { error: 'needset_not_found', run_id: runId });
      }
      return jsonRes(res, 200, {
        run_id: runId,
        ...needset
      });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'search-profile' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const searchProfile = await readIndexLabRunSearchProfile(runId);
      if (!searchProfile) {
        return jsonRes(res, 404, { error: 'search_profile_not_found', run_id: runId });
      }
      return jsonRes(res, 200, {
        run_id: runId,
        ...searchProfile
      });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'serp' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const serp = await readIndexLabRunSerpExplorer(runId);
      if (!serp) {
        return jsonRes(res, 404, { error: 'serp_not_found', run_id: runId });
      }
      return jsonRes(res, 200, {
        run_id: runId,
        ...serp
      });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'automation-queue' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const queue = await readIndexLabRunAutomationQueue(runId);
      if (!queue) {
        return jsonRes(res, 404, { error: 'automation_queue_not_found', run_id: runId });
      }
      return jsonRes(res, 200, queue);
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'rounds' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const roundsMeta = typeof readIndexLabRunMeta === 'function' ? await readIndexLabRunMeta(runId).catch(() => null) : null;
      const events = await readRunSummaryEvents(runId, 8000, { category: roundsMeta?.category });
      const summary = buildRoundSummaryFromEvents(events);
      return jsonRes(res, 200, {
        run_id: runId,
        ...summary
      });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'learning' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const learningMeta = typeof readIndexLabRunMeta === 'function' ? await readIndexLabRunMeta(runId).catch(() => null) : null;
      const events = await readRunSummaryEvents(runId, 8000, { category: learningMeta?.category });
      const learningEvents = events.filter((e) =>
        e.event === 'learning_update' || e.event === 'learning_gate_result'
        || (e.stage === 'learning')
      );
      const updates = learningEvents.map((e) => ({
        field: String(e.payload?.field || ''),
        value: String(e.payload?.value || ''),
        confidence: toFloat(e.payload?.confidence, 0),
        refs_found: toInt(e.payload?.refs_found, 0),
        tier_history: Array.isArray(e.payload?.tier_history) ? e.payload.tier_history : [],
        accepted: Boolean(e.payload?.accepted),
        reason: e.payload?.reason || null,
        source_run_id: String(e.payload?.source_run_id || runId)
      }));
      const accepted = updates.filter((u) => u.accepted).length;
      const rejected = updates.filter((u) => !u.accepted).length;
      const rejectionReasons = {};
      for (const u of updates) {
        if (!u.accepted && u.reason) {
          rejectionReasons[u.reason] = (rejectionReasons[u.reason] || 0) + 1;
        }
      }
      const acceptedUpdates = updates.filter((u) => u.accepted).map((u) => ({
        field: u.field,
        value: u.value,
        evidenceRefs: u.tier_history.map((tier, i) => ({ url: '', tier })),
        acceptanceStats: { confirmations: u.refs_found, approved: u.refs_found },
        sourceRunId: u.source_run_id
      }));
      return jsonRes(res, 200, {
        run_id: runId,
        updates,
        suggestions: {
          search_hints: buildSearchHints(acceptedUpdates),
          anchors: buildAnchorsSuggestions(acceptedUpdates),
          known_values: buildKnownValuesSuggestions(acceptedUpdates)
        },
        gate_summary: { total: updates.length, accepted, rejected, rejection_reasons: rejectionReasons }
      });
    }

    // ── Product run history ─────────────────────────────────────
    if (parts[0] === 'indexlab' && parts[1] === 'product-history' && method === 'GET') {
      const category = String(params.get('category') || '').trim();
      const productId = String(params.get('product_id') || '').trim();
      if (!category) return jsonRes(res, 400, { error: 'missing_category' });
      if (!productId) return jsonRes(res, 400, { error: 'missing_product_id' });

      const specDb = typeof getSpecDb === 'function' ? getSpecDb(category) : null;
      if (!specDb) return jsonRes(res, 500, { error: 'db_unavailable' });

      // WHY: Primary source is the `runs` table (always populated).
      const allRunsMeta = specDb.getRunsByCategory(category, 500);
      const productRunsMeta = allRunsMeta.filter(
        (r) => String(r.product_id || '').trim() === productId
      );
      const runIdSet = new Set(productRunsMeta.map((r) => r.run_id));

      // WHY: Billing cost per run from billing_entries (the actual cost source).
      // Uses global appDb (billing is cross-category in app.sqlite).
      const months = [...new Set(
        productRunsMeta.map((r) => String(r.started_at || '').slice(0, 7)).filter(Boolean)
      )];
      const costByRun = new Map();
      const billingDb = appDb || null;
      for (const m of months) {
        const entries = billingDb ? billingDb.getBillingEntriesForMonth(m) : [];
        for (const be of entries) {
          if (be.product_id !== productId) continue;
          costByRun.set(be.run_id, (costByRun.get(be.run_id) || 0) + (Number(be.cost_usd) || 0));
        }
      }

      // WHY: crawl_sources is the truth for URL crawl data.
      const crawlSources = specDb.getCrawlSourcesByProduct(productId);
      const crawlSourcesByRun = new Map();
      const urls = [];
      for (const cs of crawlSources) {
        if (!runIdSet.has(cs.run_id)) continue;
        const mapped = {
          url: cs.final_url || cs.source_url,
          host: cs.host,
          http_status: cs.http_status,
          source_tier: cs.source_tier,
          doc_kind: cs.doc_kind,
          content_type: cs.content_type,
          size_bytes: cs.size_bytes,
          run_id: cs.run_id,
          crawled_at: cs.crawled_at,
        };
        urls.push(mapped);
        if (!crawlSourcesByRun.has(cs.run_id)) crawlSourcesByRun.set(cs.run_id, []);
        crawlSourcesByRun.get(cs.run_id).push(mapped);
      }

      // WHY: Extract funnel + domain breakdown per run from run_summary telemetry events.
      const runs = productRunsMeta.map((rm) => {
        let events = [];
        try {
          const summary = specDb.getRunArtifact(rm.run_id, 'run_summary');
          events = summary?.payload?.telemetry?.events || [];
        } catch { /* no artifact — funnel will use counters only */ }

        const funnel = extractRunFunnelSummary(events, rm.counters || {});
        const domains = extractDomainBreakdown(events, crawlSourcesByRun.get(rm.run_id) || []);
        const errors = extractFetchErrors(events);
        const extraction = extractExtractionSummary(events);

        return {
          run_id: rm.run_id,
          status: rm.status || '',
          cost_usd: costByRun.get(rm.run_id) || 0,
          started_at: rm.started_at || '',
          ended_at: rm.ended_at || '',
          funnel,
          domains,
          errors,
          extraction,
        };
      });

      // WHY: Dedup queries by query text (query_index has duplicate rows per search attempt).
      const allQueries = specDb.getQueryIndexByCategory(category);
      const seenQueries = new Set();
      const queries = [];
      for (const q of allQueries) {
        if (q.product_id !== productId) continue;
        const key = `${q.query}||${q.run_id}`;
        if (seenQueries.has(key)) continue;
        seenQueries.add(key);
        queries.push({
          query: q.query,
          provider: q.provider,
          result_count: q.result_count,
          tier: q.tier || null,
          run_id: q.run_id,
          ts: q.ts,
        });
      }

      const metrics = computeProductHistoryMetrics({ runs, urls });

      return jsonRes(res, 200, {
        product_id: productId,
        category,
        aggregate: metrics,
        runs,
        queries,
        urls,
      });
    }

    // ── Index summaries ───────────────────────────────────────
    if (parts[0] === 'indexlab' && parts[1] === 'indexes' && parts[2] === 'query-summary' && method === 'GET') {
      const category = String(params.get('category') || '').trim();
      if (!category) return jsonRes(res, 400, { error: 'missing_category' });
      const _specDb = typeof getSpecDb === 'function' ? getSpecDb() : null;
      const rows = _specDb ? _specDb.getQueryIndexByCategory(category) : [];
      const summary = computeQueryIndexSummary(rows);
      return jsonRes(res, 200, { category, ...summary });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'indexes' && parts[2] === 'url-summary' && method === 'GET') {
      const category = String(params.get('category') || '').trim();
      if (!category) return jsonRes(res, 400, { error: 'missing_category' });
      const _specDb = typeof getSpecDb === 'function' ? getSpecDb() : null;
      const rows = _specDb ? _specDb.getUrlIndexByCategory(category) : [];
      const summary = computeUrlIndexSummary(rows);
      return jsonRes(res, 200, { category, ...summary });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'indexes' && parts[2] === 'prompt-summary' && method === 'GET') {
      const category = String(params.get('category') || '').trim();
      if (!category) return jsonRes(res, 400, { error: 'missing_category' });
      const _specDb = typeof getSpecDb === 'function' ? getSpecDb() : null;
      const rows = _specDb ? _specDb.getPromptIndexByCategory(category) : [];
      const summary = computePromptIndexSummary(rows);
      return jsonRes(res, 200, { category, ...summary });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'indexes' && parts[2] === 'knob-snapshots' && method === 'GET') {
      const category = String(params.get('category') || '').trim();
      if (!category) return jsonRes(res, 400, { error: 'missing_category' });
      const _specDb = typeof getSpecDb === 'function' ? getSpecDb() : null;
      const rows = _specDb ? _specDb.getKnobSnapshots(category) : [];
      const snapshots = computeKnobSnapshots(rows);
      return jsonRes(res, 200, { category, snapshots });
    }

    // ── Cross-run analytics (Phase 4B) ────────────────────────
    if (parts[0] === 'indexlab' && parts[1] === 'analytics' && parts[2] === 'compound-curve' && method === 'GET') {
      const category = String(params.get('category') || '').trim();
      if (!category) return jsonRes(res, 400, { error: 'missing_category' });
      const allRuns = await listIndexLabRuns({ limit: 200 });
      let effectiveCategory = category;
      let runs = allRuns;
      if (category === 'all') {
        const counts = {};
        for (const r of allRuns) {
          const c = String(r.category || '').trim();
          if (c) counts[c] = (counts[c] || 0) + 1;
        }
        effectiveCategory = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        runs = effectiveCategory ? allRuns.filter((r) => String(r.category || '').trim() === effectiveCategory) : allRuns;
      } else {
        runs = allRuns.filter((r) => String(r.category || '').trim() === category);
      }
      if (!effectiveCategory) return jsonRes(res, 200, { category, verdict: 'NOT_PROVEN', search_reduction_pct: 0, url_reuse_trend: 'flat', runs: [] });
      const _ccSpecDb = typeof getSpecDb === 'function' ? getSpecDb() : null;
      const result = computeCompoundCurve({
        category: effectiveCategory,
        runSummaries: runs,
        queryRows: _ccSpecDb ? _ccSpecDb.getQueryIndexByCategory(effectiveCategory) : [],
        urlRows: _ccSpecDb ? _ccSpecDb.getUrlIndexByCategory(effectiveCategory) : [],
      });
      return jsonRes(res, 200, result);
    }

    if (parts[0] === 'indexlab' && parts[1] === 'analytics' && parts[2] === 'cross-run-metrics' && method === 'GET') {
      const category = String(params.get('category') || '').trim();
      if (!category) return jsonRes(res, 400, { error: 'missing_category' });
      const allRuns = await listIndexLabRuns({ limit: 200 });
      let effectiveCat = category;
      let runs = allRuns;
      if (category === 'all') {
        const counts = {};
        for (const r of allRuns) { const c = String(r.category || '').trim(); if (c) counts[c] = (counts[c] || 0) + 1; }
        effectiveCat = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        runs = effectiveCat ? allRuns.filter((r) => String(r.category || '').trim() === effectiveCat) : allRuns;
      } else {
        runs = allRuns.filter((r) => String(r.category || '').trim() === category);
      }
      const result = aggregateCrossRunMetrics({ category: effectiveCat || category, runSummaries: runs });
      return jsonRes(res, 200, result);
    }

    if (parts[0] === 'indexlab' && parts[1] === 'analytics' && parts[2] === 'host-health' && method === 'GET') {
      const category = String(params.get('category') || '').trim();
      if (!category) return jsonRes(res, 400, { error: 'missing_category' });
      let effectiveCat = category;
      if (category === 'all') {
        const allRuns = await listIndexLabRuns({ limit: 200 });
        const counts = {};
        for (const r of allRuns) { const c = String(r.category || '').trim(); if (c) counts[c] = (counts[c] || 0) + 1; }
        effectiveCat = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || category;
      }
      const _hhSpecDb = typeof getSpecDb === 'function' ? getSpecDb() : null;
      const hosts = aggregateHostHealth({
        category: effectiveCat,
        urlRows: _hhSpecDb ? _hhSpecDb.getUrlIndexByCategory(effectiveCat) : [],
      });
      return jsonRes(res, 200, { category: effectiveCat, hosts });
    }

    // ── Live crawl validation ─────────────────────────────────
    if (parts[0] === 'indexlab' && parts[1] === 'live-crawl' && parts[2] === 'check-catalog' && method === 'GET') {
      const { CHECK_CATALOG, SECTION_IDS, VERDICT_IDS } = await import('../validation/live-crawl/checkCatalog.js');
      const { getSection } = await import('../validation/live-crawl/checkCatalog.js');
      const sections = SECTION_IDS.map((id) => ({ id, ...getSection(id) }));
      return jsonRes(res, 200, {
        total_checks: CHECK_CATALOG.length,
        sections,
        verdicts: [...VERDICT_IDS]
      });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'live-crawl' && parts[2] === 'evaluate' && method === 'GET') {
      const runId = params.get('run_id') || '';
      const runData = {};

      if (runId && typeof readRunSummaryEvents === 'function') {
        try {
          const evalMeta = typeof readIndexLabRunMeta === 'function' ? await readIndexLabRunMeta(runId).catch(() => null) : null;
          const events = await readRunSummaryEvents(runId, 2000, { category: evalMeta?.category });
          if (Array.isArray(events)) {
            runData.events = events;
            if (typeof buildScreenshotManifestFromEvents === 'function') {
              runData.screenshot_manifest = buildScreenshotManifestFromEvents(events, runId);
            }
            // Build minimal fetch ledger for plausibility check (SS-05)
            const fetchEvents = events.filter((e) =>
              (e.event === 'fetch_started' || e.event === 'fetch_complete' || e.event === 'fetch_finished')
              && e.payload?.url
            );
            const seenUrls = new Set();
            runData.fetch_ledger = fetchEvents
              .filter((e) => { const u = e.payload.url; if (seenUrls.has(u)) return false; seenUrls.add(u); return true; })
              .map((e) => ({ url: e.payload.url, final_status: e.payload.status || 'ok' }));
          }
        } catch { /* run may not exist — evaluate with empty data */ }
      }

      const result = evaluateAllSections(runData);
      return jsonRes(res, 200, result);
    }

    if (parts[0] === 'indexlab' && parts[1] === 'live-crawl' && parts[2] === 'settings-snapshot' && method === 'GET') {
      const config = typeof ctx.config === 'object' ? ctx.config : {};
      const snapshot = buildEffectiveSettingsSnapshot(config);
      return jsonRes(res, 200, snapshot);
    }

    return false;
  };
}
