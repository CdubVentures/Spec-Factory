import { SETTINGS_OPTION_VALUES } from '../../../../src/shared/settingsDefaults.js';

import type {
  RuntimeOcrBackend,
  RuntimeProfile,
  RuntimeRepairDedupeRule,
  RuntimeResumeMode,
  RuntimeSelectableSearchProvider,
} from './runtimeSettingsManifestTypes.ts';

export const RUNTIME_PROFILE_OPTIONS = Object.freeze(['standard'] as RuntimeProfile[]);

export const RUNTIME_SEARCH_PROVIDER_OPTIONS = Object.freeze(
  SETTINGS_OPTION_VALUES.runtime.searchProvider.filter(
    (option): option is RuntimeSelectableSearchProvider => option !== 'none',
  ),
);

export const RUNTIME_SEARCH_ROUTE_HELP_TEXT =
  'Phase coverage: 03 Search Profile, 04 Search Planner, 05 Query Journey, and 06 Search Results.\nLives in: discovery search execution before SERP triage.\nWhat this controls: all routes still go through SearXNG; Google, Bing, and Dual choose the engine lane used for query execution, not direct provider APIs.';

export const RUNTIME_SEARCH_PROVIDER_LABELS = Object.freeze({
  searxng: 'SearXNG Meta Search',
  bing: 'Bing Lane via SearXNG',
  google: 'Google Lane via SearXNG',
  dual: 'Dual Lanes via SearXNG',
} satisfies Record<RuntimeSelectableSearchProvider, string>);

export function formatRuntimeSearchProviderLabel(provider: string | null | undefined): string {
  const token = String(provider || '').trim().toLowerCase();
  if (!token || token === 'none') {
    return '';
  }
  return RUNTIME_SEARCH_PROVIDER_LABELS[token as RuntimeSelectableSearchProvider] ?? String(provider || '').trim();
}

export const RUNTIME_RESUME_MODE_OPTIONS = Object.freeze(
  [...SETTINGS_OPTION_VALUES.runtime.resumeMode] as RuntimeResumeMode[],
);

export const RUNTIME_OCR_BACKEND_OPTIONS = Object.freeze(
  [...SETTINGS_OPTION_VALUES.runtime.scannedPdfOcrBackend] as RuntimeOcrBackend[],
);

export const RUNTIME_REPAIR_DEDUPE_RULE_OPTIONS = Object.freeze(
  [...SETTINGS_OPTION_VALUES.runtime.repairDedupeRule] as RuntimeRepairDedupeRule[],
);
