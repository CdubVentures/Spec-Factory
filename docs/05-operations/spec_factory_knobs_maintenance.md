# Spec Factory Knobs Maintenance

> **Purpose:** Track the live knob authority surfaces and current inventory snapshots without treating this file as the canonical source of runtime behavior.
> **Prerequisites:** [../02-dependencies/environment-and-config.md](../02-dependencies/environment-and-config.md), [../04-features/pipeline-and-runtime-settings.md](../04-features/pipeline-and-runtime-settings.md)
> **Last validated:** 2026-03-24

This log is supplemental. The canonical live definitions remain the source files that own defaults, manifests, contracts, and persistence behavior.

## Current Authority Surfaces

| Surface | Path | Current role |
|---------|------|--------------|
| settings registry SSOT | `src/shared/settingsRegistry.js` | canonical registry entries for runtime, bootstrap env, UI, and storage settings |
| shared defaults | `src/shared/settingsDefaults.js` | derived defaults for runtime, storage, UI, autosave, and compatibility-only convergence surfaces |
| settings accessor | `src/shared/settingsAccessor.js` | null-safe reads plus registry-derived clamping |
| clamping ranges | `src/shared/settingsClampingRanges.js` | derived int/float/enum clamp maps |
| env manifest | `src/core/config/manifest/index.js`, `src/core/config/manifest.js` | canonical env-backed config key registry |
| config assembly | `src/config.js` | merges manifest defaults, shared defaults, runtime snapshots, and persisted settings |
| settings authority | `src/features/settings-authority/` | runtime, UI, storage, and compatibility-document validation/persistence; `convergence` is retained as `{}` only |
| settings API | `src/features/settings/api/configRoutes.js` | `/runtime-settings`, `/ui-settings`, `/storage-settings`, `/llm-policy`, `/llm-settings/*`, `/indexing/llm-config` |
| source strategy SSOT | `category_authority/<category>/sources.json`, `src/features/indexing/sources/sourceFileService.js`, `src/features/indexing/api/sourceStrategyRoutes.js` | file-backed source strategy ownership and mutation |
| GUI pipeline settings | `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx`, `tools/gui-react/src/features/pipeline-settings/sections/PipelineSourceStrategySection.tsx` | runtime/storage/source-strategy editor surfaces |
| GUI LLM surfaces | `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`, `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` | route-matrix editing and composite policy editing are separate surfaces |
| GUI storage and studio | `tools/gui-react/src/pages/storage/StoragePage.tsx`, `tools/gui-react/src/features/studio/components/StudioPage.tsx` | non-pipeline settings/editing surfaces |

## Audit Corrections From This Pass

- The older maintenance log overstated the current inventory counts. The live registry exports `122` entries, not the older `233` or `430+` claims.
- There is no exported `CONVERGENCE_SETTINGS_REGISTRY` in `src/shared/settingsRegistry.js`; convergence survives only as a compatibility-only section in `SETTINGS_DEFAULTS` and `user-settings.json`.
- `SETTINGS_DEFAULTS` currently flattens to `118` leaves, not the older `140` count.
- `src/core/config/manifest/index.js` defines 10 possible group IDs, but the current exported `CONFIG_MANIFEST` materializes only 7 populated sections with 103 entries.
- The current pipeline-settings GUI no longer has `RuntimeSettingsFlowCard.tsx`; current ownership lives in `PipelineSettingsPage.tsx`, `PipelineSettingsPageShell.tsx`, `RuntimeFlowHeaderControls.tsx`, `RuntimeFlowPrimitives.tsx`, and `sections/PipelineSourceStrategySection.tsx`.
- No live `/api/v1/convergence-settings` route is mounted. The `convergence` document section remains only as a backwards-compatibility placeholder in `user-settings.json`.
- `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` is not an alternate category route-matrix screen; it is the composite LLM policy editor backed by `/api/v1/llm-policy`.
- `category_authority/tests/` exists in the live category inventory, but it does not include `sources.json` like the authored product categories.

## Live Snapshot

### Registry Counts

| Registry | Count | Evidence |
|----------|-------|----------|
| `RUNTIME_SETTINGS_REGISTRY` | `99` | `src/shared/settingsRegistry.js` |
| `BOOTSTRAP_ENV_REGISTRY` | `8` | `src/shared/settingsRegistry.js` |
| `UI_SETTINGS_REGISTRY` | `5` | `src/shared/settingsRegistry.js` |
| `STORAGE_SETTINGS_REGISTRY` | `10` | `src/shared/settingsRegistry.js` |
| **Total** | **122** | summed from the exported live registries in `src/shared/settingsRegistry.js` |

### Shared Defaults (`SETTINGS_DEFAULTS`)

| Section | Leaf count | Evidence |
|---------|------------|----------|
| `runtime` | `99` | `src/shared/settingsDefaults.js` |
| `convergence` | `0` | `src/shared/settingsDefaults.js` |
| `storage` | `7` | `src/shared/settingsDefaults.js` |
| `ui` | `5` | `src/shared/settingsDefaults.js` |
| `autosave` | `7` | `src/shared/settingsDefaults.js` |
| **Total** | **118** | flattened from `src/shared/settingsDefaults.js` |

### Settings-Authority Key Ownership

| Surface | Writable keys | Evidence |
|---------|---------------|----------|
| runtime | `99` | `src/features/settings-authority/settingsKeySets.js` |
| convergence compatibility section | `0` | `src/features/settings-authority/README.md`, `src/core/config/settingsKeyMap.js` |
| ui | `5` | `src/features/settings-authority/settingsKeySets.js` |
| storage | `10` | `src/features/settings-authority/settingsValueTypes.js` |

### Config Manifest

| Metric | Count | Evidence |
|--------|-------|----------|
| declared group IDs | `10` | `src/core/config/manifest/index.js` |
| populated emitted sections | `7` | `src/core/config/manifest/index.js` |
| manifest entries | `103` | `src/core/config/manifest/index.js` |

### Source Strategy Inventory

| Category | Source rows | Enabled rows | Evidence |
|----------|-------------|--------------|----------|
| `keyboard` | `23` | `23` | `category_authority/keyboard/sources.json` |
| `monitor` | `23` | `23` | `category_authority/monitor/sources.json` |
| `mouse` | `22` | `22` | `category_authority/mouse/sources.json` |
| `tests` | n/a | n/a | `category_authority/tests/` exists, but no `sources.json` is present in the current checkout |

## Current GUI Ownership Notes

- Pipeline runtime/storage/source-strategy editing flows through `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` and `tools/gui-react/src/features/pipeline-settings/sections/PipelineSourceStrategySection.tsx`.
- `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` edits category-scoped `llm_route_matrix` rows in SQLite.
- `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` edits the composite runtime-backed LLM policy and provider registry through `/api/v1/llm-policy`.
- Storage credentials and destination settings are owned by `tools/gui-react/src/pages/storage/StoragePage.tsx`.
- Studio autosave and authoring-state UX live under `tools/gui-react/src/features/studio/components/StudioPage.tsx`.

## Maintenance Rules

1. Update `src/shared/settingsRegistry.js` first when adding, removing, or regrouping a knob.
2. Update `src/shared/settingsDefaults.js` when changing a derived default.
3. Update `src/core/config/manifest/index.js` when manifest grouping or computed defaults change.
4. Update `src/features/settings-authority/` contracts when a runtime/UI/storage key becomes writable or changes type/range; keep `convergence` as a compatibility-only empty section unless a real writable surface is reintroduced.
5. Update `category_authority/<category>/sources.json` and this file together when source rows or discovery semantics change.
6. Do not use this file as the source of truth for exact runtime behavior when the source files disagree.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/shared/settingsRegistry.js` | live registry counts, group ids, and env-key ownership |
| source | `src/shared/settingsDefaults.js` | live default sections and leaf counts |
| source | `src/shared/settingsClampingRanges.js` | derived clamp-map ownership |
| source | `src/core/config/manifest/index.js` | declared versus populated manifest groups and total emitted entries |
| source | `src/core/config/manifest.js` | live manifest barrel |
| source | `src/config.js` | config assembly still consumes the current settings surfaces |
| source | `src/features/settings-authority/settingsKeySets.js` | runtime/UI writable key inventories |
| source | `src/features/settings-authority/README.md` | compatibility-only convergence section invariant |
| source | `src/features/settings-authority/settingsValueTypes.js` | storage writable key inventory |
| source | `src/features/settings/api/configRoutes.js` | current settings route ownership |
| source | `src/features/indexing/sources/sourceFileService.js` | source-strategy file ownership and live shape |
| source | `src/features/indexing/api/sourceStrategyRoutes.js` | source-strategy write surface |
| source | `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` | current pipeline settings composition |
| source | `tools/gui-react/src/features/pipeline-settings/sections/PipelineSourceStrategySection.tsx` | source-strategy editor ownership |
| source | `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` | category LLM route surface |
| source | `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` | composite global LLM policy surface |
| source | `category_authority/keyboard/sources.json` | live source-strategy row counts |
| source | `category_authority/monitor/sources.json` | live source-strategy row counts |
| source | `category_authority/mouse/sources.json` | live source-strategy row counts |

## Related Documents

- [Pipeline and Runtime Settings](../04-features/pipeline-and-runtime-settings.md) - current verified settings persistence flow.
- [LLM Policy and Provider Config](../04-features/llm-policy-and-provider-config.md) - composite LLM policy and provider-registry flow.
- [Category Authority](../04-features/category-authority.md) - current authority snapshot flow and category artifact roots.
- [Environment and Config](../02-dependencies/environment-and-config.md) - maps config surfaces to manifest groups and user-editable settings.
