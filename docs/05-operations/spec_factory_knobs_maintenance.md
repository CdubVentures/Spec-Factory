# Spec Factory Knobs Maintenance

> **Purpose:** Record the live knob authority surfaces, inventory counts, and maintenance rules without treating this file as the canonical runtime source.
> **Prerequisites:** [../02-dependencies/environment-and-config.md](../02-dependencies/environment-and-config.md), [../04-features/pipeline-and-runtime-settings.md](../04-features/pipeline-and-runtime-settings.md)
> **Last validated:** 2026-04-10

This file is supplemental. Canonical behavior still lives in the source files that define registries, defaults, manifest derivation, persistence, and route mounting.

## Current Authority Surfaces

| Surface | Path | Current role |
|---------|------|--------------|
| settings registry SSOT | `src/shared/settingsRegistry.js` | canonical runtime, bootstrap-env, and UI setting entries; no separate exported storage registry exists in the current worktree |
| shared defaults | `src/shared/settingsDefaults.js` | derived defaults for runtime and UI; `convergence` and `storage` are compatibility-only empty objects |
| settings accessor | `src/shared/settingsAccessor.js` | registry-backed reads from the resolved config object |
| clamping ranges | `src/shared/settingsClampingRanges.js` | derived int/float/enum clamp maps from `RUNTIME_SETTINGS_REGISTRY` |
| env manifest | `src/core/config/manifest/index.js`, `src/core/config/manifest.js` | derives the emitted config manifest from runtime + bootstrap registries |
| config assembly | `src/config.js`, `src/core/config/configBuilder.js` | merges manifest defaults, env values, runtime defaults, and persisted settings |
| settings persistence | `src/features/settings-authority/userSettingsService.js`, `src/features/settings/api/configPersistenceContext.js` | persists settings to AppDb when available, with JSON fallback only when AppDb is unavailable |
| mounted settings API | `src/features/settings/api/configRoutes.js` | mounts `ui-settings`, `indexing/*`, `runtime-settings`, and `llm-policy`; no live `storage-settings` or `convergence-settings` route is mounted |
| storage manager inventory | `src/features/indexing/api/storageManagerRoutes.js` | inventory/maintenance surface only; currently reports `storage_backend: "local"` and is not a knob-editing API |
| source strategy SSOT | `category_authority/<category>/sources.json`, `src/features/indexing/sources/sourceFileService.js`, `src/features/indexing/api/sourceStrategyRoutes.js` | file-backed source registry; `sources` is an object keyed by `sourceId`, not an array |
| spec seed SSOT | `src/features/indexing/sources/specSeedsFileService.js`, `src/features/indexing/api/specSeedsRoutes.js` | file-backed deterministic query templates per category |
| GUI pipeline settings | `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` | edits runtime settings, source strategy, and spec seeds; no storage-settings editor exists here |
| GUI LLM surfaces | `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` | composite `llm-policy` editing |
| GUI storage surface | `tools/gui-react/src/pages/storage/StoragePage.tsx` | storage inventory/maintenance surface only; not a knob-editing screen |

## Audit Corrections From This Pass

- Older maintenance content described a live `storage-settings` settings surface. The current server does not mount that route family, and `src/features/settings/api/configStorageSettingsHandler.js` does not exist.
- Older maintenance content described a live storage registry/defaults surface. The current source exports only runtime (`137`), bootstrap (`3`), and UI (`4`) registry entries, while `SETTINGS_DEFAULTS.storage` remains `{}`.
- Older maintenance content treated the emitted manifest as a 7-section or 10-section current-state object. The current exported `CONFIG_MANIFEST` emits 5 populated sections with 137 entries.
- Older maintenance content described source inventories as arrays. The current `sources.json` files store entries under a keyed `sources` object, and enabled state lives under `discovery.enabled`.
- Older maintenance content implied active run-data relocation. The live storage manager is inventory/maintenance only and currently reports a local backend rooted at the IndexLab runs directory.

## Live Snapshot

### Registry Counts

| Registry | Count | Evidence |
|----------|-------|----------|
| `RUNTIME_SETTINGS_REGISTRY` | `137` | `src/shared/settingsRegistry.js` |
| `BOOTSTRAP_ENV_REGISTRY` | `3` | `src/shared/settingsRegistry.js` |
| `UI_SETTINGS_REGISTRY` | `4` | `src/shared/settingsRegistry.js` |
| **Total exported registry entries** | **144** | summed from the three live exported registries |

### Shared Defaults (`SETTINGS_DEFAULTS`)

| Section | Leaf count | Evidence |
|---------|------------|----------|
| `runtime` | `137` | `src/shared/settingsDefaults.js` |
| `convergence` | `0` | `src/shared/settingsDefaults.js` |
| `storage` | `0` | `src/shared/settingsDefaults.js` |
| `ui` | `4` | `src/shared/settingsDefaults.js` |
| `autosave` | `7` | `src/shared/settingsDefaults.js` (`debounceMs`: 6 keys, `statusMs`: 1 key) |

### Config Manifest

| Metric | Count | Evidence |
|--------|-------|----------|
| populated emitted sections | `5` | `src/core/config/manifest/index.js` |
| total manifest entries | `137` | `src/core/config/manifest/index.js` |
| section: `llm` | `23` | `src/core/config/manifest/index.js` |
| section: `discovery` | `1` | `src/core/config/manifest/index.js` |
| section: `runtime` | `55` | `src/core/config/manifest/index.js` |
| section: `paths` | `4` | `src/core/config/manifest/index.js` |
| section: `misc` | `54` | `src/core/config/manifest/index.js` |

Declared but currently unpopulated manifest groups remain `core`, `caching`, `storage`, `security`, and `observability`.

### Source Strategy Inventory

| Category | Source entries | Enabled entries | Evidence |
|----------|----------------|-----------------|----------|
| `keyboard` | `23` | `23` | `category_authority/keyboard/sources.json` |
| `monitor` | `23` | `23` | `category_authority/monitor/sources.json` |
| `mouse` | `22` | `22` | `category_authority/mouse/sources.json` |
| `tests` | n/a | n/a | `category_authority/tests/` exists, but no `sources.json` is present and the live categories API filters this directory out by default |

## Current GUI Ownership Notes

- `tools/gui-react/src/pages/layout/AppShell.tsx` and `tools/gui-react/src/pages/layout/hooks/useSettingsHydration.ts` hydrate runtime/UI settings before most pages render.
- `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` reads `/indexing/llm-config` for model metadata and edits runtime/source-strategy/spec-seed state.
- `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` edits the composite runtime-backed policy through `/llm-policy`.
- `tools/gui-react/src/pages/storage/StoragePage.tsx` only wraps `StorageManagerPanel`; it does not expose a writable storage-settings form.

## Maintenance Rules

1. Add, remove, or regroup a runtime knob in `src/shared/settingsRegistry.js` first.
2. Let `src/shared/settingsDefaults.js`, `src/shared/settingsClampingRanges.js`, `src/core/config/manifest/index.js`, and generated GUI typings derive from that registry change instead of hardcoding parallel maps.
3. When persistence semantics change, update both `src/features/settings-authority/userSettingsService.js` and `src/features/settings/api/configPersistenceContext.js`.
4. Do not document or generate new code against `storage-settings` or `convergence-settings` routes unless those handlers are reintroduced and mounted in `src/features/settings/api/configRoutes.js`.
5. Treat `/api/v1/storage/*` as inventory and maintenance only; do not present it as knob-editing infrastructure unless a writable settings surface is reintroduced.
6. Update `category_authority/<category>/sources.json` and `src/features/indexing/sources/sourceFileService.js` together when source entry shape, approved-host derivation, or mutable-key rules change.
7. Update `src/features/indexing/sources/specSeedsFileService.js` and `src/features/indexing/api/specSeedsRoutes.js` together when deterministic query templates change shape.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/shared/settingsRegistry.js` | live runtime/bootstrap/UI registry counts and the absence of an exported storage registry |
| source | `src/shared/settingsDefaults.js` | current default sections and leaf counts |
| source | `src/shared/settingsAccessor.js` | registry-backed config reads |
| source | `src/shared/settingsClampingRanges.js` | derived clamp-map ownership |
| source | `src/core/config/manifest/index.js` | emitted manifest sections and entry counts |
| source | `src/core/config/manifest.js` | manifest barrel export |
| source | `src/config.js` | config assembly still consumes the current settings surfaces |
| source | `src/core/config/configBuilder.js` | runtime/bootstrap registry consumption during config assembly |
| source | `src/features/settings-authority/userSettingsService.js` | AppDb-first settings persistence |
| source | `src/features/settings/api/configPersistenceContext.js` | JSON fallback and persistence counters |
| source | `src/features/settings/api/configRoutes.js` | mounted settings routes exclude `storage-settings` and `convergence-settings` |
| source | `src/features/indexing/api/storageManagerRoutes.js` | storage inventory surface is separate from knob editing and reports local backend metadata |
| source | `src/features/indexing/sources/sourceFileService.js` | `sources.json` keyed-object contract and approved-host derivation |
| source | `src/features/indexing/sources/specSeedsFileService.js` | per-category spec-seed file ownership |
| source | `src/features/indexing/api/specSeedsRoutes.js` | mounted spec-seed GET/PUT contract |
| source | `tools/gui-react/src/pages/layout/AppShell.tsx` | app-shell settings hydration boundary |
| source | `tools/gui-react/src/pages/layout/hooks/useSettingsHydration.ts` | settings hydration hook |
| source | `tools/gui-react/src/features/pipeline-settings/components/PipelineSettingsPage.tsx` | current pipeline settings GUI ownership |
| source | `tools/gui-react/src/features/llm-config/components/LlmConfigPage.tsx` | composite LLM policy surface |
| source | `tools/gui-react/src/pages/storage/StoragePage.tsx` | storage GUI is inventory-only |
| source | `category_authority/keyboard/sources.json` | keyboard source inventory count |
| source | `category_authority/monitor/sources.json` | monitor source inventory count |
| source | `category_authority/mouse/sources.json` | mouse source inventory count |

## Related Documents

- [Environment and Config](../02-dependencies/environment-and-config.md) - maps these knobs to env vars, config consumers, and secret scopes.
- [Pipeline and Runtime Settings](../04-features/pipeline-and-runtime-settings.md) - documents the live runtime/source-strategy/spec-seed editing flow.
- [LLM Policy and Provider Config](../04-features/llm-policy-and-provider-config.md) - explains the composite LLM policy surface and its sensitive reads.
- [Storage and Run Data](../04-features/storage-and-run-data.md) - documents the current inventory/maintenance-only storage feature.
