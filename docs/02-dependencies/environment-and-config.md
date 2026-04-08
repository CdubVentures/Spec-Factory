# Environment and Config

> **Purpose:** Map the config SSOT chain, env inventory, persistence targets, and mutable settings routes.
> **Prerequisites:** [stack-and-toolchain.md](./stack-and-toolchain.md)
> **Last validated:** 2026-04-07

## SSOT Chain

| Layer | Primary files | What it owns |
|-------|---------------|--------------|
| Registry SSOT | `src/shared/settingsRegistry.js` | runtime settings (`137`), bootstrap env keys (`3`), UI settings (`4`) |
| Manifest assembly | `src/core/config/manifest/index.js`, `src/core/config/manifest.js` | env manifest sections + defaults |
| Config facade | `src/config.js` | public config load/validate API |
| Config implementation | `src/core/config/configOrchestrator.js`, `src/core/config/configValidator.js`, `src/core/config/dotEnvLoader.js` | load/validate env + defaults |
| Runtime apply + persistence | `src/features/settings-authority/userSettingsService.js`, `src/features/settings/api/configPersistenceContext.js` | SQL-first persistence, JSON mirror/fallback, derived config rebuild |
| HTTP mutators | `src/features/settings/api/configRoutes.js` | mounted mutable config routes |

## Observed Env Files

| Path | Status | Notes |
|------|--------|-------|
| `.env` | present | default dotenv path used by `src/app/cli/spec.js` |
| `.env.example` | not present | do not document it as a live bootstrap artifact |

## `npm run env:check` Reality

Command:

```text
npm run env:check
```

Implementation:

```text
tools/check-env-example-sync.mjs
```

What it actually does:

- imports `CONFIG_MANIFEST_KEYS` from `src/core/config/manifest.js`
- scans a fixed file list for referenced env keys
- reports keys referenced in code but missing from the manifest

What it does **not** do:

- it does not compare `.env` against `.env.example`
- it does not enumerate every config consumer in the repo
- it does not prove env completeness across all source files

Current result on 2026-04-07:

```text
Missing keys in config manifest: PORT
```

## Registry And Manifest Counts

| Inventory | Count | Evidence |
|-----------|-------|----------|
| Runtime settings registry | `137` | `src/shared/settingsRegistry.js` |
| Bootstrap env registry | `3` | `src/shared/settingsRegistry.js` |
| UI settings registry | `4` | `src/shared/settingsRegistry.js` |
| Total exported registry entries | `144` | `src/shared/settingsRegistry.js` |
| Manifest sections emitted | `5` | `src/core/config/manifest/index.js` |
| Total manifest entries | `137` | `src/core/config/manifest/index.js` |

Manifest sections:

| Section | Entries |
|---------|---------|
| `llm` | `23` |
| `discovery` | `1` |
| `runtime` | `55` |
| `paths` | `4` |
| `misc` | `54` |

Declared but currently empty manifest groups in `src/core/config/manifest/index.js`:

```text
core
caching
storage
security
observability
```

## Config Load Order

| Step | File | Effect |
|------|------|--------|
| 1 | `src/core/config/dotEnvLoader.js` via `src/config.js` or `src/app/cli/spec.js` | loads `.env` or `--env <path>` |
| 2 | `src/core/config/configOrchestrator.js` | assembles base config from manifest defaults + env + overrides |
| 3 | `src/features/settings-authority/userSettingsService.js` `applyRuntimeSettingsToConfig()` | overlays persisted runtime settings |
| 4 | `src/config.js` `loadConfigWithUserSettings()` | prefers runtime snapshot when `RUNTIME_SETTINGS_SNAPSHOT` is present, otherwise persisted user settings |
| 5 | `src/features/settings/api/configPersistenceContext.js` | applies SQL-loaded runtime/UI state to the live server config during route-context setup |

## Mutable HTTP Config Surfaces

Mounted by:

```text
src/features/settings/api/configRoutes.js
src/app/api/guiServerRuntime.js
```

| Route family | Handler | Storage target | GUI / caller surfaces |
|--------------|---------|----------------|-----------------------|
| `/api/v1/runtime-settings` | `src/features/settings/api/configRuntimeSettingsHandler.js` | AppDb `settings` section `runtime` plus JSON mirror/fallback | `tools/gui-react/src/features/pipeline-settings/`, `tools/gui-react/src/stores/runtimeSettingsValueStore.ts` |
| `/api/v1/ui-settings` | `src/features/settings/api/configUiSettingsHandler.js` | AppDb `settings` section `ui` plus JSON mirror/fallback | `tools/gui-react/src/stores/uiStore.ts` |
| `/api/v1/llm-policy` | `src/features/settings-authority/llmPolicyHandler.js` | AppDb `settings` section `runtime` via flat-key patch merge | `tools/gui-react/src/features/llm-config/state/useLlmPolicyAuthority.ts` |
| `/api/v1/llm-settings/:category/routes` | `src/features/settings/api/configLlmSettingsHandler.js` | per-category SpecDb + JSON mirror in `category_authority/<category>/_control_plane/llm_route_matrix.json` | `tools/gui-react/src/stores/llmSettingsAuthority.ts` |
| `/api/v1/source-strategy` | `src/features/indexing/api/sourceStrategyRoutes.js` | `category_authority/<category>/sources.json` | `tools/gui-react/src/features/pipeline-settings/state/sourceStrategyAuthority.ts` |
| `/api/v1/spec-seeds` | `src/features/indexing/api/specSeedsRoutes.js` | `category_authority/<category>/spec_seeds.json` | `tools/gui-react/src/features/pipeline-settings/state/specSeedsAuthority.ts` |

Verified absences:

- no mounted `/api/v1/storage-settings`
- no mounted `/api/v1/convergence-settings`

## Persistence Targets

| Data | Canonical write path | Owner |
|------|----------------------|-------|
| Runtime settings | AppDb `settings` section `runtime` in `.workspace/db/app.sqlite` | `src/features/settings-authority/userSettingsService.js` |
| UI settings | AppDb `settings` section `ui` in `.workspace/db/app.sqlite` | `src/features/settings-authority/userSettingsService.js` |
| Studio maps | AppDb `studio_maps` table in `.workspace/db/app.sqlite` | `src/features/settings-authority/userSettingsService.js` |
| JSON settings mirror / fallback | `.workspace/global/user-settings.json` | `src/features/settings-authority/userSettingsService.js` |
| Category LLM route matrices | `.workspace/db/<category>/spec.sqlite` plus `category_authority/<category>/_control_plane/llm_route_matrix.json` mirror | `src/features/settings/api/configLlmSettingsHandler.js` |
| Source strategy | `category_authority/<category>/sources.json` | `src/features/indexing/sources/sourceFileService.js` |
| Spec seeds | `category_authority/<category>/spec_seeds.json` | `src/features/indexing/sources/specSeedsFileService.js` |

## High-Signal Keys

| Area | Keys / values | Primary consumers |
|------|---------------|-------------------|
| Bootstrap paths | `CATEGORY_AUTHORITY_ROOT`, `LOCAL_OUTPUT_ROOT`, `SPEC_DB_DIR` | `src/app/api/bootstrap/`, `src/app/api/specDbRuntime.js` |
| API binding | `PORT` | `src/app/api/guiServer.js`, `src/app/api/guiServerRuntime.js` |
| Provider keys | `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` | `src/core/llm/providerMeta.js`, `src/core/llm/client/routing.js` |
| LLM registry JSON | `LLM_PROVIDER_REGISTRY_JSON`, `LLM_PHASE_OVERRIDES_JSON` | `src/features/settings-authority/llmPolicyHandler.js`, `src/core/llm/routeResolver.js` |
| Crawl runtime | `CRAWL_MAX_CONCURRENT_SLOTS`, `CRAWLEE_HEADLESS`, `CAPTURE_PAGE_SCREENSHOT_ENABLED` | `src/features/crawl/`, `src/features/indexing/`, runtime settings APIs |
| Search/discovery | `SEARCH_...`, `SEARXNG_...`, `BRAVE_...` families | `src/features/indexing/`, `src/app/api/processRuntime.js` |

## Secret-Bearing Surfaces

- `GET /api/v1/runtime-settings` returns the runtime settings snapshot assembled by `src/features/settings/api/configRuntimeSettingsHandler.js`.
- `GET /api/v1/llm-policy` returns the composite policy assembled by `src/features/settings-authority/llmPolicyHandler.js`.
- `GET /api/v1/indexing/llm-config` returns `resolved_api_keys` in `src/features/settings/api/configIndexingMetricsHandler.js`.
- No auth middleware was verified in front of these routes. Treat the running server as trusted-network-only.

## Read Next

- [External Services](./external-services.md)
- [Backend Architecture](../03-architecture/backend-architecture.md)
- [Pipeline and Runtime Settings](../04-features/pipeline-and-runtime-settings.md)
- [LLM Policy and Provider Config](../04-features/llm-policy-and-provider-config.md)

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/shared/settingsRegistry.js` | registry counts, env keys, default provider registry |
| source | `src/core/config/manifest/index.js` | emitted manifest sections and counts |
| source | `src/core/config/manifest.js` | public manifest export path |
| source | `src/config.js` | config facade and snapshot-first load order |
| source | `src/features/settings-authority/userSettingsService.js` | SQL-first persistence, JSON mirror, runtime apply behavior |
| source | `src/features/settings/api/configPersistenceContext.js` | runtime patch merge queue and live-config apply path |
| source | `src/features/settings/api/configRoutes.js` | mounted mutable config routes |
| source | `src/features/settings/api/configRuntimeSettingsHandler.js` | `/runtime-settings` contract |
| source | `src/features/settings-authority/llmPolicyHandler.js` | `/llm-policy` contract |
| source | `src/features/settings/api/configLlmSettingsHandler.js` | category LLM route-matrix persistence |
| source | `src/features/indexing/api/sourceStrategyRoutes.js` | source-strategy file-backed settings surface |
| source | `src/features/indexing/api/specSeedsRoutes.js` | spec-seeds file-backed settings surface |
| source | `tools/check-env-example-sync.mjs` | env-check implementation and limitations |
| command | `npm run env:check` | current manifest coverage failure on 2026-04-07 |
| filesystem | `.env` | observed default dotenv file presence |

## Related Documents

- [Stack and Toolchain](./stack-and-toolchain.md) - declares the runtime and build tools that consume these settings.
- [External Services](./external-services.md) - maps config keys to external integrations.
- [Pipeline and Runtime Settings](../04-features/pipeline-and-runtime-settings.md) - explains the UI and API flows over these settings surfaces.
- [LLM Policy and Provider Config](../04-features/llm-policy-and-provider-config.md) - deep dives the LLM-specific subset of this config surface.
