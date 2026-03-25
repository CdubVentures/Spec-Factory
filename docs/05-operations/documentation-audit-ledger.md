# Documentation Audit Ledger

> **Purpose:** Record the multi-pass documentation audit, file dispositions, major divergences, and validation results for the maintained 2026-03-25 current-state docs refresh.
> **Prerequisites:** [../README.md](../README.md), [known-issues.md](./known-issues.md)
> **Last validated:** 2026-03-25

## Scope

- Audited every Markdown file under `docs/` except the excluded subtree below.
- Excluded by direct user instruction: `docs/implementation/`.
- This was a documentation-only pass. No application code, tests, configs, infrastructure, or scripts were modified.

## Audit Summary

| Bucket | Count | Notes |
|--------|-------|-------|
| `RETAIN` | `16` | Audited against the live repo and left unchanged because the file was already materially accurate. |
| `EDIT` | `24` | Corrected stale current-state assertions, validation snapshots, mounted route ownership, API surface gaps, registry counts, category inventory, auth/config assumptions, operational notes, and one mojibake defect in a maintained feature doc. |
| `REPLACE` | `0` | No in-scope file was unsalvageable after audit. |
| `DELETE` | `0` | No in-scope file met the burden for deletion. |

## Edited In This Pass

| File | Disposition | What changed |
|------|-------------|--------------|
| `docs/README.md` | `EDIT` | Corrected the live category inventory and replaced stale validation claims with the latest `env:check`, `gui:build`, and `npm test` results. |
| `docs/01-project-overview/scope.md` | `EDIT` | Replaced stale category, validation-baseline, and auth-config claims with the current live repo state. |
| `docs/01-project-overview/folder-map.md` | `EDIT` | Corrected `category_authority/` inventory, removed `gaming_mice`, and fixed settings-registry counts. |
| `docs/01-project-overview/conventions.md` | `EDIT` | Rebased repo-baseline guidance on the latest green test result and the current failing GUI/env checks. |
| `docs/02-dependencies/stack-and-toolchain.md` | `EDIT` | Rebased compatibility notes on the current green GUI build, failing env check, and refreshed `npm test` baseline. |
| `docs/02-dependencies/environment-and-config.md` | `EDIT` | Corrected registry counts, removed the nonexistent exported convergence registry, and rewrote manifest-group notes around the emitted 7-section manifest. |
| `docs/02-dependencies/external-services.md` | `EDIT` | Corrected config surfaces for S3/LLM integrations and demoted Cortex to a non-active code path note. |
| `docs/02-dependencies/setup-and-installation.md` | `EDIT` | Replaced stale verification notes with the current failing env/build checks and the current green test proof. |
| `docs/03-architecture/auth-and-sessions.md` | `EDIT` | Removed the false JWT/security-manifest claims and documented the actual absence of an emitted auth/session config surface. |
| `docs/03-architecture/backend-architecture.md` | `EDIT` | Rebased the route-pipeline narrative on `src/api/guiServerRuntime.js`, added the live `specSeeds` handler, and documented `/storage/*` delegation plus the stale `GUI_API_ROUTE_ORDER` constant. |
| `docs/03-architecture/frontend-architecture.md` | `EDIT` | Replaced stale `App.tsx`-owned route-table claims with the live `pageRegistry.ts` single-source-of-truth pattern and documented the standalone `test-mode` exception route. |
| `docs/03-architecture/routing-and-gui.md` | `EDIT` | Corrected route ownership to the live page registry, documented tab derivation, and removed the false claim that `App.tsx` hardcodes the tabbed route inventory. |
| `docs/03-architecture/system-map.md` | `EDIT` | Added the GUI page registry to the topology so the browser-side route authority points at the actual file. |
| `docs/04-features/feature-index.md` | `EDIT` | Corrected routed-feature authority from `App.tsx` to `pageRegistry.ts` and expanded the index to include the live deterministic spec-seed and storage-manager feature surfaces. |
| `docs/04-features/indexing-lab.md` | `EDIT` | Replaced mojibake punctuation in the maintained feature doc with clean ASCII so the crawl-first dependency and flow notes parse cleanly. |
| `docs/04-features/pipeline-and-runtime-settings.md` | `EDIT` | Added the deterministic spec-seed surface, corrected the canonical-only write behavior, and cross-linked the settings control-plane flows to the live `/spec-seeds` endpoints. |
| `docs/04-features/storage-and-run-data.md` | `EDIT` | Expanded the feature doc from settings-only storage notes to the live storage-manager inventory, maintenance, export, and sync surface under `/storage/*`. |
| `docs/05-operations/deployment.md` | `EDIT` | Removed a transient port-occupancy note and kept only stable deployment/build facts. |
| `docs/05-operations/known-issues.md` | `EDIT` | Rebuilt the issue matrix around live, still-present gotchas, removed the stale GUI-build failure claim, and documented the stale `GUI_API_ROUTE_ORDER` constant that omits the mounted `specSeeds` route. |
| `docs/05-operations/monitoring-and-logging.md` | `EDIT` | Added the missing `test-import-progress` WebSocket channel and clarified that `/api/install/state` belongs to the separate launcher runtime. |
| `docs/05-operations/spec_factory_knobs_maintenance.md` | `EDIT` | Corrected registry/default/manifest counts, removed `gaming_mice`, and documented the `tests/` source-strategy exception. |
| `docs/05-operations/documentation-audit-ledger.md` | `EDIT` | Replaced a stale self-referential ledger with the actual results of this pass and updated the disposition counts after the route-surface convergence pass. |
| `docs/06-references/api-surface.md` | `EDIT` | Added the live `/storage/*` inventory/maintenance endpoints, documented `/spec-seeds`, and distinguished storage settings from storage manager routes. |
| `docs/07-patterns/canonical-examples.md` | `EDIT` | Replaced the stale "register routes in `App.tsx`" guidance with the live `pageRegistry.ts` route/tab registration pattern. |

## Retained After Audit

| Area | Files retained | Confirmation of correctness |
|------|----------------|-----------------------------|
| `docs/01-project-overview/` | `docs/01-project-overview/glossary.md` | Terminology remained aligned with current feature and route names. |
| `docs/03-architecture/` | `docs/03-architecture/data-model.md`, `docs/03-architecture/STRUCTURAL-AUDIT-2026-03-23.md`, `docs/03-architecture/STRUCTURAL-AUDIT-2026-03-24.md` | Schema/data-model notes and historical-audit framing matched the audited codebase. |
| `docs/04-features/` | `docs/04-features/category-authority.md`, `docs/04-features/catalog-and-product-selection.md`, `docs/04-features/field-rules-studio.md`, `docs/04-features/llm-policy-and-provider-config.md`, `docs/04-features/review-workbench.md`, `docs/04-features/runtime-ops.md`, `docs/04-features/billing-and-learning.md`, `docs/04-features/test-mode.md` | Feature boundaries and flows remained aligned with the current implementation. |
| `docs/05-operations/` | none | Every maintained operations doc required at least one correction during this pass. |
| `docs/06-references/` | `docs/06-references/background-jobs.md`, `docs/06-references/integration-boundaries.md` | Job inventory and external boundary notes stayed consistent with the current route and worker surfaces. |
| `docs/07-patterns/` | `docs/07-patterns/anti-patterns.md` | Anti-pattern references remained consistent with the current code layout. |
| supplemental | `docs/test-audit/app-api-wiring-audit.md` | Retained as a historical test-audit record, not as current-state authority. |

## Major Divergences Discovered

| Topic | Prior-doc assumption | Verified live state |
|------|----------------------|---------------------|
| Mounted API route authority | several docs and helper references treated `src/app/api/routeRegistry.js` as the authoritative route-order source | the live mounted order is the `routeDefinitions` array in `src/api/guiServerRuntime.js`; `GUI_API_ROUTE_ORDER` is stale and omits the mounted `specSeeds` handler |
| GUI route registration | several docs instructed agents to add or reason about routes directly in `tools/gui-react/src/App.tsx` | tabbed GUI routes and tab labels are now sourced from `tools/gui-react/src/registries/pageRegistry.ts`; `App.tsx` only mounts the derived routes plus standalone `/test-mode` |
| Test baseline | several docs carried an older full-suite count | `npm test` passed on 2026-03-25 with `5827` passing tests |
| GUI build baseline | several docs carried the stale 2026-03-24 GUI build failure snapshot | `npm run gui:build` passed on 2026-03-25 and produced the current `tools/gui-react/dist/` bundle |
| Category inventory | several docs still referenced `gaming_mice` as a live category | `GET /api/v1/categories` and the checked-in `category_authority/` directories show `keyboard`, `monitor`, `mouse`, and `tests` |
| Settings inventory size | several docs claimed `233` registry entries and an exported convergence registry | `src/shared/settingsRegistry.js` exports `122` live entries across runtime (`99`), bootstrap (`8`), UI (`5`), and storage (`10`), with no exported convergence registry |
| Manifest shape | docs described a 10-group emitted manifest including `security` and `storage` sections | `src/core/config/manifest/index.js` defines 10 possible group IDs, but the current exported `CONFIG_MANIFEST` emits 7 populated sections and no `security` section |
| Auth/session posture | docs claimed JWT-related keys existed in the live registry/manifest | no emitted auth/session keys were verified in `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js`, or `src/config.js` |
| Source-strategy assumptions | docs implied every live category had `sources.json` | `category_authority/tests/` exists but has no `sources.json`; only authored product categories currently do |
| Storage API inventory | retained docs treated storage as a settings-only concern under `/storage-settings/*` | the live server also mounts `/storage/*` inventory, delete/prune/purge/export, recalculate, and sync endpoints through `src/features/indexing/api/storageManagerRoutes.js` |
| Docker deployment path | some docs treated the Dockerfile as a current deployment option | `Dockerfile` still launches missing `src/cli/run-batch.js` and is not a valid current deployment path |
| Env parity proof | `env:check` was described as broad config proof and, in some docs, as currently green | `tools/check-env-example-sync.mjs` is a narrow fixed-list scan, includes stale paths, and currently fails because `.env.example` is missing `PORT` |

## Unresolved Ambiguities

| Area | Current note |
|------|--------------|
| `tools/structured-metadata-sidecar/` | The folder still exists, but no live runtime consumer was verified during this audit. It remains documented only as optional/historical support, not an active dependency. |
| Historical audit path claims | Supplemental audit logs intentionally preserve moved/deleted path references from earlier code states. They are retained as history, not as current-state authority. |

## Validation Proof Used For This Pass

| Proof | Result | Notes |
|------|--------|-------|
| `npm run env:check` | fail | reported `Missing keys in config manifest: PORT` on 2026-03-24 |
| `npm run gui:build` | pass | completed successfully on 2026-03-25 and wrote the current `tools/gui-react/dist/` bundle |
| `GET http://127.0.0.1:8788/api/v1/health` | pass | returned `{ ok: true, service: "gui-server", ... }` from the live server |
| `GET http://127.0.0.1:8788/api/v1/categories` | pass | returned `["keyboard","monitor","mouse","tests"]` |
| `GET http://127.0.0.1:8788/api/v1/llm-policy` | pass | returned the live composite policy with provider registry and resolved model assignments |
| `GET http://127.0.0.1:8788/api/v1/process/status` | pass | returned the idle process-status payload with retained last-run metadata |
| `npm test` | pass | current worktree passed with `5827` passing tests |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/core/config/manifest/index.js` | live manifest assembly, declared group IDs, and emitted section counts |
| source | `src/shared/settingsRegistry.js` | live settings counts and registry ownership |
| source | `src/features/review/api/itemMutationRoutes.js` | live scalar review mutation surface excludes `finalize` |
| source | `src/app/api/routes/testModeRouteContext.js` | current stubbed test-mode run behavior |
| source | `src/app/api/routes/infra/categoryRoutes.js` | live categories endpoint source |
| command | `npm run env:check` | failing env-check result used in the refreshed docs |
| command | `npm run gui:build` | passing GUI build result used in the refreshed docs |
| command | `npm test` | green suite baseline used in overview/setup/toolchain docs (`5827` passing tests) |
| runtime | `http://127.0.0.1:8788/api/v1/health` | live runtime health proof |
| runtime | `http://127.0.0.1:8788/api/v1/categories` | live category inventory proof |
| runtime | `http://127.0.0.1:8788/api/v1/llm-policy` | live composite LLM policy contract |
| runtime | `http://127.0.0.1:8788/api/v1/process/status` | live idle process-status retention behavior |

## Related Documents

- [README](../README.md) - Master entrypoint and reading order for the maintained docs set.
- [Known Issues](./known-issues.md) - Carries the active runtime and workflow gotchas discovered during this audit.
- [Spec Factory Knobs Maintenance Log](./spec_factory_knobs_maintenance.md) - Records the settings-specific cleanup that fed this doc refresh.
