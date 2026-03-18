import { SETTINGS_OPTION_VALUES } from '../../../../src/shared/settingsDefaults.js';

import type {
  RuntimeOcrBackend,
  RuntimeProfile,
  RuntimeRepairDedupeRule,
  RuntimeResumeMode,
  SearxngEngine,
} from './runtimeSettingsManifestTypes.ts';

export const RUNTIME_PROFILE_OPTIONS = Object.freeze(['standard'] as RuntimeProfile[]);

export const SEARXNG_ENGINE_OPTIONS: readonly SearxngEngine[] = Object.freeze([
  'google', 'bing', 'startpage', 'duckduckgo', 'brave',
] as const);

export const SEARXNG_ENGINE_LABELS: Record<SearxngEngine, string> = {
  google: 'Google',
  bing: 'Bing',
  startpage: 'Startpage (Google proxy)',
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

export const RUNTIME_RESUME_MODE_OPTIONS = Object.freeze(
  [...SETTINGS_OPTION_VALUES.runtime.resumeMode] as RuntimeResumeMode[],
);

export const RUNTIME_OCR_BACKEND_OPTIONS = Object.freeze(
  [...SETTINGS_OPTION_VALUES.runtime.scannedPdfOcrBackend] as RuntimeOcrBackend[],
);

export const RUNTIME_REPAIR_DEDUPE_RULE_OPTIONS = Object.freeze(
  [...SETTINGS_OPTION_VALUES.runtime.repairDedupeRule] as RuntimeRepairDedupeRule[],
);
