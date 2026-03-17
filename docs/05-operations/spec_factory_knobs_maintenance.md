# Spec Factory Knobs Maintenance

> **Purpose:** Preserve the live knob inventory snapshot and retired-knob history without treating this file as the canonical config surface.
> **Prerequisites:** [../02-dependencies/environment-and-config.md](../02-dependencies/environment-and-config.md), [../04-features/pipeline-and-runtime-settings.md](../04-features/pipeline-and-runtime-settings.md)
> **Last validated:** 2026-03-16

This is a supplemental maintenance log. The canonical current-state settings references remain `src/shared/settingsDefaults.js`, `src/core/config/manifest/index.js`, `src/config.js`, and the settings-authority contracts under `src/features/settings-authority/`.

## Live Count Snapshot

| Surface | Count | Evidence |
|---------|-------|----------|
| `SETTINGS_DEFAULTS.convergence` | 15 | `src/shared/settingsDefaults.js` |
| `SETTINGS_DEFAULTS.runtime` | 333 | `src/shared/settingsDefaults.js` |
| `SETTINGS_DEFAULTS.storage` | 7 | `src/shared/settingsDefaults.js` |
| `SETTINGS_DEFAULTS.ui` | 6 | `src/shared/settingsDefaults.js` |
| `SETTINGS_DEFAULTS.autosave` | 2 | `src/shared/settingsDefaults.js` |
| **Total default keys** | **363** | flattened from `src/shared/settingsDefaults.js` |
| Config manifest groups | 11 | `src/core/config/manifest/index.js` |
| Config manifest env keys | 473 | flattened `CONFIG_MANIFEST_KEYS` from `src/core/config/manifest/index.js` |

## Current Authority Surfaces

| Surface | File | Role |
|---------|------|------|
| shared defaults | `src/shared/settingsDefaults.js` | canonical default values for runtime, convergence, storage, UI, and autosave |
| env manifest | `src/core/config/manifest/index.js` | canonical env-backed key registry |
| config assembly | `src/config.js` | merges env, manifest defaults, runtime defaults, and persisted settings |
| settings contracts | `src/features/settings-authority/settingsContract.js` | exported runtime/convergence/UI/storage settings ownership |
| frontend manifest typing | `tools/gui-react/src/stores/runtimeSettingsManifestTypes.ts` | GUI-facing runtime settings typing and manifest derivations |

## Retirement History

### Wave 1: Dead Convergence Loop And Legacy Knobs

Removed on `2026-03-15`.

The 13-phase convergence loop was removed and replaced by the collect-then-refine architecture. Convergence-loop knobs, needset cap knobs, lane-concurrency knobs tied to that loop, and legacy fallback-model knobs were retired because they controlled behavior that no longer exists.

Representative removed keys:

- `convergenceMaxRounds`
- `convergenceNoProgressLimit`
- `convergenceMaxLowQualityRounds`
- `convergenceLowQualityConfidence`
- `convergenceMaxDispatchQueries`
- `convergenceMaxTargetFields`
- `needsetEvidenceDecayDays`
- `needsetEvidenceDecayFloor`
- `needsetCapIdentityLocked`
- `needsetCapIdentityProvisional`
- `needsetCapIdentityConflict`
- `needsetCapIdentityUnlocked`
- `serpTriageEnabled`
- `laneConcurrencySearch`
- `laneConcurrencyFetch`
- `laneConcurrencyParse`
- `laneConcurrencyLlm`
- `profile`

### Wave 2: Aggressive / Uber Mode Knobs

Removed on `2026-03-16`.

Aggressive mode (`12` knobs) and uber-aggressive mode (`4` knobs) were escalation ladders for the older convergence pipeline. Both modes were already effectively hardcoded on in the live runtime, so the toggles were redundant. Their removal bakes the always-on behavior into the remaining implementation and removes the user-visible "mode" concept.

Aggressive keys removed:

- `aggressiveModeEnabled`
- `aggressiveConfidenceThreshold`
- `aggressiveMaxSearchQueries`
- `aggressiveEvidenceAuditEnabled`
- `aggressiveEvidenceAuditBatchSize`
- `aggressiveMaxTimePerProductMs`
- `aggressiveThoroughFromRound`
- `aggressiveRound1MaxUrls`
- `aggressiveRound1MaxCandidateUrls`
- `aggressiveLlmTargetMaxFields`
- `aggressiveLlmDiscoveryPasses`
- `aggressiveLlmDiscoveryQueryCap`

Uber keys removed:

- `uberAggressiveEnabled`
- `uberMaxRounds`
- `uberMaxUrlsPerProduct`
- `uberMaxUrlsPerDomain`

Manifest-only dead entries removed at the same time:

- `AGGRESSIVE_LLM_MAX_CALLS_PER_ROUND`
- `AGGRESSIVE_LLM_MAX_CALLS_PER_PRODUCT_TOTAL`

## Surfaces Cleaned By The Retirement Waves

| Surface | Wave 1 | Wave 2 |
|---------|--------|--------|
| `src/shared/settingsDefaults.js` | convergence + runtime keys removed | 16 keys removed |
| `src/config.js` | convergence parsing/validation paths removed | 16 parse/env reads plus related validation/fallback paths removed |
| `src/core/config/settingsKeyMap.js` | map entries removed | 16 entries removed |
| `src/features/settings-authority/runtimeSettingsRoutePut.js` | validation/range entries removed | 16 range entries removed |
| `src/core/config/manifest/miscGroup.js` | obsolete manifest entries removed | 18 manifest entries removed |
| GUI settings state files | deprecated keys removed from state mirrors | 16 keys removed across the affected TS files |
| GUI settings sections | loop/mode UI removed | aggressive section removed |
| backend runtime behavior | obsolete mode checks removed | unconditional always-on behavior baked into the remaining code |
| tests | stale disabled-mode assertions removed | fixture and contract updates aligned to the new runtime |

## Audit Notes

- The prior version of this file overstated the current live counts. The corrected `2026-03-16` snapshot is `runtime=333`, `total defaults=363`, `manifest keys=473`.
- `autosave` is a distinct top-level section in `SETTINGS_DEFAULTS`; it should not be silently folded into `ui`.
- Use this file for maintenance history, not for the primary definition of current key semantics.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/shared/settingsDefaults.js` | live settings-default sections and key counts |
| source | `src/core/config/manifest/index.js` | manifest group count and flattened env-key count |
| source | `src/config.js` | config assembly still consumes the current settings surfaces |
| source | `src/features/settings-authority/settingsContract.js` | settings-authority ownership boundaries |
| source | `tools/gui-react/src/stores/runtimeSettingsManifestTypes.ts` | GUI runtime-settings manifest typing still reflects the live settings surface |

## Related Documents

- [Environment and Config](../02-dependencies/environment-and-config.md) - Canonical map of current env vars and settings surfaces.
- [Pipeline and Runtime Settings](../04-features/pipeline-and-runtime-settings.md) - User-facing flow for editing the current settings surfaces.
- [Known Issues](./known-issues.md) - Tracks the current `env:check` manifest drift.
