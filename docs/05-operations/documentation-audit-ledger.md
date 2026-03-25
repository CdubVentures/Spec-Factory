# Documentation Audit Ledger

> **Purpose:** Record the Phase 0 documentation audit, file dispositions, major divergences, and validation results for the 2026-03-24 current-state docs refresh.
> **Prerequisites:** [../README.md](../README.md), [known-issues.md](./known-issues.md)
> **Last validated:** 2026-03-24

## Scope

- In scope: every Markdown file under `docs/` except the excluded subtree below.
- Excluded by direct user instruction: `docs/implementation/`.
- Output rule for this pass: preserve and correct where possible; delete only with audited proof. No in-scope docs were deleted in this pass.

## Audit Summary

| Bucket | Files | Notes |
|--------|-------|-------|
| `RETAIN` | 0 | No file was left entirely untouched; every in-scope file was either updated directly or reclassified through this pass. |
| `EDIT` | 34 | Current-state docs were corrected in place, mostly for moved file paths, settings counts, runtime proof snapshots, and cross-links. |
| `REPLACE` | 3 | `docs/03-architecture/system-map.md`, `docs/05-operations/known-issues.md`, and `docs/05-operations/spec_factory_knobs_maintenance.md` were rewritten because the old framing no longer matched the live repo. |
| `DELETE` | 0 | No in-scope documentation file met the burden for deletion. |

## Per-File Disposition

### Current-State Hierarchy

| File | Disposition | What changed |
|------|-------------|--------------|
| `docs/README.md` | `EDIT` | Refreshed reading-order entrypoint, linked the audit ledger, and marked supplemental docs as historical-only. |
| `docs/01-project-overview/scope.md` | `EDIT` | Replaced stale suite-count claims with current 2026-03-24 validation facts and live category inventory. |
| `docs/01-project-overview/folder-map.md` | `EDIT` | Corrected repo tree, removed nonexistent paths, fixed shared-settings counts, and clarified generated packaging artifacts. |
| `docs/01-project-overview/conventions.md` | `EDIT` | Replaced stale test-count baseline with current failure clusters and updated repo rule sources. |
| `docs/01-project-overview/glossary.md` | `EDIT` | Corrected moved NeedSet terminology/path references and refreshed validation date. |
| `docs/02-dependencies/stack-and-toolchain.md` | `EDIT` | Refreshed validation date, build proof date, and replaced stale full-suite counts with current failure clusters. |
| `docs/02-dependencies/external-services.md` | `EDIT` | Removed deleted integrations from the active surface and clarified historical/config-only remnants. |
| `docs/02-dependencies/environment-and-config.md` | `EDIT` | Rebased config docs on the live manifest assembly, current registry counts, and the narrow scope of `env:check`. |
| `docs/02-dependencies/setup-and-installation.md` | `EDIT` | Replaced stale verification guidance with the current `env:check`, `gui:build`, health, and red-suite baseline. |
| `docs/03-architecture/system-map.md` | `REPLACE` | Rebuilt the topology from the live Node/GUI/runtime stack and removed unverified legacy integrations from the active map. |
| `docs/03-architecture/backend-architecture.md` | `EDIT` | Corrected review mutation path ownership and the moved `dataChangeContract` location. |
| `docs/03-architecture/frontend-architecture.md` | `EDIT` | Refreshed validation date after the route/feature audit. |
| `docs/03-architecture/routing-and-gui.md` | `EDIT` | Corrected route ownership around `App.tsx` and direct feature imports. |
| `docs/03-architecture/data-model.md` | `EDIT` | Refreshed validation date after schema cross-checking. |
| `docs/03-architecture/auth-and-sessions.md` | `EDIT` | Rebased JWT/config references onto the live registry/manifest files. |
| `docs/04-features/feature-index.md` | `EDIT` | Corrected review workbench key-file references. |
| `docs/04-features/category-authority.md` | `EDIT` | Refreshed validation date after snapshot-route verification. |
| `docs/04-features/catalog-and-product-selection.md` | `EDIT` | Refreshed validation date and cleaned stale formatting while preserving the verified flow. |
| `docs/04-features/field-rules-studio.md` | `EDIT` | Refreshed validation date after route and compile-hook verification. |
| `docs/04-features/indexing-lab.md` | `EDIT` | Rebased NeedSet references onto `src/features/indexing/pipeline/needSet/*`. |
| `docs/04-features/pipeline-and-runtime-settings.md` | `EDIT` | Corrected the registry inventory from the stale 430+ claim to the live 233-entry surface and refreshed validation date. |
| `docs/04-features/review-workbench.md` | `EDIT` | Corrected review mutation file paths into `src/features/review/api/*`. |
| `docs/04-features/runtime-ops.md` | `EDIT` | Refreshed validation date after runtime-route verification. |
| `docs/04-features/billing-and-learning.md` | `EDIT` | Refreshed validation date after billing/learning route verification. |
| `docs/04-features/storage-and-run-data.md` | `EDIT` | Refreshed validation date after storage-path verification. |
| `docs/04-features/test-mode.md` | `EDIT` | Documented the stubbed test runner and corrected filesystem labels in the flow diagram. |
| `docs/05-operations/deployment.md` | `EDIT` | Clarified that desktop executables are generated artifacts not present in the current checkout and documented the stale Docker path. |
| `docs/05-operations/monitoring-and-logging.md` | `EDIT` | Corrected the `data-change` contract path to `src/core/events/dataChangeContract.js`. |
| `docs/05-operations/known-issues.md` | `REPLACE` | Rebuilt the issue matrix around the current 2026-03-24 repo state and removed stale problem statements. |
| `docs/05-operations/spec_factory_knobs_maintenance.md` | `REPLACE` | Rewrote the maintenance log around the live registry/manifest model and corrected settings counts. |
| `docs/06-references/api-surface.md` | `EDIT` | Corrected review mutation endpoint ownership and documented the stale client-only `finalize` path. |
| `docs/06-references/background-jobs.md` | `EDIT` | Refreshed validation date after batch/job verification. |
| `docs/06-references/integration-boundaries.md` | `EDIT` | Removed unverified live dependencies on deleted integrations and the excluded docs subtree. |
| `docs/07-patterns/canonical-examples.md` | `EDIT` | Corrected canonical import paths and updated the test/background-job examples to live files. |
| `docs/07-patterns/anti-patterns.md` | `EDIT` | Corrected preferred-path references after the review/settings/test-surface audit. |

### Supplemental Historical Records

| File | Disposition | What changed |
|------|-------------|--------------|
| `docs/03-architecture/STRUCTURAL-AUDIT-2026-03-23.md` | `EDIT` | Preserved the historical audit body, added standard metadata, and marked it as non-authoritative for current state. |
| `docs/03-architecture/STRUCTURAL-AUDIT-2026-03-24.md` | `EDIT` | Preserved the historical audit body, added standard metadata, and marked it as non-authoritative for current state. |
| `docs/test-audit/app-api-wiring-audit.md` | `EDIT` | Preserved the historical test-audit log, added standard metadata, and marked it as supplemental evidence rather than current-state authority. |

## Major Divergences Discovered

| Topic | Prior-doc assumption | Verified live state |
|------|----------------------|---------------------|
| Config manifest structure | per-group manifest files existed under `src/core/config/manifest/*Group.js` | live manifest assembly is centralized in `src/core/config/manifest/index.js` and re-exported by `src/core/config/manifest.js` |
| Review mutation paths | mutation routes lived under `src/api/review*Routes.js` | live mutation routes are under `src/features/review/api/*` |
| Data-change contract | `dataChangeContract.js` lived under `src/api/events/` | live contract is `src/core/events/dataChangeContract.js` |
| NeedSet engine path | `src/indexlab/needsetEngine.js` | live engine is `src/features/indexing/pipeline/needSet/needsetEngine.js` |
| Settings inventory size | older docs claimed 430+ registry entries | live registry exports 233 entries and live flattened defaults expose 140 leaf values |
| LLM settings split | `/llm-config` was described as another category route-matrix editor | `/llm-config` is a separate composite policy surface backed by `GET/PUT /api/v1/llm-policy`, while `/llm-settings` remains the category route-matrix editor |
| Convergence settings API | docs treated `/api/v1/convergence-settings` as live | no live convergence route is mounted; `convergence` remains `{}` in `user-settings.json` for compatibility only |
| Test-mode runner path | docs pointed to `src/testing/testRunner.js` | the current stub lives in `src/app/api/routes/testModeRouteContext.js`; the old file no longer exists |
| Auth/session posture | older docs implied JWT-backed sessions | JWT config keys exist, but no verified login/session middleware protects the live GUI/API runtime |
| Packaged binaries | docs implied `SpecFactory.exe` and `Launcher.exe` were checked in | only packaging scripts were present; generated executables were absent from the current checkout |
| Test baseline | older docs used 2026-03-23 pass/fail counts | current 2026-03-24 baseline is red with different failure clusters, so exact old counts are no longer authoritative |
| Env parity proof | `env:check` treated as broad manifest proof | `tools/check-env-example-sync.mjs` scans a narrow fixed file list and still references stale paths |
| Excluded docs subtree | some docs implied implementation docs affected runtime understanding | `docs/implementation/` was explicitly excluded and no live runtime dependency on that subtree was verified |

## Second-Pass Convergence Updates

| File | Disposition | What changed |
|------|-------------|--------------|
| `docs/03-architecture/backend-architecture.md` | `EDIT` | Corrected the live settings route family to include `/llm-policy`, removed the false `/convergence-settings` contract, and documented the route-matrix versus composite-policy persistence split. |
| `docs/03-architecture/frontend-architecture.md` | `EDIT` | Added the shared runtime-store / `llm-policy` / `llm-settings` split so the GUI settings architecture matches the live code. |
| `docs/03-architecture/routing-and-gui.md` | `EDIT` | Corrected `/llm-config` to the composite LLM policy page and updated `/pipeline-settings` to the current runtime/storage/source-strategy scope. |
| `docs/02-dependencies/environment-and-config.md` | `EDIT` | Added the composite LLM policy schema/API surfaces and clarified that convergence persists only as a compatibility section, not a live HTTP route. |
| `docs/04-features/feature-index.md` | `EDIT` | Added the missing first-class LLM policy feature and clarified the split from category LLM settings. |
| `docs/04-features/llm-policy-and-provider-config.md` | `EDIT` | New current-state feature doc added to cover the live `/llm-config` and `/llm-policy` surface that was absent from the first pass. |
| `docs/04-features/pipeline-and-runtime-settings.md` | `EDIT` | Removed the false convergence-route claims, added source-strategy flow details, and separated the feature from the composite LLM policy editor. |
| `docs/06-references/api-surface.md` | `EDIT` | Added `GET/PUT /api/v1/llm-policy`, removed the nonexistent convergence endpoints, and marked the current test-mode run contract as stubbed. |
| `docs/05-operations/spec_factory_knobs_maintenance.md` | `EDIT` | Corrected the settings API inventory and clarified that `LlmConfigPage` is a composite-policy surface, not a second route-matrix editor. |
| `docs/01-project-overview/{folder-map.md,glossary.md}` | `EDIT` | Removed the dead `src/testing/testRunner.js` path and corrected terminology around `LLM Settings` versus `LLM Config`. |
| `docs/04-features/test-mode.md`, `docs/05-operations/known-issues.md`, `docs/06-references/background-jobs.md` | `EDIT` | Repointed the stubbed test-mode runner to `src/app/api/routes/testModeRouteContext.js` and clarified current run behavior. |
| `docs/README.md` | `EDIT` | Added the new LLM policy feature doc to the master table of contents. |

## Third-Pass Convergence Updates

| File | Disposition | What changed |
|------|-------------|--------------|
| `docs/07-patterns/canonical-examples.md` | `EDIT` | Corrected the SpecDb migration example so it matches the literal append-only `MIGRATIONS`/`SECONDARY_INDEXES` pattern in `src/db/specDbMigrations.js` and aligned the background-job example to the real `createBatchCommand()` factory-return shape. |
| `docs/05-operations/monitoring-and-logging.md` | `EDIT` | Refreshed the live `/api/v1/process/status` observation with the 2026-03-24 local validation snapshot showing that idle status retains last-run metadata fields. |
| `docs/06-references/api-surface.md` | `EDIT` | Added the verified `POST` compatibility writes for `storage-settings`, `runtime-settings`, and `llm-policy`, documented the `/storage-settings/local` browse alias, and tightened response shapes to the current handlers. |

## Unresolved Ambiguities

| Area | Current note |
|------|--------------|
| `tools/structured-metadata-sidecar/` | The folder still exists, but no live runtime consumer was verified during this audit. It remains documented only as optional/historical support, not an active dependency. |
| Historical audit path claims | Supplemental audit logs intentionally preserve moved/deleted path references from earlier code states. They are retained as history, not as current-state authority. |
| Full-suite status | `npm test` is red on the current worktree because of active code/test drift outside this docs-only assignment. The docs now point to the verified failure clusters instead of stale counts. |

## Validation Proof Used For This Pass

| Proof | Result | Notes |
|------|--------|-------|
| `npm run env:check` | pass | reported `[env-check] OK (3 referenced keys covered)` on 2026-03-24 |
| `npm run gui:build` | pass | Vite GUI build succeeded on 2026-03-24 |
| `GET http://127.0.0.1:8788/api/v1/health` | pass | returned `{ ok: true, service: "gui-server", ... }` from the live server |
| `GET http://127.0.0.1:8788/api/v1/categories` | pass | returned `["gaming_mice","keyboard","monitor","mouse","tests"]` |
| `GET http://127.0.0.1:8788/api/v1/llm-policy` | pass | returned the live composite policy with provider registry and resolved model assignments |
| `GET http://127.0.0.1:8788/api/v1/indexing/llm-config` | pass | returned live model/pricing/token metadata plus resolved API-key exposure used by settings UIs |
| `GET http://127.0.0.1:8788/api/v1/process/status` | pass | idle status retained `run_id`, `category`, `product_id`, `storage_destination`, `pid`, `exitCode`, `startedAt`, and `endedAt` |
| `npm test` | fail | current worktree is red; details documented in `docs/05-operations/known-issues.md` |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/core/config/manifest/index.js` | live manifest assembly replacing stale per-group assumptions |
| source | `src/shared/settingsRegistry.js` | live settings counts and registry ownership |
| source | `src/features/review/api/routeSharedHelpers.js` | review mutation helpers now live under the feature boundary and import the moved data-change contract |
| source | `src/core/events/dataChangeContract.js` | current event-contract location |
| source | `src/features/indexing/pipeline/needSet/needsetEngine.js` | current NeedSet engine path |
| command | `npm run env:check` | env-check pass result used in the refreshed docs |
| command | `npm run gui:build` | GUI build proof used in the refreshed docs |
| command | `npm test` | current red baseline used for known-issues and setup/dependency docs |
| runtime | `http://127.0.0.1:8788/api/v1/health` | live runtime health proof |
| runtime | `http://127.0.0.1:8788/api/v1/categories` | live category inventory proof |
| runtime | `http://127.0.0.1:8788/api/v1/llm-policy` | live composite LLM policy contract |
| runtime | `http://127.0.0.1:8788/api/v1/indexing/llm-config` | live indexing/LLM metadata contract |
| runtime | `http://127.0.0.1:8788/api/v1/process/status` | live idle process-status retention behavior |

## Related Documents

- [README](../README.md) - Master entrypoint and reading order for the maintained docs set.
- [Known Issues](./known-issues.md) - Carries the active runtime and test drift discovered during this audit.
- [Spec Factory Knobs Maintenance Log](./spec_factory_knobs_maintenance.md) - Records the settings-specific cleanup that fed this doc refresh.
