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

    return false;
  };
}
