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
  buildPreFetchPhases,
  buildLlmCallsDashboard,
  buildFetchPhases,
} from './builders/runtimeOpsDataBuilders.js';
import { buildExtractionPluginPhases } from './builders/runtimeOpsExtractionPluginBuilders.js';
import { mergeSearchProfileRows } from './builders/runtimeOpsSearchProfileMergeHelpers.js';
import {
  loadRuntimeFieldRulesPayload,
  hydrateFieldRuleGateCounts,
} from './builders/runtimeOpsFieldRuleGateHelpers.js';
import {
  buildRuntimeIdxBadgesBySurface,
  buildRuntimeIdxBadgesForWorker,
} from '../runtime/idxRuntimeMetadata.js';
import {
  shouldSynthesizeRuntimeProofFrame,
  buildSyntheticRuntimeProofFrame,
  buildRuntimeAssetCandidatePaths,
  createRuntimeScreenshotMetadataResolver,
} from './builders/runtimeOpsScreenshotAssetHelpers.js';
import { buildArchivedS3CacheRoot } from './builders/archivedRunLocationHelpers.js';
import { resolveVideoFilePath } from './runtimeOpsVideoHelpers.js';

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

function isInvalidAssetFilename(filename, path) {
  if (!filename) return true;
  if (path.isAbsolute(filename)) return true;
  const normalized = String(filename).replaceAll('\\', '/');
  return normalized.split('/').includes('..');
}

// ---------------------------------------------------------------------------
// Asset fast-path: serves screenshot files without run resolution / event read
// ---------------------------------------------------------------------------

async function tryServeAssetFastPath({ runId, encodedFilename, directRunDir, OUTPUT_ROOT, storage, path, jsonRes, res }) {
  let filename = '';
  try {
    filename = decodeURIComponent(encodedFilename);
  } catch {
    jsonRes(res, 400, { error: 'invalid_filename' });
    return true;
  }
  if (isInvalidAssetFilename(filename, path)) {
    jsonRes(res, 400, { error: 'invalid_filename' });
    return true;
  }

  const fs = await import('node:fs');
  const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.webm': 'video/webm' };

  // Build candidate runDirs: direct local path + S3 cache path
  const candidateRunDirs = [directRunDir];
  const s3CacheRoot = buildArchivedS3CacheRoot(runId);
  if (s3CacheRoot) {
    candidateRunDirs.push(path.join(s3CacheRoot, 'indexlab'));
  }

  // Security boundaries
  const screenshotDirs = candidateRunDirs.map((d) => path.resolve(path.join(d, 'screenshots')));
  const outputRootResolved = OUTPUT_ROOT ? path.resolve(OUTPUT_ROOT) : '';

  for (const candidateRunDir of candidateRunDirs) {
    const candidates = buildRuntimeAssetCandidatePaths({
      filename,
      storage,
      OUTPUT_ROOT,
      path,
      runDir: candidateRunDir,
      runId,
    }).filter((candidatePath) => (
      screenshotDirs.some((sd) => candidatePath.startsWith(sd))
      || (outputRootResolved && candidatePath.startsWith(outputRootResolved))
    ));

    for (const candidatePath of candidates) {
      try {
        await fs.promises.access(candidatePath);
        const ext = path.extname(filename).toLowerCase();
        const contentType = mimeMap[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        const stream = fs.createReadStream(candidatePath);
        stream.pipe(res);
        return true;
      } catch {
        // Try the next candidate.
      }
    }
  }

  // No fast-path hit — signal fallback to full resolution.
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
    readRunSummaryEvents,
    readIndexLabRunSearchProfile,
    readIndexLabRunMeta,
    readIndexLabRunSourceIndexingPackets,
    resolveIndexLabRunDirectory,
    processStatus,
    getLastScreencastFrame,
    safeReadJson,
    safeJoin,
    path,
    getIndexLabRoot: _getIndexLabRoot,
    getSpecDbReady,
  } = ctx;

  const currentIndexLabRoot = () =>
    (typeof _getIndexLabRoot === 'function' ? _getIndexLabRoot() : '') || INDEXLAB_ROOT;

  const resolveScreenshotMetadata = createRuntimeScreenshotMetadataResolver({
    storage,
    OUTPUT_ROOT,
    path,
  });

  return async function handleRuntimeOpsRoutes(parts, params, method, req, res) {
    if (parts[0] !== 'indexlab' || parts[1] !== 'run' || !parts[2] || parts[3] !== 'runtime') {
      return false;
    }

    if (method !== 'GET') return false;

    const runId = String(parts[2] || '').trim();
    const directRunDir = safeJoin(currentIndexLabRoot(), runId);
    if (!directRunDir) return jsonRes(res, 400, { error: 'invalid_run_id' });

    // WHY: Asset requests are the most frequent (one per screenshot thumbnail).
    // Serving them without run resolution, meta read, or event read avoids
    // triggering full S3 hydration for archived runs.
    const earlySubPath = String(parts[4] || '').trim();

    // WHY: Opens local screenshots folder. Checks multiple candidate roots since
    // screenshots may be at defaultIndexLabRoot (AppData) while run.json is elsewhere.
    if (earlySubPath === 'extraction' && parts[5] === 'open-folder') {
      const folder = parts[6] || 'screenshots';
      if (folder !== 'screenshots') return jsonRes(res, 400, { error: 'invalid_folder' });
      try {
        const fs = await import('node:fs');
        const { defaultIndexLabRoot } = await import('../../../../core/config/runtimeArtifactRoots.js');
        const candidates = [
          path.join(defaultIndexLabRoot(), runId, 'screenshots'),
          path.join(directRunDir, 'screenshots'),
        ];
        const targetDir = candidates.find((d) => fs.existsSync(d));
        if (!targetDir) {
          return jsonRes(res, 404, { error: 'folder_not_found', tried: candidates });
        }
        const { exec } = await import('node:child_process');
        const cmd = process.platform === 'win32' ? `explorer "${targetDir}"`
          : process.platform === 'darwin' ? `open "${targetDir}"`
          : `xdg-open "${targetDir}"`;
        exec(cmd);
        return jsonRes(res, 200, { opened: targetDir });
      } catch (err) {
        return jsonRes(res, 500, { error: 'open_failed', message: err?.message });
      }
    }

    if (earlySubPath === 'assets' && parts[5]) {
      const fastResult = await tryServeAssetFastPath({
        runId,
        encodedFilename: String(parts[5] || '').trim(),
        directRunDir,
        OUTPUT_ROOT,
        storage,
        path,
        jsonRes,
        res,
      });
      if (fastResult !== null) return fastResult;
      // Fast path missed — fall through to full resolution below.
    }

    const runDir = typeof resolveIndexLabRunDirectory === 'function'
      ? (await resolveIndexLabRunDirectory(runId).catch(() => '')) || directRunDir
      : directRunDir;
    const meta = typeof readIndexLabRunMeta === 'function'
      ? await readIndexLabRunMeta(runId).catch(() => null)
      : await safeReadJson(path.join(runDir, 'run.json'));
    if (!meta) return jsonRes(res, 404, { error: 'run_not_found', run_id: runId });

    const subPath = String(parts[4] || '').trim();
    const events = await readRunSummaryEvents(runId, 2000, { category: meta?.category });
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
        crawleeRequestHandlerTimeoutSecs: config?.crawleeRequestHandlerTimeoutSecs,
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

    // WHY: Serves crawl video recordings from OS temp. resolveVideoFilePath reads
    // the manifest.json written by crawlSession to map workerId → UUID filename.
    // 404 is expected when video recording was disabled or cleaned up.
    if (subPath === 'video' && parts[5]) {
      const videoWorkerId = decodeURIComponent(String(parts[5] || '').trim());
      const videoPath = resolveVideoFilePath(runId, videoWorkerId);
      if (!videoPath) {
        return jsonRes(res, 404, { error: 'video_not_found', run_id: runId, worker_id: videoWorkerId });
      }
      const fs = await import('node:fs');
      const stat = fs.statSync(videoPath);
      // WHY: Range request support lets the <video> element seek, loop efficiently,
      // and show progress without buffering the entire file first.
      const range = req.headers.range;
      if (range) {
        const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
        const start = parseInt(startStr, 10);
        const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
        res.writeHead(206, {
          'Content-Type': 'video/webm',
          'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(videoPath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Type': 'video/webm',
          'Content-Length': stat.size,
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(videoPath).pipe(res);
      }
      return true;
    }

    if (subPath === 'llm-dashboard' && !parts[5]) {
      const dashboard = buildLlmCallsDashboard(events);
      return jsonRes(res, 200, { run_id: runId, ...dashboard });
    }

    if (subPath === 'prefetch' && !parts[5]) {
      // WHY: SQL fast path — one synchronous query replaces 3 async file reads
      // for post-Wave-3 runs. Falls back to file I/O for pre-migration runs.
      let needsetArt = null, profileArt = null, brandArt = null;
      if (typeof getSpecDbReady === 'function' && resolvedMeta?.category) {
        try {
          const specDb = await getSpecDbReady(resolvedMeta.category);
          if (specDb) {
            const arts = specDb.getRunArtifactsByRunId(runId);
            for (const art of arts) {
              if (art.artifact_type === 'needset') needsetArt = art.payload;
              else if (art.artifact_type === 'search_profile') profileArt = art.payload;
              else if (art.artifact_type === 'brand_resolution') brandArt = art.payload;
            }
          }
        } catch { /* fall through to file I/O */ }
      }
      const needsetPath = path.join(runDir, 'needset.json');
      const profilePath = path.join(runDir, 'search_profile.json');
      const brandPath = path.join(runDir, 'brand_resolution.json');
      const [needsetFallback, profileFallback, brandFallback, planProfile] = await Promise.all([
        needsetArt ? Promise.resolve(null) : safeReadJson(needsetPath),
        profileArt ? Promise.resolve(null) : safeReadJson(profilePath),
        brandArt ? Promise.resolve(null) : safeReadJson(brandPath),
        readIndexLabRunSearchProfile ? readIndexLabRunSearchProfile(runId).catch(() => null) : Promise.resolve(null),
      ]);
      needsetArt = needsetArt || needsetFallback;
      profileArt = profileArt || profileFallback;
      brandArt = brandArt || brandFallback;
      // WHY: Pipeline artifact (planProfile) is authoritative once executed.
      // Bridge file (profileArt) accumulates all event-observed queries
      // including unexecuted seed queries — merge only for progressive display.
      let searchProfile = planProfile?.status === 'executed'
        ? planProfile
        : profileArt && typeof profileArt === 'object'
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
        phase_cursor: String(resolvedMeta?.phase_cursor || '').trim(),
        idx_runtime: buildRuntimeIdxBadgesBySurface(fieldRulesPayload),
      });
    }

    if (subPath === 'fetch' && !parts[5]) {
      const fetchPhases = buildFetchPhases(events);
      return jsonRes(res, 200, { run_id: runId, ...fetchPhases });
    }

    if (subPath === 'extraction' && parts[5] === 'plugins') {
      const plugins = buildExtractionPluginPhases(events);
      return jsonRes(res, 200, { run_id: runId, plugins });
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
      const fs = await import('node:fs');
      if (isInvalidAssetFilename(filename, path)) {
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
      const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.webm': 'video/webm' };
      const contentType = mimeMap[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      const stream = fs.createReadStream(resolved);
      stream.pipe(res);
      return true;
    }

    return false;
  };
}
