import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import {
  readSourcesFile,
  writeSourcesFile,
  generateSourceId,
  listSourceEntries,
  addSourceEntry,
  updateSourceEntry,
  removeSourceEntry,
  validateSourceEntryPatch,
  DISCOVERY_DEFAULTS,
} from '../sources/sourceFileService.js';
import { SOURCE_ENTRY_DEFAULTS, sourceEntryMutableKeys } from '../pipeline/shared/contracts/sourceEntryContract.js';

export function registerSourceStrategyRoutes(ctx) {
  const {
    jsonRes,
    readJsonBody,
    config,
    resolveCategoryAlias,
    broadcastWs,
  } = ctx;

  function resolveScopedCategory(params) {
    const category = resolveCategoryAlias(params.get('category') || '');
    if (!category) return '';
    return category;
  }

  function getRoot() {
    return config?.categoryAuthorityRoot || 'category_authority';
  }

  return async function handleSourceStrategyRoutes(parts, params, method, req, res) {
    // GET /api/v1/source-strategy
    if (parts[0] === 'source-strategy' && method === 'GET' && !parts[1]) {
      const category = resolveScopedCategory(params);
      if (!category) return jsonRes(res, 400, { error: 'category_required' });
      const root = getRoot();
      const data = await readSourcesFile(root, category);
      const entries = listSourceEntries(data);
      return jsonRes(res, 200, entries);
    }

    // POST /api/v1/source-strategy
    if (parts[0] === 'source-strategy' && method === 'POST' && !parts[1]) {
      const category = resolveScopedCategory(params);
      if (!category) return jsonRes(res, 400, { error: 'category_required' });
      const body = await readJsonBody(req).catch(() => ({}));
      if (!body.host) return jsonRes(res, 400, { error: 'host_required' });
      const root = getRoot();
      const data = await readSourcesFile(root, category);
      const sourceId = body.sourceId || generateSourceId(body.host);
      const { discovery: bodyDiscovery, host: _h, sourceId: _sid, ...restBody } = body;
      // WHY: Loop over schema-derived mutable keys so new fields auto-flow through.
      const hostDefaults = {
        display_name: body.host,
        tier: 'tier2_lab',
        base_url: `https://${body.host}`,
        discovery: { ...DISCOVERY_DEFAULTS, method: 'search_first', source_type: restBody.source_type || '' },
      };
      const entry = {};
      for (const key of sourceEntryMutableKeys()) {
        if (key === 'discovery') {
          entry[key] = bodyDiscovery || hostDefaults.discovery;
        } else {
          entry[key] = restBody[key] !== undefined
            ? restBody[key]
            : (hostDefaults[key] ?? SOURCE_ENTRY_DEFAULTS[key] ?? null);
        }
      }
      const updated = addSourceEntry(data, sourceId, entry);
      await writeSourcesFile(root, category, updated);
      emitDataChange({
        broadcastWs,
        event: 'source-strategy-created',
        category,
        domains: ['source-strategy'],
        meta: { sourceId, host: String(body.host || '').trim() },
      });
      return jsonRes(res, 201, { ok: true, sourceId });
    }

    // PUT /api/v1/source-strategy/:sourceId
    if (parts[0] === 'source-strategy' && parts[1] && method === 'PUT') {
      const sourceId = parts[1];
      const category = resolveScopedCategory(params);
      if (!category) return jsonRes(res, 400, { error: 'category_required' });
      const body = await readJsonBody(req).catch(() => ({}));
      const { accepted, rejected } = validateSourceEntryPatch(body);
      const root = getRoot();
      const data = await readSourcesFile(root, category);
      if (!data.sources[sourceId]) return jsonRes(res, 404, { error: 'not_found' });
      const updated = updateSourceEntry(data, sourceId, accepted);
      await writeSourcesFile(root, category, updated);
      const entries = listSourceEntries(updated);
      const updatedEntry = entries.find((e) => e.sourceId === sourceId) || null;
      emitDataChange({
        broadcastWs,
        event: 'source-strategy-updated',
        category,
        domains: ['source-strategy'],
        meta: { sourceId },
      });
      return jsonRes(res, 200, { ok: true, applied: accepted, snapshot: updatedEntry, rejected });
    }

    // DELETE /api/v1/source-strategy/:sourceId
    if (parts[0] === 'source-strategy' && parts[1] && method === 'DELETE') {
      const sourceId = parts[1];
      const category = resolveScopedCategory(params);
      if (!category) return jsonRes(res, 400, { error: 'category_required' });
      const root = getRoot();
      const data = await readSourcesFile(root, category);
      if (!data.sources[sourceId]) return jsonRes(res, 404, { error: 'not_found' });
      const updated = removeSourceEntry(data, sourceId);
      await writeSourcesFile(root, category, updated);
      emitDataChange({
        broadcastWs,
        event: 'source-strategy-deleted',
        category,
        domains: ['source-strategy'],
        meta: { sourceId },
      });
      return jsonRes(res, 200, { ok: true });
    }

    return false;
  };
}
