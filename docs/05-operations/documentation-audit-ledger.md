# Documentation Audit Ledger

> **Purpose:** Record the documentation audit dispositions, major divergences, exclusions, and final validation proof for the maintained documentation surface.
> **Prerequisites:** [../README.md](../README.md), [known-issues.md](./known-issues.md)
> **Last validated:** 2026-04-10

## Scope

- Audited every Markdown file under `docs/` except the user-locked trees:
  - `docs/implementation/`
  - `docs/features-html/`
  - `docs/data-structure-html/`
- Included repo-root `README.md` and `CLAUDE.md` because they are first-touch LLM entrypoints.
- This was a documentation-only pass. No application code, runtime config, tests, migrations, or infrastructure definitions were modified.

## Disposition Summary

| Bucket | Count | Meaning in this pass |
|--------|-------|----------------------|
| `RETAIN` | `0` | File remained materially correct after audit with no content change required. |
| `EDIT` | `43` | File covered a relevant topic but needed current-state corrections. |
| `REPLACE` | `0` | No file was deleted and recreated under the same path as a separate disposition. |
| `DELETE` | `0` | No in-scope Markdown file met the burden for deletion. |
| `NEW` | `2` | New current-state files added because live first-class features lacked dedicated docs. |

## Edited Files

### Repo-Root Entrypoints

- `README.md`
- `CLAUDE.md`

### Master Index And Overview

- `docs/README.md`
- `docs/01-project-overview/scope.md`
- `docs/01-project-overview/folder-map.md`
- `docs/01-project-overview/conventions.md`
- `docs/01-project-overview/glossary.md`

### Dependencies

- `docs/02-dependencies/stack-and-toolchain.md`
- `docs/02-dependencies/environment-and-config.md`
- `docs/02-dependencies/external-services.md`
- `docs/02-dependencies/setup-and-installation.md`

### Architecture

- `docs/03-architecture/system-map.md`
- `docs/03-architecture/backend-architecture.md`
- `docs/03-architecture/frontend-architecture.md`
- `docs/03-architecture/routing-and-gui.md`
- `docs/03-architecture/data-model.md`
- `docs/03-architecture/auth-and-sessions.md`

### Features

- `docs/04-features/feature-index.md`
- `docs/04-features/billing-and-learning.md`
- `docs/04-features/catalog-and-product-selection.md`
- `docs/04-features/category-authority.md`
- `docs/04-features/color-registry.md`
- `docs/04-features/field-rules-studio.md`
- `docs/04-features/indexing-lab.md`
- `docs/04-features/llm-policy-and-provider-config.md`
- `docs/04-features/pipeline-and-runtime-settings.md`
- `docs/04-features/review-workbench.md`
- `docs/04-features/runtime-ops.md`
- `docs/04-features/storage-and-run-data.md`
- `docs/04-features/test-mode.md`

### Operations And References

- `docs/05-operations/deployment.md`
- `docs/05-operations/monitoring-and-logging.md`
- `docs/05-operations/spec_factory_knobs_maintenance.md`
- `docs/05-operations/known-issues.md`
- `docs/05-operations/documentation-audit-ledger.md`
- `docs/06-references/api-surface.md`
- `docs/06-references/background-jobs.md`
- `docs/06-references/integration-boundaries.md`
- `docs/07-patterns/canonical-examples.md`
- `docs/07-patterns/anti-patterns.md`

### Historical Audit Records

- `docs/audits/base-model-contract-audit-2026-04-04.md`
- `docs/audits/field-catalog-seed-retirement-audit-2026-04-04.md`
- `docs/audits/product-ssot-validation-2026-04-02.md`

## New Files Added

| File | Reason |
|------|--------|
| `docs/04-features/unit-registry.md` | live first-class `/units` GUI + `/unit-registry` API surface had no dedicated feature doc |
| `docs/04-features/publisher.md` | live first-class `/publisher` GUI + `/publisher/:category/*` API surface had no dedicated feature doc |

## Retained Files

No in-scope file stayed unchanged through the 2026-04-10 normalization pass. Every maintained document was either corrected in place or newly added.

## Major Divergences Discovered

| Topic | Prior-doc assumption | Verified live state |
|------|----------------------|---------------------|
| Mounted backend route authority | several docs still described 15 mounted route families | `src/app/api/guiServerRuntime.js` mounts 17 route families |
| Route registry constant | prior docs underreported drift in `GUI_API_ROUTE_ORDER` | `src/app/api/routeRegistry.js` has 14 keys and misses `unitRegistry`, `specSeeds`, `testMode` |
| GUI route inventory | several docs omitted `/units` and `/publisher` | `tools/gui-react/src/registries/pageRegistry.ts` includes both routes |
| AppDb schema | prior docs omitted the live `unit_registry` table | `src/db/appDbSchema.js` defines `unit_registry` and AppDb CRUD methods consume it |
| Publisher candidate schema | prior docs omitted `unit`, `metadata_json`, and `status` on `field_candidates` | `src/db/specDbSchema.js` and `src/db/stores/fieldCandidateStore.js` expose those fields |
| Validation baseline | older docs still described a green suite or stale failure counts | 2026-04-10 validation is `gui:build` green, `env:check` red, `npm test` red with 10 failures |

## Unresolved Ambiguities

| Area | Current note |
|------|--------------|
| `npm run env:check` semantics | still a fixed-file manifest coverage script, not a full environment parity audit |
| Orphaned GraphQL proxy | route remains mounted even though the upstream helper server is gone |
| Review finalize action | stale client path still exists, but no live backend endpoint serves it |

## Validation Proof Used For This Pass

| Proof | Result | Notes |
|------|--------|-------|
| `npm run gui:build` | pass | Completed successfully on 2026-04-10. |
| `npm test` | fail | Completed on 2026-04-10 with `10` failures. |
| `npm run env:check` | fail | Reported `Missing keys in config manifest: PORT` on 2026-04-10. |
| `GET /health` | pass | Verified live server identity and health payload on 2026-04-10. |
| `GET /api/v1/categories` | pass | Returned the current default categories list on 2026-04-10. |
| `GET /api/v1/process/status` | pass | Verified current runtime-status payload shape on 2026-04-10. |
| `GET /api/v1/storage/overview` | pass | Verified `storage_backend: "local"` on 2026-04-10. |
| docs header + link validation | pass | Checked all 45 in-scope Markdown entrypoints; `0` required-section failures and `0` broken local links. |

## Completion Status

This pass is implementation-backed and internally cross-linked, but validation remains partially proven because the pre-existing full test suite is red on 2026-04-10. The docs now describe that red baseline instead of claiming a green suite.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `README.md` | repo-root documentation entrypoint |
| source | `CLAUDE.md` | repo-root LLM truth file |
| source | `docs/README.md` | current reading order and cross-links |
| source | `src/app/api/guiServerRuntime.js` | live mounted route order and feature ownership |
| source | `src/app/api/routeRegistry.js` | stale route-order constant |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | routed GUI page inventory |
| source | `src/db/appDbSchema.js` | live AppDb table set |
| source | `src/db/specDbSchema.js` | live SpecDb table set |
| source | `src/db/stores/fieldCandidateStore.js` | publisher candidate hydration fields |
| command | `npm run gui:build` | current GUI build validation result |
| command | `npm test` | current test-suite validation result |
| command | `npm run env:check` | current env-check failure used in the docs set |
| runtime | `GET /health` | live health contract |
| runtime | `GET /api/v1/storage/overview` | live storage overview contract |

## Related Documents

- [README](../README.md) - master entrypoint and reading order for the maintained docs set.
- [Known Issues](./known-issues.md) - current defects and hazards discovered during the audit.
- [API Surface](../06-references/api-surface.md) - endpoint inventory corrected during this pass.
