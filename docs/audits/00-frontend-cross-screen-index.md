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

## Cross-cutting themes

1. **Mutations bypass `useDataChangeMutation`.** Brands, Studio threshold, CommandConsole bulk paths, unit registry — they fire manual `invalidateQueries` calls that miss most of the registered domain templates.
2. **Missing event-registry entries.** `key-finder-field-deleted`, `key-finder-deleted`, `key-finder-run-deleted` and any `run-completed`-style finalize event aren't mapped → resolver returns no domains → caches don't invalidate.
3. **Domain coverage gaps.** KF run/loop omits `'catalog'`; `'review-layout'` only invalidates KF prompt-preview; `'module-settings-updated'` has no downstream mapping.
4. **Settings propagation is split.** `publishSettingsPropagation` (localStorage) refetches the editor's query but doesn't reach downstream consumers (PIF carousel, eval UI, preview prompts inside settings).
5. **Mutations return `{ ok }` instead of changed entity.** Forces broad invalidation where surgical `setQueryData` would be enough.
6. **Catalog last-run timestamps never tick on run completion.** No `data-change` with `domains: ['catalog']` is emitted at finalize.
7. **Drawer/modal `staleTime` drift.** PIF popover (30 s) and ComponentReview impact (60 s) carry too long a freshness window for a "panel I just opened" surface.
8. **Selection state isn't pruned on entity deletion.** Review drawer, Overview multi-select, IndexLab picker, discovery drawer all hold IDs that may no longer exist.
9. **WS reconnect doesn't re-sync the operations store.** Caches refetch but the Zustand SSOT keeps the pre-drop state.
10. **Server-side cache pair is split.** `sessionCache` and `reviewLayoutByCategory` are invalidated together for `field-studio-map` saves but not for `field-key-order` saves.

## Top fixes (sorted by user-visible impact)

1. **Emit `data-change` on run finalization** with `domains: ['catalog']` and `entities.productIds` — fixes Overview last-run for every finder.
2. **Add the three missing KF events to `EVENT_REGISTRY`** + add `'catalog'` to KF run/loop/delete domains — fixes Review delete + Overview tier rings.
3. **Migrate `BrandManager` mutations to `useDataChangeMutation`** — restores brand-impact / catalog / review-products invalidation.
4. **Map `'module-settings-updated'` to consumer query keys** — PIF carousel/eval/finder-preview update on knob change.
5. **Invalidate `['indexlab','runs']` from `useDeleteRun`** — deleted runs vanish from picker without manual refresh.
6. **Add `reviewLayoutByCategory.delete(category)` to the `field-key-order` PUT handler** — keeps server cache pair in sync.
7. **Drop drawer/modal `staleTime`s above 30 s** to either 5 s or 0; document policy table.
8. **Close Review drawer + clear selection / picker on entity delete** — prevents ghost focus state.
9. **Refetch operations on WS reconnect.**
10. **Narrow `['runtime-ops']` and `['candidates']` prefix invalidations to scoped keys.**

Each per-domain file below has a full gap list (file:line), severity, and fix shape. None of the audits made code changes — they're pure findings for triage.

## Confirmed-good patterns to model

- `tools/gui-react/src/features/catalog/api/catalogRowPatch.ts` — surgical row patch with refetch-on-failure fallback.
- `tools/gui-react/src/features/catalog/components/productCacheOptimism.ts` — optimistic patches with rollback.
- `tools/gui-react/src/features/review/state/reviewCandidateCache.ts` — surgical `setQueryData` per mutation.
- `tools/gui-react/src/features/runtime-ops/state/runtimeOpsInvalidationScheduler.ts` — debounced exact-key invalidation.
- `promptPreviewQueries.ts:66` — `staleTime: 0` for "always fresh on open" surfaces (the canonical drawer pattern).
- `ColorRegistryPage.tsx:25–38` — golden `useDataChangeMutation` example for registries.
