# Phase 05 Adapter Registry

## Active Transitional Seams

| Seam ID | Legacy Surface | Adapter Intent | Replacement Contract | Owner | Expiry Phase | Status |
|---|---|---|---|---|---|---|
| `WA-B-PIPE-01` | `src/pipeline/runProduct.js` | extract runtime orchestration helper families behind bounded adapters | `src/features/runtime-intelligence/*` + app runtime adapters | `runtime-intelligence` | `phase-05-backend-wave-b` | `IN_PROGRESS` (`05-02` first seam landed) |
| `WA-B-SET-01` | `src/api/services/settingsContract.js`, `src/api/services/userSettingsService.js` | relocate settings internals under feature structure while preserving legacy re-export facades | `src/features/settings-authority/*` + legacy facades | `settings-authority` | `phase-05-backend-wave-b` | `IN_PROGRESS` (`05-01` seeded) |
| `WA-B-CLI-01` | `src/cli/spec.js` | route remaining deep domain imports through app-layer CLI adapters and feature contracts | `src/app/cli/*` + `src/features/*/index.js` | `app/cli` | `phase-05-backend-wave-b` | `SCOPED` |
| `WA-B-API-01` | `src/api/guiServer.js` | route remaining deep domain imports through app-layer API adapters and feature contracts | `src/app/api/*` + `src/features/*/index.js` | `app/api` | `phase-05-backend-wave-b` | `SCOPED` |

## Metadata Requirements

Every seam entry/update must include:

1. seam ID
2. owner
3. replacement contract
4. expiry phase
5. validation tests
6. cleanup or rollback task
