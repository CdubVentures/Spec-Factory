// WHY: O(1) Feature Scaling — parsed numeric values are registry-driven. Adding a
// new int/float setting to settingsRegistry.js auto-parses it here. Zero per-field code.

import {
  parseRuntimeFloat,
  parseRuntimeInt,
} from '../../pipeline-settings/state/runtimeSettingsParsing.ts';
import type { RuntimeSettings } from '../../pipeline-settings/state/runtimeSettingsAuthorityHelpers.ts';
import type { RuntimeSettingsNumericBaseline } from '../../pipeline-settings/state/runtimeSettingsAuthorityHelpers.ts';
import { RUNTIME_SETTINGS_REGISTRY } from '../../../shared/registryDerivedSettingsMaps.ts';

type DeriveIndexingRunStartParsedValuesInput = {
  runtimeSettingsPayload: RuntimeSettings;
  runtimeSettingsBaseline: RuntimeSettingsNumericBaseline;
};

// WHY: Legacy key names preserved for backward compat with existing consumers.
// New settings use the standard `parsed${Capitalize(key)}` naming automatically.
const KEY_NAME_OVERRIDES: Record<string, string> = {
  crawleeRequestHandlerTimeoutSecs: 'parsedCrawleeTimeout',
};

export function parsedKeyName(registryKey: string): string {
  if (registryKey in KEY_NAME_OVERRIDES) return KEY_NAME_OVERRIDES[registryKey];
  return `parsed${registryKey.charAt(0).toUpperCase()}${registryKey.slice(1)}`;
}

export function deriveIndexingRunStartParsedValues({
  runtimeSettingsPayload,
  runtimeSettingsBaseline,
}: DeriveIndexingRunStartParsedValuesInput): Record<string, number> {
  const baseline = runtimeSettingsBaseline as unknown as Record<string, number>;
  const result: Record<string, number> = {};

  for (const entry of RUNTIME_SETTINGS_REGISTRY) {
    if (entry.type !== 'int' && entry.type !== 'float') continue;

    const raw = runtimeSettingsPayload[entry.key];
    const value = typeof raw === 'number' || typeof raw === 'string' ? raw : '';
    const fb = baseline[entry.key] ?? 0;

    result[parsedKeyName(entry.key)] = entry.type === 'float'
      ? parseRuntimeFloat(value, fb)
      : parseRuntimeInt(value, fb);
  }

  return result;
}
