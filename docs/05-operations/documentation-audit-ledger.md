# Documentation Audit Ledger

> **Purpose:** Record the 2026-03-31 documentation audit dispositions, major divergences, deletions, and final validation proof for the maintained documentation surface.
> **Prerequisites:** [../README.md](../README.md), [known-issues.md](./known-issues.md), [spec_factory_knobs_maintenance.md](./spec_factory_knobs_maintenance.md)
> **Last validated:** 2026-03-31

## Scope

- Audited every Markdown file under `docs/`, excluding `docs/implementation/` and `docs/data-structure/` by direct user instruction.
- Additionally audited the repo-root `README.md` because it is the first maintained documentation entrypoint outside `docs/`.
- Total audited Markdown surfaces: `44`.
- Breakdown: `43` Markdown files under `docs/` after applying the two exclusions, plus `README.md` at the repo root.
- Final maintained Markdown surfaces after cleanup: `38`.
- Breakdown: `37` Markdown files under `docs/` after cleanup, plus `README.md` at the repo root.
- This was a documentation-only pass. No application code, runtime config, tests, migrations, or infrastructure definitions were modified.

## Disposition Summary

| Bucket | Count | Meaning in this pass |
|--------|-------|----------------------|
| `RETAIN` | `7` | File was already materially aligned with the live implementation. |
| `EDIT` | `31` | File covered a relevant topic but needed current-state corrections, link repair, or stale-section removal. |
| `REPLACE` | `0` | No file required topic-preserving delete-and-rewrite replacement as a separate disposition. |
| `DELETE` | `6` | File was wholly stale historical audit residue and no longer belonged in the maintained reading surface. |

## Retained Files

| File | Why it was retained |
|------|---------------------|
| `docs/04-features/billing-and-learning.md` | Feature boundaries, file references, and runtime behavior remained aligned with the live route tree. |
| `docs/04-features/catalog-and-product-selection.md` | Catalog and product-selection flow remained accurate against the current API and GUI files. |
| `docs/04-features/category-authority.md` | Category authority ownership, file locations, and data contracts remained current. |
| `docs/04-features/field-rules-studio.md` | Studio flow, route ownership, and file-backed storage notes remained accurate. |
| `docs/04-features/review-workbench.md` | Review flow and ownership remained aligned with the current mounted routes. |
| `docs/04-features/runtime-ops.md` | Runtime operations surface still matched the live telemetry and panel wiring. |
| `docs/04-features/test-mode.md` | Test-mode behavior and its bounded scope remained accurate. |

## Edited Files

### Entrypoints and Overview

| File | What was corrected |
|------|--------------------|
| `README.md` | Replaced stale package-style framing with the maintained docs entrypoint and current validation snapshot. |
| `docs/README.md` | Removed links to deleted historical audits, refreshed reading-order notes, and aligned validation status with 2026-03-31 proof. |
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
| `docs/03-architecture/system-map.md` | Rebased runtime topology on `src/api/guiServer.js`, `src/api/guiServerRuntime.js`, local storage, AppDb, and per-category SpecDb. |
| `docs/03-architecture/backend-architecture.md` | Corrected mounted route families, settings boundaries, storage-manager scope, and persistence flow. |
| `docs/03-architecture/frontend-architecture.md` | Corrected `HashRouter`, page registry ownership, hydration path, and storage-page role. |
| `docs/03-architecture/data-model.md` | Refreshed schema, data-shape, and migration notes to match the current SQLite-backed model. |
| `docs/03-architecture/auth-and-sessions.md` | Replaced assumed auth/session coverage with the current local-trust boundary and exposed sensitive routes. |
| `docs/03-architecture/routing-and-gui.md` | Corrected route tables, layout ownership, and page/component mapping to `tools/gui-react/src/registries/pageRegistry.ts`. |

### Features

| File | What was corrected |
|------|--------------------|
| `docs/04-features/feature-index.md` | Corrected feature summaries, links, and current key-file references. |
| `docs/04-features/indexing-lab.md` | Rebased crawl flow on `src/features/crawl/crawlSession.js`, `createCrawlLedgerAdapter`, and `session.runFetchPlan(...)`. |
| `docs/04-features/llm-policy-and-provider-config.md` | Corrected generated GUI file names, provider dispatch files, and secret-bearing route notes. |
| `docs/04-features/pipeline-and-runtime-settings.md` | Removed nonexistent `storage-settings` flow and aligned the feature with runtime settings, source strategy, and spec seeds. |
| `docs/04-features/storage-and-run-data.md` | Reworked the feature around the current local storage inventory and maintenance surface. |

### Operations, References, and Patterns

| File | What was corrected |
|------|--------------------|
| `docs/05-operations/deployment.md` | Refreshed build/deploy validation notes against the current scripts and outcomes. |
| `docs/05-operations/monitoring-and-logging.md` | Corrected process-status and runtime-health wording to match the live payloads. |
| `docs/05-operations/known-issues.md` | Rebuilt the issue list around current defects and hazards, including secret-bearing settings endpoints and env-check drift. |
| `docs/05-operations/spec_factory_knobs_maintenance.md` | Corrected registry/default/manifest counts and removed stale storage-settings guidance. |
| `docs/05-operations/documentation-audit-ledger.md` | Rewrote the ledger to match the final 2026-03-31 dispositions, deletions, and validation proof. |
| `docs/06-references/api-surface.md` | Removed nonexistent routes and corrected the mounted API surface and response-shape notes. |
| `docs/06-references/background-jobs.md` | Refreshed background job references and validation notes against the current runtime. |
| `docs/06-references/integration-boundaries.md` | Corrected current boundaries for LLM providers, storage, and local runtime trust assumptions. |
| `docs/07-patterns/canonical-examples.md` | Updated the "correct way" examples to the actual route, page, service, and settings patterns in this repo. |
| `docs/07-patterns/anti-patterns.md` | Removed obsolete examples and aligned the "wrong way" guidance to current file ownership and route registration. |

## Deleted Files

| File | Audited reason for deletion |
|------|-----------------------------|
| `docs/03-architecture/PIPELINE-AUDIT-2026-03-25.md` | Historical audit residue that described superseded pipeline structure and created stale cross-links from the maintained docs surface. |
| `docs/03-architecture/STRUCTURAL-AUDIT-2026-03-23.md` | Historical structural audit that no longer matched the live architecture and no longer belonged in the current-state reading order. |
| `docs/03-architecture/STRUCTURAL-AUDIT-2026-03-24.md` | Historical structural audit with stale assumptions already absorbed into corrected current-state docs. |
| `docs/test-audit/app-api-wiring-audit.md` | Test-audit residue outside the maintained LLM reading path; no unique current-state value remained after the live docs refresh. |
| `docs/test-audit/app-ui-component-audit.md` | Test-audit residue outside the maintained LLM reading path; stale against the current GUI structure. |
| `docs/test-audit/full-suite-audit-log.md` | Historical test-audit log that no longer described the current validation baseline. |

## Supporting Non-Markdown Deletion

| File | Note |
|------|------|
| `docs/test-audit/full-suite-audit-log.csv` | Removed as stale supporting residue after the corresponding Markdown audit log was deleted. |

## Major Divergences Discovered

| Topic | Prior-doc assumption | Verified live state |
|------|----------------------|---------------------|
| Documentation entrypoint | Root `README.md` still read like a package scaffold. | `README.md` now needs to point directly into `docs/README.md` and the maintained reading order. |
| Historical audit material | Historical audit files were still present in the maintained docs tree and linked from current-state docs. | Those files were stale residue and were removed from the maintained surface. |
| Mounted backend route authority | Older docs relied on stale route-order assumptions. | The live mounted route order is the `routeDefinitions` array in `src/api/guiServerRuntime.js`. |
| GUI route authority | `tools/gui-react/src/App.tsx` was treated as the complete routed-page inventory. | `tools/gui-react/src/registries/pageRegistry.ts` is the routed page/tab SSOT; `App.tsx` mounts from it plus standalone `/test-mode`. |
| Storage runtime state | Older docs described a disabled run-data storage stub and active relocation semantics. | `src/features/indexing/api/storageManagerRoutes.js` currently reports `storage_backend: "local"`; current source docs should not describe a disabled backend as live behavior. |
| Crawl execution path | Older docs referenced `src/pipeline/runCrawlProcessingLifecycle.js`. | The current crawl flow is driven by `src/features/crawl/crawlSession.js`, `createCrawlLedgerAdapter`, and `session.runFetchPlan(...)`; the old file does not exist. |
| Settings inventories | Older docs used stale registry/default counts. | Live counts are runtime `136`, bootstrap `3`, UI `4`, total exported registries `143`; `SETTINGS_DEFAULTS.runtime` also resolves to `136`. |
| Manifest shape | Older docs treated the emitted manifest as a broader object map. | `CONFIG_MANIFEST` is a 5-section array with `136` total entries: `llm` `23`, `discovery` `1`, `runtime` `55`, `paths` `4`, `misc` `53`. |
| LLM GUI generated files | Older docs named outdated generated files. | Current generated files are `tools/gui-react/src/features/llm-config/state/llmPhaseOverridesBridge.generated.ts` and `tools/gui-react/src/features/llm-config/types/llmPhaseOverrideTypes.generated.ts`. |
| Provider implementation map | Older docs implied a dedicated Anthropic provider file. | No `src/core/llm/providers/anthropic.js` exists; provider dispatch flows through `src/core/llm/providers/index.js` and `src/core/llm/providers/openaiCompatible.js`. |
| Validation baseline | Older docs described a failing `npm test` baseline. | `npm run gui:build` and `npm test` both pass on 2026-03-31; `npm run env:check` still fails because `PORT` is missing from `.env.example`. |
| Sensitive route exposure | Older docs underreported secret-bearing reads. | `/api/v1/runtime-settings`, `/api/v1/llm-policy`, and `/api/v1/indexing/llm-config` can expose provider-key-backed fields when configured and remain part of the local-trust surface. |

## Remaining Ambiguities and Explicit Exclusions

| Area | Current note |
|------|--------------|
| `docs/implementation/` | Explicitly excluded by direct user instruction and treated as out of scope for this pass. |
| `docs/data-structure/` | Explicitly excluded by direct user instruction and treated as out of scope for this pass. |
| `tools/dist/launcher.cjs` | Generated output still contains historical strings such as `runDataStorageState`; current docs were aligned to source files and live runtime, not to stale bundled residue. |

## Validation Proof Used For This Pass

| Proof | Result | Notes |
|------|--------|-------|
| `npm run gui:build` | pass | Completed successfully on 2026-03-31. |
| `npm test` | pass | Completed successfully on 2026-03-31. |
| `npm run env:check` | fail | Reported `Missing keys in config manifest: PORT` on 2026-03-31. |
| `GET /health` | pass | Verified live server identity and health payload. |
| `GET /api/v1/categories` | pass | Returned the current default categories list. |
| `GET /api/v1/process/status` | pass | Verified current runtime-status payload shape. |
| `GET /api/v1/runtime-settings` | pass | Verified the mounted runtime-settings surface and its sensitive read posture. |
| `GET /api/v1/llm-policy` | pass | Verified the mounted composite LLM policy route. |
| `GET /api/v1/storage/overview` | pass | Verified the storage manager surface and observed `storage_backend: "local"`. |
| Relative-link sweep | pass | Editable maintained docs returned `TOTAL_BROKEN=0`. |
| Stale-claim sweep | pass | Outside this audit ledger, editable maintained docs no longer contain the stale claims removed in this pass; remaining literal hits are confined to excluded docs or generated residue. |

## Final Consistency Notes

- The maintained docs tree now follows the current LLM reading order in `docs/README.md`.
- All surviving docs in scope were either explicitly retained or corrected in place; no in-scope current-state topic was removed without replacement coverage.
- No broken relative links remain in the editable maintained docs surface.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `README.md` | repo-root documentation entrypoint required current-state correction |
| source | `docs/README.md` | current reading order and cross-links across the maintained docs tree |
| source | `src/api/guiServer.js` | live server entrypoint |
| source | `src/api/guiServerRuntime.js` | live mounted route order and route-family ownership |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | routed GUI page/tab SSOT |
| source | `src/features/indexing/api/storageManagerRoutes.js` | storage manager endpoint set and local-backend reporting |
| source | `src/features/crawl/crawlSession.js` | current crawl execution path replacing the removed lifecycle file |
| source | `src/pipeline/runProduct.js` | crawl-ledger adapter and fetch-plan integration |
| source | `src/shared/settingsRegistry.js` | live registry counts |
| source | `src/shared/settingsDefaults.js` | live default-section counts |
| source | `src/core/config/manifest/index.js` | current manifest array shape and per-section entry counts |
| source | `src/core/llm/providers/index.js` | provider dispatch entrypoint |
| source | `src/core/llm/providers/openaiCompatible.js` | shared OpenAI-compatible provider implementation |
| source | `tools/gui-react/src/features/llm-config/state/llmPhaseOverridesBridge.generated.ts` | current generated LLM override bridge file name |
| source | `tools/gui-react/src/features/llm-config/types/llmPhaseOverrideTypes.generated.ts` | current generated LLM override type file name |
| command | `npm run gui:build` | current GUI build validation result |
| command | `npm test` | current test-suite validation result |
| command | `npm run env:check` | current env-check failure used in the docs set |
| runtime | `GET /health` | live health contract |
| runtime | `GET /api/v1/categories` | live categories contract |
| runtime | `GET /api/v1/process/status` | live runtime-status contract |
| runtime | `GET /api/v1/runtime-settings` | live runtime-settings contract |
| runtime | `GET /api/v1/llm-policy` | live LLM policy contract |
| runtime | `GET /api/v1/storage/overview` | live storage overview contract |

## Related Documents

- [README](../README.md) - master entrypoint and reading order for the maintained docs set.
- [Known Issues](./known-issues.md) - current defects and hazards discovered during the audit.
- [Spec Factory Knobs Maintenance](./spec_factory_knobs_maintenance.md) - settings-specific inventory and count corrections used in this pass.
- [Environment and Config](../02-dependencies/environment-and-config.md) - detailed env/config reference aligned with the corrected settings counts.
