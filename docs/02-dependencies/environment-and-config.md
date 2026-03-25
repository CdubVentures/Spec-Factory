# Environment and Config

> **Purpose:** Map the live configuration surfaces, environment manifests, and user-editable settings contracts so an arriving LLM can locate the single source of truth for each knob.
> **Prerequisites:** [stack-and-toolchain.md](./stack-and-toolchain.md)
> **Last validated:** 2026-03-24

## Config Surfaces

| Surface | Defined in | Consumed by | Scope | Notes |
|---------|------------|-------------|-------|-------|
| process env manifest | `src/core/config/manifest/index.js`, `src/core/config/manifest.js` | `src/config.js` | runtime | SSOT for env-backed config keys; the repo no longer has per-group manifest files |
| resolved config object | `src/config.js` | backend runtime, CLI, process launch plans | runtime | merges manifest defaults, env, runtime defaults, and overrides |
| settings registry SSOT | `src/shared/settingsRegistry.js` | all settings surfaces, config assembly, GUI manifests | runtime + GUI | `122` live entries across `RUNTIME_SETTINGS_REGISTRY` (`99`), `BOOTSTRAP_ENV_REGISTRY` (`8`), `UI_SETTINGS_REGISTRY` (`5`), and `STORAGE_SETTINGS_REGISTRY` (`10`); no exported convergence registry exists in the live file |
| shared runtime defaults | `src/shared/settingsDefaults.js` | settings authority, GUI bootstrap, config normalization | runtime + GUI | derived defaults from the registry |
| settings accessor | `src/shared/settingsAccessor.js` | config resolution, pipeline stages | runtime | null-safe accessor with NaN fallback + registry clamping |
| composite LLM policy schema | `src/core/llm/llmPolicySchema.js` | `src/features/settings-authority/llmPolicyHandler.js`, `tools/gui-react/src/features/llm-config/state/llmPolicyAdapter.generated.ts` | runtime + GUI | structured view over managed runtime keys; no separate storage document |
| user settings document | `category_authority/_runtime/user-settings.json` | `src/features/settings-authority/*` and GUI settings hooks | persisted user state | runtime, storage, and UI settings |
| runtime settings API | `src/features/settings/api/configRoutes.js` | GUI hooks in `tools/gui-react/src/features/pipeline-settings/state/*` | operator-writable | `GET/PUT /api/v1/runtime-settings` |
| storage settings API | `src/features/settings/api/configRoutes.js` | GUI storage settings surfaces | operator-writable | `GET/PUT /api/v1/storage-settings` plus browse route |
| UI settings API | `src/features/settings/api/configRoutes.js` | GUI client state bootstrap/persistence | operator-writable | `GET/PUT /api/v1/ui-settings` |
| LLM policy API | `src/features/settings-authority/llmPolicyHandler.js` | `tools/gui-react/src/features/llm-config/state/useLlmPolicyAuthority.ts` | operator-writable | `GET/PUT /api/v1/llm-policy`; persists back into the runtime section of `user-settings.json` |
| LLM route settings API | `src/features/settings/api/configRoutes.js` | GUI LLM settings surface | operator-writable | `GET/PUT /api/v1/llm-settings/:category/routes` |
| source strategy API | `src/features/indexing/api/sourceStrategyRoutes.js` | GUI source-strategy authority | operator-writable | separate per-category policy surface |

## `.env.example` Reality

- `.env.example` is not a complete manifest mirror.
- It contains a partial set of secrets and integration keys only.
- The file itself instructs operators to tune many defaults in `src/shared/settingsDefaults.js`.
- Do not infer missing config keys from `.env.example`; use `src/core/config/manifest/index.js`, `src/shared/settingsRegistry.js`, and `src/config.js`.
- `npm run env:check` currently fails on 2026-03-24 with `Missing keys in config manifest: PORT`.
- That failure still comes from a narrow checker, not a complete manifest audit: `tools/check-env-example-sync.mjs` only scans the fixed `FILES_TO_SCAN` list declared in that script, and two of those declared paths (`src/api/routes/configRoutes.js`, `src/catalog/activeFilteringLoader.js`) do not currently exist.

## Manifest Group Inventory

The live manifest is assembled in one place. `src/core/config/manifest/index.js` defines 10 possible group IDs, but the current exported `CONFIG_MANIFEST` materializes only 7 populated sections. Storage settings live in `STORAGE_SETTINGS_REGISTRY` and `category_authority/_runtime/user-settings.json`, not in the emitted manifest.

| Group | Manifest source | Scope | Notes |
|------|-----------------|-------|-------|
| `core` | `src/core/config/manifest/index.js` | boot/runtime environment | currently emits `PORT` and `SETTINGS_CANONICAL_ONLY_WRITES` from `BOOTSTRAP_ENV_REGISTRY` |
| `llm` | `src/core/config/manifest/index.js` | provider routing, models, budgets, timeouts, and API keys | combines populated runtime and bootstrap LLM entries |
| `discovery` | `src/core/config/manifest/index.js` | search-provider config | currently emits `searxngBaseUrl` and `searxngDefaultBaseUrl` |
| `runtime` | `src/core/config/manifest/index.js` | crawl/fetch/screenshot/runtime ops knobs | operator-tunable runtime set used by the crawl-first pipeline |
| `observability` | `src/core/config/manifest/index.js` | runtime event logging | currently emits `eventsJsonWrite` |
| `paths` | `src/core/config/manifest/index.js` | local roots and authority/frontier paths | currently emits `categoryAuthorityRoot`, `localInputRoot`, `localOutputRoot`, and `specDbDir` |
| `misc` | `src/core/config/manifest/index.js` | search/planner/browser flags | largest emitted section in the current manifest |

Declared but currently empty manifest group IDs: `caching`, `storage`, and `security`.

## User-Editable Settings Surfaces

| Surface | Contract source | API route | GUI consumers | Notes |
|---------|-----------------|-----------|---------------|-------|
| runtime settings | `src/features/settings-authority/runtimeSettingsRouteGet.js`, `runtimeSettingsRoutePut.js` | `/api/v1/runtime-settings` | `tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsAuthorityHooks.ts`, `tools/gui-react/src/features/indexing/api/indexingRunStartPayload.ts` | largest operator-facing settings surface |
| storage settings | `src/features/settings-authority/settingsValueTypes.js` plus `configRoutes.js` | `/api/v1/storage-settings` | `tools/gui-react/src/features/pipeline-settings/state/storageSettingsAuthority.ts` | includes browse capability and run-data storage config |
| composite LLM policy | `src/core/llm/llmPolicySchema.js`, `src/features/settings-authority/llmPolicyHandler.js` | `/api/v1/llm-policy` | `tools/gui-react/src/features/llm-config/state/useLlmPolicyAuthority.ts`, `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` | edits provider registry, API keys, budgets, tokens, timeouts, and phase overrides by writing managed runtime keys |
| LLM route settings | `src/features/settings/api/configRoutes.js` | `/api/v1/llm-settings/:category/routes` | `tools/gui-react/src/stores/llmSettingsAuthority.ts` | category-scoped route matrix edits |
| UI settings | `src/features/settings-authority/settingsValueTypes.js` | `/api/v1/ui-settings` | client bootstrap/autosave settings | UI-only persistence flags |
| source strategy | `src/features/indexing/api/sourceStrategyRoutes.js` | `/api/v1/source-strategy` | `tools/gui-react/src/features/pipeline-settings/state/sourceStrategyAuthority.ts` | per-category discovery/source-policy records |

The persisted `convergence` section still exists in `category_authority/_runtime/user-settings.json`, but the live repo does not mount a `/api/v1/convergence-settings` HTTP surface and does not export a dedicated convergence registry.

## High-Signal Settings Keys

| Surface | Examples | Primary consumers |
|---------|----------|-------------------|
| runtime settings | `searchEngines`, `searxngBaseUrl`, `llmModelPlan`, `llmProvider`, `pipelineSchemaEnforcementMode`, `specDbDir`, `categoryAuthorityRoot` | `src/config.js`, process launch plans, GUI settings hooks |
| composite LLM policy keys | `llmProviderRegistryJson`, `llmPhaseOverridesJson`, `llmTimeoutMs`, `llmMonthlyBudgetUsd`, `llmPerProductBudgetUsd`, `llmMaxOutputTokensPlan`, `llmPlanFallbackModel` | `src/core/llm/llmPolicySchema.js`, `src/features/settings-authority/llmPolicyHandler.js`, `tools/gui-react/src/features/llm-config/*` |
| storage settings | `destinationType`, `localDirectory`, `awsRegion`, `s3Bucket`, `s3Prefix` | `src/api/services/runDataRelocationService.js`, storage settings hooks |
| UI settings | `studioAutoSaveEnabled`, `runtimeAutoSaveEnabled`, `storageAutoSaveEnabled`, `llmSettingsAutoSaveEnabled` | GUI autosave and persisted UI behavior |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/core/config/manifest.js` | live barrel that re-exports the manifest assembly |
| source | `src/core/config/manifest/index.js` | manifest assembly and default export surface |
| source | `src/config.js` | config merge order and env consumption |
| source | `src/shared/settingsRegistry.js` | SSOT registry counts, group ids, and live env-backed/settings-backed inventory |
| source | `src/core/config/settingsKeyMap.js` | route-get map derivation and dual-key pair constants |
| source | `src/shared/settingsDefaults.js` | derived defaults from the registry |
| source | `src/features/settings/api/configRoutes.js` | live settings route surfaces |
| source | `src/features/settings-authority/llmPolicyHandler.js` | composite LLM policy route and persistence behavior |
| source | `src/core/llm/llmPolicySchema.js` | composite policy group structure and managed keys |
| source | `src/features/settings-authority/settingsContract.js` | settings authority key exports and schema ownership |
| config | `.env.example` | partial secrets-only env template |
| source | `tools/check-env-example-sync.mjs` | fixed-scope env reference checker behavior |
| command | `npm run env:check` | current env-check output fails with `Missing keys in config manifest: PORT` |

## Related Documents

- [External Services](./external-services.md) - Connects specific config keys to service boundaries.
- [Setup and Installation](./setup-and-installation.md) - Uses these surfaces in the local bootstrap sequence.
- [LLM Policy and Provider Config](../04-features/llm-policy-and-provider-config.md) - Shows how the composite LLM policy is edited and persisted.
- [Pipeline and Runtime Settings](../04-features/pipeline-and-runtime-settings.md) - Shows how operators edit the other settings surfaces in the GUI.
