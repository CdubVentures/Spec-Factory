# Documentation Audit Ledger

> **Purpose:** Record the 2026-03-17 documentation dispositions, proof runs, and doc-to-repo divergences found during the current LLM-first re-audit.
> **Prerequisites:** [../README.md](../README.md), [../05-operations/known-issues.md](../05-operations/known-issues.md), [../01-project-overview/folder-map.md](../01-project-overview/folder-map.md)
> **Last validated:** 2026-03-17

## Audit Scope

- Audited every Markdown file under `docs/` except the explicitly excluded `docs/implementation/` subtree.
- Maintained-doc count in scope: `41` Markdown files.
- Excluded subtree count: `11` Markdown files under `docs/implementation/**`.
- Exclusion reason: explicit operator instruction that `C:\Users\Chris\Desktop\Spec Factory\docs\implementation` remains off-limits for this pass.
- Validation sources included live code, manifests, lockfiles, settings/default authorities, route registries, runtime endpoints, and command proofs where available.

## Proof Run Summary

| Proof | Result | Notes |
|-------|--------|-------|
| `npm run gui:build` | pass | GUI build succeeded on `2026-03-17` |
| `npm run env:check` | pass | returned `[env-check] OK (3 referenced keys covered)` on `2026-03-17`; coverage is narrow and file-list-based |
| `npm test` | fail | `6313` pass, `11` fail, `1` skipped on `2026-03-17`; failing clusters are tracked in [../05-operations/known-issues.md](../05-operations/known-issues.md) |
| `GET /api/v1/health` | pass | live server on `127.0.0.1:8788` returned `ok: true` |
| `GET /api/v1/process/status` | pass | live server returned idle status with no active run |
| `GET /api/v1/categories` | pass | returned `["keyboard","monitor","mouse"]` |
| Markdown relative-link scan | pass | no broken relative links under maintained `docs/**` |
| Template-presence scan | pass after edits | all maintained docs now contain title, purpose, prerequisites, last-validated, validated-against, and related-docs sections |

## Disposition Summary

| Disposition | Count | Notes |
|-------------|-------|-------|
| `RETAIN` | 28 | current and traceable; no content edits required in this pass |
| `EDIT` | 12 | topic remained valid but contained stale proof, missing template sections, or incomplete index coverage |
| `REPLACE` | 1 | same topic retained, but the prior file was no longer usable as the current-pass ledger |
| `DELETE` | 0 | no file met the burden of proof for deletion in this pass |
| `EXCLUDED` | 1 subtree | `docs/implementation/**` intentionally left untouched |

## Retained

| Path | Disposition | Audit note |
|------|-------------|------------|
| `docs/01-project-overview/folder-map.md` | `RETAIN` | root and key subtree map remained aligned with the live checkout |
| `docs/01-project-overview/glossary.md` | `RETAIN` | terminology remained consistent with the current feature/runtime vocabulary |
| `docs/02-dependencies/external-services.md` | `RETAIN` | external-system inventory still matched the live repo boundaries |
| `docs/03-architecture/auth-and-sessions.md` | `RETAIN` | no-auth runtime reality still matched the live server |
| `docs/03-architecture/backend-architecture.md` | `RETAIN` | route-family inventory and process-runtime description remained accurate |
| `docs/03-architecture/data-model.md` | `RETAIN` | SQLite schema documentation still matched `src/db/specDbSchema.js` |
| `docs/03-architecture/frontend-architecture.md` | `RETAIN` | React/HashRouter/React Query/Zustand composition remained accurate |
| `docs/03-architecture/routing-and-gui.md` | `RETAIN` | GUI route table still matched `tools/gui-react/src/App.tsx` |
| `docs/03-architecture/system-map.md` | `RETAIN` | runtime topology remained accurate after rechecking entrypoints and endpoints |
| `docs/04-features/billing-and-learning.md` | `RETAIN` | billing/learning feature flow still matched the audited route and GUI surfaces |
| `docs/04-features/catalog-and-product-selection.md` | `RETAIN` | catalog/brand/product-selection flow remained accurate |
| `docs/04-features/category-authority.md` | `RETAIN` | authority snapshot flow still matched the current API and helper surfaces |
| `docs/04-features/feature-index.md` | `RETAIN` | feature coverage still matched the routed GUI and registered backend families |
| `docs/04-features/field-rules-studio.md` | `RETAIN` | studio ownership and compile flow still matched live code |
| `docs/04-features/indexing-lab.md` | `RETAIN` | IndexLab entrypoints, artifact flow, and runtime boundaries remained accurate |
| `docs/04-features/pipeline-and-runtime-settings.md` | `RETAIN` | settings-authority feature flow still matched current APIs and GUI hooks |
| `docs/04-features/review-workbench.md` | `RETAIN` | review payload/mutation flow still matched live routes and pages |
| `docs/04-features/runtime-ops.md` | `RETAIN` | runtime-ops surface still matched worker/runtime panels and APIs |
| `docs/04-features/storage-and-run-data.md` | `RETAIN` | storage/relocation behavior still matched the current service and GUI surface |
| `docs/04-features/test-mode.md` | `RETAIN` | synthetic category/run flow still matched current routes and page |
| `docs/05-operations/deployment.md` | `RETAIN` | local-first deployment/build reality remained accurate |
| `docs/05-operations/monitoring-and-logging.md` | `RETAIN` | health/status/logging surfaces remained accurate after endpoint checks |
| `docs/05-operations/spec_factory_knobs_maintenance.md` | `RETAIN` | current settings-authority inventory and counts remained accurate |
| `docs/06-references/api-surface.md` | `RETAIN` | endpoint reference remained aligned with the registered route families |
| `docs/06-references/background-jobs.md` | `RETAIN` | daemon/process/runtime job inventory remained accurate |
| `docs/06-references/integration-boundaries.md` | `RETAIN` | external-boundary contracts and failure modes remained accurate |
| `docs/07-patterns/anti-patterns.md` | `RETAIN` | project-specific banned patterns remained current |
| `docs/07-patterns/canonical-examples.md` | `RETAIN` | canonical route/page/migration/test/service examples remained accurate |

## Edited In Place

| Path | Disposition | What was corrected | What was preserved |
|------|-------------|--------------------|--------------------|
| `docs/README.md` | `EDIT` | updated validation date and added the missing audit-doc links so the table of contents now covers every maintained Markdown file | reading order, hierarchy, and `docs/implementation/` exclusion note |
| `docs/01-project-overview/scope.md` | `EDIT` | replaced stale green-suite claims with the current build/env/runtime/test proof state | system boundary, non-goals, and operator roles |
| `docs/01-project-overview/conventions.md` | `EDIT` | corrected the testing-baseline note so it no longer claims the suite is green | repo rules, placement rules, and dependency-direction guidance |
| `docs/02-dependencies/stack-and-toolchain.md` | `EDIT` | updated compatibility notes to reflect the current Node/toolchain proof and current red test baseline | dependency/version inventory and stack description |
| `docs/02-dependencies/environment-and-config.md` | `EDIT` | replaced the stale env-check failure claim with the current narrow pass result and documented the fixed file-scan limitation | config-surface map and settings-authority ownership |
| `docs/02-dependencies/setup-and-installation.md` | `EDIT` | refreshed env-check and test-verification notes to match the current audit baseline | setup steps, run commands, and verification flow |
| `docs/05-operations/known-issues.md` | `EDIT` | removed the obsolete env-check missing-key list, added the current 11-test failure clusters, and documented the narrow env-check limitation | stale Docker issue, stale review finalize route, `specdb_not_ready`, and schema-root dependency note |
| `docs/audits/archetype-query-planner-validation-pass1-live-3mice.md` | `EDIT` | removed the stale prior-green-suite claim and pointed to the new ledger/current known-issues docs | historical planner-validation results and artifacts |
| `docs/audits/test-surface-reduction-2026-03-16.md` | `EDIT` | removed the stale current-baseline sentence and pointed to the new ledger/current known-issues docs | historical test-retirement rationale and replacement-proof summary |
| `docs/audits/architectural-decomposition-audit-2026-03-16.md` | `EDIT` | added the required LLM-doc template wrapper and footer without rewriting the historical findings | historical decomposition findings and refactor analysis |
| `docs/audits/llm-architecture-audit-2026-03-17.md` | `EDIT` | added the required LLM-doc template wrapper and footer | historical LLM architecture findings and remediation analysis |
| `docs/audits/llm-integration-audit-2026-03-17.md` | `EDIT` | added the required LLM-doc template wrapper and footer | historical LLM integration diagrams and subsystem analysis |

## Replaced

| Path | Disposition | Audited evidence for replacement |
|------|-------------|----------------------------------|
| `docs/audits/documentation-audit-ledger.md` | `REPLACE` | the prior ledger hard-coded the 2026-03-16 proof state, still claimed `npm test` was green, still claimed `env:check` failed on 19 keys, and no longer represented the current pass |

## Deleted

| Path | Disposition | Audited evidence for deletion |
|------|-------------|-------------------------------|
| none | n/a | no maintained doc met the burden of proof for deletion in this pass |

## Excluded

| Path | Status | Reason |
|------|--------|--------|
| `docs/implementation/**` | excluded from edits | explicit operator instruction that the subtree is off-limits for this pass |

## Major Divergences Found

| Divergence | Audited reality |
|------------|-----------------|
| maintained docs still described `npm run env:check` as a failing manifest-completeness proof | the command now passes with `OK (3 referenced keys covered)`, and the script only scans a fixed file list declared in `tools/check-env-example-sync.mjs` |
| maintained docs still described `npm test` as green | the current suite baseline is `6313` pass, `11` fail, `1` skipped on `2026-03-17` |
| `docs/README.md` did not link every maintained Markdown file | three audit docs were omitted from the master table of contents |
| three audit docs still lacked the shared LLM-doc template | they now include purpose, prerequisites, last-validated, validated-against, and related-docs sections |

## Remaining Uncertainty / Constraints

- `docs/implementation/**` was intentionally excluded, so stale claims or missing template sections inside that subtree were not corrected in this pass.
- `src/indexlab/indexingSchemaPacketsValidator.js` still depends on schema assets under the excluded subtree; the dependency is documented, but the subtree itself was not edited.
- The live endpoint proof on `127.0.0.1:8788` came from an already-running local server rather than a freshly started second instance.
- `npm run env:check` is intentionally documented as narrow coverage because two declared scan targets in `FILES_TO_SCAN` (`src/api/routes/configRoutes.js`, `src/catalog/activeFilteringLoader.js`) are absent in the current checkout.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `package.json` | root scripts and runtime/build/test entrypoints |
| config | `package-lock.json` | resolved backend dependency versions |
| config | `tools/gui-react/package.json` | GUI scripts and frontend dependencies |
| config | `tools/gui-react/package-lock.json` | resolved GUI dependency versions |
| source | `src/api/guiServer.js` | main local runtime boot path |
| source | `src/app/api/routeRegistry.js` | route-family inventory and order |
| source | `src/config.js` | current config assembly and env/settings merge surface |
| source | `src/shared/settingsDefaults.js` | current settings-default inventories |
| source | `src/db/specDbSchema.js` | canonical SQLite schema inventory |
| source | `tools/check-env-example-sync.mjs` | env-check scan scope and behavior |
| command | `npm run gui:build` | GUI build proof |
| command | `npm run env:check` | current env-check proof |
| command | `npm test` | current full-suite baseline proof |
| runtime | `http://127.0.0.1:8788/api/v1/health` | live server health proof |
| runtime | `http://127.0.0.1:8788/api/v1/process/status` | live idle status proof |
| runtime | `http://127.0.0.1:8788/api/v1/categories` | live category inventory proof |
| command | Markdown link scan | maintained-doc relative links resolve successfully |
| command | Template-presence scan | maintained docs now meet the shared LLM-doc structure requirements |

## Related Documents

- [../README.md](../README.md) - master entrypoint for the maintained documentation tree.
- [../05-operations/known-issues.md](../05-operations/known-issues.md) - carries forward the current runtime/tooling issues discovered during this pass.
- [../02-dependencies/environment-and-config.md](../02-dependencies/environment-and-config.md) - records the current env/config authority chain clarified by this audit.
