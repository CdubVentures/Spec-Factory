# Auditor 1 - Data Contracts, Persistence, Rebuild, Codegen

Date: 2026-04-29

## Ownership

Auditor 1 owns backend data integrity and contract proof:

- SQL/JSON dual-state persistence.
- Deleted-DB rebuild behavior.
- PIF runtime SQL-vs-JSON read contracts.
- Storage/IndexLab durable projections and finalizers.
- Mutation response contracts.
- Codegen and registry drift proof.
- Backend/data contract tests.

Do not edit frontend UX components except test harnesses needed for contract proof. Coordinate with Auditor 2 before changing user-facing query behavior, and with Auditor 3 before changing WS payload contracts.

## Current Audit Snapshot

Verification refreshed on 2026-04-29 against the current dirty workspace:

| Command | Result |
|---|---|
| `npm test` | BLOCKED in Codex Windows sandbox before app assertions: Node test-runner child process spawn fails with `spawn EPERM`. Log: `.tmp/npm-test-full-audit-auditor1-2026-04-29.log`. |
| `node --test --test-isolation=none --test-force-exit --experimental-test-module-mocks` | FAIL: 12,911 tests, 12,894 passed, 17 failed. This is the sandbox fallback, not release-equivalent isolated proof. Log: `.tmp/npm-test-isolation-none-audit-auditor1-2026-04-29.log`. |
| `npm run gui:check` | PASS. Log: `.tmp/gui-check-audit-auditor1-2026-04-29.log`. |
| Focused Auditor 1 direct proof stack | PASS: 341 tests, 341 passed, 0 failed. Covers event/data-change, run-summary/storage/runtime artifacts, catalog/codegen registry drift, prompt structural assertions, and cross-finder variant cascades. |
| Targeted direct repros for red clusters | FAIL: CEF unknown-product route, review component ecosystem values, review component timestamps, field metadata shape, and component confidence color contracts reproduce outside the isolation-none full run. |

Auditor 1 has an active red gate in the current workspace. The official full-suite command is sandbox-blocked, and the sandbox fallback exposes directly reproducible data-contract failures in CEF and component-review surfaces.

## Critical Priority

| ID | Issue | Evidence | Required Next Step |
|---|---|---|---|
| C2-red | Current workspace is not audit-green | `node --test --test-isolation=none --test-force-exit --experimental-test-module-mocks` reports 17 failures, and the failing clusters reproduce with direct file execution. `npm test` remains sandbox-blocked by `spawn EPERM`, so a normal developer PowerShell full-suite pass is still required after fixes. | Resolve or intentionally re-contract the direct red clusters, then rerun focused repros and full `npm test` outside the Codex sandbox. |

## High Priority

| ID | Issue | Primary Area | Evidence |
|---|---|---|---|
| H8-cef-404 | CEF unknown product route returns 200 instead of 404 | Color Edition Finder API contract | `node --experimental-test-module-mocks src\features\color-edition\api\tests\colorEditionFinderRoutes.test.js` fails 1/18: `returns 404 for unknown product`, actual `200`. |
| H9-review-component-values | Component review ecosystem no longer projects seeded component reference/candidate values | Review component data projection | `node --experimental-test-module-mocks src\features\review\tests\reviewEcosystem.component.test.js` fails 9/14 with `unknown`/`null` values and missing component candidates for seeded sensor/material rows. |
| H10-review-component-timestamps | Component property source timestamps are missing | Review component source timestamp contract | `node --experimental-test-module-mocks src\features\review\tests\reviewEcosystem.timestamps.test.js` fails 3/10; component property `source_timestamp` values are `null`. |
| H11-review-field-meta-drift | Field metadata contract shape drifted with `component_only: false` | Review component field metadata | `componentReviewDataLaneState.fieldMetaEnumContracts.test.js` and `componentReviewDataLaneState.fieldMetaVarianceContracts.test.js` fail because returned metadata now includes `component_only: false`. Decide whether the public contract changed, then update consumers/tests or production shape consistently. |
| H12-review-confidence-color | Component payload confidence color contract regressed | Review component payload semantics | `node --experimental-test-module-mocks src\features\review\domain\tests\componentReviewDataLaneState.varianceConfidenceColors.test.js` fails: expected `red`, actual `gray`. |

## Previously Closed Findings

These rows are historical closure records from earlier audit passes. The 2026-04-29 critical/high findings above supersede any prior closure whose area has regressed in the current dirty workspace.

| ID | Closed Finding | Proof |
|---|---|---|
| C1-green | Full-suite red gate | 2026-04-28 `npm test` was green: 12,613 passed, 0 failed. Superseded by C2-red for the current 2026-04-29 dirty workspace. |
| H1-authority | Mouse source-authority host contract | Full suite now passes the mouse authority hostname contract. |
| H2-prompt | Scalar finder prompt golden drift | Full suite now passes SKU and RDF prompt golden tests. |
| H3-crawl-ledger | Crawl ledger cooldown upsert contract | Full suite now passes crawl ledger cooldown tests. |
| H4-cef-upsert | Color Edition Finder run UPSERT idempotency | Full suite now passes CEF store idempotency tests. |
| H5-color-registry | Color registry seed reconcile expectations | Full suite now passes color registry seed tests. |
| H6-pif-callback | PIF dedup callback order/count contract | Full suite now passes Product Image Finder dedup callback tests. |
| H7-review-seed | Review ecosystem component seed/link projection | Full suite now passes review ecosystem component/spec DB tests. |
| M2 | Field Studio prompt-preview invalidation | Review-layout data-change invalidation now derives field-rule-backed prompt preview families from `FINDER_MODULES`; focused data-change/event registry proof passed. |
| M6 | Run-finalize Catalog coverage | `process-completed` now includes the `catalog` domain after a run-type/product-field matrix confirmed successful compile and IndexLab completions can change Catalog row projections. Focused event/process proof passed. |
| M19 | Run-summary telemetry event cap visibility | `run-summary` schema v2 now includes `telemetry.event_limit` with `limit`, `captured`, and `truncated`; serializer reads one extra bridge event and preserves the newest capped window. Focused run-summary proof passed. |
| M20 | Storage run source pagination | `/storage/runs/:runId` now passes a bounded `sourcesPage` contract to the SQL detail reader, returns `sources_page` metadata, and uses SQL limit/offset plus count readers for `run_sources`/`crawl_sources`. Focused storage proof passed. |
| M21 | Storage HTML artifact serve route | `GET /storage/runs/:runId/sources/:contentHash/html` now serves SQL-indexed gzipped HTML artifacts with path validation under the run HTML artifact directory. Focused storage route proof passed. |
| M22 | Crawl4AI extraction artifact API | Runtime Ops now serves persisted Crawl4AI JSON extraction artifacts through `GET /indexlab/run/:runId/runtime/extractions/crawl4ai/:filename`, matching the existing GUI panel contract. Focused Runtime Ops route proof passed. |
| M23 | Storage run detail freshness contract | Documented that storage mutation events invalidate broad `['storage']`, which includes run-detail queries `['storage', 'runs', runId]`; the 60s stale window is not the post-mutation freshness boundary. Focused invalidation proof passed. |
| M24 | Query-key scope contract is incomplete | `DOMAIN_QUERY_TEMPLATES` now documents category/global query-key scope semantics next to the source registry; focused data-change tests prove every domain template and every registered event fallback materializes the expected scoped query keys. |
| M26 | Catalog sortable finder columns are hardcoded in tests | Overview sort contract proof now derives the ordered finder-backed sortable columns from the generated finder panel registry, which is generated from `FINDER_MODULES`, instead of a hardcoded CEF/PIF/RDF/SKU/KF list. Focused Overview sort proof passed. |
| M27 | Finder-specific knob schemas are not tied to rendered controls | Finder settings schemas now type `widget` against the shared widget-name contract, widget registration derives from that same contract, and the focused registry test proves every schema widget points at a registered renderer control. |
| M28 | Cross-finder cascade data-state invariants are thin | Added a cross-finder delete-variant regression that seeds PIF progress, RDF, SKU, product candidates, and variant fields; fixed PIF progress cleanup so CEF variant delete removes stale `pif_variant_progress` rows. Focused lifecycle/PIF proof passed. |
| M29 | Prompt wording assertions are brittle | RDF/SKU scalar prompt tests now assert rendered slot bags, output JSON keys, and injected identity/discovery data instead of hardcoded guidance prose. Focused prompt proof passed. |
| L10/L11 | `reviewLayoutByCategory` cache cleanup | The delete-only runtime map was retired from bootstrap, process, Studio, and Review API contexts. Source search confirms no production references remain; focused process/review/studio tests passed. |
| H2-old | PIF runtime JSON read/modify paths | SQL-first runtime reader table and focused PIF suite: 184 passed, 0 failed. |
| H3-old | Storage Run Detail B2 durable projection/finalizer coverage | `run_sources` schema/finalizer/rebuild confirmed; focused storage/indexing suite: 44 passed, 0 failed. |
| H4-old | Deleted-DB rebuild coverage for `field_key_order` | `fieldKeyOrderReseed` proof: 7 passed, 0 failed. |
| H5-old | SQL/JSON mirror atomicity | Dual-write inventory plus focused suite: 234 passed, 0 failed. |
| H6-old | Shared delete/reset atomicity | Finder/review/color route suite: 74 passed, 0 failed. |
| H16-old | Codegen drift guard | Generator drift tests: 21 passed, 0 failed. |
| M7-old | IndexLab URL history B3 projection/rebuild confirmation | `indexed_url_history` view and SQL-first reader tests are present; rebuild path is covered through `run_sources` seeding and URL history reader tests. |
| M25-old | Mutation response payloads for high-traffic deletes | Generic finder delete run/batch/all responses now return the post-mutation canonical `entity`; PIF custom image/run deletes return updated SQL-projection `entity`. Focused route/codegen/typecheck proof passed. |

## Medium Priority

| ID | Issue | Primary Area | Work Shape |
|---|---|---|---|
| M30 | No root regenerate-all codegen entry point | Codegen workflow | Fresh script inventory still shows no root `generate`/`regen`/`codegen` package script. Add only with explicit package-script approval. |
| M31 | LLM phase generator is a super-generator | Codegen architecture | Fresh audit: `tools/gui-react/scripts/generateLlmPhaseRegistry.js` is 657 LOC / 34 KB and still emits multiple registry surfaces. Document or split only when it becomes hard to maintain. |
| M32 | Finder typegen has opt-in coverage | Finder generated types | Fresh audit: `FINDER_MODULES` typegen coverage is 2/5 (`releaseDateFinder`, `skuFinder` only). Decide universal typegen vs documented opt-in criteria. |
| M33 | Broader generated-code checks are still needed before closing Registry/O(1) stage work | Registry/O(1) closure | Fresh focused generator drift tests for finder types/hooks pass, but no root regenerate-all sequence exists and the broader generated-file inspection remains open. |

## Low Priority

| ID | Issue | Primary Area | Work Shape |
|---|---|---|---|
| L3 | PIF `image-processed` does not update `pif_variant_progress` unless ring semantics change | PIF progress projection | Keep watch item unless rings move to raw image counts. |
| L7 | Data-change domain mapping is not easy to audit from source | Event registry/generated resolver | Improve source registry/generated resolver documentation. |
| L12 | Component/enum cache invalidation plumbing may be dead | Server route cleanup | Remove dead plumbing or add WHY comment. |
| L16 | No cross-system evidence enum-sync test | Evidence enum tests | Add parity test if evidence kinds change again. |
| L17 | Orphaned billing-event counters are not surfaced | Billing observability | Show telemetry warning counters when non-zero. Coordinate UI display with Auditor 2 if needed. |
| L18 | Billing dashboard freshness is timer-based | Billing dashboard data contract | Add `billing-updated` only if immediate cost freshness matters. |
| L19 | Broad data-authority snapshot invalidation intent is undocumented | Data authority invalidation | Add WHY comment near event/domain mapping. |
| L20 | Data-authority observability payload is not clearly consumed | Data authority snapshot | Document reserved payload or split endpoint when another consumer appears. |
| L21 | Data-authority polling plus invalidation is redundant | Data authority query freshness | Raise stale time or remove polling once invalidation confidence is high. |
| L22 | No data-authority cascade-scope regression test | Data authority tests | Add invariant if query becomes performance-sensitive. |
| L28 | Some registries probably need generated consumers | Registry codegen | Generate constants when drift appears or registry pipeline is touched. |
| L29 | `tsconfig.tsbuildinfo` is tracked | Repo hygiene | Remove from tracking only with explicit cleanup approval. |
| L30 | Codegen script test coverage is sparse | Codegen tests | Add generator smoke tests. |
| L35 | Screenshot directory candidate resolution is duplicated | Runtime asset routes | Extract shared screenshot path candidate helper. |
| L36 | No explicit AppDb `categories` table | AppDb category inventory | Add only if UI/API needs SQL category inventory. |
| L37 | AppDb `settings` table reserved sections are undocumented | AppDb schema docs | Add schema comment or README note. |
| L38 | Cross-DB brand reference is contract-only | AppDb/SpecDb brand contract | Document rename cascade or add fan-out if drift is reproduced. |
| L39 | Negative invalidation-scope tests are sparse | Invalidation tests | Add small negative invariants for broad templates. |

## Work Log

### 2026-04-29 - Fresh Auditor 1 Full Audit

Ran a fresh Auditor 1 audit against the current dirty workspace. No production source changes were made in this pass; the update is audit evidence and backlog triage only.

| Area | Result |
|---|---|
| Official full suite | `npm test` is blocked in the Codex Windows sandbox by Node test-runner `spawn EPERM` before app assertions execute. |
| Sandbox fallback full suite | `node --test --test-isolation=none --test-force-exit --experimental-test-module-mocks` executes the suite but is red: 12,911 tests, 12,894 passed, 17 failed. |
| GUI typecheck | `npm run gui:check` passes. |
| Focused Auditor 1 proof | 341 focused tests pass across data-change/event contracts, run-summary/storage/runtime artifacts, catalog/codegen registry checks, prompt structural assertions, and cross-finder cascade behavior. |
| Codegen audit | Root `package.json` still has no regenerate-all script; finder typegen remains opt-in at 2/5 finder modules; finder types/hooks drift tests pass. |

Direct red repros:

```text
node --experimental-test-module-mocks src\features\color-edition\api\tests\colorEditionFinderRoutes.test.js
node --experimental-test-module-mocks src\features\review\tests\reviewEcosystem.component.test.js
node --experimental-test-module-mocks src\features\review\tests\reviewEcosystem.timestamps.test.js
node --experimental-test-module-mocks src\features\review\domain\tests\componentReviewDataLaneState.fieldMetaEnumContracts.test.js
node --experimental-test-module-mocks src\features\review\domain\tests\componentReviewDataLaneState.fieldMetaVarianceContracts.test.js
node --experimental-test-module-mocks src\features\review\domain\tests\componentReviewDataLaneState.varianceConfidenceColors.test.js
```

Focused passing proof:

```text
npm run gui:check
node --experimental-test-module-mocks tools\gui-react\src\features\data-change\__tests__\dataChangeInvalidationMap.test.js
node --experimental-test-module-mocks src\core\events\tests\eventRegistryCoverage.test.js
node --experimental-test-module-mocks src\core\events\tests\dataChangeContract.test.js
node --experimental-test-module-mocks src\core\events\tests\dataChangeDomainParity.test.js
node --experimental-test-module-mocks src\app\api\services\tests\compileProcessCompletion.test.js
node --experimental-test-module-mocks src\features\indexing\api\contracts\tests\runSummaryContract.test.js
node --experimental-test-module-mocks src\indexlab\tests\runSummarySerializer.test.js
node --experimental-test-module-mocks src\indexlab\tests\runSummaryFinalize.test.js
node --experimental-test-module-mocks src\features\indexing\api\builders\tests\readRunSummaryEventsCharacterization.test.js
node --experimental-test-module-mocks src\features\indexing\api\tests\storageManagerRouteContract.test.js
node --experimental-test-module-mocks src\features\indexing\api\tests\indexlabRoutes.test.js
node --experimental-test-module-mocks src\db\stores\tests\artifactStore.test.js
node --experimental-test-module-mocks src\features\indexing\api\tests\runtimeOpsRoutes.assets.test.js
node --experimental-test-module-mocks src\app\api\tests\catalogHelpersSqlPath.test.js
node --experimental-test-module-mocks src\app\api\tests\apiCatalogHelpersWiring.test.js
node --experimental-test-module-mocks tools\gui-react\src\pages\overview\__tests__\overviewSort.test.ts
node --experimental-test-module-mocks tools\gui-react\src\features\pipeline-settings\state\__tests__\finderSettingsRegistryContract.test.ts
node --experimental-test-module-mocks tools\gui-react\scripts\tests\generateFinderTypes.test.js
node --experimental-test-module-mocks tools\gui-react\scripts\tests\generateFinderHooks.test.js
node --experimental-test-module-mocks src\features\release-date\tests\releaseDateLlmAdapter.test.js
node --experimental-test-module-mocks src\features\sku\tests\skuLlmAdapter.test.js
node --experimental-test-module-mocks src\features\color-edition\tests\variantLifecycle.crossFinderCascade.test.js
node --experimental-test-module-mocks src\features\color-edition\tests\variantLifecycle.test.js
node --experimental-test-module-mocks src\features\product-image\tests\variantPropagation.test.js
node --check src\app\api\catalogHelpers.js
node --check src\features\product-image\variantPropagation.js
node --check tools\gui-react\scripts\generateLlmPhaseRegistry.js
```

### 2026-04-28 - M29 Structural Prompt Assertions

Closed M29 by replacing brittle scalar prompt wording checks with structure-oriented contracts in RDF and SKU prompt adapter tests.

| Area | Contract |
|---|---|
| Output shape | Prompt tests assert `Return JSON` keys for RDF/SKU scalar payloads, including evidence/discovery fields and `unknown_reason`. |
| Source guidance | Compiled prompts must render the exported source-guidance slot bags for each finder instead of matching specific guidance sentences. |
| Variant disambiguation | Compiled prompts must render the exported variant-disambiguation slot bags for shared/base/variant cases. |
| Identity/discovery | Tests verify ambiguity levels change injected identity context and empty previous-discovery input omits prior URL/query data. |

Proof:

```text
node src\features\release-date\tests\releaseDateLlmAdapter.test.js
node src\features\sku\tests\skuLlmAdapter.test.js
```

Result: 44 focused prompt tests passed, 0 failed.

### 2026-04-28 - M28 Cross-Finder Variant Delete Cascade

Closed M28 by adding a focused CEF variant-delete regression across downstream finder projections and fixing the stale PIF progress gap.

| Area | Contract |
|---|---|
| PIF progress | Deleting a CEF variant removes the matching `pif_variant_progress` SQL row, even though PIF image JSON cleanup is handled separately. |
| RDF/SKU candidates | Variant-anchored field candidates for `release_date` and `sku` are deleted from SQL and product JSON mirrors. |
| RDF/SKU history | Registry-driven `variantFieldProducer` cleanup removes deleted-variant run shells and summary candidates for both RDF and SKU. |
| Product mirror | `product.json.variant_fields[variantId]` and deleted-variant candidate entries are removed while surviving variants remain. |

Proof:

```text
node src\features\color-edition\tests\variantLifecycle.crossFinderCascade.test.js
node src\features\color-edition\tests\variantLifecycle.test.js
node src\features\product-image\tests\variantPropagation.test.js
node --check src\features\product-image\variantPropagation.js
```

Result: 61 focused tests passed, 0 failed. `node --check` passed. The new regression failed before the production patch on stale `pif_variant_progress` for the deleted variant and passed after the cleanup fix.

### 2026-04-28 - M27 Finder Settings Widget Contract

Closed M27 by tying finder settings schema widgets to the rendered control registry:

| Area | Contract |
|---|---|
| Widget names | `SETTING_WIDGET_NAMES` is the shared contract for supported finder settings widgets. |
| Runtime registration | The widget registration module derives from `SETTING_WIDGET_NAMES`, with TypeScript requiring one component per supported widget name. |
| Generated schema | `FinderSettingsEntry.widget` is generated as `SettingWidgetName`, so unknown widget names fail the GUI typecheck. |
| Focused test | The finder settings registry test asserts every schema widget references a supported renderer control. |

Proof:

```text
node tools\gui-react\src\features\pipeline-settings\state\__tests__\finderSettingsRegistryContract.test.ts
node --check tools\gui-react\scripts\generateLlmPhaseRegistry.js
cd tools\gui-react && npm exec -- tsc -b
git diff --check -- tools/gui-react/scripts/generateLlmPhaseRegistry.js tools/gui-react/src/features/pipeline-settings/components/widgets/index.ts tools/gui-react/src/features/pipeline-settings/components/widgets/widgetRegistryNames.ts tools/gui-react/src/features/pipeline-settings/state/finderSettingsRegistry.generated.ts tools/gui-react/src/features/pipeline-settings/state/__tests__/finderSettingsRegistryContract.test.ts
```

Result: 9 focused tests passed, 0 failed. Generator syntax check, GUI typecheck, and diff whitespace check passed.

### 2026-04-28 - M26 Overview Sort Finder Registry Contract

Closed M26 by replacing the hardcoded finder column expectations in the Overview sort test with a registry-derived ordered contract.

| Area | Contract |
|---|---|
| Finder columns | Expected Overview finder sort columns are derived from `FINDER_PANELS`, the generated GUI registry sourced from core `FINDER_MODULES`. |
| Static columns | Non-finder Overview columns remain explicit prefix/suffix contract entries. |
| Sortable list | `OVERVIEW_SORTABLE_COLUMN_IDS` must equal static prefix + registry-derived finder columns + static suffix. |

Proof:

```text
node tools\gui-react\src\pages\overview\__tests__\overviewSort.test.ts
```

Result: 31 tests passed, 0 failed.

### 2026-04-28 - Catalog Projection Performance Follow-up

Improved the SQL catalog projection path that feeds Overview by indexing category candidate rows once per catalog refresh:

| Area | Change |
|---|---|
| Scalar variant cells | Reuse a per-product/per-field candidate index for SKU/RDF variant projection instead of filtering each product candidate list for every scalar variant cell. |
| Key tier progress | Reuse a compiled field-to-tier index and category resolved/concrete field sets for full-catalog key progress instead of recomputing tier totals for every product. |

Proof:

```text
node src\app\api\tests\catalogHelpersSqlPath.test.js
node src\app\api\tests\apiCatalogHelpersWiring.test.js
node --check src\app\api\catalogHelpers.js
git diff --check -- src/app/api/catalogHelpers.js src/app/api/tests/catalogHelpersSqlPath.test.js
```

Result: 23 tests passed, 0 failed. `node --check` and `git diff --check` passed.

### 2026-04-28 - M24 Query-Key Scope Contract

Closed M24 by making the query-key scope contract explicit next to the source registry:

| Scope | Contract |
|---|---|
| Query templates | `DOMAIN_QUERY_TEMPLATES` entries are React Query prefixes; broad keys intentionally refresh all descendants. |
| Category scope | `CATEGORY_TOKEN` materializes once per scoped category from the payload/categories. |
| Global scope | Templates without `CATEGORY_TOKEN` materialize once per event. |
| Explicit domains | Payload `domains` override `EVENT_REGISTRY` fallback domains, so emitters that pass explicit domains must include every affected domain. |

Added focused contract tests proving every registered domain template materializes for scoped categories and every registered event fallback expands through the shared registry into the expected query-key prefixes.

Proof:

```text
node tools\gui-react\src\features\data-change\__tests__\dataChangeInvalidationMap.test.js
node src\core\events\tests\eventRegistryCoverage.test.js
node src\core\events\tests\dataChangeContract.test.js
node src\core\events\tests\dataChangeDomainParity.test.js
```

Result: 42 tests passed, 0 failed. The normal `node --test --test-force-exit ...` invocation hit sandbox `spawn EPERM` before executing the file, so the focused proof was run in-process.

### 2026-04-28 - M23 Storage Run Detail Freshness Contract

Closed M23 as a contract/documentation gap. Storage mutation events already resolve to the `storage` domain, and `DOMAIN_QUERY_TEMPLATES.storage` includes the broad query key:

```text
['storage']
```

That broad key intentionally invalidates active run-detail queries such as:

```text
['storage', 'runs', runId]
```

So the `useRunDetail` 60s `staleTime` is a soft cache window only; after storage mutations, data-change invalidation is the freshness boundary. Added a WHY comment next to the source registry to make the exact contract visible.

Proof:

```text
node --test --test-force-exit tools\gui-react\src\features\data-change\__tests__\dataChangeInvalidationMap.test.js
```

Expected storage events covered: `storage-runs-deleted`, `storage-runs-bulk-deleted`, `storage-pruned`, `storage-purged`, `storage-urls-deleted`, `storage-history-purged`.

Result: 29 tests passed, 0 failed.

### 2026-04-28 - M22 Crawl4AI Extraction Artifact API

Closed M22 by matching the existing Runtime Ops Crawl4AI panel contract. The GUI already points each Crawl4AI artifact to:

```text
GET /indexlab/run/:runId/runtime/extractions/crawl4ai/:filename
```

The backend now serves `.json` artifact files from the run's `extractions/crawl4ai/` directory after rejecting traversal, absolute paths, and non-JSON filenames. This makes persisted Crawl4AI bundles API-readable instead of write-only.

Proof:

```text
node --test --test-force-exit src\features\indexing\api\tests\runtimeOpsRoutes.assets.test.js
```

Result: 4 tests passed, 0 failed.

### 2026-04-28 - M21 Storage HTML Artifact Route

Closed M21 by treating Storage Manager HTML artifacts as user-facing because run detail already exposes `html_file` in expanded source artifact rows. Added a deterministic artifact route:

```text
GET /storage/runs/:runId/sources/:contentHash/html
```

Contract:

| Boundary | Contract |
|---|---|
| Identity | Route resolves a source by `run_id` + `content_hash` from SQL (`run_sources`, then `crawl_sources`). |
| Path safety | Artifact files are served only when the resolved path stays under the run's `html/` artifact directory in the configured IndexLab root or default IndexLab root. |
| Payload | Gzipped HTML is served as `text/html; charset=utf-8` with `Content-Encoding: gzip`. |

Proof:

```text
node --test --test-force-exit src\features\indexing\api\tests\storageManagerRouteContract.test.js src\features\indexing\api\tests\indexlabRoutes.test.js
```

Result: 30 tests passed, 0 failed.

### 2026-04-28 - M20 Storage Run Source Pagination

Closed M20 by moving Storage Run Detail sources to an explicit page contract:

| Boundary | Contract |
|---|---|
| HTTP | `GET /storage/runs/:runId?sourcesLimit=<n>&sourcesOffset=<n>` normalizes source pagination and returns `sources_page`. Default page is bounded at 100 rows; max accepted page size is 500. |
| SQL | `run_sources` and `crawl_sources` expose count plus limit/offset readers ordered by newest crawl first. |
| Response | `sources_page` includes `limit`, `offset`, `total`, and `has_more`; `sources` contains only the requested page. |
| GUI type contract | `RunDetailResponse` includes optional `sources_page` metadata for consumers. |

Proof:

```text
node --test --test-force-exit src\features\indexing\api\tests\storageManagerRouteContract.test.js src\db\stores\tests\artifactStore.test.js
node --test --test-force-exit src\features\indexing\api\tests\indexlabRoutes.test.js
```

Result: 39 tests passed, 0 failed.

GUI typecheck was re-run after the later workspace update and now passes:

```text
cd tools\gui-react && npm exec -- tsc -b
```

### 2026-04-28 - M19 Run-Summary Telemetry Cap Visibility

Closed M19 by making the run-summary event cap explicit in the serialized contract. `run-summary` schema v2 now includes `telemetry.event_limit`:

| Field | Contract |
|---|---|
| `limit` | Central `RUN_SUMMARY_EVENTS_LIMIT` value used by the serializer. |
| `captured` | Number of events serialized into `telemetry.events`. |
| `truncated` | `true` when SQL had more rows than the summary event window. |

The serializer reads `RUN_SUMMARY_EVENTS_LIMIT + 1` rows, detects overflow, and preserves the newest `RUN_SUMMARY_EVENTS_LIMIT` events in chronological order.

Proof:

```text
node --test --test-force-exit src\features\indexing\api\contracts\tests\runSummaryContract.test.js src\indexlab\tests\runSummarySerializer.test.js src\indexlab\tests\runSummaryFinalize.test.js src\features\indexing\api\builders\tests\readRunSummaryEventsCharacterization.test.js
```

Result: 59 tests passed, 0 failed.

### 2026-04-28 - M6 Run-Finalize Catalog Coverage

Run-type/product-field matrix:

| Completion path | Event | Catalog-sensitive fields | Required invalidation |
|---|---|---|---|
| Successful IndexLab process (`indexlab ... --category <cat>`) | `process-completed` | Coverage, confidence, filled-field counts, field candidates, CEF/PIF/RDF/SKU/key finder columns, last-run columns | `catalog`, `storage`, existing review/studio domains |
| Successful compile process (`category-compile` / `compile-rules`) | `process-completed` | Field totals, labels/order, key-tier progress shape, component/enum-backed catalog projections | `catalog`, existing studio/review-layout/component/enum domains |
| Failed or categoryless process | No data-change payload | None | No invalidation |

Closed the gap by adding `catalog` to the existing `process-completed` event domains. This keeps one generic process-completion event while making Catalog refresh with finalized SQL projections.

Proof:

```text
node --test --test-force-exit tools\gui-react\src\features\data-change\__tests__\dataChangeInvalidationMap.test.js
node --test --test-force-exit src\core\events\tests\eventRegistryCoverage.test.js src\core\events\tests\dataChangeContract.test.js src\core\events\tests\dataChangeDomainParity.test.js src\app\api\services\tests\compileProcessCompletion.test.js
```

Result: 43 tests passed, 0 failed.

### 2026-04-28 - M2 Field Studio Prompt Preview Invalidation

Closed M2 by deriving review-layout prompt-preview invalidation from `FINDER_MODULES` entries marked `promptPreviewFieldRuleBacked`. Field Studio saves now invalidate the Key Finder and PIF prompt-preview query families, covering both preview paths that read compiled field rules.

Proof:

```text
node --test --test-force-exit tools\gui-react\src\features\data-change\__tests__\dataChangeInvalidationMap.test.js
node --test --test-force-exit src\core\events\tests\eventRegistryCoverage.test.js src\core\events\tests\dataChangeContract.test.js src\core\events\tests\dataChangeDomainParity.test.js
```

Result: 40 tests passed, 0 failed.

### 2026-04-28 - Full Audit All 3 Green Refresh

Refreshed full-suite proof:

```text
npm test 2>&1 | Tee-Object -FilePath .tmp\npm-test-full-audit-all3-2026-04-28.log
```

Result: 12,613 tests, 12,613 passed, 0 failed. The previous Auditor 1 critical/high failure clusters are closed; only the medium/low backlog remains active in this doc.

### 2026-04-28 - Superseded Full Audit Refresh

Refreshed full-suite proof:

```text
npm test 2>&1 | Tee-Object -FilePath .tmp\npm-test-full-audit-2026-04-28.log
```

Historical result, superseded by the green audit above: 12,531 tests, 12,511 passed, 20 failed. Those Auditor 1-owned failure clusters are now closed.

### 2026-04-28 - H1/H2 Start

H1 full-suite baseline was reproduced with `npm test`; the suite is red before Auditor 1 changes. Current unrelated baseline failures include prompt golden drift, crawl/color registry/DB seed failures, cascade tests, overview tests, evidence color tests, and a syntax blocker in `src/field-rules/fieldRuleSchema.js` where `FIELD_RULE_AI_ASSIST_TOGGLE_SPECS` is declared twice.

After the H2/H3/H4/H5/H6/H16 focused fixes, full-suite status was refreshed:

```text
npm test 2>&1 | Tee-Object -FilePath .tmp\npm-test-after-auditor1.log
```

Result: 12,529 tests, 12,504 passed, 25 failed. Remaining failures are outside the focused Auditor 1 changes and cluster around mouse authority host validation, scalar prompt golden drift, crawl ledger cooldown rows, color edition finder store idempotency, category-audit component-schema expectations, color registry seeding, review ecosystem component seed data, Studio component/cascade expectations, two GUI React mock export failures, and evidence-kind color-class expectations.

H2 PIF runtime read table:

| Runtime Path | Previous Read Source | Required Contract | Change/Proof |
|---|---|---|---|
| `compilePifPreviewPrompt` prompt context | SQL-first local helper, JSON fallback | SQL projection/runs win; JSON fallback only when SQL is empty | Reused shared `readProductImageFinderRuntimeDoc`; existing preview SQL-before-JSON test remains green. |
| `runProductImageFinder` single-run prompt history, image history, URL/content dedup | `product_images.json` | SQL projection/runs win; mirror SQL state back to JSON before JSON-backed write helper appends new run | Added characterization test proving SQL history/dedup beats stale JSON and JSON mirror is refreshed. |
| `runCarouselLoop` loop prompt history, collected image progress, and dedup self-heal | `product_images.json` | SQL projection/runs win during runtime loop iterations; mirror before JSON-backed write helper appends iterations | Wired shared runtime reader into loop state reads and added stale-JSON dedup self-heal regression. |
| `runEvalView` / `runEvalCarouselLoop` candidate selection and carousel context | `product_images.json` | SQL projection/runs win for choosing eval candidates and context images | Added contract test proving eval uses SQL candidate over stale JSON candidate. |
| `runEvalHero` hero candidate selection | `product_images.json` | SQL projection/runs win for hero candidate selection | Wired shared runtime reader; covered by carousel/eval slice smoke. |
| `imageEvaluator.js` mutation helpers (`mergeEvaluation`, `appendEvalRecord`) | JSON mirror read/modify/write | Keep JSON mirror writes; callers must mirror SQL runtime state before invoking JSON-backed mutation helpers | Candidate-selection callers now mirror SQL to JSON first; post-`appendEvalRecord` projection reads JSON directly to avoid overwriting a new eval record with stale SQL. |

### 2026-04-28 - PIF Runtime/Dedup And Mutation Payload Follow-up

Closed the remaining PIF runtime JSON-read gap in `runSingleVariant` dedup self-heal. The carousel-loop regression forces stale `product_images.json` while SQL contains the known URL; the duplicate must be rejected from SQL projection state.

Generic finder delete-all now runs SQL cleanup before finder JSON mirror deletion, and JSON delete is last in the transaction body. This prevents a SQL cleanup failure from leaving finder JSON already cleared.

M25 mutation payload scope completed for high-traffic deletes:

- Generic finder delete run/batch/all responses include `product_id`, `category`, delete metadata, and canonical post-mutation `entity`.
- Generated RDF/SKU delete response types include `entity`; CEF/PIF hand-written delete response types were aligned.
- PIF custom image delete and run delete responses return updated SQL-projection `entity`.

Focused proof:

```text
node --test --test-force-exit src\features\product-image\tests\carouselLoop.test.js
node --test --test-force-exit src\core\finder\tests\finderRoutes.test.js
node --test --test-force-exit tools\gui-react\scripts\tests\generateFinderHooks.test.js
node --test --test-force-exit src\features\product-image\tests\productImageFinderRoutes.dataChange.test.js
node --test --test-force-exit src\features\color-edition\api\tests\colorEditionFinderRoutes.test.js
node --test --test-force-exit src\features\sku\tests\skuFinderRoutes.characterization.test.js
node --test --test-force-exit src\features\release-date\tests\releaseDateFinderRoutes.characterization.test.js
cd tools\gui-react && npm exec -- tsc -b
```

Full-suite refresh after this follow-up:

```text
npm test 2>&1 | Tee-Object -FilePath .tmp\npm-test-after-continue.log
```

Historical result, superseded by the green audit above: 12,608 tests, 12,556 passed, 42 failed, 10 cancelled. The focused PIF/generic mutation response slice was green; the remaining failure clusters are now closed.

Focused proof run:

```text
node --test --test-force-exit --experimental-test-module-mocks src\features\product-image\tests\productImageFinder.characterization.test.js src\features\product-image\tests\carouselBuild.test.js src\features\product-image\tests\imageEvaluator.viewEval.test.js src\features\product-image\tests\evalRecord.test.js src\features\product-image\tests\productImagePreviewPrompt.test.js src\features\product-image\tests\productImageStore.test.js
```

Result: 184 tests passed, 0 failed.

### 2026-04-28 - H3 Storage Run Detail B2

Confirmed existing pieces:

| Contract Piece | Evidence |
|---|---|
| Schema | `run_sources` table and `indexed_url_history` view exist in `src/db/specDbSchema.js`. |
| Live finalizer projection | `writeCrawlCheckpoint` projects checkpoint `sources[]` through `insertRunSource`. |
| Deleted-DB rebuild path | `scanAndSeedCheckpoints` reads durable `run.json` and `seedFromCheckpoint` reseeds SQL. |
| Storage Run Detail read path | `/storage/runs/:runId` reads SQL `run_sources`, screenshots, and videos through `readStorageRunDetailState`; no `run.json` fallback. |

Gap fixed: deleted-DB rebuild was reseeding source rows but dropping source metadata that live finalization preserves. `seedFromCheckpoint` now projects `doc_kind`, `source_tier`, `content_type`, `size_bytes`, and artifact flags (`has_pdf`, `has_ldjson`, `has_dom_snippet`) from durable checkpoints into SQL.

New proof:

```text
node --test --test-force-exit src\pipeline\checkpoint\tests\seedFromCheckpoint.test.js src\features\indexing\api\tests\indexlabRoutes.test.js
```

Result: 44 tests passed, 0 failed. This includes a Storage Run Detail deleted-DB contract test that rebuilds a fresh `SpecDb` from `run.json`, screenshot, and video artifacts, then verifies `/storage/runs/:runId` returns the rebuilt `run_sources` metadata and media totals.

Related slice proof:

```text
node --test --test-force-exit src\pipeline\checkpoint\tests\writeCrawlCheckpoint.test.js src\pipeline\checkpoint\tests\scanAndSeedCheckpoints.test.js src\pipeline\checkpoint\tests\rebuildMediaIndexes.test.js src\db\stores\tests\artifactStore.test.js src\features\indexing\pipeline\searchPlanner\tests\discoveryHistoryInjection.test.js
```

Result: 52 tests passed, 0 failed.

### 2026-04-28 - H4 Deleted-DB Rebuild Coverage

Added targeted coverage for the `field_key_order` reseed surface. This was a weak projection because the SQL store had round-trip tests, but the durable JSON -> fresh SQL rebuild path was not directly asserted.

New proof:

```text
node --test --test-force-exit src\features\studio\tests\fieldKeyOrderReseed.test.js src\db\stores\tests\fieldKeyOrderStore.test.js
```

Result: 7 tests passed, 0 failed. The tests assert both representative-value restoration from `field_key_order.json` and stale SQL row removal when the durable JSON order is empty.

### 2026-04-28 - H5 SQL/JSON Mirror Atomicity

High-value dual-write inventory:

| Mutation Class | Contract | Proof/Status |
|---|---|---|
| Product Image Finder live runs | Stage the JSON mirror in memory, write SQL run + summary first, then write `product_images.json` inside the same persistence callback. A SQL insert failure must not leave a JSON run mirror. | Added PIF regression test for SQL insert failure; both single-run and carousel-loop persistence now use staged merge data. |
| Module settings, global scope | `finder_global_settings` SQL updates and `_global/*_settings.json` mirror writes run inside the app DB transaction callback. A mirror-write failure rolls back the SQL setting and no data-change event is emitted. | Added global route rollback test. |
| Module settings, category scope | Per-category finder settings SQL updates and `<category>/*_settings.json` mirror writes run inside the spec DB transaction callback. Category requests that also patch global settings wrap both DB callbacks so mirror-write failures roll back the SQL rows touched by the request. | Added category route rollback test. |
| Color Edition Finder live runs | Existing contract already rejects SQL insert failures before writing `color_edition.json`. | Existing `colorEditionFinder.test.js` case: "does not write color_edition.json when SQL run insert fails". |
| IndexLab artifact/run metadata writers | Current contract is SQL-only; legacy dual-write names no longer write JSON mirrors. | Existing `artifactDualWrite.test.js` and `writeRunMetaDualWrite.test.js` assert no JSON files are created. |
| Checkpoint finalizer projection | Durable checkpoint JSON is written first; SQL projection is a rebuildable/best-effort projection. This is intentionally not an all-or-nothing mirror contract. | Covered under H3 finalizer/rebuild proof. |

New proof:

```text
node --test --test-force-exit --experimental-test-module-mocks src\core\finder\tests\finderJsonStore.test.js src\features\product-image\tests\productImageFinder.characterization.test.js src\features\product-image\tests\productImageFinder.dedup.test.js src\features\product-image\tests\carouselBuild.test.js src\features\product-image\tests\imageEvaluator.viewEval.test.js src\features\product-image\tests\evalRecord.test.js src\features\product-image\tests\productImagePreviewPrompt.test.js src\features\product-image\tests\productImageStore.test.js src\features\module-settings\tests\moduleSettingsRoutes.test.js
```

Result: 234 tests passed, 0 failed.

### 2026-04-28 - H6 Shared Delete/Reset Atomicity

Defined contract: shared delete/reset paths that mutate SQL plus durable JSON mirrors must execute their SQL side effects inside the owning `SpecDb` transaction callback. If the JSON mirror edit, candidate mirror update, summary bookkeeping, or reset cascade hook throws, the SQL rows touched by that route are rolled back and no success data-change event is emitted.

Changes/proof:

| Surface | Contract Added |
|---|---|
| `createFinderRouteHandler` single-run delete | `deleteRunSql`, JSON run deletion, candidate cleanup, post-delete hook, and summary/bookkeeping update now run inside the shared spec DB transaction. |
| `createFinderRouteHandler` batch-run delete | Per-run SQL deletes, batch JSON deletion, candidate cleanup, post-delete hook, and summary/bookkeeping update now share the same transaction boundary. |
| `createFinderRouteHandler` delete-all reset | Run cleanup, candidate cleanup, summary reset, and reset cascade hook now share the same transaction boundary. |
| `deleteCandidateBySourceId` / `deleteAllCandidatesForField` | Candidate SQL deletion, non-variant republish side effects, and `product.json` mirror writes now run inside the spec DB transaction. |

New proof:

```text
node --test --test-force-exit src\core\finder\tests\finderRoutes.test.js src\features\review\domain\tests\deleteCandidate.test.js src\features\color-edition\api\tests\colorEditionFinderRoutes.test.js
```

Result: 74 tests passed, 0 failed.

### 2026-04-28 - H16 Codegen Drift Guard

Added drift guards to the existing generator test files without changing `package.json` scripts. The validation command builds generator output in memory and compares it byte-for-byte against committed generated files for every finder that opts into `getResponseSchemaExport` in `FINDER_MODULES`.

Guarded generated files:

| Generator | Files Covered |
|---|---|
| `generateFinderTypes.js` | `tools/gui-react/src/features/release-date-finder/types.generated.ts`, `tools/gui-react/src/features/sku-finder/types.generated.ts` |
| `generateFinderHooks.js` | `tools/gui-react/src/features/release-date-finder/api/releaseDateFinderQueries.generated.ts`, `tools/gui-react/src/features/sku-finder/api/skuFinderQueries.generated.ts` |

New proof:

```text
node --test --test-force-exit tools\gui-react\scripts\tests\generateFinderTypes.test.js tools\gui-react\scripts\tests\generateFinderHooks.test.js
```

Result: 21 tests passed, 0 failed.

## Coordination Rules

- Auditor 1 owns backend/event/data contracts. If Auditor 2 or 3 needs a new backend event or payload shape, define the contract here first.
- Do not change `tools/gui-react` presentation components except for contract tests or generated type consumers.
- Any new behavior follows AGENTS.md TDD rules.
