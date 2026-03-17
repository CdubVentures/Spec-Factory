# Documentation Audit Ledger

> **Purpose:** Record the `2026-03-16` documentation dispositions, current proof runs, and the repo/documentation divergences found during the LLM-first documentation rebuild.
> **Prerequisites:** [../README.md](../README.md), [../01-project-overview/folder-map.md](../01-project-overview/folder-map.md), [../05-operations/known-issues.md](../05-operations/known-issues.md)
> **Last validated:** 2026-03-16

## Audit Scope

- Audited every Markdown file under `docs/` except the explicitly excluded `docs/implementation/` subtree.
- Excluded subtree count: `16` Markdown files under `docs/implementation/**`.
- Exclusion reason: explicit operator instruction that `C:\Users\Chris\Desktop\Spec Factory\docs\implementation` is off-limits for edits in this pass.
- Validation sources included live code, manifests, config manifests, runtime entrypoints, route handlers, lockfiles, and command/runtime validation where available.

## Proof Run Summary

| Proof | Result | Notes |
|-------|--------|-------|
| `npm run gui:build` | pass | GUI build succeeded on `2026-03-16` |
| `npm test` | pass | `5552/5552` passing on `2026-03-16` |
| `npm run env:check` | fail | manifest still missing `19` referenced keys; tracked in [../05-operations/known-issues.md](../05-operations/known-issues.md) |
| `GET /api/v1/health` | pass | live server on `127.0.0.1:8788` returned `ok: true` |
| `GET /api/v1/process/status` | pass | idle response retained last-run metadata and `exitCode: 0` |
| `GET /api/v1/categories` | pass | returned `["keyboard","monitor","mouse"]` |

## Disposition Summary

| Disposition | Count | Notes |
|-------------|-------|-------|
| `RETAIN` | 11 | current and traceable; no content changes required |
| `EDIT` | 23 | content or validation metadata updated in place |
| `REPLACE` | 4 | topic still relevant, but prior file was stale or underspecified enough to rewrite |
| `DELETE` | 1 | speculative document contradicted the current-state documentation contract |
| `EXCLUDED` | 1 subtree | `docs/implementation/**` intentionally left untouched |

## Retained

| Path | Disposition | Audit note |
|------|-------------|------------|
| `docs/README.md` | `RETAIN` | reading order, links, and exclusion note were already current |
| `docs/01-project-overview/scope.md` | `RETAIN` | live system boundary, test baseline, and non-goals already matched audited reality |
| `docs/01-project-overview/conventions.md` | `RETAIN` | aligned with `AGENTS.md`, package manifests, and repo structure |
| `docs/02-dependencies/stack-and-toolchain.md` | `RETAIN` | dependency versions, Node/npm observations, and toolchain notes matched lockfiles and runtime checks |
| `docs/02-dependencies/environment-and-config.md` | `RETAIN` | config surfaces and manifest-group ownership were already accurate |
| `docs/02-dependencies/setup-and-installation.md` | `RETAIN` | install/build/run steps and live audit notes already matched the repo |
| `docs/03-architecture/system-map.md` | `RETAIN` | runtime topology remained accurate after re-audit |
| `docs/05-operations/deployment.md` | `RETAIN` | local-first deployment/build reality and stale Docker warning were already correct |
| `docs/05-operations/monitoring-and-logging.md` | `RETAIN` | health/status/logging surfaces matched live code and runtime responses |
| `docs/05-operations/known-issues.md` | `RETAIN` | current issues list matched the live repo and runtime checks |
| `docs/06-references/integration-boundaries.md` | `RETAIN` | local/external boundaries and failure modes matched audited code paths |

## Edited In Place

| Path | Disposition | What was corrected | What was preserved |
|------|-------------|--------------------|--------------------|
| `docs/01-project-overview/glossary.md` | `EDIT` | advanced validation metadata after re-auditing terminology | glossary terms and file-backed meanings |
| `docs/01-project-overview/folder-map.md` | `EDIT` | removed invented top-level `imports/` and `storage/` directories, rebuilt the root tree from the live checkout, and moved configured-on-demand paths into a separate section | folder-map topic, reading-order placement, and file-path focus |
| `docs/02-dependencies/external-services.md` | `EDIT` | advanced validation metadata after re-auditing service boundaries | verified service inventory and failure behavior |
| `docs/03-architecture/backend-architecture.md` | `EDIT` | advanced validation metadata after route/runtime re-audit | entrypoints, route-family map, and error-handling description |
| `docs/03-architecture/frontend-architecture.md` | `EDIT` | advanced validation metadata after GUI route/state re-audit | framework, routing, and state/fetching structure |
| `docs/03-architecture/routing-and-gui.md` | `EDIT` | advanced validation metadata after GUI route-map re-audit | route table, wrapper notes, and client/server boundary |
| `docs/03-architecture/data-model.md` | `EDIT` | advanced validation metadata after schema re-check against `src/db/specDbSchema.js` | table inventory and migration notes |
| `docs/03-architecture/auth-and-sessions.md` | `EDIT` | advanced validation metadata after confirming the no-auth runtime still holds | verified no-auth/session reality |
| `docs/04-features/feature-index.md` | `EDIT` | advanced validation metadata after full feature-pass re-audit | feature lookup table and ownership paths |
| `docs/04-features/category-authority.md` | `EDIT` | advanced validation metadata after route/helper re-audit | snapshot flow and authority boundary explanation |
| `docs/04-features/catalog-and-product-selection.md` | `EDIT` | advanced validation metadata after catalog/brand route re-audit | end-to-end catalog flow and side effects |
| `docs/04-features/field-rules-studio.md` | `EDIT` | advanced validation metadata after studio route/settings re-audit | studio flow, state transitions, and side effects |
| `docs/04-features/indexing-lab.md` | `EDIT` | advanced validation metadata after process-runtime and replay-route re-audit | run flow, artifact lifecycle, and error paths |
| `docs/04-features/pipeline-and-runtime-settings.md` | `EDIT` | advanced validation metadata after settings-authority re-audit | settings persistence flow and side effects |
| `docs/04-features/review-workbench.md` | `EDIT` | advanced validation metadata after review route/mutation re-audit | scalar/component/enum review flow and data writes |
| `docs/04-features/runtime-ops.md` | `EDIT` | advanced validation metadata after runtime-ops route/builder re-audit | runtime diagnostics flow and asset behavior |
| `docs/04-features/storage-and-run-data.md` | `EDIT` | advanced validation metadata after storage/relocation re-audit | storage flow and relocation semantics |
| `docs/04-features/billing-and-learning.md` | `EDIT` | advanced validation metadata after billing/learning re-audit | billing and learning artifact flow |
| `docs/04-features/test-mode.md` | `EDIT` | advanced validation metadata after test-mode route re-audit | synthetic category lifecycle and cleanup behavior |
| `docs/06-references/api-surface.md` | `EDIT` | advanced validation metadata after endpoint re-audit | endpoint inventory and stale-review-finalize warning |
| `docs/06-references/background-jobs.md` | `EDIT` | replaced the checked-in `imports/` assumption with the real configured imports-root behavior and advanced validation metadata | daemon/process runtime/job inventory |
| `docs/07-patterns/canonical-examples.md` | `EDIT` | advanced validation metadata after pattern re-audit | canonical route/page/migration/test/job/service examples |
| `docs/07-patterns/anti-patterns.md` | `EDIT` | advanced validation metadata after pattern re-audit | banned patterns and corrective guidance |

## Replaced

| Path | Disposition | Audited evidence for replacement |
|------|-------------|----------------------------------|
| `docs/05-operations/spec_factory_knobs_maintenance.md` | `REPLACE` | prior file lacked the required template, had stale count values (`runtime=336`, `total=364`, `manifest=475`), and mixed current-state counts with retirement history without naming the canonical authority files |
| `docs/audits/documentation-audit-ledger.md` | `REPLACE` | prior ledger described the older `2026-03-15` pass, stale test-failure claims, and outdated disposition counts; it could not serve as the current pass record without full replacement |
| `docs/audits/test-surface-reduction-2026-03-16.md` | `REPLACE` | prior file was a very large raw audit dump with no required template or historical-context guardrails; replaced with a concise machine-readable summary preserving the verified decisions and proof |
| `docs/audits/archetype-query-planner-validation-pass1-live-3mice.md` | `REPLACE` | prior file was a very large raw validation dump with outdated global suite counts and no template framing; replaced with a concise historical summary preserving the validated outcomes and limits |

## Deleted

| Path | Disposition | Audited evidence for deletion |
|------|-------------|-------------------------------|
| `docs/ARCHITECTURAL-AUDIT-2026-03-16.md` | `DELETE` | speculative refactor plan rather than current-state documentation; contained prescriptive future-state claims that conflict with the required implementation-backed doc set |

## Excluded

| Path | Status | Reason |
|------|--------|--------|
| `docs/implementation/**` | excluded from edits | explicit operator instruction that the subtree is off-limits for this pass |

## Major Divergences Found

| Divergence | Audited reality |
|------------|-----------------|
| folder map showed checked-in `imports/` and `storage/` roots | the live checkout has neither; imports are a configured path defaulting to `imports/`, and runtime artifact roots default under the OS temp directory |
| knobs maintenance counts were treated as current | live counts are `runtime=333`, `total defaults=363`, `manifest keys=473` |
| older audit ledger still described a failing `npm test` baseline | current audit run passed `5552/5552` tests on `2026-03-16` |
| historical audit docs could be misread as current baseline docs | they are now explicitly framed as historical audit records, not current-state runtime truth |

## Remaining Uncertainty / Constraints

- `docs/implementation/**` was intentionally excluded, so stale links or claims inside that subtree were not corrected in this pass.
- `src/indexlab/indexingSchemaPacketsValidator.js` still depends on schema assets under the excluded subtree; the dependency is documented, but the subtree itself was not edited.
- Fresh second-instance startup validation of `npm run gui:api` was blocked because port `8788` was already in use; live endpoint validation was collected from the already-running server instead.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `package.json` | root scripts and runtime/build/test entrypoints |
| config | `package-lock.json` | resolved backend dependency versions |
| config | `tools/gui-react/package.json` | GUI scripts and frontend deps |
| config | `tools/gui-react/package-lock.json` | resolved GUI dependency versions |
| source | `src/api/guiServer.js` | main local runtime boot path |
| source | `src/app/api/routeRegistry.js` | route-family inventory and order |
| source | `src/config.js` | current config assembly and imports-root defaults |
| source | `src/shared/settingsDefaults.js` | live settings-default counts and imports-root default |
| source | `src/db/specDbSchema.js` | canonical SQLite schema inventory |
| command | `npm run gui:build` | GUI build proof |
| command | `npm run env:check` | current env-sync drift proof |
| command | `npm test` | current full-suite baseline proof |
| runtime | `http://127.0.0.1:8788/api/v1/health` | live server health proof |
| runtime | `http://127.0.0.1:8788/api/v1/process/status` | live idle status payload proof |
| runtime | `http://127.0.0.1:8788/api/v1/categories` | live category inventory proof |

## Related Documents

- [../README.md](../README.md) - master entrypoint for the maintained documentation tree.
- [../05-operations/known-issues.md](../05-operations/known-issues.md) - carries forward live issues discovered during the audit.
- [../01-project-overview/folder-map.md](../01-project-overview/folder-map.md) - corrected repo-tree map produced by this audit.
