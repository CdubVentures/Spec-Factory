// WHY: Proxies Serper.dev account endpoint to expose credit balance
// in the GUI without leaking the API key to the browser.

const SERPER_ACCOUNT_URL = 'https://google.serper.dev/account';

export function createInfraSerperRoutes({
  jsonRes,
  getSerperApiKey,
  getSerperEnabled,
  fetchApi = globalThis.fetch,
} = {}) {
  return async function handleInfraSerper(parts, _params, method, _req, res) {
    if (parts[0] !== 'serper') return false;
    if (parts[1] !== 'credit' || method !== 'GET') return false;

    const enabled = typeof getSerperEnabled === 'function' ? Boolean(getSerperEnabled()) : true;
    const apiKey = typeof getSerperApiKey === 'function' ? getSerperApiKey() : '';
    if (!apiKey) {
      return jsonRes(res, 200, { credit: null, configured: false, enabled });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetchApi(SERPER_ACCOUNT_URL, {
        method: 'GET',
        headers: { 'X-API-KEY': apiKey },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 401) {
        return jsonRes(res, 200, { credit: null, configured: true, enabled, error: 'auth_failed' });
      }

      if (!response.ok) {
        return jsonRes(res, 200, { credit: null, configured: true, enabled, error: `serper_http_${response.status}` });
      }

      // WHY: Serper returns { balance: number, rateLimit: number }.
      const payload = await response.json();
      const credit = payload.balance ?? payload.credit ?? null;
      return jsonRes(res, 200, { credit, configured: true, enabled });
    } catch (err) {
      return jsonRes(res, 500, {
        error: 'serper_account_check_failed',
        message: err?.message || 'unknown',
      });
    }
  };
}
