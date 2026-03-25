# Spec Factory Knobs Maintenance

> **Purpose:** Track the live knob authority surfaces and current inventory snapshots without treating this file as the canonical source of runtime behavior.
> **Prerequisites:** [../02-dependencies/environment-and-config.md](../02-dependencies/environment-and-config.md), [../04-features/pipeline-and-runtime-settings.md](../04-features/pipeline-and-runtime-settings.md)
> **Last validated:** 2026-03-24

This log is supplemental. The canonical live definitions remain the source files that own defaults, manifests, contracts, and persistence behavior.

## Current Authority Surfaces

| Surface | Path | Current role |
|---------|------|--------------|
| settings registry SSOT | `src/shared/settingsRegistry.js` | canonical registry entries for runtime, bootstrap env, UI, and storage settings |
| shared defaults | `src/shared/settingsDefaults.js` | derived defaults for runtime, storage, UI, and autosave surfaces |
| settings accessor | `src/shared/settingsAccessor.js` | null-safe reads plus registry-derived clamping |
| clamping ranges | `src/shared/settingsClampingRanges.js` | derived int/float/enum clamp maps |
| env manifest | `src/core/config/manifest/index.js`, `src/core/config/manifest.js` | canonical env-backed config key registry |
| config assembly | `src/config.js` | merges env, manifest defaults, shared defaults, and persisted settings |
| settings authority | `src/features/settings-authority/` | runtime, UI, storage, and compatibility-document validation/persistence; `convergence` is retained as `{}` only |
| settings API | `src/features/settings/api/configRoutes.js` | `/runtime-settings`, `/ui-settings`, `/storage-settings`, `/llm-policy`, `/llm-settings/*`, `/indexing/llm-config` |
| source strategy SSOT | `category_authority/<category>/sources.json`, `src/features/indexing/sources/sourceFileService.js`, `src/features/indexing/api/sourceStrategyRoutes.js` | file-backed source strategy ownership and mutation |
| LLM route defaults | `src/db/specDbHelpers.js`, `src/db/specDb.js` | default `llm_route_matrix` row seed and persistence |
| GUI pipeline settings | `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx`, `tools/gui-react/src/features/pipeline-settings/sections/PipelineSourceStrategySection.tsx` | runtime/storage/source-strategy editor surfaces |
| GUI LLM surfaces | `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx`, `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` | route-matrix editing and composite policy editing are separate surfaces |
| GUI storage and studio | `tools/gui-react/src/pages/storage/StoragePage.tsx`, `tools/gui-react/src/features/studio/components/StudioPage.tsx` | non-pipeline settings/editing surfaces |

## Audit Corrections From This Pass

- The older maintenance log overstated the current inventory counts. The live registry exports 233 entries, not the older 430+ claim.
- The live defaults surface is smaller than the older snapshot suggested: `SETTINGS_DEFAULTS` currently flattens to 140 leaves.
- The manifest is built from one assembly file (`src/core/config/manifest/index.js`), not a set of per-group files.
- The current pipeline-settings GUI no longer has `RuntimeSettingsFlowCard.tsx`; current ownership lives in `PipelineSettingsPage.tsx`, `PipelineSettingsPageShell.tsx`, `RuntimeFlowHeaderControls.tsx`, `RuntimeFlowPrimitives.tsx`, and `sections/PipelineSourceStrategySection.tsx`.
- No live `/api/v1/convergence-settings` route is mounted. The `convergence` document section remains only as a backwards-compatibility placeholder in `user-settings.json`.
- `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` is not an alternate category route-matrix screen; it is the composite LLM policy editor backed by `/api/v1/llm-policy`.
- Source strategy files still exist per category, but the older `search_first` / `manual` mode counts are no longer present in the live file shape.

## Live Snapshot

### Registry Counts

| Registry | Count | Evidence |
|----------|-------|----------|
| `RUNTIME_SETTINGS_REGISTRY` | `121` | `src/shared/settingsRegistry.js` |
| `BOOTSTRAP_ENV_REGISTRY` | `97` | `src/shared/settingsRegistry.js` |
| `CONVERGENCE_SETTINGS_REGISTRY` | `0` | `src/shared/settingsRegistry.js` |
| `UI_SETTINGS_REGISTRY` | `5` | `src/shared/settingsRegistry.js` |
| `STORAGE_SETTINGS_REGISTRY` | `10` | `src/shared/settingsRegistry.js` |
| **Total** | **233** | flattened from `src/shared/settingsRegistry.js` |

### Shared Defaults (`SETTINGS_DEFAULTS`)

| Section | Leaf count | Evidence |
|---------|------------|----------|
| `convergence` | `0` | `src/shared/settingsDefaults.js` |
| `runtime` | `121` | `src/shared/settingsDefaults.js` |
| `storage` | `7` | `src/shared/settingsDefaults.js` |
| `ui` | `5` | `src/shared/settingsDefaults.js` |
| `autosave` | `7` | `src/shared/settingsDefaults.js` |
| **Total** | **140** | flattened from `src/shared/settingsDefaults.js` |

### Settings-Authority Key Ownership

| Surface | Writable keys | Evidence |
|---------|---------------|----------|
| runtime | `120` | `src/features/settings-authority/settingsKeySets.js` |
| convergence | `0` | `src/features/settings-authority/README.md`, `src/core/config/settingsKeyMap.js` |
| ui | `5` | `src/features/settings-authority/settingsKeySets.js` |
| storage | `10` | `src/features/settings-authority/settingsValueTypes.js` |

### Config Manifest

| Metric | Count | Evidence |
|--------|-------|----------|
| manifest groups | `10` | `src/core/config/manifest/index.js` |
| manifest keys | `214` | `src/core/config/manifest/index.js` |

### Source Strategy Inventory

| Category | Source rows | Enabled rows | Evidence |
|----------|-------------|--------------|----------|
| `keyboard` | `23` | `23` | `category_authority/keyboard/sources.json` |
| `monitor` | `23` | `23` | `category_authority/monitor/sources.json` |
| `mouse` | `22` | `22` | `category_authority/mouse/sources.json` |
| `gaming_mice` | `0` | `0` | `category_authority/gaming_mice/sources.json` |

### LLM Route Matrix Defaults

| Metric | Count | Evidence |
|--------|-------|----------|
| default rows | `15` | `src/db/specDbHelpers.js` |
| field rows | `9` | `src/db/specDbHelpers.js` |
| component rows | `3` | `src/db/specDbHelpers.js` |
| list rows | `3` | `src/db/specDbHelpers.js` |

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
5. Update `category_authority/<category>/sources.json` and the source-strategy docs together when source rows or discovery semantics change.
6. Update `src/db/specDbHelpers.js` and this file together when the default LLM route seed matrix changes.
7. Do not use this file as the source of truth for exact runtime behavior when the source files disagree.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/shared/settingsRegistry.js` | live registry counts, group ids, and env-key ownership |
| source | `src/shared/settingsDefaults.js` | live default sections and leaf counts |
| source | `src/shared/settingsClampingRanges.js` | derived clamp-map ownership |
| source | `src/core/config/manifest/index.js` | manifest group count and total key count |
| source | `src/core/config/manifest.js` | live manifest barrel |
| source | `src/config.js` | config assembly still consumes the current settings surfaces |
| source | `src/features/settings-authority/settingsKeySets.js` | runtime/UI writable key inventories |
| source | `src/features/settings-authority/README.md` | compatibility-only convergence section invariant |
| source | `src/features/settings-authority/settingsValueTypes.js` | storage writable key inventory |
| source | `src/features/settings/api/configRoutes.js` | current settings route ownership |
| source | `src/features/indexing/sources/sourceFileService.js` | source-strategy file ownership and live shape |
| source | `src/features/indexing/api/sourceStrategyRoutes.js` | source-strategy write surface |
| source | `src/db/specDbHelpers.js` | default LLM route seed matrix |
| source | `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` | current pipeline settings composition |
| source | `tools/gui-react/src/features/pipeline-settings/sections/PipelineSourceStrategySection.tsx` | source-strategy editor ownership |
| source | `tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx` | category LLM route surface |
| source | `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` | composite global LLM policy surface |

## Related Documents

- [Pipeline and Runtime Settings](../04-features/pipeline-and-runtime-settings.md) - current verified settings persistence flow.
- [LLM Policy and Provider Config](../04-features/llm-policy-and-provider-config.md) - composite LLM policy and provider-registry flow.
- [Category Authority](../04-features/category-authority.md) - current authority snapshot flow and category artifact roots.
- [Environment and Config](../02-dependencies/environment-and-config.md) - maps config surfaces to manifest groups and user-editable settings.
