# Documentation Audit Ledger

> **Purpose:** Record the documentation audit dispositions, major divergences, deletions, and final validation proof for the maintained documentation surface.
> **Prerequisites:** [../README.md](../README.md), [known-issues.md](./known-issues.md), [spec_factory_knobs_maintenance.md](./spec_factory_knobs_maintenance.md)
> **Last validated:** 2026-04-07

## Scope

- Audited every Markdown file under `docs/`.
- Also audited the repo-root `README.md` and `CLAUDE.md` because they are maintained LLM-facing documentation entrypoints outside `docs/`.
- Initial audited Markdown surfaces before cleanup: `66`.
- Breakdown:
  - `64` Markdown files under `docs/` before cleanup,
  - `README.md`,
  - `CLAUDE.md`.
- Final audited Markdown surfaces after cleanup: `60`.
- Breakdown:
  - `58` Markdown files under `docs/`,
  - `README.md`,
  - `CLAUDE.md`.
- Current `docs/` composition after cleanup:
  - `38` numbered current-state docs in the primary reading order,
  - `3` dated audit artifacts under `docs/audits/`,
  - `17` supplemental implementation-reference docs under `docs/implementation/`,
  - `0` Markdown files under `docs/data-structure/` in this checkout.
- This was a documentation-only pass. No application code, runtime config, tests, migrations, or infrastructure definitions were modified.

## Disposition Summary

| Bucket | Count | Meaning in this pass |
|--------|-------|----------------------|
| `RETAIN` | `24` | File remained materially correct or intentionally historical after audit. |
| `EDIT` | `35` | File covered a relevant topic but needed current-state corrections, link repair, reframing, or stale-section removal. |
| `REPLACE` | `0` | No file required topic-preserving delete-and-rewrite replacement as a separate disposition. |
| `DELETE` | `7` | File was wholly stale residue, temporary audit output, or no longer belonged in the maintained docs tree. |
| `NEW` | `1` | New current-state file added because a live feature had no dedicated documentation. |

## Retained Files

### Retained Numbered Current-State Docs

| File | Why it was retained |
|------|---------------------|
| `docs/04-features/billing-and-learning.md` | Feature boundaries, file references, and runtime behavior remained aligned with the live route tree. |
| `docs/04-features/catalog-and-product-selection.md` | Catalog and product-selection flow remained accurate against the current API and GUI files. |
| `docs/04-features/field-rules-studio.md` | Studio flow, route ownership, and data contracts remained accurate. |
| `docs/04-features/review-workbench.md` | Review flow and ownership remained aligned with the current mounted routes. |
| `docs/04-features/test-mode.md` | Test-mode behavior and its bounded scope remained accurate. |

### Retained Support Artifacts

| File or group | Why it was retained |
|---------------|---------------------|
| `docs/audits/base-model-contract-audit-2026-04-04.md` | Dated audit artifact with repo-specific contract findings; kept as supplemental evidence, not numbered current-state authority. |
| `docs/audits/field-catalog-seed-retirement-audit-2026-04-04.md` | Dated retirement audit that still documents a verified cleanup decision. |
| `docs/audits/product-ssot-validation-2026-04-02.md` | Dated SSOT audit retained as supporting evidence for product/queue history. |
| `docs/implementation/ai-indexing-plans/**/*.md` | Preserved historical or design-depth indexing material retained as supplemental reference only. |
| `docs/implementation/ai-indexing-plans/README.md` | Subtree entrypoint accurately frames the implementation docs as reference material, not current-state SSOT. |
| `docs/implementation/ai-indexing-plans/PRODUCT-GOAL.md` | Preserved product-goal artifact retained as historical/design context under the supplemental subtree. |

## Edited Files

### Repo-Root LLM Entrypoints

| File | What was corrected |
|------|--------------------|
| `README.md` | Rebased the repo-root entrypoint on the maintained docs reading order. |
| `CLAUDE.md` | Rebuilt the LLM truth file around the current source tree, route ownership, storage model, and validated runtime notes. |

### Primary Docs Entrypoint And Overview

| File | What was corrected |
|------|--------------------|
| `docs/README.md` | Refreshed reading order, support-artifact links, and cross-links to the retained audit / implementation subtrees. |
| `docs/01-project-overview/scope.md` | Corrected product scope, explicit non-goals, and current validation state. |
| `docs/01-project-overview/folder-map.md` | Rebuilt the annotated tree from the live checkout and removed nonexistent folders from the map. |
| `docs/01-project-overview/conventions.md` | Corrected route-registration SSOT, test baseline, and GUI routing ownership. |
| `docs/01-project-overview/glossary.md` | Updated project-specific terms around storage, crawl sessions, AppDb, and SpecDb. |

### Dependencies

| File | What was corrected |
|------|--------------------|
| `docs/02-dependencies/stack-and-toolchain.md` | Rebased dependency and validation notes on the current manifests, lockfiles, `npm run gui:build`, `npm test`, and `npm run env:check`. |
| `docs/02-dependencies/environment-and-config.md` | Corrected registry counts, manifest counts, secret-bearing surfaces, and current persistence notes. |
| `docs/02-dependencies/external-services.md` | Corrected provider dispatch, local storage posture, and failure behavior for current integrations. |
| `docs/02-dependencies/setup-and-installation.md` | Updated setup verification steps and expected local validation results. |

### Architecture

| File | What was corrected |
|------|--------------------|
| `docs/03-architecture/system-map.md` | Rebased runtime topology on `src/app/api/guiServer.js`, `src/app/api/guiServerRuntime.js`, AppDb, per-category SpecDb, and the live sidecar/runtime boundaries. |
| `docs/03-architecture/backend-architecture.md` | Corrected mounted route families, settings boundaries, storage-manager scope, and persistence flow. |
| `docs/03-architecture/frontend-architecture.md` | Corrected `HashRouter`, page registry ownership, hydration path, and storage-page role. |
| `docs/03-architecture/data-model.md` | Refreshed schema, data-shape, and migration notes to match the current SQLite-backed model. |
| `docs/03-architecture/auth-and-sessions.md` | Replaced assumed auth/session coverage with the current local-trust boundary and exposed sensitive routes. |
| `docs/03-architecture/routing-and-gui.md` | Corrected route tables, layout ownership, and page/component mapping to `tools/gui-react/src/registries/pageRegistry.ts`. |

### Features

| File | What was corrected |
|------|--------------------|
| `docs/04-features/feature-index.md` | Corrected feature summaries, links, and current key-file references, and added the missing color feature family. |
| `docs/04-features/category-authority.md` | Corrected stale client path references and refreshed validation date. |
| `docs/04-features/indexing-lab.md` | Rebased persisted artifact claims on the SQL-first runtime rather than stale NDJSON/file assumptions. |
| `docs/04-features/llm-policy-and-provider-config.md` | Corrected generated GUI file names, provider dispatch files, and secret-bearing route notes. |
| `docs/04-features/pipeline-and-runtime-settings.md` | Removed nonexistent `storage-settings` flow and aligned the feature with runtime settings, source strategy, and spec seeds. |
| `docs/04-features/runtime-ops.md` | Expanded runtime flow to include fetch/extraction/video/open-folder/resolve-folder surfaces and current error paths. |
| `docs/04-features/storage-and-run-data.md` | Reworked the feature around the current local storage inventory and deletion surfaces. |

### Operations, References, And Patterns

| File | What was corrected |
|------|--------------------|
| `docs/05-operations/deployment.md` | Corrected the Docker interpretation, refreshed build/runtime validation notes, and kept the document aligned to the verified local-first deployment model. |
| `docs/05-operations/monitoring-and-logging.md` | Replaced stale NDJSON watcher assumptions with the live SQL-first telemetry and WebSocket contract. |
| `docs/05-operations/known-issues.md` | Rebuilt the issue list around current defects and hazards, including unauthenticated sensitive routes, env-check drift, and auto-seed warnings. |
| `docs/05-operations/spec_factory_knobs_maintenance.md` | Corrected registry/default/manifest counts and removed stale storage-settings guidance. |
| `docs/05-operations/documentation-audit-ledger.md` | Rewrote the ledger to match the final 2026-04-04 dispositions, counts, and validation proof. |
| `docs/06-references/api-surface.md` | Removed nonexistent routes, added missing color/runtime/storage endpoints, and corrected mounted API details. |
| `docs/06-references/background-jobs.md` | Refreshed job references and validation notes against the current runtime. |
| `docs/06-references/integration-boundaries.md` | Corrected current boundaries for storage deletion, LLM providers, sidecars, and local runtime trust assumptions. |
| `docs/07-patterns/canonical-examples.md` | Updated the "correct way" examples to the actual route, page, test, service, and CLI patterns in this repo. |
| `docs/07-patterns/anti-patterns.md` | Removed obsolete examples and aligned the "wrong way" guidance to current file ownership, API client, and test patterns. |

### Supplemental Entrypoint

| File | What was corrected |
|------|--------------------|
| `docs/implementation/README.md` | Reframed the subtree as supplemental historical/reference material, repaired cross-links, and removed stale current-state claims. |

## New Files Added

| File | Reason |
|------|--------|
| `docs/04-features/color-registry.md` | The live `/colors` and `/color-edition-finder/*` feature family was mounted and user-facing but lacked its own dedicated feature document. |

## Deleted Files

| File | Audited reason for deletion |
|------|-----------------------------|
| `docs/03-architecture/PIPELINE-AUDIT-2026-03-25.md` | Historical audit residue that described superseded pipeline structure and created stale cross-links from the maintained docs surface. |
| `docs/03-architecture/STRUCTURAL-AUDIT-2026-03-23.md` | Historical structural audit that no longer matched the live architecture and no longer belonged in the current-state reading order. |
| `docs/03-architecture/STRUCTURAL-AUDIT-2026-03-24.md` | Historical structural audit with stale assumptions already absorbed into corrected current-state docs. |
| `docs/test-audit/app-api-wiring-audit.md` | Test-audit residue outside the maintained LLM reading path; no unique current-state value remained after the live docs refresh. |
| `docs/test-audit/app-ui-component-audit.md` | Test-audit residue outside the maintained LLM reading path; stale against the current GUI structure. |
| `docs/test-audit/full-suite-audit-log.md` | Historical test-audit log that no longer described the current validation baseline. |
| `docs/05-operations/temp-root-audit-report-2026-04-04.md` | Temporary audit residue created during this pass; deleted after its findings were absorbed into the maintained docs set. |

## Supporting Non-Markdown Deletion

| File | Note |
|------|------|
| `docs/test-audit/full-suite-audit-log.csv` | Removed as stale supporting residue after the corresponding Markdown audit log was deleted. |

## Major Divergences Discovered

| Topic | Prior-doc assumption | Verified live state |
|------|----------------------|---------------------|
| Mounted backend route authority | Older docs relied on stale route-order assumptions. | The live mounted route order is the `routeDefinitions` array in `src/app/api/guiServerRuntime.js`. |
| GUI route authority | `tools/gui-react/src/App.tsx` was treated as the complete routed-page inventory. | `tools/gui-react/src/registries/pageRegistry.ts` is the routed page / tab SSOT; `App.tsx` mounts from it plus standalone `/test-mode`. |
| Env-check semantics | Docs implied `.env.example` parity checking. | `tools/check-env-example-sync.mjs` is a narrow manifest coverage checker, no checked-in `.env.example` exists in this checkout, and `npm run env:check` currently fails on `PORT`. |
| Storage settings and relocation | Older docs described a live `storage-settings` surface and relocation workflow. | The current source tree mounts no `/api/v1/storage-settings`; `/api/v1/storage/*` is inventory / deletion / export only. |
| Monitoring model | Older docs described `_runtime/events.jsonl`, run-scoped NDJSON watchers, and watcher-driven WebSocket updates. | The live runtime is SQL-first: `bridge_events`, `runs`, `run_artifacts`, `query_index`, `url_index`, and `knob_snapshots` are the verified telemetry surfaces, and `setupWatchers()` returns `null`. |
| Sensitive route exposure | Older docs underreported secret-bearing reads. | `/api/v1/runtime-settings`, `/api/v1/llm-policy`, and `/api/v1/indexing/llm-config` can expose provider-key-backed fields when configured and remain part of the local-trust surface. |
| Review finalize surface | Older docs and GUI assumptions implied a live review finalize mutation. | No verified `POST /api/v1/review/:category/finalize` HTTP route is mounted; the client reference is stale drift. |
| Color feature coverage | The live color registry and color-edition finder surfaces were not represented in the feature docs or API reference. | `/api/v1/colors` and `/api/v1/color-edition-finder/*` are live and now documented. |
| Docker interpretation | Older docs treated the Dockerfile as a broken entrypoint. | `Dockerfile` does invoke a real `run-batch` CLI command, but it is a batch-only container path and was not executed during this audit. |

## Remaining Ambiguities And Explicit Notes

| Area | Current note |
|------|--------------|
| `docs/implementation/` | Retained as supplemental historical/reference material. It is intentionally not part of the numbered first-pass reading order. |
| `docs/data-structure/` | Directory exists, but no Markdown files were present in this checkout. |
| Generated bundles | `tools/dist/launcher.cjs` can still contain historical strings; current-state docs were aligned to source files and live runtime, not generated residue. |
| WebSocket `events` channel | The channel still exists in bridge/client filtering code, but no live producer was verified outside tests in this source audit. |

## Validation Proof Used For This Pass

| Proof | Result | Notes |
|------|--------|-------|
| `npm run gui:build` | pass | Completed successfully on 2026-04-04. |
| `npm test` | pass | Completed successfully on 2026-04-04. |
| `npm run env:check` | fail | Reported `Missing keys in config manifest: PORT` on 2026-04-04. |
| `GET /health` | pass | Verified live server identity and health payload. |
| `GET /api/v1/categories` | pass | Returned the current default categories list. |
| `GET /api/v1/process/status` | pass | Verified current runtime-status payload shape. |
| `GET /api/v1/storage/overview` | pass | Verified the storage manager surface and observed `storage_backend: "local"` with `total_runs: 15`. |
| Relative-link sweep | pass | `TOTAL_BROKEN=0` across `docs/**/*.md`, `README.md`, and `CLAUDE.md` after the final patch set. |
| Stale-claim sweep | pass | No hits remained in current-state docs for the stale GUI client path, deleted publish-test refs, or removed `evidence-index` endpoint; remaining literal hits were intentional negative statements or retained historical artifacts. |

## Final Consistency Notes

- The maintained docs tree now follows the numbered LLM reading order in `docs/README.md`.
- All surviving current-state docs in the numbered reading path were either corrected in place, retained with verification, or added where a live feature was missing.
- Support docs under `docs/audits/` and `docs/implementation/` are intentionally retained as supplemental artifacts and are cross-linked from `docs/README.md`.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `README.md` | repo-root documentation entrypoint required current-state correction |
| source | `CLAUDE.md` | repo-root LLM truth file participates in the maintained documentation surface |
| source | `docs/README.md` | current reading order and cross-links across the maintained docs tree |
| source | `src/app/api/guiServer.js` | live server entrypoint |
| source | `src/app/api/guiServerRuntime.js` | live mounted route order and route-family ownership |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | routed GUI page / tab SSOT |
| source | `src/features/indexing/api/storageManagerRoutes.js` | storage manager endpoint set and local-backend reporting |
| source | `src/features/color-registry/api/colorRoutes.js` | live mounted color registry surface |
| source | `src/features/color-edition/api/colorEditionFinderRoutes.js` | live mounted color-edition-finder surface |
| source | `src/shared/settingsRegistry.js` | live registry counts |
| source | `src/shared/settingsDefaults.js` | live default-section counts |
| source | `src/core/config/manifest/index.js` | current manifest array shape and per-section entry counts |
| source | `tools/check-env-example-sync.mjs` | current env-check behavior |
| source | `src/indexlab/runtimeBridgeArtifacts.js` | SQL-first telemetry persistence replacing watcher/NDJSON assumptions |
| command | `npm run gui:build` | current GUI build validation result |
| command | `npm test` | current test-suite validation result |
| command | `npm run env:check` | current env-check failure used in the docs set |
| runtime | `GET /health` | live health contract |
| runtime | `GET /api/v1/categories` | live categories contract |
| runtime | `GET /api/v1/process/status` | live runtime-status contract |
| runtime | `GET /api/v1/storage/overview` | live storage overview contract |

## 2026-04-07 Audit Pass

### Scope

Targeted update pass to align operations documentation with codebase changes since 2026-04-04. Not a full Markdown surface re-audit; focused on five files in `docs/05-operations/`.

### Infrastructure Deletions Confirmed

| Deleted file | What it was |
|--------------|-------------|
| `src/app/api/intelGraphApi.js` | Intel Graph helper server |
| `src/app/api/tests/intelGraphApi.test.js` | Intel Graph test |
| `src/app/cli/commands/batchCommand.js` | `run-batch` CLI command |
| `src/app/cli/commands/dataUtilityCommands.js` | data utility CLI commands |
| `src/app/cli/commands/publishingCommands.js` | publishing CLI commands |
| `src/app/cli/commands/intelGraphApiCommand.js` | Intel Graph CLI command |
| `src/features/indexing/orchestration/banditScheduler.js` | bandit scheduler |
| `src/pipeline/runUntilComplete.js` | pipeline run-until-complete loop |

The `intel:api` npm script has been removed from `package.json`. The `Dockerfile` CMD now runs `node src/app/cli/spec.js indexlab --category mouse` instead of the deleted `run-batch` command.

### Additions Confirmed

| New surface | What it is |
|-------------|------------|
| `src/app/api/routes/testModeRoutes.js` | test-mode route family |
| `src/app/api/routes/testModeRouteContext.js` | test-mode route context factory |
| `src/features/publisher/buildDiscoveredEnumMap.js` | discovery enum builder |
| `src/features/publisher/persistDiscoveredValues.js` | discovery enum persistence |
| `src/features/publisher/validation/mergeDiscoveredEnums.js` | discovery enum merge |
| `src/tests/` | field contract audit infrastructure |
| `field_audit_cache` table in `specDbSchema.js` | field audit cache DB table |
| `tools/gui-react/src/pages/test-mode/` | test-mode GUI page |

### Route Registry Drift

`routeDefinitions` in `guiServerRuntime.js` now defines 15 route families. `GUI_API_ROUTE_ORDER` in `routeRegistry.js` still lists only 13, missing `testMode` and `specSeeds`.

### Review Domain Change

Override functions in `overrideWorkflow.js` no longer perform direct DB sync of `item_field_state`. Overrides write to JSON SSOT and rely on the publisher pipeline for DB projection.

### File Dispositions (This Pass)

| File | Disposition | What was corrected |
|------|-------------|-------------------|
| `docs/05-operations/deployment.md` | `EDIT` | Dockerfile CMD updated to `indexlab`, removed `run-batch`/`batchCommand.js`/`intelGraphApi.js` references, updated validation date |
| `docs/05-operations/documentation-audit-ledger.md` | `EDIT` | Added 2026-04-07 audit pass section documenting infrastructure deletions, additions, and drift |
| `docs/05-operations/known-issues.md` | `EDIT` | Updated `GUI_API_ROUTE_ORDER` issue with specific missing entries, added override DB sync and deleted infrastructure issues, updated validation date |
| `docs/05-operations/monitoring-and-logging.md` | `EDIT` | Updated validation date; no Intel Graph references were present to remove |
| `docs/05-operations/spec_factory_knobs_maintenance.md` | `EDIT` | Registry counts verified unchanged (136/3/4 = 143 total), updated validation date |

## Related Documents

- [README](../README.md) - master entrypoint and reading order for the maintained docs set.
- [Known Issues](./known-issues.md) - current defects and hazards discovered during the audit.
- [Spec Factory Knobs Maintenance](./spec_factory_knobs_maintenance.md) - settings-specific inventory and count corrections used in this pass.
- [Environment and Config](../02-dependencies/environment-and-config.md) - detailed env/config reference aligned with the corrected settings counts.
