# Documentation Audit Ledger

> **Purpose:** Record the Phase 0 documentation dispositions, the exact docs changed or removed, and the major documentation-to-code divergences found during the 2026-03-15 audit.
> **Prerequisites:** [../README.md](../README.md), [../01-project-overview/folder-map.md](../01-project-overview/folder-map.md), [../03-architecture/backend-architecture.md](../03-architecture/backend-architecture.md)
> **Last validated:** 2026-03-15

## Audit Scope

- Audited every Markdown file under `docs/` except `docs/implementation/ai-indexing-plans/**`.
- Exclusion reason: explicit operator instruction not to touch `C:\Users\Chris\Desktop\Spec Factory\docs\implementation\ai-indexing-plans`.
- Validation sources included live code, manifests, config manifests, feature READMEs, and command execution for `npm run gui:build`, `npm run env:check`, and `npm test`.

## Disposition Summary

| Disposition | Count | Notes |
|-------------|-------|-------|
| `RETAIN` | 19 | current and traceable after repo audit |
| `EDIT` | 16 | corrected stale path references, validation status, encoding drift, audit-scope wording, or implementation-ownership precision |
| `REPLACE` | 0 | no file required full rewrite |
| `DELETE` | 2 | removed stale architecture-audit artifacts that contradicted live repo state |
| `EXCLUDED` | 1 subtree | `docs/implementation/ai-indexing-plans/**` left untouched by instruction |

## Retained

| Path | Disposition | Audit note |
|------|-------------|------------|
| `docs/README.md` | `RETAIN` | content was current; broken ledger link is resolved by this new file |
| `docs/01-project-overview/conventions.md` | `RETAIN` | aligned with `AGENTS.md`, package manifests, and GUI/backend split |
| `docs/01-project-overview/folder-map.md` | `RETAIN` | repo tree and key folders matched live layout |
| `docs/02-dependencies/environment-and-config.md` | `RETAIN` | config surfaces and manifest groups matched `src/core/config/manifest/*.js` and `src/config.js` |
| `docs/02-dependencies/external-services.md` | `RETAIN` | verified active and optional integrations against live consumers |
| `docs/02-dependencies/stack-and-toolchain.md` | `RETAIN` | dependency versions and toolchain matched manifests and lockfiles |
| `docs/03-architecture/data-model.md` | `RETAIN` | schema description remained aligned with `src/db/specDbSchema.js` |
| `docs/03-architecture/system-map.md` | `RETAIN` | topology remained consistent with local-first runtime |
| `docs/04-features/billing-and-learning.md` | `RETAIN` | verified against queue/billing/learning route family and GUI page |
| `docs/04-features/category-authority.md` | `RETAIN` | authority snapshot flow matched live route and GUI consumer paths |
| `docs/04-features/storage-and-run-data.md` | `RETAIN` | storage relocation and GUI browsing surfaces matched live code |
| `docs/04-features/test-mode.md` | `RETAIN` | test-mode routes and GUI page matched live code |
| `docs/05-operations/deployment.md` | `RETAIN` | local deployment/build/packaging reality matched scripts and launcher files |
| `docs/05-operations/monitoring-and-logging.md` | `RETAIN` | health, logging, websocket, and counter surfaces matched live runtime |
| `docs/06-references/api-surface.md` | `RETAIN` | endpoint inventory remained accurate, including stale client `finalize` warning |
| `docs/06-references/background-jobs.md` | `RETAIN` | recurring loops and on-demand jobs matched daemon/CLI/process runtime |
| `docs/06-references/integration-boundaries.md` | `RETAIN` | external/local boundary contracts matched live consumers |
| `docs/07-patterns/anti-patterns.md` | `RETAIN` | anti-patterns matched `AGENTS.md` and live architecture constraints |
| `docs/07-patterns/canonical-examples.md` | `RETAIN` | examples still reflected real route/page/migration/test patterns |

## Edited In Place

| Path | Disposition | What was corrected | What was preserved |
|------|-------------|--------------------|--------------------|
| `docs/01-project-overview/scope.md` | `EDIT` | updated stale `npm test` baseline claim from 2 failures to the observed 21 failures | project boundary, operator roles, and non-goals |
| `docs/01-project-overview/glossary.md` | `EDIT` | replaced nonexistent search-profile panel path with the live Runtime Ops prefetch panel path | all other glossary terms and evidence |
| `docs/02-dependencies/setup-and-installation.md` | `EDIT` | updated test-status note to reflect the 2026-03-15 audit rerun | install/build/run steps |
| `docs/03-architecture/backend-architecture.md` | `EDIT` | removed nonexistent `src/app/api/guiRouteContext.js` claim and documented the real `routeCtx`/assembly/registry pipeline | route-family inventory and runtime behavior notes |
| `docs/03-architecture/auth-and-sessions.md` | `EDIT` | normalized encoding corruption to ASCII while preserving the verified no-auth conclusion | verified no-auth/session reality |
| `docs/03-architecture/frontend-architecture.md` | `EDIT` | tightened route ownership and top-level route implementation paths so wrapper pages are no longer the implied owners | framework, router, and state/data-layer description |
| `docs/03-architecture/routing-and-gui.md` | `EDIT` | expanded wrapper-vs-page-local ownership notes for the live GUI route map | route table, layout ownership, and transport boundaries |
| `docs/04-features/catalog-and-product-selection.md` | `EDIT` | replaced wrapper-page references with the primary catalog feature component owner | flow, side effects, and data-change behavior |
| `docs/04-features/feature-index.md` | `EDIT` | corrected Indexing Lab GUI file path to the live feature-owned component | all other feature rows |
| `docs/04-features/field-rules-studio.md` | `EDIT` | replaced wrapper-page references with the primary studio feature component owner | studio flow, compile behavior, and cache invalidation |
| `docs/04-features/indexing-lab.md` | `EDIT` | corrected Indexing page path throughout entrypoint table, flow, diagram, and evidence table | run lifecycle and API flow |
| `docs/04-features/pipeline-and-runtime-settings.md` | `EDIT` | replaced wrapper-page references with the primary pipeline-settings feature component owner while keeping page-local LLM settings ownership explicit | settings persistence flow and side effects |
| `docs/04-features/review-workbench.md` | `EDIT` | replaced scalar review wrapper-page references with the primary feature component owner | review mutations, state transitions, and component-review details |
| `docs/04-features/runtime-ops.md` | `EDIT` | replaced nonexistent IDX runtime metadata dependency path with the real live files | runtime-ops flow, side effects, and error paths |
| `docs/05-operations/known-issues.md` | `EDIT` | replaced stale 2-failure baseline note with the 21-failure audit observation and representative failing suites | Docker, env drift, review finalize, and `specdb_not_ready` issues |
| `docs/implementation/README.md` | `EDIT` | corrected false claim that only one Markdown file remained and documented the explicit audit exclusion for `ai-indexing-plans` | runtime-schema retention rationale and subtree guardrails |

## Deleted

| Path | Disposition | Audited evidence for deletion |
|------|-------------|-------------------------------|
| `docs/architecture/ARCHITECTURAL-AUDIT-2026-03-15.md` | `DELETE` | contained speculative future modules, broken file references, stale git-state claims, and refactor-plan content that is not current-state documentation |
| `docs/audit/ARCHITECTURAL-AUDIT-2026-03-15.md` | `DELETE` | duplicated the same speculative audit/problem-plan role with many nonexistent target paths and contradicted the live repo state |

## Replaced

None.

## Unresolved Ambiguities

- `docs/implementation/ai-indexing-plans/**` was intentionally excluded from edits. Its content may contain stale plans, but this audit did not change it.
- `JWT_SECRET` and related security config keys still exist in the config manifest even though no live auth/session middleware was verified.
- `npm test` was executable and produced 21 failures on 2026-03-15, but this documentation task did not diagnose or fix those failures.

## Major Documentation Divergences Found

| Divergence | Audited reality |
|------------|-----------------|
| Test baseline docs said the suite had only two failures | the 2026-03-15 audit rerun observed 21 failures |
| Backend architecture doc cited `src/app/api/guiRouteContext.js` | `routeCtx` is assembled inline in `src/api/guiServer.js` and specialized by context builders in `src/app/api/routeRegistry.js` |
| Indexing docs cited `tools/gui-react/src/pages/indexing/IndexingPage.tsx` | the live route imports `tools/gui-react/src/features/indexing/components/IndexingPage.tsx` directly from `tools/gui-react/src/App.tsx` |
| Runtime Ops doc cited `src/features/indexing/api/runtime/idxRuntimeMetadata.js` | live IDX runtime metadata lives at `src/features/indexing/runtime/idxRuntimeMetadata.js` |
| Glossary cited nonexistent `SearchProfilePanel.tsx` under indexing | live search-profile UI evidence is under Runtime Ops prefetch panels |
| Implementation README implied `ai-indexing-plans` Markdown was gone | the subtree still exists and was explicitly excluded from this audit |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/api/guiServer.js` | live server assembly, inline `routeCtx`, and runtime entrypoint reality |
| source | `src/app/api/routeRegistry.js` | fixed route-family order and context-builder usage |
| source | `src/api/guiServerHttpAssembly.js` | registered-route pipeline handoff |
| source | `tools/gui-react/src/App.tsx` | live GUI route imports and Indexing page ownership |
| source | `src/features/indexing/api/runtimeOpsRoutes.js` | runtime-ops dependency paths and route behavior |
| source | `src/features/indexing/runtime/idxRuntimeMetadata.js` | live IDX runtime badge metadata file |
| source | `src/db/specDbSchema.js` | current-state SQLite schema authority |
| config | `package.json` | build/test command definitions used during audit |

## Related Documents

- [../README.md](../README.md) - master entrypoint that now links to this ledger.
- [../05-operations/known-issues.md](../05-operations/known-issues.md) - carries forward the verified runtime/test drift that matters during implementation.
- [../implementation/README.md](../implementation/README.md) - explains the excluded `docs/implementation/` subtree and retained runtime schema assets.
