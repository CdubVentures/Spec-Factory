import { toInt } from './typeHelpers.js';
import { configValue } from '../../../../shared/settingsAccessor.js';
import { OUTPUT_KEY_PREFIX } from '../../../../shared/storageKeyPrefixes.js';
import { normalizeHost } from '../../pipeline/shared/hostParser.js';

export function resolveRuntimeControlKey(storage, config = {}) {
  const raw = String(configValue(config, 'runtimeControlFile')).trim();
  if (!raw) {
    return storage.resolveOutputKey('_runtime/control/runtime_overrides.json');
  }
  if (raw.startsWith(`${OUTPUT_KEY_PREFIX}/`)) {
    return raw;
  }
  return storage.resolveOutputKey(raw);
}

export function resolveIndexingResumeKey(storage, category, productId) {
  return storage.resolveOutputKey('_runtime', 'indexing_resume', category, `${productId}.json`);
}

export function defaultRuntimeOverrides() {
  return {
    pause: false,
    max_urls_per_product: null,
    max_queries_per_product: null,
    blocked_domains: [],
    force_high_fields: [],
    disable_llm: false,
    disable_search: false,
    notes: ''
  };
}

export function normalizeRuntimeOverrides(payload = {}) {
  const input = payload && typeof payload === 'object' ? payload : {};
  return {
    ...defaultRuntimeOverrides(),
    ...input,
    pause: Boolean(input.pause),
    max_urls_per_product: input.max_urls_per_product === null || input.max_urls_per_product === undefined
      ? null
      : Math.max(1, toInt(input.max_urls_per_product, 0)),
    max_queries_per_product: input.max_queries_per_product === null || input.max_queries_per_product === undefined
      ? null
      : Math.max(1, toInt(input.max_queries_per_product, 0)),
    blocked_domains: Array.isArray(input.blocked_domains)
      ? [...new Set(input.blocked_domains.map((row) => normalizeHost(row)).filter(Boolean))]
      : [],
    force_high_fields: Array.isArray(input.force_high_fields)
      ? [...new Set(input.force_high_fields.map((row) => String(row || '').trim()).filter(Boolean))]
      : [],
    disable_llm: Boolean(input.disable_llm),
    disable_search: Boolean(input.disable_search),
    notes: String(input.notes || '')
  };
}
