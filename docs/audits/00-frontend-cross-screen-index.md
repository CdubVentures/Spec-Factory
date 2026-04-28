# Frontend Cross-Screen Data-Sharing Audits

Date: 2026-04-27
Scope: `tools/gui-react/**` and the backend events / caches that drive its state.
Goal: identify every place where shared data should refresh instantly across panels but doesn't, so the app behaves like a single live SSOT instead of N independent caches.

## Audit set

### Round 1 — primary surfaces

| File | Domain | Severity (worst) |
|---|---|---|
| [review-overview-data-sync.md](./review-overview-data-sync.md) | Review grid ↔ Overview catalog ↔ field_candidates / published / variants | HIGH |
| [field-studio-propagation.md](./field-studio-propagation.md) | Field Rules Studio → Review / Overview / prompts / KF | MEDIUM |
| [finder-cross-screen-propagation.md](./finder-cross-screen-propagation.md) | Finder runs (CEF, PIF, RDF, SKU, KF) → all consumers | CRITICAL |
| [indexlab-storage-runtime-ops-sync.md](./indexlab-storage-runtime-ops-sync.md) | IndexLab ↔ Storage ↔ Runtime Ops ↔ Overview last-run ↔ Command Console | HIGH |
| [settings-config-propagation.md](./settings-config-propagation.md) | Pipeline / LLM / module settings → live UI | HIGH |

### Round 2 — runtime, selection, drawers, registries

| File | Domain | Severity (worst) |
|---|---|---|
| [operations-queue-state.md](./operations-queue-state.md) | Operations store ↔ process status ↔ queue badges across panels | MEDIUM |
| [selection-focus-state.md](./selection-focus-state.md) | Selection / drawer focus / picker state vs deletes & cross-panel sync | HIGH |
| [server-side-caches.md](./server-side-caches.md) | Backend in-memory caches (`sessionCache`, `reviewLayoutByCategory`, `fieldRulesEngine`) | MEDIUM |
| [drawer-modal-freshness.md](./drawer-modal-freshness.md) | Drawer/modal `staleTime` policies and snapshot avoidance | MEDIUM |
| [auxiliary-registries.md](./auxiliary-registries.md) | Brand / color / unit / components-DB registries → consumers | CRITICAL |

### Round 3 — pipelines, telemetry, transport, routing

| File | Domain | Severity (worst) |
|---|---|---|
| [evidence-pipeline.md](./evidence-pipeline.md) | Evidence kind enum, gates, replace-semantics, URL HEAD-check | LOW |
| [billing-cost-telemetry.md](./billing-cost-telemetry.md) | Cost ledger, telemetry events, billing dashboard freshness | MEDIUM |
| [data-authority-snapshot.md](./data-authority-snapshot.md) | `['data-authority','snapshot',cat]` query — broad invalidation, single consumer | LOW |
| [websocket-schema.md](./websocket-schema.md) | WS channels, message validation, orphans, reconnect | HIGH |
| [routing-url-state.md](./routing-url-state.md) | URL / hash router / deep links / refresh restoration | MEDIUM |

### Round 4 — verification, build, UX, storage layout

| File | Domain | Severity (worst) |
|---|---|---|
| [test-coverage-invariants.md](./test-coverage-invariants.md) | Tests of cross-screen / dual-state / rebuild contracts | CRITICAL |
| [codegen-drift.md](./codegen-drift.md) | `*.generated.*` files and CI guards for them | HIGH |
| [loading-error-ux.md](./loading-error-ux.md) | Loading skeletons, error toasts, retry, WS-offline UX | HIGH |
| [run-artifact-read-paths.md](./run-artifact-read-paths.md) | Screenshots / video / HTML / extractions / run.json read paths | HIGH |
| [appdb-specdb-boundary.md](./appdb-specdb-boundary.md) | Global AppDb vs per-category SpecDb — ownership, rebuild, drift | MEDIUM |

## Cross-cutting themes

1. **Mutations bypass `useDataChangeMutation`.** Brands, Studio threshold, CommandConsole bulk paths, unit registry — manual `invalidateQueries` calls miss most domain templates.
2. **Missing event-registry entries.** KF deletions and run-finalize aren't mapped → resolver returns no domains → caches don't invalidate.
3. **Domain coverage gaps.** KF run/loop omits `'catalog'`; `'review-layout'` only invalidates KF prompt-preview; `'module-settings-updated'` has no downstream mapping; no `'billing-updated'` mapping.
4. **Settings propagation is split.** `publishSettingsPropagation` (localStorage) refetches the editor's query but doesn't reach downstream consumers.
5. **Mutations return `{ ok }` instead of changed entity.** Forces broad invalidation.
6. **Catalog last-run timestamps never tick on run completion.** No `data-change` with `domains: ['catalog']` is emitted at finalize.
7. **Drawer/modal `staleTime` drift.** PIF popover (30 s) and ComponentReview impact (60 s) too long.
8. **Selection state isn't pruned on entity deletion.** Review drawer, Overview multi-select, IndexLab picker, discovery drawer all hold IDs that may no longer exist.
9. **WS reconnect doesn't re-sync the operations store.**
10. **Server-side cache pair is split.** `sessionCache` + `reviewLayoutByCategory` only co-invalidated on `field-studio-map` saves.
11. **Frontend has no runtime WS message validation.** Operations channel especially exposed.
12. **Screencast frame cache unbounded.** `lastScreencastFrames` grows GB-scale on long runs.
13. **Telemetry events truncated at 6 000 per run.** Long runs lose tail telemetry silently.
14. **No URL state for drawers / selection / pickers.** Refresh wipes context; deep links aren't shareable.
15. **`run_summary` orphan counters never surfaced.** `llm_orphan_finish`, `llm_missing_telemetry` invisible.
16. **Rebuild contract is essentially untested.** Only PIF variant progress has a "delete table → rebuild from JSON" test; 8+ projections claim "rebuild yes" without proof. Highest data-loss risk.
17. **Codegen has no CI guard.** A developer can edit a registry without re-running codegen and ship stale generated TypeScript silently.
18. **No global error toast / retry UI.** Query and mutation failures are largely invisible to users; WS reconnect can cascade into a silent page reload.
19. **Storage detail still does a `run.json` JSON-fallback parse + per-source `fs.stat()` loop.** ~46 K-line files + ~2 K syscalls per request.
20. **Two artifact types are write-only.** HTML and crawl4ai extractions are persisted but not exposed via the HTTP API.
21. **`studio_maps` in AppDb is likely orphaned.** Real field-studio-map lives in SpecDb; AppDb copy can drift silently.
22. **`brand_categories` rebuild is implicit.** Wiping AppDb without re-walking every SpecDb leaves the m:n table empty.
23. **Anti-patterns in tests.** Prompt wording locked in assertions (`feedback_prompt_test_looseness.md` violation); hardcoded finder field lists; no negative tests for invalidation cascade scope.

## Top fixes (sorted by user-visible impact + data safety)

1. **Add a rebuild test per SQL projection** — biggest silent-data-loss prevention.
2. **Emit `data-change` on run finalization** with `domains: ['catalog']` — fixes Overview last-run for every finder.
3. **Add operations WS message validator** — prevents silent Zustand corruption.
4. **Global error toast + retry UI** — make failures visible.
5. **Add the three missing KF events to `EVENT_REGISTRY`** + `'catalog'` to KF run/loop/delete domains.
6. **Migrate `BrandManager` mutations to `useDataChangeMutation`**.
7. **Map `'module-settings-updated'` to consumer query keys**.
8. **CI / pre-commit `git diff --exit-code` after codegen** — catches stale generated files.
9. **Cap `lastScreencastFrames` Map** with LRU or TTL.
10. **Drop `run.json` fallback in `/storage/runs/:runId`** — pure SQL path.
11. **Persist `overviewSelectionStore` and add Review drawer URL params**.
12. **Investigate / remove `studio_maps` AppDb orphan; explicit `brand_categories` rebuild**.
13. **Invalidate `['indexlab','runs']` from `useDeleteRun`**.
14. **Add `reviewLayoutByCategory.delete(category)` to the `field-key-order` PUT handler**.
15. **Drop drawer/modal `staleTime`s above 30 s** to 5 s or 0.
16. **Wrap WS channel handlers in try/catch**.
17. **Refetch operations on WS reconnect**.
18. **Raise `run_summary` event cap** + surface "events truncated" flag.
19. **Emit `billing-updated` data-change on run finalize**.
20. **Add `WS reconnect` UI status (connected / reconnecting / offline)** instead of silent reload.

## Confirmed-good patterns to model

- `tools/gui-react/src/features/catalog/api/catalogRowPatch.ts` — surgical row patch with refetch-on-failure fallback.
- `tools/gui-react/src/features/catalog/components/productCacheOptimism.ts` — optimistic patches with rollback.
- `tools/gui-react/src/features/review/state/reviewCandidateCache.ts` — surgical `setQueryData` per mutation.
- `tools/gui-react/src/features/runtime-ops/state/runtimeOpsInvalidationScheduler.ts` — debounced exact-key invalidation.
- `promptPreviewQueries.ts:66` — `staleTime: 0` for "always fresh on open" surfaces.
- `ColorRegistryPage.tsx:25–38` — golden `useDataChangeMutation` example for registries.
- `src/features/publisher/publish/evidenceGate.js::evaluateFieldBuckets` — single SSOT for confidence + concrete gates.
- `src/core/finder/discoveryHistoryScrub.js:301` — SQL-first then JSON-mirror.
- `tools/gui-react/src/api/ws.ts` reconnect handler list — clean fan-out for reconnect.
- `tools/gui-react/src/features/billing/**` — model loading-state UX (skeletons + empty states + stale-refetch styling).
- `src/core/events/tests/eventRegistryCoverage.test.js` — every emitted event is asserted to be in `EVENT_REGISTRY`.

## Status

Each per-domain file has a full gap list (file:line), severity, and fix shape. No code changes were made — these audits are pure findings for triage and prioritization. 20 audit files across 4 rounds.
