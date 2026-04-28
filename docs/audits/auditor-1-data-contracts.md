# Auditor 1 - Data Contracts, Persistence, Rebuild, Codegen

Date: 2026-04-28

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

Verification refreshed on 2026-04-28:

| Command | Result |
|---|---|
| `npm test` | RED: 12,608 tests, 12,556 passed, 42 failed, 10 cancelled. Log: `.tmp/npm-test-after-continue.log`. |
| `npm run gui:check` | PASS. |

Auditor 1 has no remaining stale high-priority findings from the earlier PIF/runtime, storage run detail, rebuild, mirror atomicity, delete/reset atomicity, or codegen drift batch. The active Auditor 1 queue is now the backend/data subset of the refreshed full-suite failures plus the medium/low backlog below.

## Critical Priority

| ID | Issue | Primary Area | Current Evidence | Work Shape |
|---|---|---|---|---|
| C1 | Full-suite gate is still red | Test baseline | `npm test` fails with 20 tests. | Fix or classify each remaining failing cluster; keep the log path above current until green. |

## High Priority

| ID | Issue | Primary Area | Current Evidence | Work Shape |
|---|---|---|---|---|
| H1 | Mouse source-authority host contract fails | Category authority | `category_authority/mouse/tests/mouse.contract.test.js`: `razer.com` is not approved for acceleration hints. | Decide whether the authority fixture or allowlist is correct; update the data contract, not the test blindly. |
| H2 | Scalar finder prompt goldens drifted | Finder prompt contracts | `src/core/finder/tests/scalarFinderPromptGolden.test.js`: SKU and RDF goldens differ by prompt text/spacing. | Determine whether prompt render change is intentional; regenerate goldens only after contract review. |
| H3 | Crawl ledger cooldown upsert contract is broken | URL crawl ledger | `src/db/stores/tests/crawlLedgerStore.test.js`: cooldown lookup returns null and `attempt_count` is null. | Fix SQL/store behavior or update schema migration if the unique key changed. |
| H4 | Color Edition Finder run UPSERT is not idempotent | CEF SQL store | `src/db/tests/colorEditionFinderStore.test.js`: duplicate `run_number` hits `SQLITE_CONSTRAINT_UNIQUE`. | Restore idempotent insert/update behavior through the store public API. |
| H5 | Color registry seed reconcile expectations drifted | Global color registry | `src/features/color-registry/tests/colorRegistrySeed.test.js`: default/source color values do not match expected CSS tokens. | Decide whether the new registry values are intended; update seed logic or tests with explicit contract proof. |
| H6 | PIF dedup callback order/count contract fails | Product Image Finder | `src/features/product-image/tests/productImageFinder.dedup.test.js`: `onVariantPersisted` callback result changed. | Reconcile callback timing with the new staged SQL/JSON persistence path. |
| H7 | Review ecosystem component links are missing from seed projection | Review/component seed | `reviewEcosystem.component.test.js` and `reviewEcosystem.specdb.test.js`: component links/candidates missing. | Repair fixture seed/projection path; verify table counts and representative component links. |

## Closed Since Last Audit

| ID | Closed Finding | Proof |
|---|---|---|
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
| M2 | Field Studio prompt-preview invalidation covers Key Finder but not every finder | Event/query contract | Extend review-layout prompt-preview invalidation to all finders that read field rules. Coordinate UI verification with Auditor 2. |
| M6 | Run-finalize Catalog coverage needs per-run-type audit | IndexLab/Catalog contract | Build run-type/event/product-field matrix before adding generic finalize events. |
| M19 | Run-summary telemetry is capped at 6000 events | Run telemetry | Add truncation flag, raise cap, or move telemetry to paginated reader. |
| M20 | `crawl_sources.sources[]` has no pagination | Storage API | Add cursor or limit/offset pagination on SQL query and UI contract; coordinate UI with Auditor 2 if needed. |
| M21 | HTML artifacts have no HTTP serve route | Run artifacts | Decide user-facing vs internal-only; add route only if user-facing. |
| M22 | crawl4ai extractions are write-only | Extraction artifacts | Project into SQL/API or document debug-only cleanup policy. |
| M23 | Storage run detail freshness is stale-window based | Storage detail data contract | Provide exact invalidation/refetch contract for Auditor 2 if frontend work is needed. |
| M24 | Query-key scope contract is incomplete | Event registry/tests | Document event scope expectations next to source registry and add focused tests. |
| M26 | Catalog sortable finder columns are hardcoded in tests | Overview/finder registry tests | Derive expected lists from `FINDER_MODULES`. |
| M27 | Finder-specific knob schemas are not tied to rendered controls | Finder settings tests | Add schema-to-rendered-control contract test. |
| M28 | Cross-finder cascade data-state invariants are thin | CEF/PIF/RDF/SKU cascade | Populate affected projections, delete CEF variant, assert cascade cleanup. |
| M29 | Prompt wording assertions are brittle | Prompt tests | Replace wording assertions with structural prompt assertions. |
| M30 | No root regenerate-all codegen entry point | Codegen workflow | Add approved root codegen script only with explicit package-script approval. |
| M31 | LLM phase generator is a super-generator | Codegen architecture | Document or split only when it becomes hard to maintain. |
| M32 | Finder typegen has opt-in coverage | Finder generated types | Decide universal typegen vs documented opt-in criteria. |
| M33 | Broader generated-code checks are still needed before closing Registry/O(1) stage work | Registry/O(1) closure | Run agreed codegen/check sequence and inspect generated diffs. |

## Low Priority

| ID | Issue | Primary Area | Work Shape |
|---|---|---|---|
| L3 | PIF `image-processed` does not update `pif_variant_progress` unless ring semantics change | PIF progress projection | Keep watch item unless rings move to raw image counts. |
| L7 | Data-change domain mapping is not easy to audit from source | Event registry/generated resolver | Improve source registry/generated resolver documentation. |
| L10 | Direct field-key-order PUT may miss `reviewLayoutByCategory` invalidation | Server cache invalidation | Wire invalidation only if that cache is active. |
| L11 | `reviewLayoutByCategory` may be unused | Server cache cleanup | Confirm and delete if dead. |
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

### 2026-04-28 - Full Audit Refresh

Refreshed full-suite proof:

```text
npm test 2>&1 | Tee-Object -FilePath .tmp\npm-test-full-audit-2026-04-28.log
```

Result: 12,531 tests, 12,511 passed, 20 failed. Remaining Auditor 1-owned failure clusters are mouse authority host approval, scalar prompt golden drift, crawl ledger cooldown upsert, Color Edition Finder run UPSERT idempotency, color registry seed reconcile values, Product Image Finder `onVariantPersisted` callback behavior, and review ecosystem component seed/link projection.

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

Result: RED, 12,608 tests, 12,556 passed, 42 failed, 10 cancelled. The focused PIF/generic mutation response slice is green; remaining failures are separate authority, prompt golden, crawl ledger, CEF store idempotency, color registry seed, PIF callback, review seed, compiler/studio, and GUI contract clusters.

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
