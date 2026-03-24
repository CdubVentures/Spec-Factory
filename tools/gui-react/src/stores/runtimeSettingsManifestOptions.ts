import { SETTINGS_OPTION_VALUES } from '../../../../src/shared/settingsDefaults.js';

import type {
  RuntimeRepairDedupeRule,
  SearxngEngine,
} from './runtimeSettingsManifestTypes.ts';

export const SEARXNG_ENGINE_LABELS: Record<SearxngEngine, string> = {
  google: 'Google (Crawlee)',
  bing: 'Bing',
  'google-proxy': 'Google Proxy',
  duckduckgo: 'DuckDuckGo',
  brave: 'Brave',
};

export const RUNTIME_SEARCH_PRIMARY_HELP =
  'The main engine queried for every discovery search. Always fires.';

export const RUNTIME_SEARCH_DUAL_HELP =
  'Optional second engine. Queried alongside primary in the same SearXNG request. Set to "None" to use only the primary engine.';

export const RUNTIME_SEARCH_TRIPLE_HELP =
  'Optional third engine. Queried alongside primary and dual in the same SearXNG request. Set to "None" to skip.';

export const RUNTIME_SEARCH_FALLBACK_HELP =
  'Backup engine. Tried only if primary + dual + triple return zero usable results or all results are garbage-filtered.';

export const RUNTIME_REPAIR_DEDUPE_RULE_OPTIONS = Object.freeze(
  [...SETTINGS_OPTION_VALUES.runtime.repairDedupeRule] as RuntimeRepairDedupeRule[],
);
