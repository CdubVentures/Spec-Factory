import { createHash } from 'node:crypto';

function stableStringify(value) {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

export class LLMCache {
  constructor({
    specDb = null,
    defaultTtlMs = 7 * 24 * 60 * 60 * 1000
  } = {}) {
    this.specDb = specDb || null;
    this.defaultTtlMs = Math.max(1, Number(defaultTtlMs || 0) || (7 * 24 * 60 * 60 * 1000));
    this._setCount = 0;
  }

  getCacheKey({
    model,
    prompt,
    evidence,
    extra = {}
  }) {
    const payload = stableStringify({
      model: String(model || '').trim(),
      prompt,
      evidence,
      extra
    });
    return sha256(payload);
  }

  async get(key) {
    if (!key || !this.specDb) {
      return null;
    }

    try {
      const entry = this.specDb.getLlmCacheEntry(key);
      if (entry) {
        const timestamp = Number(entry.timestamp || 0);
        const ttl = Number(entry.ttl || this.defaultTtlMs);
        if (Number.isFinite(timestamp) && Number.isFinite(ttl) && timestamp > 0 && ttl > 0) {
          if ((Date.now() - timestamp) <= ttl) {
            const response = entry.response;
            if (typeof response === 'string') {
              try {
                return JSON.parse(response) ?? null;
              } catch {
                return response ?? null;
              }
            }
            return response ?? null;
          }
        }
      }
    } catch {
      // WHY: best-effort — cache must not crash the pipeline
    }

    return null;
  }

  async set(key, response, ttlMs = this.defaultTtlMs) {
    if (!key || !this.specDb) {
      return;
    }
    const effectiveTtl = Math.max(1, Number(ttlMs || this.defaultTtlMs) || this.defaultTtlMs);

    try {
      this.specDb.setLlmCacheEntry(key, JSON.stringify(response), Date.now(), effectiveTtl);
      this._setCount += 1;
      if (this._setCount % 100 === 0) {
        this.specDb.evictExpiredCache(Date.now());
      }
    } catch {
      // WHY: best-effort — cache must not crash the pipeline
    }
  }

  evictExpired() {
    if (this.specDb) {
      this.specDb.evictExpiredCache(Date.now());
    }
  }
}
