export function createInfraHealthRoutes({
  jsonRes,
  DIST_ROOT,
  processRef = process,
} = {}) {
  return async function handleInfraHealth(parts, _params, method, _req, res) {
    if (parts[0] !== 'health' && !(parts.length === 0 && method === 'GET')) {
      return false;
    }

    return jsonRes(res, 200, {
      ok: true,
      service: 'gui-server',
      dist_root: DIST_ROOT,
      cwd: processRef.cwd(),
      isPkg: typeof processRef.pkg !== 'undefined',
    });
  };
}
