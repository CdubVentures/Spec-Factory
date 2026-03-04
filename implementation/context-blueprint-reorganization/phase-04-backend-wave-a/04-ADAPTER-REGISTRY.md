# Phase 04 Adapter Registry

## Active Transitional Seams

| Seam ID | Legacy Surface | Adapter Intent | Replacement Contract | Owner | Expiry Phase | Status |
|---|---|---|---|---|---|---|
| `WA-A-SET-01` | `src/api/guiServer.js`, `src/api/routes/configRoutes.js`, `src/api/routes/studioRoutes.js` | route/composition consumers import settings capabilities through feature entrypoint | `src/features/settings-authority/index.js` | `settings-authority` | `phase-04-backend-wave-a` | `COMPLETED` (`04-01` landed) |
| `WA-A-SET-02` | `src/api/services/settingsContract.js`, `src/api/services/userSettingsService.js` | relocate settings internals under feature structure while preserving legacy facades | `src/features/settings-authority/*` + legacy re-export facades | `settings-authority` | `phase-05-backend-wave-b` | `SCOPED` |
| `WA-A-CAT-01` | catalog route/helper consumers in API layer | route/composition imports consume catalog-identity entrypoint instead of deep legacy imports | `src/features/catalog-identity/index.js` | `catalog-identity` | `phase-04-backend-wave-a` | `COMPLETED` (`04-02` landed) |
| `WA-A-REV-01` | review route/helper consumers in API layer | route/composition imports consume review-curation entrypoint instead of deep legacy imports | `src/features/review-curation/index.js` | `review-curation` | `phase-04-backend-wave-a` | `COMPLETED` (`04-03` landed) |

## Metadata Requirements

Every seam entry/update must include:

1. seam ID
2. owner
3. replacement contract
4. expiry phase
5. validation tests
6. cleanup or rollback task
