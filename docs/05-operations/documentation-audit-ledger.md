# Documentation Audit Ledger

> **Purpose:** Record the March 30, 2026 documentation audit dispositions, major divergences, and validation proof for all in-scope docs.
> **Prerequisites:** [../README.md](../README.md), [known-issues.md](./known-issues.md)
> **Last validated:** 2026-03-30

## Scope

- Audited every Markdown file under `docs/`.
- Excluded by direct user instruction: `docs/implementation/`.
- In-scope Markdown files audited: `42`.
- This was a documentation-only pass. No application code, tests, configs, migrations, or infrastructure definitions were modified.

## Audit Summary

| Bucket | Count | Notes |
|--------|-------|-------|
| `RETAIN` | `15` | File was already materially correct after source-backed audit. |
| `EDIT` | `27` | File covered a relevant topic but contained stale dates, route/config drift, outdated counts, or missing links. |
| `REPLACE` | `0` | No file required delete-and-rewrite replacement. |
| `DELETE` | `0` | No file met the burden for deletion. |

## File Disposition Ledger

| File | Disposition | Notes |
|------|-------------|-------|
| `docs/README.md` | `EDIT` | Corrected project summary, reading order notes, validation snapshot, and category inventory. |
| `docs/01-project-overview/scope.md` | `EDIT` | Removed nonexistent settings/auth assumptions and corrected status notes. |
| `docs/01-project-overview/folder-map.md` | `EDIT` | Rebased top-level tree, runtime roots, and category inventory on the current checkout. |
| `docs/01-project-overview/conventions.md` | `EDIT` | Corrected route-registration SSOT, test baseline, and GUI route authority notes. |
| `docs/01-project-overview/glossary.md` | `EDIT` | Reworked storage/run-data terms around the current Storage Manager and AppDb language. |
| `docs/02-dependencies/stack-and-toolchain.md` | `EDIT` | Rebased validation results on the current `gui:build`, `env:check`, and `npm test` outcomes. |
| `docs/02-dependencies/environment-and-config.md` | `EDIT` | Corrected registry counts, manifest counts, persistence model, and sensitive endpoint notes. |
| `docs/02-dependencies/external-services.md` | `EDIT` | Corrected S3 usage, local-first posture, and LLM endpoint exposure notes. |
| `docs/02-dependencies/setup-and-installation.md` | `EDIT` | Updated verification steps and expected categories endpoint result. |
| `docs/03-architecture/system-map.md` | `EDIT` | Rebased runtime topology on `src/api/guiServerRuntime.js`, AppDb/SpecDb, and registry-driven GUI routing. |
| `docs/03-architecture/backend-architecture.md` | `EDIT` | Corrected mounted route families, settings/config boundaries, storage manager scope, and persistence flow. |
| `docs/03-architecture/frontend-architecture.md` | `EDIT` | Corrected `HashRouter`, `pageRegistry.ts`, AppShell hydration, and Storage page ownership. |
| `docs/03-architecture/auth-and-sessions.md` | `EDIT` | Replaced assumed auth/session system with the current unauthenticated local-trust boundary. |
| `docs/03-architecture/routing-and-gui.md` | `EDIT` | Corrected GUI route SSOT, settings tab ownership, and page/component mapping. |
| `docs/03-architecture/data-model.md` | `RETAIN` | Schema, AppDb/SpecDb notes, and migration references remained aligned with the current code. |
| `docs/03-architecture/STRUCTURAL-AUDIT-2026-03-23.md` | `RETAIN` | Retained as a clearly historical structural audit, not current-state SSOT. |
| `docs/03-architecture/STRUCTURAL-AUDIT-2026-03-24.md` | `RETAIN` | Retained as a clearly historical structural audit, not current-state SSOT. |
| `docs/03-architecture/PIPELINE-AUDIT-2026-03-25.md` | `RETAIN` | Retained as supplemental historical audit context. |
| `docs/04-features/feature-index.md` | `EDIT` | Corrected feature summaries, route authority links, and storage/pipeline feature wording. |
| `docs/04-features/category-authority.md` | `RETAIN` | Current feature boundaries and file references remained accurate. |
| `docs/04-features/catalog-and-product-selection.md` | `RETAIN` | Product/catalog flow remained aligned with current routes and files. |
| `docs/04-features/field-rules-studio.md` | `RETAIN` | Studio flow and ownership remained accurate. |
| `docs/04-features/indexing-lab.md` | `EDIT` | Removed stale relocation wording and rebased exit behavior on SpecDb storage-location recording. |
| `docs/04-features/llm-policy-and-provider-config.md` | `EDIT` | Added current sensitive-read behavior and corrected composite LLM policy notes. |
| `docs/04-features/pipeline-and-runtime-settings.md` | `EDIT` | Removed nonexistent storage-settings flow and corrected runtime/source-strategy/spec-seed ownership. |
| `docs/04-features/review-workbench.md` | `RETAIN` | Review flow remained aligned with the live route tree. |
| `docs/04-features/runtime-ops.md` | `RETAIN` | Runtime telemetry and panel mapping remained accurate. |
| `docs/04-features/billing-and-learning.md` | `RETAIN` | Billing/learning surfaces remained accurate. |
| `docs/04-features/storage-and-run-data.md` | `EDIT` | Reworked around the current inventory/maintenance-only storage surface. |
| `docs/04-features/test-mode.md` | `RETAIN` | Test-mode scope and the stubbed run behavior remained accurate. |
| `docs/05-operations/deployment.md` | `RETAIN` | Deployment/build facts remained materially accurate after audit. |
| `docs/05-operations/monitoring-and-logging.md` | `EDIT` | Corrected `/process/status` wording from relocation-state language to the current `storage_destination` contract. |
| `docs/05-operations/known-issues.md` | `EDIT` | Rebuilt around current runtime, routing, and validation failures. |
| `docs/05-operations/spec_factory_knobs_maintenance.md` | `EDIT` | Corrected registry/default/manifest counts and removed nonexistent storage-settings guidance. |
| `docs/05-operations/documentation-audit-ledger.md` | `EDIT` | Replaced stale self-reporting with the actual March 30 audit results. |
| `docs/06-references/api-surface.md` | `EDIT` | Removed nonexistent `storage-settings`, `recalculate`, and `sync` routes; corrected the mounted API surface. |
| `docs/06-references/background-jobs.md` | `RETAIN` | Job inventory remained aligned with the current CLI/runtime surface. |
| `docs/06-references/integration-boundaries.md` | `EDIT` | Removed nonexistent relocation service boundary and corrected storage/auth assumptions. |
| `docs/07-patterns/canonical-examples.md` | `EDIT` | Corrected API route-family and GUI page-registration examples to use current SSOT files. |
| `docs/07-patterns/anti-patterns.md` | `EDIT` | Removed nonexistent `storage-settings` guidance and corrected route-registration anti-patterns. |
| `docs/test-audit/app-api-wiring-audit.md` | `RETAIN` | Retained as historical audit material, not current-state SSOT. |
| `docs/test-audit/app-ui-component-audit.md` | `RETAIN` | Retained as historical audit material, not current-state SSOT. |

## Major Divergences Discovered

| Topic | Prior-doc assumption | Verified live state |
|------|----------------------|---------------------|
| Mounted API route authority | `src/app/api/routeRegistry.js` was treated as the mounted route-order SSOT | the live mounted order is the `routeDefinitions` array in `src/api/guiServerRuntime.js`; `GUI_API_ROUTE_ORDER` is stale and omits `specSeeds` |
| GUI route authority | several docs implied `tools/gui-react/src/App.tsx` owns the full routed page inventory | routed page/tab SSOT is `tools/gui-react/src/registries/pageRegistry.ts`; `App.tsx` mounts derived routes plus standalone `/test-mode` |
| Settings surface | several docs described live `storage-settings` and `convergence-settings` endpoints | `src/features/settings/api/configRoutes.js` mounts only `ui-settings`, `indexing/*`, `llm-settings/*`, `runtime-settings`, and `llm-policy` |
| Storage manager API | older docs described `/storage/recalculate` and `/storage/sync/*` routes | `src/features/indexing/api/storageManagerRoutes.js` mounts only overview, runs, bulk delete, prune, purge, and export |
| Run-data relocation | older docs described a relocation service and active storage state | `src/api/bootstrap/createBootstrapEnvironment.js` now exports `runDataStorageState = Object.freeze({ enabled: false })`; `src/api/services/runDataRelocationService.js` does not exist |
| Settings inventories | older docs described smaller or differently partitioned registries | current live exports are runtime `138`, bootstrap `3`, UI `4`, total `145`; `SETTINGS_DEFAULTS.storage` and `SETTINGS_DEFAULTS.convergence` are empty |
| Manifest shape | older docs described 7-section or broader emitted manifests | current `CONFIG_MANIFEST` emits 5 populated sections with 138 entries |
| Category inventory | older docs treated `category_authority/tests/` as a live category | `src/app/api/routes/infra/categoryRoutes.js` filters `tests`, `_global`, and underscored categories by default; live `/api/v1/categories` returned `["keyboard","monitor","mouse"]` |
| Persistence model | older docs implied JSON-first settings persistence | current writes prefer AppDb and fall back to JSON only when AppDb is unavailable |
| Auth/session posture | older docs implied a real auth/session subsystem | no verified auth/session layer protects the GUI server; `/llm-policy` and `/indexing/llm-config` are currently unauthenticated and can return sensitive key material |
| Validation baseline | older docs described green env/full-test baselines | `npm run env:check` fails (`PORT` missing from `.env.example`) and `npm test` currently fails across multiple suites on 2026-03-30 |

## Unresolved Ambiguities

| Area | Current note |
|------|--------------|
| Historical audit documents | Supplemental audit docs intentionally preserve older code-state references. They are retained as history, not as current-state SSOT. |
| Optional helper/runtime folders | Folders such as `.specfactory_tmp/`, `debug/`, and `gui-dist/` exist in the checkout, but not every helper inside them is part of the live runtime path. They are described as supporting/generated surfaces only where directly verified. |

## Validation Proof Used For This Pass

| Proof | Result | Notes |
|------|--------|-------|
| `npm run env:check` | fail | on 2026-03-30, reported `Missing keys in config manifest: PORT` |
| `npm run gui:build` | pass | on 2026-03-30, rebuilt the GUI bundle successfully |
| `npm test` | fail | on 2026-03-30, failed in multiple server and GUI suites; docs were corrected to file-backed truth rather than assuming a green suite |
| `GET http://127.0.0.1:8788/api/v1/health` | pass | confirmed live GUI server identity |
| `GET http://127.0.0.1:8788/api/v1/categories` | pass | returned `["keyboard","monitor","mouse"]` |
| `GET http://127.0.0.1:8788/api/v1/llm-policy` | pass | confirmed unauthenticated composite policy endpoint remains mounted |
| `GET http://127.0.0.1:8788/api/v1/process/status` | pass | confirmed idle process-status payload with retained last-run metadata |
| `GET http://127.0.0.1:8788/api/v1/storage/overview` | pass | confirmed storage manager surface is mounted and currently reports `storage_backend: "disabled"` |
| `GET http://127.0.0.1:8788/api/v1/runtime-settings` | pass | confirmed runtime settings surface remains mounted |

## Stale-Claim Sweep Notes

- Repo-wide doc sweeps were rerun for stale phrases including `storage-settings`, `runDataRelocationService`, `/storage/recalculate`, `/storage/sync`, and the old green-suite count.
- Remaining historical references were retained only in clearly historical audit documents or in known-issues notes that explicitly mark the drift as current technical debt.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/api/guiServerRuntime.js` | live mounted route families and route-order SSOT |
| source | `src/app/api/routeRegistry.js` | stale `GUI_API_ROUTE_ORDER` constant versus live routeDefinitions |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | GUI route/tab SSOT |
| source | `src/features/settings/api/configRoutes.js` | mounted settings surface excludes storage/convergence settings |
| source | `src/features/indexing/api/storageManagerRoutes.js` | live storage manager endpoint set |
| source | `src/api/bootstrap/createBootstrapEnvironment.js` | storage-state compatibility stub |
| source | `src/shared/settingsRegistry.js` | current registry counts |
| source | `src/shared/settingsDefaults.js` | current defaults counts |
| source | `src/core/config/manifest/index.js` | current manifest sections and entry counts |
| source | `src/features/settings-authority/userSettingsService.js` | AppDb-first persistence model |
| source | `src/app/api/routes/infra/categoryRoutes.js` | categories filtering rules |
| command | `npm run env:check` | current env-check failure used in refreshed docs |
| command | `npm run gui:build` | current GUI build success used in refreshed docs |
| command | `npm test` | current failing suite baseline used in refreshed docs |
| runtime | `http://127.0.0.1:8788/api/v1/health` | live runtime health proof |
| runtime | `http://127.0.0.1:8788/api/v1/categories` | live categories API proof |
| runtime | `http://127.0.0.1:8788/api/v1/llm-policy` | live unauthenticated LLM policy contract |
| runtime | `http://127.0.0.1:8788/api/v1/process/status` | live idle process-status shape |
| runtime | `http://127.0.0.1:8788/api/v1/storage/overview` | live storage-manager contract |
| runtime | `http://127.0.0.1:8788/api/v1/runtime-settings` | live runtime-settings contract |

## Related Documents

- [README](../README.md) - master entrypoint and reading order for the maintained docs set.
- [Known Issues](./known-issues.md) - active runtime and workflow defects discovered during the audit.
- [Spec Factory Knobs Maintenance](./spec_factory_knobs_maintenance.md) - settings-specific corrections that fed this refresh.
