# Environment and Config

> **Purpose:** Map the live configuration surfaces, environment manifests, and user-editable settings contracts so an arriving LLM can locate the single source of truth for each knob.
> **Prerequisites:** [stack-and-toolchain.md](./stack-and-toolchain.md)
> **Last validated:** 2026-03-23

## Config Surfaces

| Surface | Defined in | Consumed by | Scope | Notes |
|---------|------------|-------------|-------|-------|
| process env manifest | `src/core/config/manifest/*.js` | `src/config.js` | runtime | SSOT for env-backed config keys |
| resolved config object | `src/config.js` | backend runtime, CLI, process launch plans | runtime | merges manifest defaults, env, runtime defaults, and overrides |
| settings registry SSOT | `src/shared/settingsRegistry.js` | all settings surfaces, config assembly, GUI manifests | runtime + GUI | 430+ settings across 4 registries: `RUNTIME_SETTINGS_REGISTRY`, `CONVERGENCE_SETTINGS_REGISTRY`, `UI_SETTINGS_REGISTRY`, `STORAGE_SETTINGS_REGISTRY` |
| shared runtime defaults | `src/shared/settingsDefaults.js` | settings authority, GUI bootstrap, config normalization | runtime + GUI | derived defaults from the registry |
| settings accessor | `src/shared/settingsAccessor.js` | config resolution, pipeline stages | runtime | null-safe accessor with NaN fallback + registry clamping |
| user settings document | `category_authority/_runtime/user-settings.json` | `src/features/settings-authority/*` and GUI settings hooks | persisted user state | runtime, convergence, storage, and UI settings |
| runtime settings API | `src/features/settings/api/configRoutes.js` | GUI hooks in `tools/gui-react/src/features/pipeline-settings/state/*` | operator-writable | `GET/PUT /api/v1/runtime-settings` |
| convergence settings API | `src/features/settings/api/configRoutes.js` | GUI convergence/settings consumers | operator-writable | `GET/PUT /api/v1/convergence-settings` |
| storage settings API | `src/features/settings/api/configRoutes.js` | GUI storage settings surfaces | operator-writable | `GET/PUT /api/v1/storage-settings` plus browse route |
| UI settings API | `src/features/settings/api/configRoutes.js` | GUI client state bootstrap/persistence | operator-writable | `GET/PUT /api/v1/ui-settings` |
| LLM route settings API | `src/features/settings/api/configRoutes.js` | GUI LLM settings surface | operator-writable | `GET/PUT /api/v1/llm-settings/:category/routes` |
| source strategy API | `src/features/indexing/api/sourceStrategyRoutes.js` | GUI source-strategy authority | operator-writable | separate per-category policy surface |

## `.env.example` Reality

- `.env.example` is not a complete manifest mirror.
- It contains a partial set of secrets and integration keys only.
- The file itself instructs operators to tune many defaults in `src/shared/settingsDefaults.js`.
- Do not infer missing config keys from `.env.example`; use `src/core/config/manifest/*.js` and `src/config.js`.
- `npm run env:check` passed on 2026-03-17 with `[env-check] OK (3 referenced keys covered)`.
- That pass result is narrow coverage, not full manifest proof: `tools/check-env-example-sync.mjs` only scans the fixed `FILES_TO_SCAN` list declared in that script, and two of those declared paths (`src/api/routes/configRoutes.js`, `src/catalog/activeFilteringLoader.js`) do not currently exist.

## Manifest Group Inventory

| Group | Manifest file | Scope | Notes |
|------|---------------|-------|-------|
| `core` | `src/core/config/manifest/coreGroup.js` | server binding and boot env | `API_BASE_URL`, `PORT`, `NODE_ENV` |
| `caching` | `src/core/config/manifest/cachingGroup.js` | cache backends | Redis URL/password/TTL only |
| `storage` | `src/core/config/manifest/storageGroup.js` | S3 and run-data relocation | includes AWS creds and run-data destination keys |
| `security` | `src/core/config/manifest/securityGroup.js` | security-related config | contains JWT keys, but no audited auth middleware consumer |
| `llm` | `src/core/config/manifest/llmGroup.js` | provider routing, budgets, Cortex, models | largest env surface |
| `discovery` | `src/core/config/manifest/discoveryGroup.js` | search-provider config | includes SearXNG base URLs |
| `retrieval` | formerly `src/core/config/manifest/retrievalGroup.js` (deleted in pipeline rework) | scoring, convergence, evidence knobs | settings migrated to `CONVERGENCE_SETTINGS_REGISTRY` in `src/shared/settingsRegistry.js` |
| `runtime` | `src/core/config/manifest/runtimeGroup.js` | fetch/ocr/screenshot/runtime ops knobs | large operator-tunable runtime set |
| `observability` | `src/core/config/manifest/observabilityGroup.js` | JSON-write flags, daemon/import loops, drift | runtime housekeeping and write-mode knobs |
| `paths` | `src/core/config/manifest/pathsGroup.js` | local roots and authority/frontier paths | includes `CATEGORY_AUTHORITY_ROOT` and `SPEC_DB_DIR` |
| `misc` | `src/core/config/manifest/miscGroup.js` | aggressive mode, Elo, image processor, general knobs | mixed operational surface |

## User-Editable Settings Surfaces

| Surface | Contract source | API route | GUI consumers | Notes |
|---------|-----------------|-----------|---------------|-------|
| runtime settings | `src/features/settings-authority/runtimeSettingsRouteGet.js`, `runtimeSettingsRoutePut.js` | `/api/v1/runtime-settings` | `tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsAuthorityHooks.ts`, `tools/gui-react/src/features/indexing/api/indexingRunStartPayload.ts` | largest operator-facing settings surface |
| convergence settings | `src/features/settings-authority/convergenceSettingsRouteContract.js` | `/api/v1/convergence-settings` | convergence UI + indexing settings consumers | scoring, concurrency, round-control knobs |
| storage settings | `src/features/settings-authority/settingsValueTypes.js` plus `configRoutes.js` | `/api/v1/storage-settings` | `tools/gui-react/src/features/pipeline-settings/state/storageSettingsAuthority.ts` | includes browse capability and run-data storage config |
| LLM route settings | `src/features/settings/api/configRoutes.js` | `/api/v1/llm-settings/:category/routes` | `tools/gui-react/src/features/pipeline-settings/state/llmSettingsAuthority.ts` | category-scoped route matrix edits |
| UI settings | `src/features/settings-authority/settingsValueTypes.js` | `/api/v1/ui-settings` | client bootstrap/autosave settings | UI-only persistence flags |

## High-Signal Settings Keys

| Surface | Examples | Primary consumers |
|---------|----------|-------------------|
| runtime settings | `searchProvider`, `searxngBaseUrl`, `llmModelPlan`, `llmProvider`, `outputMode`, `specDbDir`, `categoryAuthorityRoot`, `s3Bucket` | `src/config.js`, process launch plans, GUI settings hooks |
| convergence settings | `convergenceMaxRounds`, `serpTriageMinScore`, `retrievalMaxHitsPerField`, `laneConcurrencyFetch` | convergence logic and settings APIs |
| storage settings | `awsRegion`, run-data destination/bucket/prefix fields | `src/api/services/runDataRelocationService.js`, storage settings hooks |
| UI settings | `studioAutoSaveEnabled`, `runtimeAutoSaveEnabled`, `storageAutoSaveEnabled`, `llmSettingsAutoSaveEnabled` | GUI autosave and persisted UI behavior |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/core/config/manifest/index.js` | manifest assembly and default export surface |
| source | `src/config.js` | config merge order and env consumption |
| source | `src/shared/settingsRegistry.js` | SSOT settings registry with 430+ setting definitions across 4 registries |
| source | `src/shared/settingsDefaults.js` | derived defaults from the registry |
| source | `src/features/settings/api/configRoutes.js` | live settings route surfaces |
| source | `src/features/settings-authority/settingsContract.js` | settings authority key exports and schema ownership |
| config | `.env.example` | partial secrets-only env template |
| source | `tools/check-env-example-sync.mjs` | fixed-scope env reference checker behavior |
| command | `npm run env:check` | current env-check output is `OK (3 referenced keys covered)` |

## Related Documents

- [External Services](./external-services.md) - Connects specific config keys to service boundaries.
- [Setup and Installation](./setup-and-installation.md) - Uses these surfaces in the local bootstrap sequence.
- [Pipeline and Runtime Settings](../04-features/pipeline-and-runtime-settings.md) - Shows how operators edit these settings in the GUI.
