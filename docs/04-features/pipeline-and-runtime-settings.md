# Pipeline And Runtime Settings

> **Purpose:** Document the verified persistence flow for runtime, UI, storage, deterministic spec-seed, source-strategy, and category-scoped LLM route-matrix controls.
> **Prerequisites:** [../02-dependencies/environment-and-config.md](../02-dependencies/environment-and-config.md), [../03-architecture/backend-architecture.md](../03-architecture/backend-architecture.md), [llm-policy-and-provider-config.md](./llm-policy-and-provider-config.md)
> **Last validated:** 2026-03-25

This document covers the pipeline/settings surfaces owned by `PipelineSettingsPage` and `LlmSettingsPage`, including the deterministic spec-seed editor mounted inside the pipeline settings UI. The separate `/llm-config` composite policy editor is documented in [llm-policy-and-provider-config.md](./llm-policy-and-provider-config.md).

## Entry Points

| Surface | Path | Role |
|--------|------|------|
| Pipeline settings page | `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` | runtime settings, storage settings, and source-strategy editor |
| Deterministic strategy section | `tools/gui-react/src/features/pipeline-settings/sections/PipelineDeterministicStrategySection.tsx` | per-category spec-seed editor for deterministic Tier 1 query templates |
| LLM settings page | `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` | category-scoped LLM route-matrix editor |
| Settings API | `src/features/settings/api/configRoutes.js` | `/ui-settings`, `/runtime-settings`, `/storage-settings`, `/llm-settings/*`, `/indexing/llm-config` |
| Source strategy API | `src/features/indexing/api/sourceStrategyRoutes.js` | `/source-strategy/*` per-category discovery policy |
| Spec seeds API | `src/features/indexing/api/specSeedsRoutes.js` | `/spec-seeds?category=:category` deterministic query-template persistence |
| Settings authority | `src/features/settings-authority/index.js` | canonical settings schema, migration, validation, persistence |

## Dependencies

- `src/features/settings-authority/settingsContract.js`
- `src/features/settings-authority/userSettingsService.js`
- `src/features/settings/api/configRuntimeSettingsHandler.js`
- `src/features/settings/api/configStorageSettingsHandler.js`
- `src/features/settings/api/configUiSettingsHandler.js`
- `src/features/settings/api/configLlmSettingsHandler.js`
- `src/features/indexing/api/sourceStrategyRoutes.js`
- `src/features/indexing/api/specSeedsRoutes.js`
- `src/features/indexing/sources/sourceFileService.js`
- `src/features/indexing/sources/specSeedsFileService.js`
- `src/shared/settingsRegistry.js` - SSOT registry defining `122` live entries across runtime (`99`), bootstrap-env (`8`), UI (`5`), and storage (`10`) domains; no exported convergence registry exists in the live file
- `src/shared/settingsDefaults.js` - derived defaults from the registry
- `src/shared/settingsAccessor.js` - null-safe accessor with registry clamping
- `src/api/services/runDataRelocationService.js`
- `src/db/specDb.js`
- `tools/gui-react/src/features/pipeline-settings/state/specSeedsAuthority.ts`
- `tools/gui-react/src/features/pipeline-settings/sections/PipelineDeterministicStrategySection.tsx`
- `category_authority/_runtime/user-settings.json`

## Flow

1. `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` hydrates runtime settings from `GET /api/v1/runtime-settings`; storage and UI-specific saves go to `/api/v1/storage-settings` and `/api/v1/ui-settings`.
2. The same page loads `GET /api/v1/indexing/llm-config` only to derive token defaults and model metadata for runtime-setting helpers; it does not persist through `/llm-policy`.
3. `tools/gui-react/src/features/pipeline-settings/state/sourceStrategyAuthority.ts` calls `/api/v1/source-strategy` for per-category source rows stored in `category_authority/<category>/sources.json`.
4. `tools/gui-react/src/features/pipeline-settings/state/specSeedsAuthority.ts` calls `GET/PUT /api/v1/spec-seeds?category=:category` for ordered deterministic query templates stored in `category_authority/<category>/spec_seeds.json`.
5. `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` reads and writes category route matrices through `GET/PUT /api/v1/llm-settings/:category/routes`.
6. `src/features/settings/api/configRoutes.js` dispatches runtime, storage, and UI writes into their dedicated handlers, which normalize request payloads against contracts exported from `src/features/settings-authority/index.js`.
7. `src/features/settings/api/configRoutes.js` hard-codes `canonicalOnlySettingsWrites = true`, so `src/features/settings/api/configPersistenceContext.js` only persists canonical sections into `category_authority/_runtime/user-settings.json` during the current runtime.
8. `src/features/settings-authority/userSettingsService.js` projects accepted runtime/storage values back into the live in-memory config object so subsequent runs use the new settings immediately.
9. `src/features/settings/api/configLlmSettingsHandler.js` persists LLM route matrices directly into SQLite through `src/db/specDb.js`.

The `convergence` section still exists in the persisted settings document as `{}` for backward compatibility, but no live `/api/v1/convergence-settings` route is mounted in `src/features/settings/api/configRoutes.js`.

## Side Effects

- Writes canonical settings to `category_authority/_runtime/user-settings.json`.
- Mutates the live server config object so subsequent runs use updated runtime/storage settings immediately.
- Writes category source-strategy records into `category_authority/<category>/sources.json`.
- Writes category deterministic query templates into `category_authority/<category>/spec_seeds.json`.
- Updates `llm_route_matrix` rows in SQLite for category route-matrix changes.
- Emits `data-change` events such as `runtime-settings-updated`, `user-settings-updated`, and route-matrix update broadcasts.
- Broadcasts `spec-seeds-updated` after successful deterministic template writes.

## Error Paths

- Invalid storage payload: `400` with a specific validation message.
- Invalid integer/float/enum runtime setting: key is rejected and reported in the response.
- Missing SpecDb for LLM settings: `500 specdb_unavailable`.
- Missing or unresolved `category` query param for `/spec-seeds`: `400 category_required`.
- Invalid deterministic templates for `/spec-seeds`: `400 invalid_spec_seeds` with a reason such as `not_an_array` or `entry_0_not_a_nonempty_string`.
- Source-strategy validation errors are returned from `src/features/indexing/api/sourceStrategyRoutes.js` rather than through settings-authority.
- Persistence failures return route-specific `500 *_persist_failed` errors.

## State Transitions

| Surface | Transition |
|---------|------------|
| UI settings | in-memory toggle -> persisted UI snapshot |
| Runtime settings | request payload -> normalized snapshot -> live config mutation |
| Storage settings | request payload -> normalized storage snapshot -> relocation/archive config mutation |
| Source strategy | form entry -> `sources.json` row -> reloaded authority list |
| Spec seeds | ordered template edits -> `spec_seeds.json` -> deterministic query seed list for future runs |
| LLM route matrix | fetched rows -> edited rows -> persisted SQLite rows |

## Diagram

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '20px', 'actorWidth': 250, 'actorMargin': 200, 'boxMargin': 20 }}}%%
sequenceDiagram
  autonumber
  box Client
    participant PipelinePage as PipelineSettingsPage<br/>(tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx)
    participant SpecSeedsHook as specSeedsAuthority<br/>(tools/gui-react/src/features/pipeline-settings/state/specSeedsAuthority.ts)
    participant LlmSettingsPage as LlmSettingsPage<br/>(tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx)
  end
  box Server
    participant ConfigRoutes as configRoutes<br/>(src/features/settings/api/configRoutes.js)
    participant SourceRoutes as sourceStrategyRoutes<br/>(src/features/indexing/api/sourceStrategyRoutes.js)
    participant SpecSeedRoutes as specSeedsRoutes<br/>(src/features/indexing/api/specSeedsRoutes.js)
    participant Authority as settings-authority<br/>(src/features/settings-authority/index.js)
  end
  box Persistence
    participant SettingsFile as user-settings.json<br/>(category_authority/_runtime/user-settings.json)
    participant SourcesFile as sources.json<br/>(category_authority/<category>/sources.json)
    participant SeedsFile as spec_seeds.json<br/>(category_authority/<category>/spec_seeds.json)
    participant SpecDb as SpecDb<br/>(src/db/specDb.js)
  end
  PipelinePage->>ConfigRoutes: PUT /api/v1/runtime-settings
  ConfigRoutes->>Authority: persist canonical runtime section
  Authority->>SettingsFile: write runtime snapshot
  PipelinePage->>SourceRoutes: POST/PUT/DELETE /api/v1/source-strategy
  SourceRoutes->>SourcesFile: write source row changes
  SpecSeedsHook->>SpecSeedRoutes: PUT /api/v1/spec-seeds?category=:category
  SpecSeedRoutes->>SeedsFile: write ordered template list
  LlmSettingsPage->>ConfigRoutes: PUT /api/v1/llm-settings/:category/routes
  ConfigRoutes->>SpecDb: saveLlmRouteMatrix(rows)
  ConfigRoutes-->>LlmSettingsPage: persisted route matrix
```

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/features/settings/api/configRoutes.js` | live settings endpoints and dispatch split |
| source | `src/features/settings/api/configRuntimeSettingsHandler.js` | runtime settings read/write behavior |
| source | `src/features/settings/api/configStorageSettingsHandler.js` | storage settings read/write behavior |
| source | `src/features/settings/api/configUiSettingsHandler.js` | UI settings read/write behavior |
| source | `src/features/settings/api/configLlmSettingsHandler.js` | category route-matrix persistence |
| source | `src/features/settings/api/configPersistenceContext.js` | canonical-only write behavior and in-memory projection boundary |
| source | `src/features/settings-authority/README.md` | compatibility-only convergence section invariant |
| source | `src/features/settings-authority/index.js` | exported contracts and helpers |
| source | `src/features/indexing/api/sourceStrategyRoutes.js` | source-strategy read/write surface |
| source | `src/features/indexing/api/specSeedsRoutes.js` | deterministic spec-seed read/write surface |
| source | `src/features/indexing/sources/specSeedsFileService.js` | default seed list, validation, and file-write behavior |
| source | `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` | primary GUI settings surface |
| source | `tools/gui-react/src/features/pipeline-settings/sections/PipelineDeterministicStrategySection.tsx` | deterministic strategy editor UI |
| source | `tools/gui-react/src/features/pipeline-settings/state/specSeedsAuthority.ts` | GUI fetch/save calls for deterministic templates |
| source | `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` | category LLM route-matrix GUI surface |

## Related Documents

- [LLM Policy and Provider Config](./llm-policy-and-provider-config.md) - Covers the separate composite `/llm-policy` editor.
- [Storage and Run Data](./storage-and-run-data.md) - Storage settings are a subset of this flow but affect run artifact destinations.
- [Category Authority](./category-authority.md) - Persisted settings and source-strategy changes influence authority snapshots and cache invalidation.
