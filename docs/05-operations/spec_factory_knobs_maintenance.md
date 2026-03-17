# Spec Factory Knobs Maintenance

> **Purpose:** Track the current knob authority surfaces and verified inventory snapshots without treating this file as the canonical source of setting semantics.
> **Prerequisites:** [../02-dependencies/environment-and-config.md](../02-dependencies/environment-and-config.md), [../04-features/pipeline-and-runtime-settings.md](../04-features/pipeline-and-runtime-settings.md)
> **Last validated:** 2026-03-17

This log is supplemental. The canonical live definitions remain the source files that own defaults, manifests, contracts, and persistence behavior.

## Current Authority Surfaces

| Surface | Path | Current role |
|---------|------|--------------|
| shared defaults | `src/shared/settingsDefaults.js` | canonical defaults for `runtime`, `convergence`, `storage`, `ui`, and `autosave` |
| env manifest | `src/core/config/manifest/index.js` | canonical env-backed config key registry |
| config assembly | `src/config.js` | merges env, manifest defaults, shared defaults, and persisted settings |
| settings authority | `src/features/settings-authority/` | runtime/convergence/ui/storage validation, migration, and persistence |
| settings API | `src/features/settings/api/configRoutes.js` | `/runtime-settings`, `/convergence-settings`, `/ui-settings`, `/storage-settings`, `/llm-settings/*`, `/settings-manifest` |
| source strategy SSOT | `category_authority/<category>/sources.json`, `src/features/indexing/sources/sourceFileService.js`, `src/features/indexing/api/sourceStrategyRoutes.js` | file-backed source strategy ownership and mutation |
| LLM route defaults | `src/db/specDbHelpers.js`, `src/db/specDb.js` | default `llm_route_matrix` row seed and persistence |
| GUI runtime settings | `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx`, `tools/gui-react/src/features/pipeline-settings/components/RuntimeSettingsFlowCard.tsx` | current runtime/convergence/source-strategy editor surfaces |
| GUI category LLM routes | `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` | category-scoped route-matrix editor |
| GUI storage and studio | `tools/gui-react/src/pages/storage/StoragePage.tsx`, `tools/gui-react/src/features/studio/components/StudioPage.tsx` | non-pipeline settings/editing surfaces |

## Audit Corrections From 2026-03-17

- The previous maintenance log in this repo overstated the current settings inventory. The live snapshot is now `265` default leaves, not `277`.
- The current config manifest exports `10` groups and `330` env-backed keys, not `358`.
- The current pipeline-settings UI is organized around `RuntimeSettingsFlowCard` plus `RuntimeFlow*Section` files. Older ownership references such as `RuntimeFlowLlmCortexSection.tsx` and `RuntimeFlowPlannerTriageSection.tsx` are stale.
- Earlier retirement-wave claims in older copies no longer describe the live tree. Current source still contains keys such as `structuredMetadataExtruct*` and `daemonGracefulShutdownTimeoutMs` in `src/shared/settingsDefaults.js`.

## Live Snapshot

### Shared Defaults (`SETTINGS_DEFAULTS`)

| Section | Leaf count | Evidence |
|---------|------------|----------|
| `convergence` | `2` | `src/shared/settingsDefaults.js` |
| `runtime` | `243` | `src/shared/settingsDefaults.js` |
| `storage` | `7` | `src/shared/settingsDefaults.js` |
| `ui` | `6` | `src/shared/settingsDefaults.js` |
| `autosave` | `7` | `src/shared/settingsDefaults.js` |
| **Total** | **265** | flattened from `src/shared/settingsDefaults.js` |

### Settings-Authority Key Ownership

| Surface | Writable keys | Evidence |
|---------|---------------|----------|
| runtime | `212` | `src/features/settings-authority/settingsKeySets.js` |
| convergence | `2` | `src/features/settings-authority/settingsKeySets.js` |
| ui | `6` | `src/features/settings-authority/settingsKeySets.js` |
| storage | `10` | `src/features/settings-authority/settingsValueTypes.js` |

The storage count includes persisted Storage-page credentials that are not backed by `SETTINGS_DEFAULTS.storage`.

### Config Manifest

| Metric | Count | Evidence |
|--------|-------|----------|
| manifest groups | `10` | `src/core/config/manifest/index.js` |
| manifest keys | `330` | `src/core/config/manifest/index.js` |

### Source Strategy Inventory

| Category | Detailed rows | Enabled rows | `search_first` | `manual` |
|----------|---------------|--------------|----------------|----------|
| `keyboard` | `23` | `23` | `19` | `4` |
| `monitor` | `23` | `23` | `22` | `1` |
| `mouse` | `22` | `22` | `21` | `1` |

### LLM Route Matrix Defaults

| Metric | Count | Evidence |
|--------|-------|----------|
| default rows | `15` | `src/db/specDbHelpers.js` |
| field rows | `9` | `src/db/specDbHelpers.js` |
| component rows | `3` | `src/db/specDbHelpers.js` |
| list rows | `3` | `src/db/specDbHelpers.js` |

## Current GUI Ownership Notes

- Pipeline runtime/convergence editing flows through `PipelineSettingsPage.tsx`, `RuntimeSettingsFlowCard.tsx`, and the section files under `tools/gui-react/src/features/pipeline-settings/sections/`.
- Source Strategy editing is exposed through `tools/gui-react/src/pages/pipeline-settings/PipelineSourceStrategySection.tsx`.
- LLM route editing is isolated to `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`.
- Storage credentials and destination settings are owned by `tools/gui-react/src/pages/storage/StoragePage.tsx`.
- Studio autosave and authoring-state UX live under `tools/gui-react/src/features/studio/components/StudioPage.tsx`.

## Maintenance Rules

1. Update `src/shared/settingsDefaults.js` first when changing a shared default.
2. Update `src/core/config/manifest/index.js` when adding, removing, or renaming an env-backed config key.
3. Update `src/features/settings-authority/` contracts when a runtime/convergence/ui/storage key becomes writable or changes type/range.
4. Update `category_authority/<category>/sources.json` and the source-strategy docs together when source rows or discovery semantics change.
5. Update `src/db/specDbHelpers.js` and this file together when the default LLM route seed matrix changes.
6. Do not use this file as the source of truth for exact runtime behavior when the source files disagree.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/shared/settingsDefaults.js` | live default sections and counts |
| source | `src/core/config/manifest/index.js` | manifest group count and total key count |
| source | `src/config.js` | config assembly still consumes the current settings surfaces |
| source | `src/features/settings-authority/settingsKeySets.js` | runtime/convergence/ui writable key inventories |
| source | `src/features/settings-authority/settingsValueTypes.js` | storage writable key inventory |
| source | `src/features/settings/api/configRoutes.js` | current settings route ownership |
| source | `src/features/indexing/sources/sourceFileService.js` | source-strategy file ownership and defaults |
| source | `src/features/indexing/api/sourceStrategyRoutes.js` | source-strategy write surface |
| source | `src/db/specDbHelpers.js` | default LLM route seed matrix |
| source | `tools/gui-react/src/features/pipeline-settings/components/RuntimeSettingsFlowCard.tsx` | current pipeline settings composition |
| source | `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` | current LLM settings surface |

## Related Documents

- [Pipeline and Runtime Settings](../04-features/pipeline-and-runtime-settings.md) - current verified settings persistence flow.
- [Category Authority](../04-features/category-authority.md) - current authority snapshot flow and category artifact roots.
- [Implementation copy of knobs maintenance](../implementation/ai-indexing-plans/spec_factory_knobs_maintenance.md) - preserved historical reference only.
