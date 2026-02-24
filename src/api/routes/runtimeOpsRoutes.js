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

export function registerRuntimeOpsRoutes(ctx) {
  const {
    jsonRes,
    toInt,
    INDEXLAB_ROOT,
    config,
    readIndexLabRunEvents,
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
      const [needsetArt, profileArt] = await Promise.all([
        safeReadJson(needsetPath),
        safeReadJson(profilePath),
      ]);
      const artifacts = { needset: needsetArt, search_profile: profileArt };
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
