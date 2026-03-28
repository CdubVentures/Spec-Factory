import path from 'node:path';
import { safeReadJson } from '../../../../shared/fileHelpers.js';

/**
 * Factory that creates the 4 phase-data reader functions.
 * All parent-module dependencies are injected so this module
 * never imports from `indexlabDataBuilders.js` (no circular dep).
 */
export function createPhaseDataReaders({
  resolveRunDir,
  readMeta,
  readEvents,
  resolveProductId,
  getStorage,
  readOutputRootJson,
}) {
  async function readIndexLabRunPhase07Retrieval(runId) {
    const token = String(runId || '').trim();
    if (!token) return null;
    const runDir = await resolveRunDir(token);
    if (!runDir) return null;

    const directPath = path.join(runDir, 'phase07_retrieval.json');
    const direct = await safeReadJson(directPath);
    if (direct && typeof direct === 'object') {
      return direct;
    }

    const meta = await readMeta(token);
    const category = String(meta?.category || '').trim();
    const resolvedRunId = String(meta?.run_id || token).trim();
    if (!category || !resolvedRunId) {
      return null;
    }
    const eventRows = await readEvents(token, 3000, { category });
    const productId = resolveProductId(meta, eventRows);
    if (!productId) return null;

    const storage = getStorage();
    const runKey = storage.resolveOutputKey(category, productId, 'runs', resolvedRunId, 'analysis', 'phase07_retrieval.json');
    const runPayload = await storage.readJsonOrNull(runKey);
    if (runPayload && typeof runPayload === 'object') {
      return runPayload;
    }

    const runSummaryKey = storage.resolveOutputKey(category, productId, 'runs', resolvedRunId, 'logs', 'summary.json');
    const runSummary = await storage.readJsonOrNull(runSummaryKey);
    if (runSummary?.phase07 && typeof runSummary.phase07 === 'object') {
      return {
        run_id: resolvedRunId,
        category,
        product_id: productId,
        generated_at: String(runSummary.generated_at || '').trim() || null,
        summary: runSummary.phase07,
        fields: [],
        summary_only: true
      };
    }

    return null;
  }

  async function readIndexLabRunPhase08Extraction(runId) {
    const token = String(runId || '').trim();
    if (!token) return null;
    const runDir = await resolveRunDir(token);
    if (!runDir) return null;

    const directPath = path.join(runDir, 'phase08_extraction.json');
    const direct = await safeReadJson(directPath);
    if (direct && typeof direct === 'object') {
      return direct;
    }

    const meta = await readMeta(token);
    const category = String(meta?.category || '').trim();
    const resolvedRunId = String(meta?.run_id || token).trim();
    if (!category || !resolvedRunId) {
      return null;
    }
    const eventRows = await readEvents(token, 3000, { category });
    const productId = resolveProductId(meta, eventRows);
    if (!productId) return null;

    const storage = getStorage();
    const runKey = storage.resolveOutputKey(category, productId, 'runs', resolvedRunId, 'analysis', 'phase08_extraction.json');
    const runPayload = await storage.readJsonOrNull(runKey);
    if (runPayload && typeof runPayload === 'object') {
      return runPayload;
    }

    const runSummaryKey = storage.resolveOutputKey(category, productId, 'runs', resolvedRunId, 'logs', 'summary.json');
    const runSummary = await storage.readJsonOrNull(runSummaryKey);
    if (runSummary?.phase08 && typeof runSummary.phase08 === 'object') {
      return {
        run_id: resolvedRunId,
        category,
        product_id: productId,
        generated_at: String(runSummary.generated_at || '').trim() || null,
        summary: runSummary.phase08,
        batches: [],
        field_contexts: {},
        prime_sources: { rows: [] },
        summary_only: true
      };
    }

    return null;
  }

  async function readIndexLabRunDynamicFetchDashboard(runId) {
    const token = String(runId || '').trim();
    if (!token) return null;
    const runDir = await resolveRunDir(token);
    if (!runDir) return null;

    const directPath = path.join(runDir, 'dynamic_fetch_dashboard.json');
    const direct = await safeReadJson(directPath);
    if (direct && typeof direct === 'object') {
      return direct;
    }

    const meta = await readMeta(token);
    const category = String(meta?.category || '').trim();
    const resolvedRunId = String(meta?.run_id || token).trim();
    if (!category || !resolvedRunId) {
      return null;
    }
    const eventRows = await readEvents(token, 3000, { category });
    const productId = resolveProductId(meta, eventRows);
    if (!productId) return null;

    const storage = getStorage();
    const runKey = storage.resolveOutputKey(category, productId, 'runs', resolvedRunId, 'analysis', 'dynamic_fetch_dashboard.json');
    const runPayload = await storage.readJsonOrNull(runKey);
    if (runPayload && typeof runPayload === 'object') {
      return runPayload;
    }

    const runSummaryKey = storage.resolveOutputKey(category, productId, 'runs', resolvedRunId, 'logs', 'summary.json');
    const runSummary = await storage.readJsonOrNull(runSummaryKey);
    if (runSummary?.dynamic_fetch_dashboard && typeof runSummary.dynamic_fetch_dashboard === 'object') {
      return {
        run_id: resolvedRunId,
        category,
        product_id: productId,
        generated_at: String(runSummary.generated_at || '').trim() || null,
        host_count: Number(runSummary.dynamic_fetch_dashboard.host_count || 0),
        hosts: [],
        summary_only: true,
        key: String(runSummary.dynamic_fetch_dashboard.key || '').trim() || null,
        latest_key: String(runSummary.dynamic_fetch_dashboard.latest_key || '').trim() || null
      };
    }

    return null;
  }

  async function readIndexLabRunSourceIndexingPackets(runId) {
    const token = String(runId || '').trim();
    if (!token) return null;
    const runDir = await resolveRunDir(token);
    if (!runDir) return null;

    const directPaths = [
      path.join(runDir, 'source_indexing_extraction_packets.json'),
      path.join(path.dirname(runDir), 'latest_snapshot', 'source_indexing_extraction_packets.json'),
      path.join(path.dirname(runDir), 'run_output', 'analysis', 'source_indexing_extraction_packets.json'),
    ];
    for (const candidatePath of directPaths) {
      const direct = await safeReadJson(candidatePath);
      if (direct && typeof direct === 'object') {
        return direct;
      }
    }

    const meta = await readMeta(token);
    const category = String(meta?.category || '').trim();
    const resolvedRunId = String(meta?.run_id || token).trim();
    const normalizedRunBase = String(meta?.run_base || meta?.runBase || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
    const normalizedLatestBase = String(meta?.latest_base || meta?.latestBase || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
    if (!category || !resolvedRunId) {
      return null;
    }
    const eventRows = await readEvents(token, 3000, { category });
    const productId = resolveProductId(meta, eventRows);
    if (!productId) return null;

    const storage = getStorage();
    const runKey = storage.resolveOutputKey(category, productId, 'runs', resolvedRunId, 'analysis', 'source_indexing_extraction_packets.json');
    const runPayload = await storage.readJsonOrNull(runKey);
    if (runPayload && typeof runPayload === 'object') {
      return runPayload;
    }
    const runPayloadFromOutputRoot = await readOutputRootJson(runKey);
    if (runPayloadFromOutputRoot && typeof runPayloadFromOutputRoot === 'object') {
      return runPayloadFromOutputRoot;
    }

    if (normalizedRunBase) {
      const runBasePayload = await readOutputRootJson(`${normalizedRunBase}/analysis/source_indexing_extraction_packets.json`);
      if (runBasePayload && typeof runBasePayload === 'object') {
        return runBasePayload;
      }
    }

    return null;
  }

  return {
    readIndexLabRunPhase07Retrieval,
    readIndexLabRunPhase08Extraction,
    readIndexLabRunDynamicFetchDashboard,
    readIndexLabRunSourceIndexingPackets,
  };
}
