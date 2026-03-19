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
    readIndexLabRunMeta,
    resolveIndexLabRunDirectory,
    readIndexLabRunEvents,
    readIndexLabRunNeedSet,
    readIndexLabRunSearchProfile,
    readIndexLabRunPhase07Retrieval,
    readIndexLabRunPhase08Extraction,
    readIndexLabRunDynamicFetchDashboard,
    readIndexLabRunSourceIndexingPackets,
    readIndexLabRunItemIndexingPacket,
    readIndexLabRunRunMetaPacket,
    readIndexLabRunSerpExplorer,
    readIndexLabRunLlmTraces,
    readIndexLabRunAutomationQueue,
    readIndexLabRunEvidenceIndex,
    listIndexLabRuns,
    buildRoundSummaryFromEvents,
    buildSearchHints,
    buildAnchorsSuggestions,
    buildKnownValuesSuggestions,
    queryIndexSummary,
    urlIndexSummary,
    highYieldUrls,
    promptIndexSummary,
    readKnobSnapshots,
    evaluateAllSections,
    buildEvidenceReport,
    buildEffectiveSettingsSnapshot,
    buildScreenshotManifestFromEvents,
    // Cross-run analytics (Phase 4B)
    computeCompoundCurve,
    diffRunPlans,
    buildFieldMapFromPacket,
    aggregateCrossRunMetrics,
    aggregateHostHealth,
  } = ctx;

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

  return async function handleIndexlabRoutes(parts, params, method, req, res) {
    // IndexLab runs + event replay
    if (parts[0] === 'indexlab' && parts[1] === 'runs' && method === 'GET') {
      const limit = Math.max(1, toInt(params.get('limit'), 50));
      const category = String(params.get('category') || '').trim();
      const rows = await listIndexLabRuns({ limit, category });
      return jsonRes(res, 200, {
        root: INDEXLAB_ROOT,
        runs: rows
      });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && !parts[3] && method === 'GET') {
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
      const events = await readIndexLabRunEvents(runId, 2000);
      return jsonRes(res, 200, resolveInactiveRunMeta(meta, events, runId));
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'events' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const limit = Math.max(1, toInt(params.get('limit'), 2000));
      const rows = await readIndexLabRunEvents(runId, limit);
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

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'phase07-retrieval' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const payload = await readIndexLabRunPhase07Retrieval(runId);
      if (!payload) {
        return jsonRes(res, 404, { error: 'phase07_retrieval_not_found', run_id: runId });
      }
      return jsonRes(res, 200, {
        run_id: runId,
        ...payload
      });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'phase08-extraction' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const payload = await readIndexLabRunPhase08Extraction(runId);
      if (!payload) {
        return jsonRes(res, 404, { error: 'phase08_extraction_not_found', run_id: runId });
      }
      return jsonRes(res, 200, {
        run_id: runId,
        ...payload
      });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'dynamic-fetch-dashboard' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const payload = await readIndexLabRunDynamicFetchDashboard(runId);
      if (!payload) {
        return jsonRes(res, 404, { error: 'dynamic_fetch_dashboard_not_found', run_id: runId });
      }
      return jsonRes(res, 200, {
        run_id: runId,
        ...payload
      });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'source-indexing-packets' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const payload = await readIndexLabRunSourceIndexingPackets(runId);
      if (!payload) {
        return jsonRes(res, 404, { error: 'source_indexing_packets_not_found', run_id: runId });
      }
      return jsonRes(res, 200, payload);
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'item-indexing-packet' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const payload = await readIndexLabRunItemIndexingPacket(runId);
      if (!payload) {
        return jsonRes(res, 404, { error: 'item_indexing_packet_not_found', run_id: runId });
      }
      return jsonRes(res, 200, payload);
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'run-meta-packet' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const payload = await readIndexLabRunRunMetaPacket(runId);
      if (!payload) {
        return jsonRes(res, 404, { error: 'run_meta_packet_not_found', run_id: runId });
      }
      return jsonRes(res, 200, payload);
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

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'llm-traces' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const limit = Math.max(1, toInt(params.get('limit'), 80));
      const traces = await readIndexLabRunLlmTraces(runId, limit);
      if (!traces) {
        return jsonRes(res, 404, { error: 'llm_traces_not_found', run_id: runId });
      }
      return jsonRes(res, 200, traces);
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'automation-queue' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const queue = await readIndexLabRunAutomationQueue(runId);
      if (!queue) {
        return jsonRes(res, 404, { error: 'automation_queue_not_found', run_id: runId });
      }
      return jsonRes(res, 200, queue);
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'evidence-index' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const query = String(params.get('q') || params.get('query') || '').trim();
      const limit = Math.max(1, toInt(params.get('limit'), 40));
      const payload = await readIndexLabRunEvidenceIndex(runId, { query, limit });
      if (!payload) {
        return jsonRes(res, 404, { error: 'evidence_index_not_found', run_id: runId });
      }
      return jsonRes(res, 200, payload);
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'rounds' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const events = await readIndexLabRunEvents(runId, 8000);
      const summary = buildRoundSummaryFromEvents(events);
      return jsonRes(res, 200, {
        run_id: runId,
        ...summary
      });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'run' && parts[2] && parts[3] === 'learning' && method === 'GET') {
      const runId = String(parts[2] || '').trim();
      const events = await readIndexLabRunEvents(runId, 8000);
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

    // ── Index summaries ───────────────────────────────────────
    if (parts[0] === 'indexlab' && parts[1] === 'indexes' && parts[2] === 'query-summary' && method === 'GET') {
      const category = String(params.get('category') || '').trim();
      if (!category) return jsonRes(res, 400, { error: 'missing_category' });
      const logPath = path.join(INDEXLAB_ROOT, category, 'query-index.ndjson');
      const summary = queryIndexSummary(logPath);
      return jsonRes(res, 200, { category, ...summary });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'indexes' && parts[2] === 'url-summary' && method === 'GET') {
      const category = String(params.get('category') || '').trim();
      if (!category) return jsonRes(res, 400, { error: 'missing_category' });
      const logPath = path.join(INDEXLAB_ROOT, category, 'url-index.ndjson');
      const summary = urlIndexSummary(logPath);
      return jsonRes(res, 200, { category, ...summary });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'indexes' && parts[2] === 'prompt-summary' && method === 'GET') {
      const category = String(params.get('category') || '').trim();
      if (!category) return jsonRes(res, 400, { error: 'missing_category' });
      const logPath = path.join(INDEXLAB_ROOT, category, 'prompt-index.ndjson');
      const summary = promptIndexSummary(logPath);
      return jsonRes(res, 200, { category, ...summary });
    }

    if (parts[0] === 'indexlab' && parts[1] === 'indexes' && parts[2] === 'knob-snapshots' && method === 'GET') {
      const category = String(params.get('category') || '').trim();
      if (!category) return jsonRes(res, 400, { error: 'missing_category' });
      const logPath = path.join(INDEXLAB_ROOT, category, 'knob-snapshots.ndjson');
      const snapshots = readKnobSnapshots(logPath);
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
      const result = computeCompoundCurve({
        category: effectiveCategory,
        runSummaries: runs,
        queryIndexPath: path.join(INDEXLAB_ROOT, effectiveCategory, 'query-index.ndjson'),
        urlIndexPath: path.join(INDEXLAB_ROOT, effectiveCategory, 'url-index.ndjson'),
      });
      return jsonRes(res, 200, result);
    }

    if (parts[0] === 'indexlab' && parts[1] === 'analytics' && parts[2] === 'plan-diff' && method === 'GET') {
      const run1Id = String(params.get('run1') || '').trim();
      const run2Id = String(params.get('run2') || '').trim();
      if (!run1Id || !run2Id) return jsonRes(res, 400, { error: 'missing_run_ids' });
      const [packet1, packet2] = await Promise.all([
        readIndexLabRunItemIndexingPacket(run1Id),
        readIndexLabRunItemIndexingPacket(run2Id),
      ]);
      if (!packet1 || !packet2) {
        return jsonRes(res, 404, { error: 'packet_not_found', run1_found: Boolean(packet1), run2_found: Boolean(packet2) });
      }
      const result = diffRunPlans({
        run1Summary: { run_id: run1Id, fields: buildFieldMapFromPacket(packet1) },
        run2Summary: { run_id: run2Id, fields: buildFieldMapFromPacket(packet2) },
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
      const urlIndexPath = path.join(INDEXLAB_ROOT, effectiveCat, 'url-index.ndjson');
      const hosts = aggregateHostHealth({ urlIndexPath, category: effectiveCat });
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

      if (runId && typeof readIndexLabRunEvents === 'function') {
        try {
          const events = await readIndexLabRunEvents(runId);
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
