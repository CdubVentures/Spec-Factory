// WHY: Thin orchestrator wiring configBuilder + configPostMerge (Phase 8).
// The manifest applicator is created once at module load; loadConfig composes
// buildRawConfig and applyPostMergeNormalization.

import { createManifestApplicator, buildRawConfig } from './configBuilder.js';
import { applyPostMergeNormalization } from './configPostMerge.js';
import { CONFIG_MANIFEST_DEFAULTS } from './manifest.js';

const manifestApplicator = createManifestApplicator(CONFIG_MANIFEST_DEFAULTS);

export function loadConfig(overrides = {}) {
  const { cfg, explicitEnvKeys } = buildRawConfig({ manifestApplicator });
  return applyPostMergeNormalization(cfg, overrides, explicitEnvKeys);
}
