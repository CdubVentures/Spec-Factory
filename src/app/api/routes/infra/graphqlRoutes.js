export function createInfraGraphqlRoutes({
  jsonRes,
  readJsonBody,
  fetchApi = globalThis.fetch,
} = {}) {
  return async function handleInfraGraphql(parts, _params, method, req, res) {
    if (parts[0] !== 'graphql' || method !== 'POST') {
      return false;
    }

    try {
      const body = await readJsonBody(req);
      const proxyRes = await fetchApi('http://localhost:8787/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const proxyData = await proxyRes.json();
      return jsonRes(res, proxyRes.status, proxyData);
    } catch {
      return jsonRes(res, 502, { error: 'graphql_proxy_failed' });
    }
  };
}
