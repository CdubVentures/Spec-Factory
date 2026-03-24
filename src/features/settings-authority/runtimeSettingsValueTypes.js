// WHY: Derived from registry SSOT via deriveValueTypeMap(). No manual patching
// needed for readOnly entries (awsRegion, s3Bucket) — the derivation includes them.
// defaultsOnly entries are filtered to preserve the existing RUNTIME_SETTINGS_KEYS contract.

import { RUNTIME_SETTINGS_REGISTRY } from '../../shared/settingsRegistry.js';
import { deriveValueTypeMap } from '../../shared/settingsRegistryDerivations.js';

const fullMap = deriveValueTypeMap(RUNTIME_SETTINGS_REGISTRY);
const defaultsOnlyCfgKeys = new Set(
  RUNTIME_SETTINGS_REGISTRY
    .filter((e) => e.defaultsOnly)
    .map((e) => e.configKey || e.key)
);
const filtered = {};
for (const [k, v] of Object.entries(fullMap)) {
  if (!defaultsOnlyCfgKeys.has(k)) filtered[k] = v;
}

export const RUNTIME_SETTINGS_VALUE_TYPES = Object.freeze(filtered);
