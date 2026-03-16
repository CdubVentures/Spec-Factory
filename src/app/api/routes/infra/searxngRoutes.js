export function createInfraSearxngRoutes({
  jsonRes,
  getSearxngStatus,
  startSearxngStack,
} = {}) {
  return async function handleInfraSearxng(parts, _params, method, _req, res) {
    if (parts[0] !== 'searxng') {
      return false;
    }

    if (parts[1] === 'status' && method === 'GET') {
      try {
        const status = await getSearxngStatus();
        return jsonRes(res, 200, status);
      } catch (err) {
        return jsonRes(res, 500, {
          error: 'searxng_status_failed',
          message: err?.message || 'searxng_status_failed',
        });
      }
    }

    if (parts[1] === 'start' && method === 'POST') {
      try {
        const startResult = await startSearxngStack();
        if (!startResult.ok) {
          return jsonRes(res, 500, {
            error: startResult.error || 'searxng_start_failed',
            status: startResult.status || null,
          });
        }
        return jsonRes(res, 200, startResult);
      } catch (err) {
        return jsonRes(res, 500, {
          error: 'searxng_start_failed',
          message: err?.message || 'searxng_start_failed',
        });
      }
    }

    return false;
  };
}
