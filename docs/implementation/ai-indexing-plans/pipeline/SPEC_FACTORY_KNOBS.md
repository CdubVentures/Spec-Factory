# Spec Factory Knobs Maintenance Reference

> **Purpose:** Preserve the old rollout-era maintenance narrative while recording the current corrections needed to read it safely.
> **Prerequisites:** [../../../05-operations/spec_factory_knobs_maintenance.md](../../../05-operations/spec_factory_knobs_maintenance.md), [../../../04-features/pipeline-and-runtime-settings.md](../../../04-features/pipeline-and-runtime-settings.md)
> **Last audited:** 2026-03-17

This file lives under the preserved `docs/implementation/ai-indexing-plans/` subtree. It is not current-state authority.

## Current Authority

Use these instead when you need live settings truth:

- [../../../05-operations/spec_factory_knobs_maintenance.md](../../../05-operations/spec_factory_knobs_maintenance.md)
- [../../../04-features/pipeline-and-runtime-settings.md](../../../04-features/pipeline-and-runtime-settings.md)
- `src/shared/settingsDefaults.js`
- `src/core/config/manifest/index.js`
- `src/config.js`
- `src/features/settings-authority/`

## 2026-03-17 Audit Corrections

- The older rollout snapshot in this subtree no longer matches the live settings inventory.
- Current `SETTINGS_DEFAULTS` leaf counts are `convergence=2`, `runtime=243`, `storage=7`, `ui=6`, `autosave=7`, for `265` total leaves.
- Current config manifest totals are `10` groups and `330` env-backed keys.
- The current pipeline settings UI is centered on `RuntimeSettingsFlowCard` plus `RuntimeFlow*Section` files. Older references such as `RuntimeFlowLlmCortexSection.tsx` and `RuntimeFlowPlannerTriageSection.tsx` are stale.
- The `structuredMetadataExtruct*` settings have been fully retired (2026-03-18). `daemonGracefulShutdownTimeoutMs` remains in `src/shared/settingsDefaults.js`.
- Source strategy remains file-backed in `category_authority/<category>/sources.json` and `src/features/indexing/sources/sourceFileService.js`.
- Default LLM route seeding still produces `15` rows (`field=9`, `component=3`, `list=3`) via `src/db/specDbHelpers.js`.

## Current Snapshot For Safe Comparison

| Surface | Current verified value |
|---------|------------------------|
| shared default leaves | `265` |
| settings-authority runtime keys | `212` |
| settings-authority convergence keys | `2` |
| settings-authority UI keys | `6` |
| settings-authority storage keys | `10` |
| config manifest groups | `10` |
| config manifest keys | `330` |
| keyboard source rows | `23` |
| monitor source rows | `23` |
| mouse source rows | `22` |
| default LLM route rows | `15` |

## How To Read The Old Narrative

- Treat any detailed retirement-wave language here as historical rollout context, not as proof of what is currently in source.
- Treat any component ownership table that names deleted or moved GUI files as stale.
- When this file disagrees with current docs or source, the current docs and source win.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/shared/settingsDefaults.js` | current default sections and key counts |
| source | `src/core/config/manifest/index.js` | current manifest groups and key totals |
| source | `src/features/settings-authority/settingsKeySets.js` | current runtime/convergence/ui key ownership |
| source | `src/features/settings-authority/settingsValueTypes.js` | current storage key ownership |
| source | `src/features/indexing/sources/sourceFileService.js` | file-backed source strategy ownership |
| source | `src/db/specDbHelpers.js` | current LLM route default matrix |
| source | `tools/gui-react/src/features/pipeline-settings/components/RuntimeSettingsFlowCard.tsx` | current runtime-settings composition |

## Related Documents

- [../../../05-operations/spec_factory_knobs_maintenance.md](../../../05-operations/spec_factory_knobs_maintenance.md) - current maintained copy.
- [../../../04-features/pipeline-and-runtime-settings.md](../../../04-features/pipeline-and-runtime-settings.md) - current settings persistence flow.
