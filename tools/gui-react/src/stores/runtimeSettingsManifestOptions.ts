import { SETTINGS_OPTION_VALUES } from '../../../../src/shared/settingsDefaults.js';

import type {
  RuntimeAutomationQueueStorageEngine,
  RuntimeOcrBackend,
  RuntimeProfile,
  RuntimeRepairDedupeRule,
  RuntimeResumeMode,
  RuntimeSelectableSearchProvider,
} from './runtimeSettingsManifestTypes';

export const RUNTIME_PROFILE_OPTIONS = Object.freeze(['standard'] as RuntimeProfile[]);

export const RUNTIME_SEARCH_PROVIDER_OPTIONS = Object.freeze(
  SETTINGS_OPTION_VALUES.runtime.searchProvider.filter(
    (option): option is RuntimeSelectableSearchProvider => option !== 'none',
  ),
);

export const RUNTIME_SEARCH_ROUTE_HELP_TEXT =
  'All routes go through SearXNG. Google, Bing, and Dual choose engine lanes, not direct provider APIs.';

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

export const RUNTIME_AUTOMATION_QUEUE_STORAGE_ENGINE_OPTIONS = Object.freeze(
  [...SETTINGS_OPTION_VALUES.runtime.automationQueueStorageEngine] as RuntimeAutomationQueueStorageEngine[],
);
