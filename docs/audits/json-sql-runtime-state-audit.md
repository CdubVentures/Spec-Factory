# JSON / SQL Runtime State Audit

Date: 2026-04-26

Scope: read-only audit of backend routes, runtime workers, SQL projections, rebuild surfaces, frontend query consumers, and data-change invalidation paths related to mutable state stored in JSON and/or SQLite.

No code edits were made during the audit that produced this document.

Update note, 2026-04-26: this document was amended after the PIF image/popup performance work. That work changed runtime behavior and surfaced additional JSON/SQL/runtime-cache gaps; the addendum below records the new state and the remaining gaps.

Re-audit note, 2026-04-26: the current checked-out tree was re-audited before starting implementation work. The re-audit changed this document only; no product source was changed and no test or GUI proof was run for this documentation pass.

Implementation update, 2026-04-27: Review override active runtime paths now write/read SQL first, consolidated override JSON now has deleted-DB reseed coverage for resolved manual/candidate override rows, and Overview catalog consistency is covered after a route-level manual override mutation. Global prompts now use appDb settings as the runtime source, with `.workspace/global/global-prompts.json` kept as the rebuild mirror/fallback. Source Strategy and Spec Seeds now use per-category SpecDb projections as the runtime source, with `sources.json` and `spec_seeds.json` retained as rebuild mirrors.

Implementation update, 2026-04-27: The shared frontend mutation wrapper now derives product/field entity scope from mutation results, variables, metadata, and optimistic mutation context, so local on-success invalidation can target product/detail/candidate keys without one-off component code. PIF full reset now also clears SQL summary artifact columns (`images`, `image_count`, `carousel_slots`, `eval_state`, `evaluations`) after deleting JSON/image/progress state, preventing stale runtime SQL from surviving delete-all.

Implementation update, 2026-04-27: Key Finder route reads and prompt-history inputs now prefer `key_finder` / `key_finder_runs` through `specDb.getFinderStore('keyFinder')`. Live runs allocate from SQL history, persist SQL first, then mirror `key_finder.json`. Run delete, delete-all, and key field-delete paths use SQL run rows first and mirror JSON afterward; legacy JSON fallback remains only for unseeded test/boot compatibility.

## Contract Being Audited

Spec Factory uses a dual-state model:

- JSON is the durable audit/rebuild layer.
- SQLite is the runtime and frontend projection layer.
- GUI/API/runtime reads should use SQLite where the state is mutable runtime state.
- Mutations should update SQLite first, then mirror JSON for rebuild/audit.
- Bootstrap/reseed may read JSON to reconstruct SQLite.

This audit treats a path as non-compliant when it does one of these:

- The GUI/API reads mutable runtime state directly from JSON.
- A runtime worker makes live decisions from JSON while an SQL projection exists or should exist.
- A mutation writes JSON only, leaving SQL consumers stale.
- A dual write writes JSON first and SQL second, creating a JSON-without-SQL failure window for frontend/runtime state.
- Tests document or protect the old JSON-only contract.

## High-Risk Dependency Map

The most important dependent screen is Overview:

- Frontend: `tools/gui-react/src/pages/overview/OverviewPage.tsx`
- API: `GET /api/v1/catalog/:category`
- Backend builder: `src/app/api/catalogHelpers.js`

`catalogHelpers.js` is SQL-driven. It reads:

- `products`
- `field_candidates`
- `variants`
- `pif_variant_progress`
- finder summary/runs tables through `specDb.getFinderStore(...)`

Therefore, any JSON-only update can show up in one screen that reads JSON, while Overview remains stale because it reads SQLite.

Data-change invalidation is mostly registered correctly:

- Backend registry: `src/core/events/eventRegistry.js`
- Frontend resolver: `tools/gui-react/src/features/data-change/invalidationResolver.js`
- App bridge: `tools/gui-react/src/pages/layout/hooks/useWsEventBridge.ts`

But invalidation cannot fix a missing SQL projection. If the SQL row did not change, the refetched GUI query will still return stale data.

## Executive Summary

The previous audit was directionally correct, but incomplete. The largest missing item was the broader review override workflow. Its active runtime paths are now SQL-first, deleted-DB reseed coverage exists for resolved manual/candidate override rows, and Overview catalog consistency is covered for route-level manual override mutation.

Definite violations:

1. Storage Manager run detail.
2. Cross-cutting finder run persistence, delete-all, and discovery-history scrub paths.
3. Scalar finder prompt history for RDF/SKU.
4. CEF prompt/runtime history.
5. PIF progress, mutations, prompt history, and some evaluation/carousel paths.
6. PIF binary image asset inventory and derived-image cache lifecycle are still filesystem-first.
7. PIF lightweight summary is SQL-backed, but still route-local and hand-projected instead of schema/registry-driven.
8. IndexLab product URL history.

Design-call items:

1. Internal source corpus.
2. Learning artifacts.
3. Runtime control override file.
4. Catalog add/update write order.
5. Run artifact fallback reads that are immutable artifacts, not mutable runtime state.

Mostly compliant:

1. Overview/catalog read path.
2. User settings.
3. Module finder settings.
4. Unit/color registries.
5. Studio maps.
6. Run list builder.
7. RuntimeOps artifacts.
8. Billing.
9. Deletion store SQL-first cleanup.
10. Brand registry.
11. Global prompts.
12. Source strategy and spec seeds.
13. Key Finder route reads and live/preview prompt history.

## Current Re-Audit Snapshot

This pass confirmed that the recommended fix order below is still accurate for the remaining non-review/global-prompt/source-settings areas. The production mitigations already recorded in the addendum are present, and Review Override, Global Prompts, Source Strategy, and Spec Seeds now have SQL-first runtime paths plus JSON rebuild mirrors.

Implementation note, 2026-04-26: review-route manual overrides now call `publishManualOverride(...)`, which demotes the previous resolved row by scalar/variant scope, inserts a resolved `field_candidates` row with `source_type='manual_override'`, and mirrors the value to `product.json.fields` or `product.json.variant_fields`. Review Grid no longer synthesizes manual override rows from `product.json`; JSON-only overrides are treated as rebuild/audit data until reseeded into SQL.

Implementation note, 2026-04-26: consolidated review override write paths in `src/features/review/domain/overrideWorkflow.js` now project into SQL before updating `category_authority/{category}/_overrides/overrides.json`. `setManualOverride(...)` writes a resolved `manual_override` row; `setOverrideFromCandidate(...)` and `approveGreenOverrides(...)` write resolved `candidate_override` rows with `metadata_json.override_source='candidate_selection'`. `finalizeOverrides(...)` now derives pending/applied override entries from those resolved SQL rows, so missing or stale consolidated JSON no longer controls finalize. `buildReviewMetrics(...)` and `listOverrideDocs(...)` now read SQL override rows when `specDb` is available; finalize stamps review status metadata on those rows before mirroring JSON.

Implementation note, 2026-04-27: `rebuildReviewOverridesFromJson(...)` now reseeds resolved `manual_override` and `candidate_override` rows from consolidated override JSON into `field_candidates`. The reseed surface is registered as `review_overrides` in `seedRegistry`, wired into `specDbRuntime`, and covered by idempotence and registry tests.

Implementation note, 2026-04-27: `src/app/api/catalogHelpers.js` now normalizes resolved candidate confidence with the publisher's 0-1/0-100 helper, so manual override rows stored as `confidence: 1.0` render as full-confidence Overview rows instead of `1%`. `src/app/api/tests/reviewOverrideOverviewConsistency.test.js` protects the route-level mutation -> SQL -> catalog row contract.

Implementation note, 2026-04-27: `src/core/llm/prompts/globalPromptStore.js` now reads appDb settings section `global-prompts` before JSON, reseeds SQL from `.workspace/global/global-prompts.json` only when SQL is empty, and writes SQL before mirroring JSON. `src/features/settings-authority/globalPromptsHandler.js` and `registerConfigRoutes(...)` thread appDb into GET/PUT `/llm-policy/global-prompts`, and `createBootstrapSessionLayer(...)` reloads the prompt snapshot after appDb opens.

Implementation note, 2026-04-27: Source Strategy and Spec Seeds now project into per-category SpecDb tables (`source_strategy_meta`, `source_strategy_entries`, `spec_seed_sets`, `spec_seed_templates`). GET/POST/PUT/DELETE source strategy routes and GET/PUT spec seed routes read/write SQL first and mirror JSON afterward. `loadCategoryConfig(...)` and `loadEnabledSourceEntries(...)` read SQL when a SpecDb is supplied. `seedRegistry` and `specDbRuntime` include deleted-DB reseed surfaces for `sources.json` and `spec_seeds.json`.

### Still Open

| Area | Current status | Current proof in the checked-out tree | Implementation contract still needed |
| --- | --- | --- | --- |
| Review manual overrides | Closed for active runtime, rebuild, and Overview paths | `src/features/review/api/itemMutationRoutes.js` routes manual overrides through `publishManualOverride`; `src/features/publisher/publish/publishManualOverride.js` writes SQL first and mirrors JSON; `src/features/review/domain/reviewGridData.js` no longer merges JSON-only manual overrides; publisher locks now read resolved SQL manual override rows; `rebuildReviewOverridesFromJson(...)` reseeds consolidated manual override mirrors into SQL; `reviewOverrideOverviewConsistency.test.js` proves the Overview catalog row reflects the route-level mutation. | Keep regression coverage current. |
| Consolidated review overrides | Active runtime paths SQL-first; deleted-DB reseed covered | `src/features/review/domain/overrideWorkflow.js` writes `setManualOverride(...)`, `setOverrideFromCandidate(...)`, and `approveGreenOverrides(...)` to resolved `field_candidates` rows before mirroring consolidated JSON. `finalizeOverrides(...)`, `buildReviewMetrics(...)`, and `listOverrideDocs(...)` read resolved SQL override rows even when consolidated JSON is missing or stale. `src/features/review/domain/reviewOverrideReseed.js` and `seedRegistry` rebuild those SQL rows from consolidated JSON. | Keep JSON as rebuild/export/import artifact only. |
| Publisher manual-override locks | Closed for active publisher paths | `src/features/publisher/publish/publishCandidate.js`, `reconcileThreshold.js`, and `republishField.js` read resolved SQL manual override rows by scalar/variant scope; JSON-only manual override entries are no longer live locks. | Keep `product.json` reseed coverage so deleted-DB rebuild recreates SQL locks. |
| Global prompts | Closed for active runtime and deleted-DB rebuild | `globalPromptStore.js` reads appDb settings section `global-prompts` before JSON, rebuilds SQL from `global-prompts.json` only when SQL is empty, and writes SQL before mirroring JSON. `globalPromptsHandler.test.js`, `globalPromptStore.test.js`, and `configRoutesGlobalPrompts.test.js` protect store, route, and production wiring contracts. | Keep JSON as rebuild/fallback mirror only. |
| Source strategy and spec seeds | Closed for active API/runtime readers and deleted-DB rebuild | SpecDb owns `source_strategy_meta`, `source_strategy_entries`, `spec_seed_sets`, and `spec_seed_templates`. Source Strategy/Spec Seeds routes use SQL first and mirror JSON. `loadCategoryConfig(...)` and `loadEnabledSourceEntries(...)` prefer SQL when SpecDb is supplied. `seedRegistry`/`specDbRuntime` register JSON reseed surfaces. | Keep frontend query shape stable and keep JSON as rebuild mirror only. |
| Storage Manager run detail | Open | `src/features/indexing/api/storageManagerRoutes.js` still enriches `GET /storage/runs/:runId` from `run.json` for sources and identity. | Replace mutable detail enrichment with SQL joins / `run_artifacts` rows, leaving historical file fallback as explicit artifact policy only. |
| Cross-cutting finder persistence | Open | `src/core/finder/finderJsonStore.js` still owns read/write/merge/delete of finder JSON files; `finderRoutes.js` delete-all calls JSON cleanup before SQL run cleanup; `discoveryHistoryScrub.js` and `variantCleanup.js` write JSON before updating SQL run blobs. | Introduce SQL-first finder history services and make JSON helpers mirror/rebuild-only. |
| Key Finder | Closed for route reads, live/preview prompt history, run write order, run delete, delete-all, and key field-delete | `keyFinderRoutes.js` list/summary/detail/delete paths read SQL finder rows when available; `keyFinder.js` and `keyFinderPreviewPrompt.js` read previous history from SQL; `persistKeyFinderRunSqlFirst(...)` writes SQL before mirroring `key_finder.json`; `scrubFieldFromKeyFinderSqlFirst(...)` updates SQL run blobs/deletes before mirroring JSON. | Discovery-history scrub still uses the shared JSON-first scrubber and remains part of the cross-cutting finder persistence item. |
| RDF/SKU scalar finder history | Open | `src/core/finder/variantScalarFieldProducer.js` still calls `mergeDiscovery(...)` before `store.insertRun(...)` and reads prior runs via the JSON `readRuns` callback. | Allocate/read run history from SQL first; write JSON mirror after SQL success. |
| CEF prompt/runtime history | Open | CEF still participates in the shared finder JSON/run cleanup paths, and variant cleanup still treats JSON as the first mutation target. | Move CEF run history and prompt-history inputs to SQL-first services. |
| PIF runtime state and progress | Open, partially mitigated | PIF bulk/single image delete recomputes `pif_variant_progress`, and full reset now clears SQL summary artifact columns as well as JSON/image/progress state. Remaining paths still treat `product_images.json` as the immediate source: `productImageStore.js` declares durable SSOT as `product_images.json`; `productImageFinderRoutes.js` says progress source of truth is `product_images.json`; `imageEvaluator.js` and `carouselBuild.js` append eval/carousel state to JSON before SQL projection. | Make PIF run/eval/carousel/image mutations SQL-first, materialize progress from SQL, mirror JSON after success, and keep rebuild from JSON. |
| PIF asset/cache contract | Open, partially mitigated | Image files and derived caches still live on disk; route-local deletion code prunes some files and cache variants, but there is no single SQL metadata owner for binary assets. | Declare one asset metadata owner, make cache files derived/discardable, and prune derived cache on every image mutation path. |
| PIF lightweight summary | Partial mitigation, still open as architecture debt | `GET /product-image-finder/:category/:productId/summary` reads SQL summary/runs, but `buildPifSummaryResponse(...)` is still route-local and hand-projected. | Move the summary contract to a schema/registry-backed projection shared with frontend types. |
| IndexLab product URL history | Open | `indexlabUrlHistoryReader.js` reads `{productRoot}/{productId}/product.json::sources[]`; `runDiscoverySeedPlan.js` injects that into planning while SQL alternatives exist. | Replace with `url_crawl_ledger` or `crawl_sources` reader based on intended semantics. |
| Design-call artifacts | Still undecided | `sourceCorpus.js` reads/writes `_source_intel/{category}/corpus.json`; `helpers.js` reads `_learning/*`; runtime overrides still read `_runtime/control/runtime_overrides.json`; catalog add/bulk add writes `product.json` before route-level SQL upsert. | Decide artifact vs runtime state, then either document an artifact exception or add SQL-first projection. |
| Frontend propagation | Open beyond targeted mitigations | Brand rename still depends on already-loaded `impactData.product_details`; component/enum helpers patch `reviewProductsIndex` but product detail and candidate caches still wait for invalidation; direct component-review item actions patch `componentReview`, but batch/whole-row flows still invalidate; module settings do not publish a broad local propagation event; no central mutation projection registry exists. | Add server-normalized changed entities and a registry-driven frontend cache dispatcher that patches all loaded query families. |

### Mitigations Already Present

| Mitigation | Status | Remaining limit |
| --- | --- | --- |
| Product add/update/delete shared cache patching | Present | Optimistic cache patches do not prove backend SQL correctness after refetch. |
| Brand rename cache cascade | Present when impact data is loaded | If the impact query is disabled/stale/failed/not loaded, rename relies on invalidation/refetch. |
| Product-scoped catalog row refresh | Present | Only patches Overview/Indexing catalog rows for product-scoped data-change messages; SQL must already be correct. |
| Direct Component Review item actions | Present | Patches `['componentReview', category]` for direct approve/merge/dismiss actions only; batch and whole-row flows still need exact changed-entity contracts. |
| PIF bulk image delete/frontend reset patch | Present | Bulk/single image delete and full reset now update the relevant runtime SQL projections, but backend paths still read/write `product_images.json` first before projecting SQL. |
| PIF thumbnail/preview URL variants | Present | Asset metadata/caches remain filesystem-first. |
| Runtime settings active-tab propagation | Present | External-tab conflict/status UI and module setting consumer propagation remain incomplete. |

### Start Here

Continue Phase 4 with Finder History and Route Reads:

- Review Override Family is covered for current active runtime, rebuild, and Overview catalog contracts.
- Global prompts are now appDb-backed at runtime with JSON mirror/reseed coverage.
- Source Strategy and Spec Seeds are now SpecDb-backed at runtime with JSON mirror/reseed coverage.
- Shared finder history, scalar finder prompt history, CEF history, and PIF runtime state are the next JSON-heavy runtime surfaces.

## Frontend Impact Matrix

| Surface | Main query key(s) | Backend source | Stale when JSON-only? | Notes |
| --- | --- | --- | --- | --- |
| Overview catalog | `['catalog', category]` | SQL via `buildCatalogFromSql` | Yes | Reads products, candidates, variants, PIF progress, finder summaries. |
| Review product grid | `['product', category, productId]`, `['reviewProductsIndex', category]` | SQL for manual override state plus mixed review artifacts | Partially | Manual overrides now appear only when projected into SQL; JSON-only manual overrides no longer mask stale SQL. |
| Review catalog picker | `['catalog-review', category]` | SQL product list | Yes | Manual product.json edits do not update picker identity. |
| Finder panels | `['key-finder', category]`, `['release-date-finder', category]`, `['sku-finder', category]`, `['color-edition-finder', category]`, `['product-image-finder', category]` | Mixed | Yes | Key Finder route reads now prefer SQL; shared scalar/CEF/PIF write/history paths remain mixed. |
| PIF Overview rings | `['catalog', category]` | `pif_variant_progress` SQL | Yes | If JSON images change but progress projection is stale, rings stay stale. |
| PIF Overview popover | `['product-image-finder', category, productId, 'summary']` | SQL summary/runs plus filesystem image URLs | Partially | New lightweight summary avoids full PIF payload, but still ships product-wide run/image data for one variant popover. |
| Storage Manager | `['storage']`, `['storage', 'runs', category]`, run detail queries | Mixed SQL + `run.json` | Yes | Run list is SQL-first; run detail still reads `run.json`. |
| Pipeline source settings | `['source-strategy', category]`, `['spec-seeds', category]` | SpecDb source/spec-seed tables with JSON mirror | No | SQL wins when SpecDb exists; JSON is fallback/reseed only. |
| Global prompt editor | `['llm-policy', 'global-prompts']` | appDb settings section `global-prompts` with JSON mirror | No | SQL wins when appDb exists; JSON is fallback/reseed only. |

## Post-Implementation Addendum: Frontend Runtime Propagation

This addendum reflects the instant-propagation work completed after the original read-only audit. The work improved frontend cache coherence, but it did not change the deeper JSON/SQL state findings below.

Closed by the implementation:

- Product add, bulk add, update, and delete now patch the shared product-derived React Query caches used by Catalog, Overview, Indexing, Review catalog, and Review Grid.
- Brand rename now patches exact affected products across shared product caches when Brand Manager has the impact product list loaded.
- Review Grid row-wide actions and scalar override/clear flows now patch the Review Grid cache immediately and roll back on API failure.
- Component Review inline edits and drawer override/accept flows now patch linked Review Grid fields immediately.
- Component Review direct approve, merge-alias, and dismiss actions now patch the `['componentReview', category]` document immediately and roll back on API failure.
- Enum Review accept, remove, confirm, drawer rename, and inline rename now patch linked Review Grid fields immediately.
- Settings data-change fan-out now covers runtime settings, UI settings, finder families, Indexing LLM config, and prompt preview invalidation. Existing contracts verify global settings events fall back to the active category and dirty/flush-pending runtime settings are not overwritten by stale refetches.

Important limitation:

- These fixes are frontend cache coherence fixes. They make mounted screens respond faster, but they do not make a JSON-only backend write SQL-compliant. If SQL is stale, a later refetch can still bring stale SQL data back into a cache.

### Remaining Frontend Propagation Gaps

#### 1. Brand Cascade Depends on Loaded Impact Data

Status: open gap.

Files:

- `tools/gui-react/src/features/studio/components/BrandManager.tsx`
- `tools/gui-react/src/features/catalog/components/productCacheOptimism.ts`

Current behavior:

- The optimistic brand cascade patches product caches only when `impactData.product_details` is already available in Brand Manager.
- If the impact query is disabled, stale, failed, or not yet loaded, the rename still saves, but product caches rely on invalidation/refetch instead of instant propagation.

Impact:

- Overview, Indexing catalog, Review catalog, and Review Grid can briefly show the old brand after a rename.
- The correctness eventually depends on backend data-change plus SQL refetch.

Required fix:

- Make the brand rename mutation return the affected product IDs by category, or require/refetch impact data before the optimistic mutation starts.
- Use that returned server payload as the optimistic cache patch input.
- Keep the current loaded-impact path as a fast local fallback only.

#### 2. Component and Enum Propagation Patches Review Grid Only

Status: open gap.

Files:

- `tools/gui-react/src/pages/component-review/componentReviewCache.ts`
- `tools/gui-react/src/pages/component-review/ComponentSubTab.tsx`
- `tools/gui-react/src/pages/component-review/ComponentReviewDrawer.tsx`
- `tools/gui-react/src/pages/component-review/EnumSubTab.tsx`
- Product detail queries: `['product', category, productId]`
- Candidate queries: `['candidates', category, productId, field]`

Current behavior:

- Component/enum optimistic propagation patches `['reviewProductsIndex', category]`.
- Product detail payloads and candidate query caches are not patched.
- The mutation success handlers invalidate product/candidate families, but those surfaces wait for refetch.

Impact:

- Review Grid updates instantly.
- A mounted product drawer/detail view can still show the previous value until refetch.
- Candidate counts, accepted candidate metadata, and field evidence rows can lag behind the green cell shown in the grid.

Required fix:

- Extend the linked-product cache helper to patch product detail queries for each linked product.
- Patch or clear matching candidate query caches when accept/remove/clear changes candidate visibility.
- Keep rollback snapshots for every patched query family, not only Review Grid.

#### 3. Component Shared-Lane Confirm Is Only Partially Optimistic

Status: open gap.

Files:

- `tools/gui-react/src/pages/component-review/ComponentReviewDrawer.tsx`

Current behavior:

- Shared-lane confirm patches Review Grid when a `candidateValue` is available.
- It does not optimistically patch `componentReviewData` to clear pending flags or accepted candidate state.
- If no candidate value is available, it skips optimistic Review Grid patching and relies on invalidation.

Impact:

- The linked Review Grid cell can update, but the component drawer/tab can still show pending state until refetch.
- Confirm actions with fallback/current values are less instant than manual override and candidate accept.

Required fix:

- Add a component-review cache patch for confirm that clears the pending lane and marks the candidate as accepted.
- Resolve the effective confirm value before mutation so every confirm path has a patchable value.
- Roll back both `componentReviewData` and Review Grid on error.

#### 4. Component Review Batch and Whole-Row Actions Still Rely on Invalidation

Status: partially mitigated; direct item actions are fixed, batch and whole-row workflows remain open.

Files:

- `tools/gui-react/src/pages/component-review/ComponentReviewPanel.tsx`
- `tools/gui-react/src/pages/component-review/ComponentReviewDrawer.tsx`
- `tools/gui-react/src/pages/component-review/ComponentSubTab.tsx`
- `tools/gui-react/src/pages/component-review/componentReviewCache.ts`

Current behavior:

- Direct Panel/Drawer approve, merge-alias, and dismiss mutations patch `['componentReview', category]` immediately and restore the previous document on API failure.
- Those direct actions still rely on success invalidation for `componentReviewData`, linked Review Grid fields, product detail caches, and candidate caches.
- AI batch actions and drawer "Accept Entire Row" still invalidate broad query families instead of applying one deterministic changed-entity patch.
- During this pass, the backend route search also found a contract gap: the UI calls `/review-components/:category/component-review` and `/review-components/:category/component-review-action`, but the checked backend route files expose layout/components/enums/impact plus override/confirm endpoints. If those routes are still intentionally external/generated, document that owner; otherwise add backend route tests before treating the UI mutation path as end-to-end fixed.

Impact:

- Direct item status changes feel instant in the mounted component-review document.
- Batch and whole-row workflows can still feel delayed because mounted surfaces wait for backend processing and refetch.
- Product detail, Review Grid, Overview, and candidate metadata can still lag behind the direct item status patch.

Required fix:

- Define optimistic patch contracts for each batch action:
  - Accept entire component row.
  - Run component AI review batch.
  - Batch enum accept/remove if added later.
- Add or document the backend `component-review` and `component-review-action` route contract, then make it return exact changed entities where the frontend cannot infer them safely.
- Use server response payloads where exact changed fields are too broad to infer safely.

#### 5. Derived Metrics Are Not Optimistically Recomputed

Status: open gap.

Files:

- `tools/gui-react/src/features/catalog/components/productCacheOptimism.ts`
- `tools/gui-react/src/features/review/state/reviewCandidateCache.ts`
- `tools/gui-react/src/pages/component-review/componentReviewCache.ts`
- Overview and Review metrics consumers.

Current behavior:

- Optimistic patches update visible identity/field values.
- They generally do not recompute all derived metrics, including confidence, coverage, missing count, finder ring totals, component flags, enum flags, or Overview score tiles.

Impact:

- The primary cell changes instantly.
- Summary counters can lag until refetch.
- Users can see a new value next to an old score/count for a short period.

Required fix:

- Centralize metric recomputation selectors for product/review rows.
- Reuse those selectors in optimistic cache patches.
- For expensive or backend-only metrics, mark the row as locally pending instead of showing stale precision.

#### 6. Settings Propagation Is Reactive, Not Fully Optimistic Across All Consumers

Status: partial gap.

Files:

- `tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsAuthorityHooks.ts`
- `tools/gui-react/src/stores/runtimeSettingsValueStore.ts`
- `tools/gui-react/src/pages/layout/hooks/useWsEventBridge.ts`
- `tools/gui-react/src/features/data-change/invalidationResolver.js`
- `tools/gui-react/src/features/pipeline-settings/state/moduleSettingsAuthority.ts`

Current behavior:

- Runtime settings in the current tab update immediately through `runtimeSettingsValueStore`.
- Server-confirmed settings writes invalidate related query families.
- Dirty and flush-pending settings intentionally block stale server hydration.
- Module settings are optimistic for their own query, but downstream finder panels and prompt previews rely on invalidation/refetch.

Impact:

- Runtime settings behave like a true app in the active tab.
- External-tab edits or module setting edits can still feel like refetch-driven updates.
- If a tab has local dirty settings, external confirmed settings changes are intentionally blocked and no conflict UI is shown.

Required fix:

- Add explicit conflict/status UI for external settings updates blocked by dirty or flush-pending local state.
- For module settings, publish a local settings-propagation event that mounted finder panels can consume without waiting for query refetch.
- Add tests for mounted module-setting consumers, not just invalidation key coverage.

#### 7. Cross-Surface Propagation Still Stops at Frontend Cache Boundaries

Status: open gap.

Affected surfaces:

- Overview catalog: `['catalog', category]`
- Indexing catalog: `['catalog', category, 'indexing']`
- Review Grid: `['reviewProductsIndex', category]`
- Product detail: `['product', category, productId]`
- Finder panels and prompt previews.

Current behavior:

- Product identity and brand changes now patch several shared product caches.
- Product-scoped catalog data-change messages now patch loaded Overview/Indexing catalog rows through a single-row backend refresh.
- Review field/component/enum mutations mainly patch Review Grid.
- Finder panels, prompt previews, active operation data, and product detail data usually wait for data-change invalidation.

Impact:

- The app is more responsive, but the propagation model is still per-feature helper based.
- A new shared data surface can be missed unless the mutation author remembers to patch it.

Required fix:

- Introduce a single registry-driven frontend cache projection map for product, field, component, enum, finder, and settings mutations.
- Mutation responses should carry normalized changed entities.
- A central cache dispatcher should patch every loaded query family from those entities.
- Feature components should not manually know all sibling query keys.

#### 8. Backend SQL Gaps Can Still Reintroduce Stale Data After Refetch

Status: open gap, same root as the main audit findings.

Current behavior:

- Frontend optimistic updates can temporarily hide backend split-brain issues.
- When invalidation refetches a SQL-backed query after a JSON-only mutation, the cache can revert to stale SQL data.

Impact:

- Instant UI propagation is not sufficient proof of data correctness.
- The deeper JSON/SQL violations in Review overrides, finder histories, PIF progress, source strategy, prompt settings, and run detail still need SQL-first fixes.

Required fix:

- Complete the SQL-first migration findings below.
- Add end-to-end contracts that mutate once and assert Overview, Review Grid, product detail, finder panels, and prompt preview agree after refetch.

## Findings

### 1. Review Manual Overrides

Status: active API/Grid mitigation complete; broader override family still open.

Active route:

- `src/features/review/api/itemMutationRoutes.js`
- Calls `publishManualOverride(...)`.
- The route writes resolved SQL runtime state first, then mirrors `product.json`.

Read path:

- `src/features/review/domain/reviewGridData.js`
- Reads manual override state from resolved `field_candidates` rows.
- JSON-only manual overrides no longer synthesize Review Grid fields.

Impact:

- Review Grid and Overview can converge after refetch because the mutation updates resolved SQL state.
- `product.json` remains a rebuild/audit mirror.
- Publisher lock reads use resolved SQL manual override rows and ignore JSON-only mirror state.

Implementation:

- `src/features/publisher/publish/publishManualOverride.js`
- `src/features/publisher/publish/writeManualOverride.js` was retired.

Tests now protecting the SQL-first contract:

- `src/features/review/api/tests/itemMutationRoutes.manualOverride.happyPath.characterization.test.js`
- `src/features/review/api/tests/itemMutationRoutes.variantId.test.js`
- `src/features/publisher/publish/tests/publishManualOverride.test.js`
- `src/features/review/domain/tests/reviewGridData.resolvedSelection.characterization.test.js`
- `src/app/api/tests/reviewOverrideOverviewConsistency.test.js`

### 2. Consolidated Review Overrides

Status: active runtime paths SQL-first; deleted-DB rebuild covered.

Files:

- `src/shared/consolidatedOverrides.js`
- `src/features/review/domain/overrideWorkflow.js`
- `src/features/review/domain/overrideHelpers.js`
- `src/features/review/domain/reviewOverrideReseed.js`
- `src/features/review/domain/reviewGridHelpers.js`

Current contract:

- `setManualOverride(...)` writes a resolved SQL `manual_override` row before mirroring consolidated JSON.
- `setOverrideFromCandidate(...)` and `approveGreenOverrides(...)` write resolved SQL `candidate_override` rows before mirroring consolidated JSON.
- `finalizeOverrides(...)` builds pending/applied override entries from resolved SQL override rows and mirrors finalize metadata back to consolidated JSON.
- `finalizeOverrides(...)` stamps review status metadata onto resolved SQL override rows before mirroring JSON.
- `buildReviewMetrics(...)` and `listOverrideDocs(...)` read SQL override rows when `specDb` is available.
- `category_authority/{category}/_overrides/overrides.json` is now the audit/rebuild/export mirror for these active runtime paths.
- `rebuildReviewOverridesFromJson(...)` projects consolidated JSON mirrors back into resolved SQL override rows after DB deletion.

Impact:

- Review write actions now project selected overrides into SQL, so Overview and product-level SQL consumers can converge after refetch.
- Finalize now ignores missing/stale consolidated JSON for pending/applied override values.
- Metrics/listing now ignore missing/stale consolidated JSON when SQL rows are present.
- Deleted-DB rebuild now reseeds resolved override rows and review metadata from the consolidated mirror.
- Overview catalog confidence now normalizes both 0-1 manual override rows and 0-100 finder rows correctly.

Tests now protecting the SQL-first write contract:

- `src/features/review/domain/tests/reviewManualOverrideCanonicalId.test.js`
- `src/features/review/domain/tests/reviewOverrideCandidateWriteContracts.test.js`
- `src/features/review/domain/tests/reviewOverrideApprovalContracts.test.js`
- `src/features/review/domain/tests/reviewOverrideFinalizeApplyContracts.test.js`
- `src/features/review/domain/tests/reviewOverrideFinalizePreviewGuard.test.js`
- `src/features/review/domain/tests/reviewOverrideMetricsContracts.test.js`
- `src/features/review/domain/tests/reviewOverrideReseedContracts.test.js`
- `src/db/tests/seedRegistry.test.js`
- `src/app/api/tests/reviewOverrideOverviewConsistency.test.js`

Tests still covering consolidated JSON mirror behavior:

- `src/features/review/domain/tests/overrideWorkflowCharacterization.test.js`
- `src/shared/tests/consolidatedOverrides.test.js`

Required fix:

- Keep JSON as rebuild/export/import artifact only.

### 3. Global Prompts

Status: closed for active runtime and deleted-DB rebuild.

Files:

- `src/core/llm/prompts/globalPromptStore.js`
- `src/features/settings-authority/globalPromptsHandler.js`
- `src/app/api/bootstrap/createBootstrapEnvironment.js`
- `src/app/api/bootstrap/createBootstrapSessionLayer.js`
- Frontend: `tools/gui-react/src/features/llm-config/state/useGlobalPromptsAuthority.ts`
- Frontend API: `tools/gui-react/src/features/llm-config/api/globalPromptsApi.ts`

Current behavior after fix:

- Overrides persist to appDb settings section `global-prompts` when appDb exists.
- `.workspace/global/global-prompts.json` remains the durable mirror and first-boot fallback.
- Bootstrap initially allows JSON before appDb exists, then `createBootstrapSessionLayer(...)` reloads prompt overrides from appDb and reseeds SQL from JSON only when SQL is empty.
- GET `/llm-policy/global-prompts` serves the appDb-backed in-memory snapshot when appDb is threaded through the route.
- PUT `/llm-policy/global-prompts` writes SQL first, mirrors JSON, and updates the snapshot.

Impact closed:

- Runtime prompt builders read process memory loaded from appDb when appDb exists.
- JSON-only edits no longer win over SQL except during deleted-DB rebuild or first boot before appDb opens.

Proof:

- `src/core/llm/prompts/tests/globalPromptStore.test.js`
- `src/features/settings-authority/tests/globalPromptsHandler.test.js`
- `src/features/settings/api/tests/configRoutesGlobalPrompts.test.js`

Remaining related prompt-contract risk:

- PIF `viewPromptOverride` is a full-template override, not an image requirements fragment.
- If the GUI stores only an `Image requirements:` fragment, missing-template-variable errors occur.
- This is separate from JSON/SQL persistence but should be fixed while touching prompt settings.

### 4. Source Strategy and Spec Seeds

Status: closed for active API/runtime readers and deleted-DB rebuild.

Files:

- `src/features/indexing/sources/sourceFileService.js`
- `src/features/indexing/sources/specSeedsFileService.js`
- `src/features/indexing/api/sourceStrategyRoutes.js`
- `src/features/indexing/api/specSeedsRoutes.js`
- Runtime helper: `src/features/indexing/orchestration/shared/runProductOrchestrationHelpers.js`
- Frontend: `tools/gui-react/src/features/pipeline-settings/state/sourceStrategyAuthority.ts`
- Frontend: `tools/gui-react/src/features/pipeline-settings/state/specSeedsAuthority.ts`
- Frontend copy: `tools/gui-react/src/features/pipeline-settings/sections/PipelineSourceStrategySection.tsx`

Current behavior:

- SpecDb tables `source_strategy_meta` and `source_strategy_entries` are the runtime source for source strategy when SpecDb exists.
- SpecDb tables `spec_seed_sets` and `spec_seed_templates` are the runtime source for spec seeds when SpecDb exists.
- Source Strategy and Spec Seeds routes write SQL first, then mirror `sources.json` / `spec_seeds.json`.
- `loadCategoryConfig(...)` and `loadEnabledSourceEntries(...)` prefer SQL when a SpecDb is supplied.
- Deleted-DB rebuild surfaces reseed SQL from `sources.json` and `spec_seeds.json`.

Impact closed:

- GUI query keys and response shapes stay stable while the backend source is SQL.
- Runtime readers can use SQL-backed source strategy/spec seeds through the injected SpecDb.
- JSON-only edits no longer win over SQL except for deleted-DB rebuild/fallback.

Proof:

- `src/features/indexing/api/tests/sourceStrategySqlContract.test.js`
- `src/features/indexing/api/tests/specSeedsSqlContract.test.js`
- `src/categories/tests/sourceRegistryLoader.test.js`
- `src/features/indexing/orchestration/shared/tests/runProductOrchestrationSeamWiring.test.js`
- `src/db/tests/seedRegistry.test.js`

### 5. Storage Manager Run Detail

Status: definite violation for run detail; run list is mostly compliant.

Files:

- `src/features/indexing/api/storageManagerRoutes.js`
- SQL tables: `runs`, `run_artifacts`, `crawl_sources`, `source_screenshots`, `source_videos`
- SQL builders: `src/features/indexing/api/builders/runListBuilder.js`
- RuntimeOps: `src/features/indexing/api/runtimeOpsRoutes.js`

Current behavior:

- `GET /storage/runs/:runId` reads `run.json` to enrich sources and identity.
- The run list builder is SQL-first and has tests documenting no `run.json` fallback.
- RuntimeOps artifacts use `run_artifacts` as the primary source.

Impact:

- Storage Manager detail can show data that SQL-backed RuntimeOps/run-list paths do not.
- Deleting or editing `run.json` can affect detail even when SQL has the correct runtime data.
- SQL artifact tables already exist, so this is a read-path cleanup.

Required fix:

- Build run detail from `runs`, `crawl_sources`, `source_screenshots`, `source_videos`, and `run_artifacts`.
- Do not parse `run.json` in the GUI route.
- Keep `run.json` only as rebuild/audit output.

### 6. Key Finder

Status: closed for route reads, live/preview prompt history, SQL-first live run writes, run delete, delete-all, and key field-delete. Discovery-history scrub is still covered by the cross-cutting finder scrub finding.

Files:

- `src/features/key/api/keyFinderRoutes.js`
- `src/features/key/keyFinder.js`
- `src/features/key/keyFinderPreviewPrompt.js`
- `src/features/key/keyStore.js`

Current behavior after fix:

- List/summary/detail routes read `key_finder` / `key_finder_runs` when the SQL finder store is available.
- Live runner and preview compiler read previous prompt/discovery history from SQL runs.
- Live runner allocates the next run number from SQL history, writes the SQL run/summary first, then mirrors `key_finder.json`.
- Run delete, delete-all, and key field-delete derive affected keys/runs from SQL rows and mirror JSON afterward.
- Legacy JSON fallback remains for unseeded compatibility and deleted-DB rebuild workflows.
- Discovery-history scrub still uses the shared finder scrubber and remains open under the cross-cutting finder persistence item.

SQL exists:

- `key_finder`
- `key_finder_runs`
- Generated from `FINDER_MODULES`.
- Rebuild exists through `rebuildKeyFinderFromJson`.

Impact:

- Key Finder panel, prompt preview, and live prompt history now converge on the same SQL run projection as Overview/finder SQL consumers.
- `key_finder.json` remains a rebuild/audit mirror.
- Discovery-history scrub can still diverge until the shared scrub service is made SQL-first.

Tests now protecting the SQL-first contract:

- `src/features/key/tests/keyFinderRoutes.summary.test.js`
- `src/features/key/tests/keyFinderRoutes.historyScope.test.js`
- `src/features/key/tests/keyFinder.test.js`
- `src/features/key/tests/keyFinderRoutes.unresolveDelete.test.js`

Remaining fix:

- Move `scrubFinderDiscoveryHistory(...)` itself to SQL-first for all finder modules, then mirror JSON.

### 7. Release Date Finder and SKU Finder

Status: partial violation.

Files:

- `src/core/finder/variantScalarFieldProducer.js`
- `src/features/release-date/releaseDateFinderPreviewPrompt.js`
- `src/features/sku/skuFinderPreviewPrompt.js`
- `src/features/release-date/releaseDateStore.js`
- `src/features/sku/skuStore.js`

Compliant part:

- Generic scalar finder GET routes are SQL-based through `createFinderRouteHandler`.
- Summary/runs tables exist:
  - `release_date_finder`
  - `release_date_finder_runs`
  - `sku_finder`
  - `sku_finder_runs`
- Rebuild from JSON exists.

Violation:

- Live producer reads previous JSON runs for prompt history.
- Preview compilers read `release_date.json` and `sku.json` for previous runs.

Impact:

- A scrub or run mutation that updates SQL only would not affect prompt history until JSON is mirrored.
- A JSON-only change can affect future prompts without updating SQL panels/Overview.

Required fix:

- Add SQL previous-run history readers for scalar finders.
- Use SQL runs in live and preview prompt builders.
- Mirror JSON after SQL writes and after SQL scrub.

### 8. Color & Edition Finder

Status: partial violation.

Files:

- `src/features/color-edition/colorEditionFinder.js`
- `src/features/color-edition/colorEditionPreviewPrompt.js`
- `src/features/color-edition/colorEditionStore.js`
- `src/features/color-edition/variantLifecycle.js`

Compliant part:

- API route uses generic finder route handler and SQL summary/runs for GET.
- Variants table is the runtime source for active variant identity.
- Rebuild from JSON exists.

Violation:

- Live finder reads `color_edition.json` existing/previous runs for prompt/history.
- Preview compiler reads `color_edition.json` unless a current result is supplied.
- Variant lifecycle still mutates JSON store in several cleanup/rename paths.

Impact:

- CEF prompt behavior can diverge from SQL run history.
- Downstream PIF/RDF/SKU depend on variants SQL, but prompt history can still be JSON-driven.

Required fix:

- Move CEF prompt/history reads to SQL runs.
- Keep variant identity from `variants`.
- Ensure lifecycle cleanup writes SQL first, then mirrors JSON.

### 9. Product Image Finder

Status: mixed, high risk.

Files:

- `src/features/product-image/api/productImageFinderRoutes.js`
- `src/features/product-image/productImageFinder.js`
- `src/features/product-image/productImagePreviewPrompt.js`
- `src/features/product-image/imageEvaluator.js`
- `src/features/product-image/carouselBuild.js`
- `src/features/product-image/productImageStore.js`
- `src/features/product-image/pifVariantProgressRebuild.js`

Compliant or partially compliant parts:

- GET `/product-image-finder/:category/:productId/summary` now reads SQL finder summary/runs and strips prompts, raw response images, source URLs/pages, alt text, and raw discovery URL/query arrays.
- Overview PIF popover now reads the lightweight summary instead of the full PIF result.
- Summary query key `['product-image-finder', category, productId, 'summary']` is covered by the `['product-image-finder', category]` data-change template because TanStack invalidation is prefix-based.
- PIF thumbnail/preview routes generate derived WebP assets while preserving full original/master image bytes for full-view paths.
- PIF delete-image and delete-run paths now best-effort remove derived thumbnail/preview cache files for deleted source images.
- `product_image_finder`, `product_image_finder_runs`, and `pif_variant_progress` exist.
- `pif_variant_progress` can rebuild from `product_images.json`.
- Overview reads PIF progress from SQL.

Violations:

- PIF binary image assets are still filesystem-first. SQL stores filenames/metadata in summary/run JSON blobs, but there is no normalized SQL asset inventory for master/original image files, file existence, content hash, mtime, cache fingerprint, or deletion state.
- Derived image variants under `.workspace/products/{productId}/images/.cache/...` are runtime cache files with no formal contract in this audit. That is acceptable only if they are documented as discardable derived state and every source replacement/deletion path invalidates them.
- Derived cache cleanup is incomplete. Delete-image and delete-run paths clean relevant cache entries, and delete-all removes the whole image directory, but process/reprocess/process-all/download/replace/variant-cascade paths can still leave stale derived files for the same logical image stem.
- The lightweight summary endpoint is still route-local hand projection, not generated from a backend schema or shared contract. The frontend `ProductImageFinderSummary` type is manually maintained and can drift from the route.
- The lightweight summary remains product-wide. Opening one variant popover still fetches all product runs, selected images, carousel slots, and per-variant history counts for that product. Live smoke after the optimization showed about 150 KB for one product versus about 2.68 MB for the full endpoint, but the target should be a variant-scoped/materialized payload.
- Summary generation still reads every SQL run row for the product and maps selected image blobs in application code. That is SQL-backed, but not O(1) with product history size.
- History counts are now pre-aggregated by the summary route, but the counts are computed at request time from run response JSON blobs. They should be materialized or queried from a normalized discovery-history table if the counts remain part of Overview.
- Data-change invalidation is correct but coarse: any PIF event invalidates `['product-image-finder', category]`, which covers summary queries but can invalidate all PIF product summaries in the category. There is no product-scoped PIF domain template.
- `writePifVariantProgress` treats `product_images.json` as source of truth for progress.
- Several route mutation paths read/write `product_images.json` and then update SQL.
- `PATCH /carousel-slot` explicitly says "JSON first, then SQL projection".
- PIF preview reads `product_images.json` for previous runs.
- PIF live finder reads `product_images.json` in several places for dedupe/history/current image state.
- Image evaluator and carousel builder read/write JSON and then update SQL projection.

Impact:

- Overview PIF rings can be stale if JSON changed but `pif_variant_progress` did not.
- PIF panel and Overview can disagree if one route reads JSON and the other reads SQL.
- JSON-first write order can leave JSON updated and SQL stale if SQL update fails.
- PIF popovers are much faster after the lightweight summary, but still scale with product history rather than with the one variant/slot set the user opened.
- A source image replacement can show a stale derived thumbnail/preview if cache-busting metadata does not change or if an old cache file is reused by a path that does not include the `v=` cache-bust parameter.
- File deletion can succeed while SQL metadata remains, or SQL deletion can succeed while filesystem cleanup misses an image/original/cache file; there is no single transaction boundary for PIF image asset lifecycle.

Required fix:

- Treat SQL runs/summary/progress as the runtime source.
- Add or define a SQL-backed PIF asset inventory/projection, or explicitly document image binaries as external durable artifacts with SQL as the authoritative metadata owner.
- Make every source-image mutation path invalidate derived `.cache` entries before returning success: process, process-all, reprocess, download/replace, variant cascade, full reset, single image delete, run delete, and delete-all.
- Move the lightweight summary contract into a schema-backed/shared contract and generate or infer the frontend type from it.
- Add a variant-scoped summary endpoint or materialized summary table for Overview popovers, e.g. by `variant_id`/`variant_key`, so the UI fetches only the slots/images/counts it renders.
- Materialize PIF history counts or normalize discovery history so Overview does not scan run response JSON blobs per popup.
- Consider adding product-scoped PIF invalidation templates once wrapper/domain-query work lands, so PIF updates do not over-invalidate every product summary in a category.
- PIF mutations update SQL first, then mirror JSON.
- `writePifVariantProgress` should derive from SQL images/runs/projection data, not by reading `product_images.json`.
- PIF preview/live prompt history should use SQL runs.
- Keep JSON rebuild from SQL writes.

### 9A. PIF Image Asset Cache and Quality Contract

Status: design gap with partial mitigation.

Files:

- `src/core/media/imageVariantAssets.js`
- `src/features/product-image/api/productImageFinderRoutes.js`
- `tools/gui-react/src/features/product-image-finder/helpers/pifImageUrls.ts`
- `tools/gui-react/src/features/product-image-finder/components/GalleryCard.tsx`
- `tools/gui-react/src/features/product-image-finder/components/SlotCard.tsx`
- `tools/gui-react/src/features/product-image-finder/components/CarouselSlotRow.tsx`
- `tools/gui-react/src/pages/overview/PifVariantPopover.tsx`

Current behavior after the performance work:

- Full image routes still serve source/master bytes unchanged.
- `variant=thumb` and `variant=preview` produce derived WebP files from the source image.
- Frontend thumbnail/preview surfaces request the smaller variants.
- Full lightbox/image inspection paths keep full-quality URLs.
- Cache-busting now uses image byte metadata on the main PIF thumbnail/preview consumers touched by the recent work.

What is not a quality risk:

- Derived WebP thumbnails/previews do not replace the canonical original/master files.
- Deleting derived cache files only removes regenerable cache output.
- Full quality remains available as long as the original/master source file exists.

Remaining gaps:

- There is no central manifest declaring which UI surfaces may use `thumb`, `preview`, or full. This is hand-coded per component.
- There is no automated frontend contract that every thumbnail surface uses `variant=thumb` with a cache-bust value and every preview surface uses `variant=preview`.
- There is no automated contract that full-inspection surfaces avoid `thumb`/`preview`.
- Derived cache cleanup is best-effort and not transactional with SQL/JSON state.
- Cache storage can grow without a pruning policy because old derived files are fingerprinted by source mtime/size and retained after replacements unless a mutation explicitly deletes them.
- Runtime image serving still checks the filesystem directly; SQL can reference missing files and files can exist without SQL references.
- PIF image metadata used by the UI is still spread across SQL summary rows, SQL run JSON blobs, product JSON mirrors, and filesystem facts.

Required fix:

- Define the PIF image asset contract: canonical source file, SQL metadata row, JSON rebuild mirror, and derived cache policy.
- Add a normalized SQL projection for product image assets or a documented artifact table relationship.
- Add a small cache-prune/invalidate utility used by every PIF image mutation path.
- Add boundary tests for thumbnail/preview/full URL selection through public component or helper contracts.
- Add a periodic or mutation-triggered prune for orphaned `.cache` files.

### 9B. PIF Image Delete Live Propagation Gap

Status: confirmed frontend/backend boundary gap after the 2026-04-26 live-propagation audit. The first production fix now replaces the PIF panel's delete-all/variant image fan-out with a product-scoped bulk mutation and immediate frontend cache patching.

Tooling evidence:

- Temporary audit tooling was installed under `.tmp/audit-tools` only.
- Extraction output is under `.tmp/live-propagation-audit/out/`.
- Latest extractor rerun scanned 2,713 source files and 1,513 production runtime files. The runtime graph still reports 43 propagation-gap candidates after the targeted fixes, meaning the remaining items are mostly broader JSON-first/runtime-cache architecture gaps rather than the specific PIF delete/full-reset and local mutation-scope bugs fixed in this pass.
- `dependency-cruiser` and `madge` outputs were generated in `.tmp/live-propagation-audit/out/dependency-cruiser.json` and `.tmp/live-propagation-audit/out/madge-dependencies.json`.

Observed path:

- Indexing Lab PIF panel: `tools/gui-react/src/features/product-image-finder/components/ProductImageFinderPanel.tsx`
- Delete-all-images UI path: `deleteTarget.kind === 'images-all'`
- Pre-fix behavior: looped every filename and called `deleteImageMut.mutate(f)` independently, then dismissed the modal immediately.
- Single image mutation hook: `tools/gui-react/src/features/product-image-finder/api/productImageFinderQueries.ts`
- Backend route: `DELETE /product-image-finder/:category/:productId/images/:filename`
- Backend mutation: `src/features/product-image/api/productImageFinderRoutes.js`
- Overview source: `GET /catalog/:category` -> `src/app/api/catalogHelpers.js` -> `pif_variant_progress`

What works:

- The single-image backend route emits `product-image-finder-image-deleted` with `category` and `entities.productIds`.
- The data-change registry maps `product-image-finder-image-deleted` to the PIF domain plus `catalog`, so `['catalog', category]` should be invalidated by WS data-change.
- The frontend single-image mutation optimistically removes the image from the PIF detail cache.

What was broken before the first fix:

- There is no product-level "delete selected/all images" mutation. The UI fans out N concurrent single-image deletes against the same `product_images.json` and SQL summary/runs rows.
- The fan-out creates a read/modify/write race on `product_images.json`. Later deletes can write a recalculation based on stale pre-delete data from another request.
- The fan-out emits N data-change events and N invalidation waves instead of one authoritative product-level mutation event.
- The frontend optimistic patch only updates the PIF detail query. It does not patch the Overview catalog row (`['catalog', category]`) or the product-scoped PIF summary query (`['product-image-finder', category, productId, 'summary']`) before the backend/WS round trip.
- The backend single-image route deletes `pif_variant_progress` rows instead of recomputing them from the updated image state. For "delete all" this happens to produce zero rings after refetch, but for partial deletes it can make Overview show zero progress for all variants until the next recomputation.
- Storage Manager deletes (`storage-*`) clean IndexLab run/source artifacts and product checkpoint history, but they do not own the PIF image asset contract. They do not update `product_images.json`, `product_image_finder` rows, or `pif_variant_progress` unless the request goes through the PIF route.
- Pre-fix: `useStorageActions.ts` did not pass mutation variables or response scope into `useDataChangeMutation` as category/product context, so local on-success invalidation for storage actions was weaker than the later WS event. This was a latency gap even when the server event was correct.

Impact:

- Deleting images in the PIF panel can appear instantly inside that panel but not inside Overview because Overview waits for category-level invalidation and a catalog refetch.
- During operation load, the N-delete fan-out competes with operation WS events, stream chunks, and broad query invalidations. The user sees the app slow down and the Overview can stay visually stale until refetch wins.
- Because the app has no mutation-to-surface contract, the current tests prove selected events invalidate selected query-key families, but they do not prove every table/surface that shares data receives an immediate update.

Required fix:

- Add a single backend bulk image deletion contract for PIF, e.g. delete by filename list and delete all images for one product. First fix complete for filename-list bulk delete.
- Make that backend contract update `product_images.json`, `product_image_finder`, `product_image_finder_runs`, and `pif_variant_progress` once in a deterministic order, then emit one product-scoped data-change event. First fix complete for PIF panel bulk deletes.
- Recompute `pif_variant_progress` immediately from the post-delete state instead of deleting rows and waiting for a later run. First fix complete for bulk and single-image PIF deletes.
- Clear PIF SQL summary artifact columns on full reset/delete-all so SQL runtime reads cannot retain stale `images`, `image_count`, `carousel_slots`, `eval_state`, or `evaluations`. Fix complete for `fullResetProductImages(...)`.
- Replace the frontend `images-all`/`images-variant` fan-out with the bulk mutation. First fix complete.
- Optimistically patch all mounted product image consumers: PIF detail, PIF summary, and the Overview catalog row. First fix complete for PIF detail, product-scoped PIF summary, and all/variant Overview PIF rings.
- Let `useDataChangeMutation` derive local invalidation scope from mutation variables, server response payloads, metadata, and optimistic mutation context. Fix complete in the shared hook; Review candidate deletion now has exact candidate/product invalidation from mutation context, and Storage Manager scoped responses remain covered.
- Add regression contracts that mutate once and assert the PIF panel, Overview catalog row, and product-scoped PIF summary agree after the mutation/refetch.
- Add a generated or declarative mutation dependency map for app-level propagation: mutation -> SQL/JSON writes -> data-change event -> query keys -> frontend surfaces.

### 9C. Overview Live Operation Render Fan-Out

Status: confirmed frontend render-scope gap after the 2026-04-26 live-propagation audit. First production mitigation complete.

Observed path:

- `tools/gui-react/src/pages/overview/LiveOpsCell.tsx`
- `tools/gui-react/src/features/operations/hooks/useFinderOperations.ts`
- `tools/gui-react/src/pages/overview/OverviewPage.tsx`

What was broken before the fix:

- Every Overview row's `LiveOpsCell` subscribed to the category-wide `useRunningModulesByProductOrdered(category)` map.
- Any running-operation update changed the serialized category map, so every live cell in the grid recomputed even when only one product changed.
- During active IndexLab operations this compounded with operation WS events, LLM stream chunks, and data-change invalidations, making the app feel slow.

Fix completed:

- Added a product-scoped selector/hook: `selectRunningModulesForProductOrdered()` / `useRunningModulesForProductOrdered(category, productId)`.
- Updated `LiveOpsCell` to subscribe only to its row product's ordered module signature.
- Added regression coverage proving unrelated product operation changes do not change the selected product signature.

Remaining gaps:

- Overview still keeps one category-wide running-product map for active-first sort and selection badges.
- Category-level catalog invalidation is now mitigated for product-scoped catalog data-change messages by the single-row patch path below. Category-wide events, events without product IDs, and non-catalog surfaces still rely on broader invalidation/refetch.
- Runtime operation detail pages still need a separate render-profile pass; this fix only narrows the Overview live-cell hot path.

### 9D. Product-Scoped Catalog Row Refresh

Status: production mitigation complete for product-scoped catalog row propagation after the 2026-04-26 live-propagation audit.

Observed path:

- Backend full list: `GET /catalog/:category` -> `src/app/api/catalogHelpers.js`
- Backend new row contract: `GET /catalog/:category/rows/:productId`
- Frontend cache patcher: `tools/gui-react/src/features/catalog/api/catalogRowPatch.ts`
- Frontend data-change bridge: `tools/gui-react/src/pages/layout/hooks/useWsEventBridge.ts`
- Shared catalog caches patched: `['catalog', category]` and `['catalog', category, 'indexing']`

What was broken before the fix:

- A product-scoped data-change event that affected Overview still invalidated `['catalog', category]`.
- React Query's broad invalidation then refetched the full category catalog, including products unrelated to the mutation.
- During active operations, that full refetch competed with operation WS events and table rendering, so a small product change could feel like a whole-app refresh.

Fix completed:

- Added `createCatalogRowBuilder()` and `GET /catalog/:category/rows/:productId`.
- The row builder uses `specDb.getProduct(productId)` and reads candidate/progress data only for the requested product row.
- Added frontend row patching that fetches one refreshed `CatalogRow` and splices it into mounted Overview/Indexing catalog caches.
- Added a data-change scheduler key filter so patchable product-scoped catalog messages skip broad `['catalog', category]` invalidation.
- Added fallback invalidation for the same catalog keys if the row fetch fails, so the optimization does not silently strand stale rows.

Remaining gaps:

- This is still a targeted cache patch, not the final registry-driven mutation dependency graph. New shared surfaces can still be missed unless they are added to the patcher/dispatcher.
- Review Grid (`['reviewProductsIndex', category]`), product detail (`['product', category, productId]`), and candidate caches are not patched by this catalog-row helper; they continue to rely on their own optimistic helpers or invalidation.
- Category-wide changes, brand-wide changes without affected product IDs, and settings changes still require broader invalidation/refetch.
- The row patch depends on the backend SQL projection being correct. If the mutation wrote JSON only and did not update SQL, the single-row refetch can still return stale data.
- GUI proof has not yet been run for this slice; verification is currently automated contract tests and TypeScript build only.

### 10. IndexLab Product URL History

Status: definite runtime read violation.

Files:

- `src/features/indexing/pipeline/searchPlanner/indexlabUrlHistoryReader.js`
- `src/features/indexing/pipeline/orchestration/runDiscoverySeedPlan.js`

Current behavior:

- Runtime planning reads prior source URLs from `product.json`.

SQL alternatives:

- `url_crawl_ledger`
- `crawl_sources`

Impact:

- Search planning can use JSON history that does not match SQL crawl history.
- JSON-only URL edits can influence discovery behavior without SQL audit consistency.

Required fix:

- Replace product.json URL-history reader with a SQL reader.
- Use `url_crawl_ledger` or `crawl_sources`, depending on whether the intent is per-product historical URLs or per-run crawled sources.
- Keep product.json source URL list as rebuild/audit mirror only.

### 11. Cross-Cutting Finder Run Persistence and Mutation Helpers

Status: definite violation / write-order gap.

Files:

- `src/core/finder/finderJsonStore.js`
- `src/core/finder/finderRoutes.js`
- `src/core/finder/discoveryHistoryScrub.js`
- `src/core/finder/variantCleanup.js`
- `src/core/finder/variantScalarFieldProducer.js`
- `src/features/key/keyFinder.js`
- `src/features/product-image/productImageStore.js`

Current behavior:

- Finder GET routes can be SQL-backed, but the shared persistence helper writes `{finder}.json` before SQL run/summary rows in several live-run paths.
- Scalar finder runs call `mergeDiscovery(...)` first, then `finderStore.insertRun(...)` / `finderStore.upsert(...)`.
- Key Finder no longer uses this JSON-first live-run path, but shared scalar/CEF/PIF paths still do.
- PIF uses the same JSON store pattern for `product_images.json`.
- Discovery-history scrub reads and mutates finder JSON, then updates SQL run JSON blobs.
- Variant cleanup reads and writes finder JSON, then updates SQL summary/run rows.
- Generic single-run and batch-delete routes are partly better because they delete SQL run rows first, then update JSON; delete-all is mixed and calls JSON cleanup before SQL run cleanup.

Impact:

- A write failure after JSON succeeds can leave JSON with a newer run/history state than SQL.
- SQL-backed Overview/finder panels may stay stale while future prompts or rebuilds see newer JSON.
- Tests for generic finder routes and discovery-history scrub currently normalize the JSON-first contract.

Required fix:

- Introduce SQL-first finder run-history services per module class.
- Allocate run numbers from SQL or a transaction-safe SQL high-water mark before JSON mirror writes.
- Make discovery-history scrub update SQL run payloads first, then mirror JSON.
- Make variant cleanup update SQL rows first, then mirror JSON.
- Keep JSON store helpers as rebuild/mirror helpers, not runtime mutation owners.

### 12. Publisher Candidate and Published-State Dependencies

Status: mostly SQL-first, but dependent on manual-override fix.

Files:

- `src/features/publisher/candidate-gate/submitCandidate.js`
- `src/features/publisher/publish/publishCandidate.js`
- `src/features/publisher/publish/republishField.js`
- `src/features/review/domain/deleteCandidate.js`
- `src/core/finder/finderRoutes.js`

Compliant parts:

- Candidate submission inserts `field_candidates` first, then appends to `product.json.candidates`.
- Evidence projection writes SQL from candidate metadata.
- Auto-publish marks SQL candidate status before mirroring published fields into `product.json`.
- Review candidate delete removes SQL candidates first, then mirrors candidate/published cleanup into `product.json`.

Closed dependency:

- Auto-publish, threshold reconcile, and republish read resolved SQL manual override rows to honor a `manual_override` lock.
- JSON-only manual override entries no longer drive live publisher lock decisions.

Remaining requirement:

- Keep `product.json.fields` / `variant_fields` as mirror/rebuild output after SQL state is resolved.

## Design-Call Items

### A. Internal Source Corpus

Files:

- `src/features/indexing/pipeline/searchExecution/sourceCorpus.js`

Current behavior:

- Reads/writes `_source_intel/{category}/corpus.json`.

Question:

- Is this production runtime state used to decide live discovery, or an operational artifact/cache?

Recommendation:

- If it influences runtime search, add a SQL projection.
- If it is cache-only, document it as ephemeral/derived and define invalidation rules.

### B. Learning Artifacts

Files:

- `src/features/indexing/pipeline/shared/helpers.js`
- `src/features/indexing/api/queueBillingLearningRoutes.js`
- Docs mention SQLite learning stores were removed.

Current behavior:

- Reads `_learning/{category}/field_lexicon.json`.
- Reads `_learning/{category}/query_templates.json`.
- Reads `_learning/{category}/field_yield.json`.

Question:

- Are these mutable learning settings that guide live discovery?

Recommendation:

- If yes, project to SQL.
- If no, mark them as offline artifacts and avoid GUI/runtime treating them as canonical state.

### C. Runtime Control File

Files:

- `src/features/indexing/orchestration/shared/runtimeHelpers.js`
- `src/features/indexing/orchestration/bootstrap/createRuntimeOverridesLoader.js`
- `src/shared/settingsRegistry.js`

Current behavior:

- Reads `_runtime/control/runtime_overrides.json`.
- No write surface was identified in the audit.

Question:

- Is this a supported operator control surface or a temporary escape hatch?

Recommendation:

- If supported, move to appDb/specDb depending on scope.
- If escape hatch, document the exception and keep it outside GUI-owned mutable state.

### D. Catalog Add/Update Write Order

Files:

- `src/features/catalog/products/productCatalog.js`
- `src/features/catalog/api/catalogRoutes.js`
- `src/app/api/catalogHelpers.js`

Current behavior:

- Catalog list/overview is SQL-driven.
- Add/update creates or updates `product.json`, then route upserts `products`.
- Comments conflict: some say `product.json` SSOT / SQL cache, others say SQL SSOT.

Impact:

- Add/update has a JSON-without-SQL failure window.
- If the route fails after `product.json` write but before SQL upsert, Overview/catalog list may not show the product.

Recommendation:

- Clarify product identity contract.
- Prefer SQL-first for GUI/runtime identity, then mirror `product.json`.
- Keep product.json for deleted-DB rebuild.

### E. Run Artifact Fallback Reads

Files:

- `src/features/indexing/api/builders/runArtifactReaders.js`
- `src/features/indexing/api/builders/indexlabDataBuilders.js`
- `src/indexlab/runSummarySerializer.js`

Current behavior:

- RuntimeOps event reads are SQL-first through `run_artifacts` and `bridge_events`.
- `runSummarySerializer.js` still has stale comments saying the GUI reads `run-summary.json`, but runtime code/tests indicate `run_summary` is now stored in SQL `run_artifacts`.
- `readIndexLabRunSerpExplorer(...)` can still read `logs/summary.json` as an immutable run artifact fallback when SQL `search_profile` lacks `serp_explorer`.

Question:

- Should immutable historical run artifacts be explicitly allowed as GUI detail fallbacks, or should every GUI detail view read only `run_artifacts` SQL?

Recommendation:

- Do not treat immutable run artifact reads as the same severity as mutable JSON state.
- If a GUI route uses an artifact fallback, document it as artifact-only and prefer a SQL `run_artifacts` row when available.
- Clean stale comments that still describe `run-summary.json` as a GUI file source.

## Mostly Compliant Patterns

### Overview / Catalog Read Path

Files:

- `src/app/api/catalogHelpers.js`
- `tools/gui-react/src/pages/overview/OverviewPage.tsx`

Status:

- Overview query reads `/catalog/:category`.
- Backend `buildCatalogFromSql` reads SQL.
- It does not parse per-product JSON for coverage/confidence/progress.

Risk:

- This makes upstream JSON-only writes visible as stale Overview data.

### User Settings

Files:

- `src/features/settings-authority/userSettingsService.js`
- `src/db/appDbSeed.js`
- `src/db/seedRegistry.js`

Status:

- appDb is primary at runtime.
- `user-settings.json` is mirror/fallback/reseed.

### Global Prompts

Files:

- `src/core/llm/prompts/globalPromptStore.js`
- `src/features/settings-authority/globalPromptsHandler.js`
- `src/features/settings/api/configRoutes.js`

Status:

- appDb settings section `global-prompts` is primary at runtime.
- `.workspace/global/global-prompts.json` is mirror/fallback/reseed.
- GET/PUT `/llm-policy/global-prompts` use appDb when available.

### Brand Registry

Files:

- `src/features/catalog/identity/brandRegistry.js`
- `src/features/catalog/api/brandRoutes.js`
- `src/db/appDbSeed.js`

Status:

- appDb is the runtime source for brand reads/writes.
- `brand_registry.json` is written after HTTP mutations as a rebuild mirror.
- A mirror write failure does not roll back SQL runtime state.

### Module Finder Settings

Files:

- `src/features/module-settings/api/moduleSettingsRoutes.js`
- `src/db/appDb.js`
- `src/core/finder/finderSqlDdl.js`

Status:

- Global finder settings use appDb `finder_global_settings`.
- Category finder settings use per-category finder settings tables.
- JSON settings files are mirrors for rebuild.

### Unit and Color Registries

Files:

- `src/features/unit-registry/api/unitRegistryRoutes.js`
- `src/features/color-registry/api/colorRoutes.js`
- `src/db/appDbSchema.js`

Status:

- appDb-backed runtime projection with JSON durable registry/reseed.

### Studio Maps

Files:

- `src/features/studio/api/studioRoutes.js`
- `src/features/studio/fieldStudioMapReseed.js`

Status:

- SQL is runtime SSOT for field studio map.
- JSON reseed exists.

### Run List Builder and RuntimeOps

Files:

- `src/features/indexing/api/builders/runListBuilder.js`
- `src/features/indexing/api/runtimeOpsRoutes.js`
- `src/features/indexing/api/builders/runArtifactReaders.js`

Status:

- Run list metadata is SQL-first.
- RuntimeOps artifact readers use `run_artifacts` for needset/search profile artifacts.

### Billing

Files:

- `src/billing/costLedger.js`
- `src/db/appDbSeed.js`

Status:

- appDb primary for GUI billing.
- JSONL ledger is durable rebuild mirror.

### Deletion Store

Files:

- `src/db/stores/deletionStore.js`

Status:

- SQL deletion happens first.
- JSON files are rewritten afterward as mirror cleanup.

## Test Debt

Tests that must change during the fixes:

- Manual override SQL-first tests now updated:
  - `src/features/publisher/publish/tests/publishManualOverride.test.js`
  - `src/features/review/api/tests/itemMutationRoutes.manualOverride.happyPath.characterization.test.js`
  - `src/features/review/api/tests/itemMutationRoutes.variantId.test.js`
  - `src/features/review/domain/tests/reviewGridData.resolvedSelection.characterization.test.js`
- Consolidated override SQL-first write/finalize/metrics tests now updated:
  - `src/features/review/domain/tests/reviewManualOverrideCanonicalId.test.js`
  - `src/features/review/domain/tests/reviewOverrideCandidateWriteContracts.test.js`
  - `src/features/review/domain/tests/reviewOverrideApprovalContracts.test.js`
  - `src/features/review/domain/tests/reviewOverrideFinalizeApplyContracts.test.js`
  - `src/features/review/domain/tests/reviewOverrideFinalizePreviewGuard.test.js`
  - `src/features/review/domain/tests/reviewOverrideMetricsContracts.test.js`
- Consolidated override mirror tests still JSON-based by design:
  - `src/shared/tests/consolidatedOverrides.test.js`
- Global prompt SQL-first tests now updated:
  - `src/core/llm/prompts/tests/globalPromptStore.test.js`
  - `src/features/settings-authority/tests/globalPromptsHandler.test.js`
  - `src/features/settings/api/tests/configRoutesGlobalPrompts.test.js`
- Source strategy/spec seed SQL-first tests now updated:
  - `src/features/indexing/api/tests/sourceStrategySqlContract.test.js`
  - `src/features/indexing/api/tests/specSeedsSqlContract.test.js`
  - `src/categories/tests/sourceRegistryLoader.test.js`
  - `src/features/indexing/orchestration/shared/tests/runProductOrchestrationSeamWiring.test.js`
  - `src/db/tests/seedRegistry.test.js`
- Source strategy/spec seed file-mirror tests still cover fallback behavior:
  - `src/features/indexing/api/tests/sourceStrategyRoutesDataChangeContract.test.js`
  - `src/features/indexing/api/tests/sourceStrategyCategoryScope.test.js`
  - `src/features/indexing/sources/tests/sourceFileService.test.js`
  - `src/features/indexing/sources/tests/specSeedsFileService.test.js`
- Key Finder SQL-first route/history tests:
  - `src/features/key/tests/keyFinderRoutes.summary.test.js`
  - `src/features/key/tests/keyFinderRoutes.historyScope.test.js`
  - `src/features/key/tests/keyFinder.test.js`
  - `src/features/key/tests/keyFinderRoutes.unresolveDelete.test.js`
- PIF JSON-first/progress tests:
  - `src/features/product-image/tests/productImageFinderRoutes.dataChange.test.js`
  - `src/features/product-image/tests/productImageFinderRoutes.summary.test.js`
  - `src/features/product-image/tests/productImageFinderImageAssets.test.js`
  - `src/features/product-image/tests/pifVariantProgressRebuild.test.js`
  - `tools/gui-react/src/features/product-image-finder/components/__tests__/slotCardImageUrl.test.js`
  - `tools/gui-react/src/pages/overview/__tests__/pifVariantPopoverDependencies.test.js`
  - PIF store/eval/carousel tests that assert JSON as immediate runtime source.
- PIF asset/cache contract tests still needed:
  - Summary route returns only schema-approved lightweight fields and does not reintroduce raw prompts/source URL arrays.
  - Overview popover uses the lightweight summary endpoint, not the full PIF endpoint.
  - Thumbnail surfaces use `variant=thumb` plus cache-bust.
  - Preview carousel surfaces use `variant=preview` plus cache-bust.
  - Full inspection/lightbox surfaces keep full-quality image URLs.
  - Every image mutation path prunes derived cache files for affected source images.
- Prompt-history tests for CEF/RDF/SKU/PIF that currently seed JSON to influence preview/live prompt output.
- Generic finder route/discovery-history tests:
  - `src/core/finder/tests/finderRoutes.test.js`
  - `src/core/finder/tests/discoveryHistoryScrub.test.js`
  - `src/core/finder/tests/finderJsonStore.test.js`

Test strategy:

- Do not add broad source-text tests.
- Use public route/service contracts.
- Assert SQL-first write behavior.
- Assert JSON mirror/rebuild still works.
- Assert Overview/query consumers update after the same mutation because SQL changed.

## Recommended Fix Order

### Phase 1: Review Override Family

Status: complete for current active runtime, rebuild, and Overview contracts.

Contract after fix:

- Manual/user override API writes SQL runtime state first.
- JSON `product.json` mirrors after SQL succeeds.
- Consolidated override writes/finalize/metrics/listing are SQL-projected.
- Consolidated override mirrors reseed resolved manual/candidate override SQL rows after DB deletion.
- Review grid reads SQL only for manual override runtime state.

Why first:

- Highest user-visible split-brain risk.
- Earlier tests protected the wrong behavior; current tests now protect SQL-first behavior.

### Phase 2: Global Prompts

Status: complete for active runtime and deleted-DB rebuild.

Contract after fix:

- appDb settings section `global-prompts` is the runtime source.
- Bootstrap reloads prompt overrides after appDb opens.
- GET/PUT `/llm-policy/global-prompts` use appDb when available.
- JSON mirror/reseed is retained for deleted-DB recovery and first-boot fallback.
- PIF prompt override UX/schema issue was not touched in this slice.

Why second:

- Prompt errors are currently user-visible.
- Global prompt state is cross-cutting and should be stabilized before more finder work.

### Phase 3: Source Strategy and Spec Seeds

Status: complete for active API/runtime readers and deleted-DB rebuild.

Contract after fix:

- SpecDb tables hold source strategy and spec seed runtime projections.
- API routes use SQL first and mirror JSON after SQL succeeds.
- `loadCategoryConfig(...)` and `loadEnabledSourceEntries(...)` read SQL when SpecDb is supplied.
- `seedRegistry` / `specDbRuntime` rebuild SQL from `sources.json` and `spec_seeds.json`.
- Frontend remains on the same query keys.

Why third:

- This is a clean settings surface with obvious frontend/API/runtime boundaries.

### Phase 4: Finder History and Route Reads

Fix in this order:

1. Key Finder list/summary/detail/preview/live history. Status: complete except shared discovery-history scrub.
2. Generic finder run persistence/write order.
3. Generic discovery-history scrub and variant cleanup.
4. RDF/SKU preview and live previous-history readers.
5. CEF preview/live previous-history readers.
6. PIF preview/live previous-history readers.

Why fourth:

- SQL finder summary/runs tables already exist.
- This reduces prompt/runtime drift without changing user-facing output semantics first.

### Phase 5: PIF Runtime Mutations and Progress

Fix:

- SQL-first image/eval/carousel mutations.
- Progress derivation from SQL, not JSON.
- PIF image asset inventory or explicit artifact contract.
- Derived cache invalidation for every PIF image mutation path.
- Variant-scoped/materialized PIF summary for Overview popovers.
- Schema-backed summary response contract shared with frontend types.
- JSON mirror after SQL.
- Rebuild from JSON retained.

Why separate:

- PIF has many paths and a high blast radius.
- It needs focused tests around Overview rings, finder panel summaries, image detail, carousel, and rebuild.
- It also owns the largest user-visible image payload and thumbnail/preview quality contract.

### Phase 6: Storage Manager Run Detail

Fix:

- Replace `run.json` detail enrichment with SQL joins/artifact reads.

Why later:

- Mostly a read-path cleanup.
- SQL tables already exist.

### Phase 7: IndexLab URL History and Design Calls

Fix or decide:

- URL history reader from `url_crawl_ledger` / `crawl_sources`.
- Source corpus.
- Learning artifacts.
- Runtime control file.
- Catalog write-order clarification.
- Run artifact fallback policy.

## Completion Criteria

The migration is not complete until all of these are true:

- No GUI/API route reads mutable runtime state directly from JSON.
- No runtime prompt/history reader uses JSON when an SQL runs/projection table exists.
- Every mutable runtime write is SQL-first, JSON-second.
- Binary/runtime artifacts have one declared metadata owner, and any filesystem cache is documented as derived/discardable.
- Derived image caches cannot outlive source-image mutation paths in a way that changes what the UI shows.
- Lightweight route contracts are schema-backed or generated so frontend response types do not drift from backend output.
- Deleted-DB rebuild reconstructs all SQL runtime projections from JSON mirrors.
- Overview, Review, finder panels, Storage Manager, and prompt previews agree after the same mutation.
- Tests no longer assert JSON-only mutable state as correct behavior.
