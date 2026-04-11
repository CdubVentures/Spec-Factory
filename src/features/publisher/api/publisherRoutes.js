/**
 * Publisher GUI routes.
 *
 * GET /publisher/:category/candidates?page=1&limit=100
 * GET /publisher/:category/stats
 */

export function registerPublisherRoutes(ctx) {
  const { jsonRes, getSpecDb } = ctx;

  return async function handlePublisherRoutes(parts, params, method, req, res) {
    if (parts[0] !== 'publisher') return false;

    const category = parts[1];
    if (!category) { jsonRes(res, 400, { error: 'category required' }); return true; }

    const specDb = getSpecDb(category);
    if (!specDb) { jsonRes(res, 404, { error: `no db for category: ${category}` }); return true; }

    // GET /publisher/:category/candidates
    if (parts[2] === 'candidates' && method === 'GET') {
      const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
      const limit = Math.min(500, Math.max(1, parseInt(params.get('limit') || '100', 10) || 100));
      const offset = (page - 1) * limit;

      const rows = specDb.getFieldCandidatesPaginated({ limit, offset });
      const total = specDb.countFieldCandidates();
      const stats = specDb.getFieldCandidatesStats();

      jsonRes(res, 200, { rows, total, page, limit, stats });
      return true;
    }

    // GET /publisher/:category/stats
    if (parts[2] === 'stats' && method === 'GET') {
      const stats = specDb.getFieldCandidatesStats();
      jsonRes(res, 200, stats);
      return true;
    }

    // GET /publisher/:category/published/:productId
    if (parts[2] === 'published' && parts[3] && method === 'GET') {
      const productId = parts[3];
      const allCandidates = specDb.getAllFieldCandidatesByProduct(productId);
      const fields = {};
      for (const row of allCandidates) {
        if (row.status !== 'resolved') continue;
        fields[row.field_key] = {
          value: row.value,
          confidence: row.confidence,
          source: row.metadata_json?.source || 'pipeline',
          resolved_at: row.updated_at,
        };
      }
      jsonRes(res, 200, { product_id: productId, fields });
      return true;
    }

    return false;
  };
}
