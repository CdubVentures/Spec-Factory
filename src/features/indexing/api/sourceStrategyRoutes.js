import { emitDataChange } from '../../../api/events/dataChangeContract.js';
import {
  readSourcesFile,
  writeSourcesFile,
  generateSourceId,
  listSourceEntries,
  addSourceEntry,
  updateSourceEntry,
  removeSourceEntry,
  validateSourceEntryPatch,
} from '../sources/sourceFileService.js';

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
      const entry = {
        display_name: restBody.display_name || body.host,
        tier: restBody.tier || 'tier2_lab',
        authority: restBody.authority || 'unknown',
        base_url: restBody.base_url || `https://${body.host}`,
        content_types: restBody.content_types || [],
        doc_kinds: restBody.doc_kinds || [],
        crawl_config: restBody.crawl_config || { method: 'http', rate_limit_ms: 2000, timeout_ms: 12000, robots_txt_compliant: true },
        field_coverage: restBody.field_coverage || { high: [], medium: [], low: [] },
        discovery: bodyDiscovery || { method: 'search_first', source_type: restBody.source_type || '', search_pattern: '', priority: 50, enabled: true, notes: '' },
      };
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
