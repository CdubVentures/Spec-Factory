function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const DEFAULT_PROVIDER_FAILURE_THRESHOLD = 300;
export const DEFAULT_PROVIDER_CIRCUIT_OPEN_MS = 60_000;

export function normalizeProviderHealthKey(value) {
  if (value && typeof value === 'object') {
    const provider = String(value.provider || value.id || value.name || 'default').trim().toLowerCase();
    const accessMode = String(value.accessMode || value.access_mode || '').trim().toLowerCase();
    const baseUrl = normalizeProviderBaseUrl(value.baseUrl || value.base_url || '').toLowerCase();
    const model = String(value.model || '').trim().toLowerCase();
    return [provider, accessMode, baseUrl, model].filter(Boolean).join('|') || 'default';
  }
  return String(value || 'default').toLowerCase();
}

export class LlmProviderHealth {
  constructor({
    failureThreshold = DEFAULT_PROVIDER_FAILURE_THRESHOLD,
    openMs = DEFAULT_PROVIDER_CIRCUIT_OPEN_MS,
    now = () => Date.now()
  } = {}) {
    this.failureThreshold = Math.max(1, toInt(failureThreshold, DEFAULT_PROVIDER_FAILURE_THRESHOLD));
    this.openMs = Math.max(1_000, toInt(openMs, DEFAULT_PROVIDER_CIRCUIT_OPEN_MS));
    this.now = now;
    this.providers = new Map();
  }

  _ensureProvider(name) {
    const key = normalizeProviderHealthKey(name);
    if (!this.providers.has(key)) {
      this.providers.set(key, {
        state: 'closed',
        failureCount: 0,
        successCount: 0,
        totalCalls: 0,
        openUntilMs: 0,
        lastFailure: '',
        lastCallMs: 0
      });
    }
    return this.providers.get(key);
  }

  canRequest(providerName) {
    const p = this._ensureProvider(providerName);
    const nowMs = this.now();
    if (p.state === 'open') {
      if (nowMs >= p.openUntilMs) {
        p.state = 'half_open';
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(providerName) {
    const p = this._ensureProvider(providerName);
    p.state = 'closed';
    p.failureCount = 0;
    p.successCount += 1;
    p.totalCalls += 1;
    p.openUntilMs = 0;
    p.lastCallMs = this.now();
  }

  recordFailure(providerName, error = null) {
    const p = this._ensureProvider(providerName);
    p.failureCount += 1;
    p.totalCalls += 1;
    p.lastFailure = String(error?.message || error || '');
    p.lastCallMs = this.now();
    if (p.failureCount >= this.failureThreshold) {
      p.state = 'open';
      p.openUntilMs = this.now() + this.openMs;
    } else if (p.state === 'half_open') {
      p.state = 'open';
      p.openUntilMs = this.now() + this.openMs;
    }
  }

  snapshot(providerName) {
    if (providerName) {
      const p = this._ensureProvider(providerName);
      return {
        provider: normalizeProviderHealthKey(providerName),
        state: p.state,
        failure_count: p.failureCount,
        success_count: p.successCount,
        total_calls: p.totalCalls,
        open_until_ms: p.openUntilMs || 0
      };
    }
    const result = {};
    for (const [key, p] of this.providers) {
      result[key] = {
        state: p.state,
        failure_count: p.failureCount,
        success_count: p.successCount,
        total_calls: p.totalCalls
      };
    }
    return result;
  }
}

export function normalizeProviderBaseUrl(baseUrl) {
  let url = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!url) {
    return url;
  }
  // Ensure OpenAI-compatible endpoints have /v1 suffix
  if (
    (url.includes('api.openai.com') || url.includes('localhost')) &&
    !url.endsWith('/v1')
  ) {
    url = `${url}/v1`;
  }
  return url;
}
