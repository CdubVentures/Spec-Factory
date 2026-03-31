# Environment and Config

> **Purpose:** Map the live configuration surfaces, environment manifests, and user-editable settings contracts so an arriving LLM can locate the single source of truth for each knob.
> **Prerequisites:** [stack-and-toolchain.md](./stack-and-toolchain.md)
> **Last validated:** 2026-03-30

## Config Surfaces

| Surface | Defined in | Consumed by | Scope | Notes |
|---------|------------|-------------|-------|-------|
| process env manifest | `src/core/config/manifest/index.js`, `src/core/config/manifest.js` | `src/config.js` | runtime | manifest is derived from registry entries; no per-group manifest files remain |
| resolved config object | `src/config.js` | backend runtime, CLI, process launch plans | runtime | merges manifest defaults, env, registry defaults, and persisted runtime settings |
| settings registry SSOT | `src/shared/settingsRegistry.js` | config assembly, settings routes, GUI manifests | runtime plus GUI | exports `145` live entries: `138` runtime, `3` bootstrap env, `4` UI |
| shared defaults | `src/shared/settingsDefaults.js` | config normalization and GUI bootstrapping | runtime plus GUI | runtime defaults are derived from registry; `storage` and `convergence` remain empty objects |
| settings accessor | `src/shared/settingsAccessor.js` | config resolution, runtime helpers | runtime | null-safe reads with registry-backed clamping |
| composite LLM policy schema | `src/core/llm/llmPolicySchema.js` | `src/features/settings-authority/llmPolicyHandler.js`, GUI adapters | runtime plus GUI | structured view over managed runtime keys |
| config persistence context | `src/features/settings/api/configPersistenceContext.js` | runtime, UI, and LLM policy handlers | runtime | applies persisted sections back into live config and UI state |
| primary persisted settings store | `.workspace/db/app.sqlite` via `src/db/appDb.js` | bootstrap and settings handlers | persisted runtime state | canonical store when `appDb` is available |
| JSON fallback settings store | `.workspace/global/user-settings.json` | early boot path, tests, fallback writes | persisted runtime state | fallback only when `appDb` is unavailable |

## `.env.example` Reality

- `.env.example` is not a complete manifest mirror.
- It is a partial env bootstrap file, not the authoritative registry of every supported config key.
- Use `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js`, and `src/config.js` as the SSOT chain.
- `npm run env:check` failed on 2026-03-30 with `Missing keys in config manifest: PORT`.
- `tools/check-env-example-sync.mjs` is a narrow fixed-file scan, not a full manifest-to-code proof.

## Emitted Manifest Inventory

`src/core/config/manifest/index.js` declares 10 possible group IDs, but the current emitted `CONFIG_MANIFEST` contains only 5 populated sections and 138 total entries.

| Manifest section | Entry count | Notes |
|------------------|-------------|-------|
| `llm` | `23` | provider IDs, models, budgets, API keys, registry JSON |
| `discovery` | `1` | current discovery/search-provider env surface |
| `runtime` | `57` | crawl, fetch, screenshot, and runtime behavior knobs |
| `paths` | `4` | category authority root, input root, output root, SpecDb dir |
| `misc` | `53` | planner, search, browser, and compatibility settings |

Unpopulated declared sections: `core`, `caching`, `storage`, `security`, and `observability`.

## User-Editable HTTP Surfaces

| Surface | Contract source | API route | GUI consumers | Persistence target |
|---------|-----------------|-----------|---------------|--------------------|
| runtime settings | `src/features/settings/api/configRuntimeSettingsHandler.js` | `/api/v1/runtime-settings` | `tools/gui-react/src/features/pipeline-settings/state/*`, `tools/gui-react/src/stores/runtimeSettingsValueStore.ts` | AppDb `settings` table, JSON fallback |
| UI settings | `src/features/settings/api/configUiSettingsHandler.js` | `/api/v1/ui-settings` | `tools/gui-react/src/stores/uiStore.ts` | AppDb `settings` table, JSON fallback |
| composite LLM policy | `src/features/settings-authority/llmPolicyHandler.js`, `src/core/llm/llmPolicySchema.js` | `/api/v1/llm-policy` | `tools/gui-react/src/features/llm-config/state/useLlmPolicyAuthority.ts` | AppDb `settings` table, JSON fallback |
| category LLM routes | `src/features/settings/api/configLlmSettingsHandler.js` | `/api/v1/llm-settings/:category/routes` | `tools/gui-react/src/stores/llmSettingsAuthority.ts` | per-category SpecDb |
| source strategy | `src/features/indexing/api/sourceStrategyRoutes.js` | `/api/v1/source-strategy` | `tools/gui-react/src/features/pipeline-settings/state/sourceStrategyAuthority.ts` | `category_authority/<category>/sources.json` |
| spec seeds | `src/features/indexing/api/specSeedsRoutes.js` | `/api/v1/spec-seeds` | `tools/gui-react/src/features/pipeline-settings/state/specSeedsAuthority.ts` | `category_authority/<category>/spec_seeds.json` |

No live `/api/v1/storage-settings` route is mounted in `src/features/settings/api/configRoutes.js`.
No live `/api/v1/convergence-settings` route is mounted in `src/features/settings/api/configRoutes.js`.

## Persistence Boundaries

| Boundary | Owner | Canonical write path | Notes |
|----------|-------|----------------------|-------|
| global runtime and UI settings | `src/features/settings-authority/userSettingsService.js` | AppDb `settings` table | JSON file is fallback only when `appDb` is unavailable |
| studio maps | `src/features/settings-authority/userSettingsService.js` | AppDb `studio_maps` table | same JSON fallback behavior |
| category LLM route matrices | `src/features/settings/api/configLlmSettingsHandler.js` | per-category SpecDb | not stored in user settings |
| source strategy | `src/features/indexing/sources/sourceFileService.js` | `category_authority/<category>/sources.json` | file-backed control-plane surface |
| spec seeds | `src/features/indexing/sources/specSeedsFileService.js` | `category_authority/<category>/spec_seeds.json` | file-backed deterministic query templates |

## High-Signal Keys and Roots

| Area | Examples | Primary consumers |
|------|----------|-------------------|
| path roots | `categoryAuthorityRoot`, `localInputRoot`, `localOutputRoot`, `specDbDir` | `src/api/bootstrap/createBootstrapEnvironment.js`, `src/api/bootstrap/createBootstrapSessionLayer.js` |
| LLM routing | `llmProvider`, `llmModelPlan`, `llmModelReasoning`, `llmPlanFallbackModel`, `llmProviderRegistryJson`, `llmPhaseOverridesJson` | `src/core/llm/*`, `src/features/settings-authority/llmPolicyHandler.js` |
| search/discovery | `searchEngines`, `searxngBaseUrl`, `searxngSearchTimeoutMs`, `searchProfileQueryCap` | planner and crawl orchestration code under `src/features/indexing/` |
| crawl/runtime | `crawlMaxConcurrentSlots`, `crawleeHeadless`, `capturePageScreenshotEnabled`, `cookieConsentEnabled`, `overlayDismissalEnabled` | crawl module and runtime pipeline |
| UI autosave | `studioAutoSaveAllEnabled`, `studioAutoSaveEnabled`, `studioAutoSaveMapEnabled`, `runtimeAutoSaveEnabled` | GUI stores and settings bootstrapping |

## Sensitive Surfaces

- `GET /api/v1/llm-policy` is unauthenticated and returns provider-registry entries that include `apiKey` fields when configured.
- `GET /api/v1/indexing/llm-config` is unauthenticated and returns `resolved_api_keys` when configured.
- Treat the current runtime as trusted-network-only until an explicit auth hardening task changes that contract.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/core/config/manifest/index.js` | emitted manifest sections and counts |
| source | `src/config.js` | config merge order and env consumption |
| source | `src/shared/settingsRegistry.js` | live registry counts and key ownership |
| source | `src/shared/settingsDefaults.js` | derived defaults and empty storage/convergence sections |
| source | `src/features/settings/api/configRoutes.js` | mounted settings route families |
| source | `src/features/settings/api/configPersistenceContext.js` | AppDb-first persistence behavior |
| source | `src/features/settings-authority/userSettingsService.js` | AppDb primary plus JSON fallback persistence model |
| source | `src/features/settings-authority/llmPolicyHandler.js` | composite LLM policy route and managed-key persistence |
| source | `src/features/indexing/api/sourceStrategyRoutes.js` | source-strategy write surface |
| source | `src/features/indexing/api/specSeedsRoutes.js` | deterministic spec-seed write surface |
| config | `.env.example` | partial env bootstrap file |
| source | `tools/check-env-example-sync.mjs` | env-check scope and limitations |
| command | `npm run env:check` | failing March 30 env-check result |

## Related Documents

- [External Services](./external-services.md) - Connects these settings to third-party and sidecar boundaries.
- [Setup and Installation](./setup-and-installation.md) - Uses these config surfaces in the local bootstrap sequence.
- [Pipeline and Runtime Settings](../04-features/pipeline-and-runtime-settings.md) - Shows the live GUI flows for runtime, UI, source strategy, and spec seeds.
- [LLM Policy and Provider Config](../04-features/llm-policy-and-provider-config.md) - Deep dive on the composite policy surface.
