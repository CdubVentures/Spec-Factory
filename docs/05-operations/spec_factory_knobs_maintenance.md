# Spec Factory Knobs Maintenance

> **Purpose:** Preserve the live knob inventory snapshot and retired-knob history without treating this file as the canonical config surface.
> **Prerequisites:** [../02-dependencies/environment-and-config.md](../02-dependencies/environment-and-config.md), [../04-features/pipeline-and-runtime-settings.md](../04-features/pipeline-and-runtime-settings.md)
> **Last validated:** 2026-03-16

This is a supplemental maintenance log. The canonical current-state settings references remain `src/shared/settingsDefaults.js`, `src/core/config/manifest/index.js`, `src/config.js`, and the settings-authority contracts under `src/features/settings-authority/`.

## Live Count Snapshot

| Surface | Count | Evidence |
|---------|-------|----------|
| `SETTINGS_DEFAULTS.convergence` | 2 | `src/shared/settingsDefaults.js` |
| `SETTINGS_DEFAULTS.runtime` | 277 | `src/shared/settingsDefaults.js` |
| `SETTINGS_DEFAULTS.storage` | 7 | `src/shared/settingsDefaults.js` |
| `SETTINGS_DEFAULTS.ui` | 6 | `src/shared/settingsDefaults.js` |
| `SETTINGS_DEFAULTS.autosave` | 2 | `src/shared/settingsDefaults.js` |
| **Total default keys** | **294** | flattened from `src/shared/settingsDefaults.js` |
| Config manifest groups | 10 | `src/core/config/manifest/index.js` |
| Config manifest env keys | 363 | flattened `CONFIG_MANIFEST_KEYS` from `src/core/config/manifest/index.js` |

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

### Wave 3: Manufacturer Settings Knobs

Removed on `2026-03-16`.

The archetype query planner (v3) replaced field-first query planning with source-archetype-driven planning. 6 manufacturer-specific settings were redundant — the archetype planner handles manufacturer query budgeting via `V1_BUDGET_RATIOS` (15% manufacturer), and general URL caps (`maxUrlsPerProduct`, `maxPagesPerDomain`) provide sufficient fetch-time guardrails. `manufacturerAutoPromote` is kept.

Keys removed:

- `manufacturerBroadDiscovery`
- `manufacturerDeepResearchEnabled`
- `manufacturerSeedSearchUrls`
- `maxManufacturerUrlsPerProduct`
- `maxManufacturerPagesPerDomain`
- `manufacturerReserveUrls`

### Wave 4: Development-Era Feature Flags

Removed on `2026-03-16`.

Four boolean feature flags — `enableSourceRegistry`, `enableDomainHintResolverV2`, `enableQueryCompiler`, `enableCoreDeepGates` — were development-era toggles introduced during incremental subsystem buildout. All defaulted to `true`, nobody toggled them in production, and the "disabled" code paths were vestigial. The first three formed a redundant 3-way AND gate in `searchDiscovery.js`; their compound check was replaced by the one meaningful condition: `categoryConfig?.validatedRegistry`. The fourth guarded a no-op early return in `coreDeepGate.js`.

Keys removed:

- `enableSourceRegistry`
- `enableDomainHintResolverV2`
- `enableQueryCompiler`
- `enableCoreDeepGates`

### Wave 5: Scoring, Consensus, Identity Gate & Retrieval Knobs

Removed on `2026-03-16`.

The "Scoring and Evidence" GUI section exposed ~43 knobs for consensus engine tuning, identity gate thresholds, retrieval tier/doc/method weights, and evidence limits. Per the product goal, the architecture separates Collection (current pipeline) from Review (future phase). These knobs tune review-phase logic that runs prematurely during collection. All runtime consumers already have hardcoded `??` fallback defaults — removing the settings surface does not change runtime behavior.

Bug fix included: `consensusEngine.js` used `Boolean(config.allowBelowPassTargetFill)` — `Boolean(undefined)` = `false`, but the intended default is `true`. Changed to `config?.allowBelowPassTargetFill ?? true`.

Identity Gate keys removed:

- `identityGatePublishThreshold`
- `identityGateBaseMatchThreshold`
- `qualityGateIdentityThreshold`

Consensus Engine keys removed:

- `consensusWeightedMajorityThreshold`
- `consensusStrictAcceptanceDomainCount`
- `consensusConfidenceScoringBase`
- `consensusPassTargetIdentityStrong`
- `consensusPassTargetNormal`
- `allowBelowPassTargetFill`
- `consensusMethodWeightNetworkJson`
- `consensusMethodWeightAdapterApi`
- `consensusMethodWeightStructuredMeta`
- `consensusMethodWeightPdf`
- `consensusMethodWeightTableKv`
- `consensusMethodWeightDom`
- `consensusMethodWeightLlmExtractBase`
- `consensusPolicyBonus`
- `consensusRelaxedAcceptanceDomainCount`
- `consensusInstrumentedFieldThreshold`

Retrieval & Evidence keys removed:

- `retrievalTierWeightTier1`–`retrievalTierWeightTier5`
- `retrievalDocKindWeightManualPdf`, `retrievalDocKindWeightSpecPdf`, `retrievalDocKindWeightSupport`, `retrievalDocKindWeightLabReview`, `retrievalDocKindWeightProductPage`, `retrievalDocKindWeightOther`
- `retrievalMethodWeightTable`, `retrievalMethodWeightKv`, `retrievalMethodWeightJsonLd`, `retrievalMethodWeightLlmExtract`, `retrievalMethodWeightHelperSupportive`
- `retrievalAnchorScorePerMatch`, `retrievalIdentityScorePerMatch`, `retrievalUnitMatchBonus`, `retrievalDirectFieldMatchBonus`
- `evidenceTextMaxChars`

JSON Maps removed:

- `retrievalInternalsMapJson`
- `evidencePackLimitsMapJson`
- `parsingConfidenceBaseMapJson`

Note: The unpacked individual keys derived from these JSON maps (e.g., `retrievalEvidenceTierWeightMultiplier`, `evidenceHeadingsLimit`, `parsingConfidenceBaseMap`) remain in config — only the user-facing JSON string knobs were retired.

### Wave 6: All Remaining Retrieval Group Knobs

Removed on `2026-03-16`.

The entire `retrievalGroup.js` manifest file (54 entries) was deleted. 28 were dead manifest ghosts (retired from defaults/config in Wave 1 but the manifest was never cleaned). 26 were alive but algorithm internals masquerading as settings — nobody tunes them via GUI. All runtime consumers already have hardcoded `??` fallback defaults. Zero behavior change.

Consensus LLM weight keys hardcoded:

- `consensusLlmWeightTier1`–`consensusLlmWeightTier4`
- `consensusTier1Weight`–`consensusTier4Weight`

Consensus threshold keys removed (never consumed by runtime):

- `consensusTier4OverrideThreshold`
- `consensusMinConfidence`

Retrieval core keys hardcoded:

- `retrievalMaxHitsPerField`
- `retrievalMaxPrimeSources`
- `retrievalIdentityFilterEnabled`

Retrieval internals (12) and evidence pack (3) keys: env override removed, values now read directly from normalized maps.

`serpTriageMinScore` and `serpTriageMaxUrls` survive — they are NOT in the retrieval group and are NOT retired.

### Wave 7: Dead Feature Knobs (Structured Metadata + Daemon Shutdown)

Removed on `2026-03-16`.

The `StructuredMetadataClient` was fully implemented but never instantiated in the pipeline — `pageData.structuredMetadata` was never populated, making all 6 knobs dead configuration for a dead feature. `daemonGracefulShutdownTimeoutMs` was loaded and clamped but never read by any runtime code.

Structured Metadata knobs removed (6):

- `structuredMetadataExtructEnabled`
- `structuredMetadataExtructUrl`
- `structuredMetadataExtructTimeoutMs`
- `structuredMetadataExtructMaxItemsPerSurface`
- `structuredMetadataExtructCacheEnabled`
- `structuredMetadataExtructCacheLimit`

Daemon knob removed (1):

- `daemonGracefulShutdownTimeoutMs`

All 7 values hardcoded in `configBuilder.js`. Zero behavior change (feature was already permanently off / value was never read).

## Surfaces Cleaned By The Retirement Waves

| Surface | Wave 1 | Wave 2 | Wave 3 | Wave 4 | Wave 5 | Wave 6 | Wave 7 |
|---------|--------|--------|--------|--------|--------|--------|--------|
| `src/shared/settingsDefaults.js` | convergence + runtime keys removed | 16 keys removed | 6 keys removed | 4 keys removed | 43 keys removed | convergence 15→2 keys | 7 runtime keys removed |
| `src/config.js` | convergence parsing/validation paths removed | 16 parse/env reads plus related validation/fallback paths removed | 6 parse/env reads removed | 4 parse/env reads removed | 40 parse/env reads removed; JSON map normalizers hardcoded to `{}` | 23 parseEnv calls removed; 8 consensus + 3 retrieval core hardcoded; 15 retrieval/evidence use normalized maps directly | 7 parseEnv calls removed; values hardcoded |
| `src/core/config/settingsKeyMap.js` | map entries removed | 16 entries removed | 6 entries removed | 4 entries removed | 43 entries removed across int/float/bool/string maps | CONVERGENCE_SETTINGS_KEYS 15→2 | 7 entries removed (3 int, 1 string, 2 bool, 1 int) |
| `src/features/settings-authority/runtimeSettingsRoutePut.js` | validation/range entries removed | 16 range entries removed | 6 entries removed | 4 entries removed | 43 entries removed across all validation maps | — | 3 entries removed (1 string, 2 bool) |
| `src/features/settings-authority/convergenceSettingsRouteContract.js` | — | — | — | — | — | 13 keys removed; intKeys 4→2, floatKeys 10→0, boolKeys 1→0 | — |
| `src/core/config/manifest/miscGroup.js` | obsolete manifest entries removed | 18 manifest entries removed | 6 entries removed | — | 3 entries removed | — | — |
| `src/core/config/manifest/retrievalGroup.js` | — | — | — | — | 40 entries removed | FILE DELETED (54 entries) | — |
| `src/core/config/manifest/runtimeGroup.js` | — | — | — | — | — | — | 6 STRUCTURED_METADATA entries removed |
| `src/core/config/manifest/observabilityGroup.js` | — | — | — | — | — | — | 1 DAEMON_GRACEFUL entry removed |
| GUI settings state files | deprecated keys removed from state mirrors | 16 keys removed across the affected TS files | 6 keys removed across TS files | 4 keys removed across TS files | 43 keys removed across 7 TS files | convergenceSettingsManifest.ts: 4 of 5 knob groups removed | 7 keys removed across 7 TS state files |
| GUI settings sections | loop/mode UI removed | aggressive section removed | 6 manufacturer controls removed | 4 toggle controls removed | scoring-evidence section + 2 files deleted | — | Structured Metadata group removed from Parsing section; daemon shutdown control removed from Observability |
| backend runtime behavior | obsolete mode checks removed | unconditional always-on behavior baked into the remaining code | manufacturer caps use general caps; gates always-on | 3-flag AND gate simplified; registry always loads; core/deep gate always applies | `allowBelowPassTargetFill` bug fixed (`?? true`); 7 passthrough files cleaned | zero behavior change; values hardcoded instead of env-parsed | zero behavior change; dead feature permanently off; dead plumbing removed |
| tests | stale disabled-mode assertions removed | fixture and contract updates aligned to the new runtime | fixture and gate-test cleanup | disabled-path tests deleted; fixtures cleaned | config/fixture assertions updated; behavioral tests kept | convergence key lists updated; manifest group order updated | clamping + normalization tests removed; fixture keys cleaned |

## Audit Notes

- The corrected `2026-03-16` snapshot after Wave 7 is `runtime=277`, `convergence=2`, `total defaults=294`, `manifest groups=10`, `manifest keys=363`.
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
