# IndexLab ↔ Storage ↔ Runtime Ops ↔ Overview ↔ Command Console Sync Audit

Date: 2026-04-27
Worst severity: **HIGH** — Overview last-run timestamps never update on run completion (no event with `'catalog'` domain is emitted at finalize).

## Surface ↔ event listener matrix

| WS event | IndexLab catalog/picker | Storage manager | Runtime Ops monitor | Overview last-run | Command Console |
|---|---|---|---|---|---|
| `indexlab-event` (per-pulse) | Indirect (activeRunId triggers `['indexlab','run']` invalidate) | – | **Listens** (debounced 150 ms scheduler → `['runtime-ops', runId]`) | – | – |
| `data-change` (storage-runs-deleted) | – | **Listens** | – | Indirect (catalog row patch if `'catalog'` in domains) | – |
| `data-change` (storage-urls-deleted) | – | **Listens** | – | Indirect | – |
| `data-change` (run-completed) | – | – | – | **Not emitted** | – |
| `process-status` | **Listens** (fallback picker) | – | – | – | – |
| `operations` | – | – | – | – | **Listens** (optimism) |

## Mutation coverage

| Mutation | Event sent | Catalog patch | IndexLab runs list | Runtime Ops | Overview last-run |
|---|---|---|---|---|---|
| Delete run | `storage-runs-deleted` | ✓ | ✗ not invalidated | polls only | ✓ via catalog patch |
| Finder/run completes | (no `data-change`) | ✗ never patched | events ingested into store | invalidates `['runtime-ops', runId]` | ✗ stale until staleTime expires |
| Prune runs | `storage-pruned` | ✓ | ✗ | polls | ✓ |
| Purge all | `storage-purged` | ✓ | ✗ | polls | ✓ |

## Identified gaps

### G1. Overview last-run cells never update on run completion — **HIGH**
**Files:** backend run finalization + frontend `useWsEventBridge.ts`
At finalize, the backend writes `run_completed` to `bridge_events` and updates `run_artifacts.run_summary`, but **does not emit a `data-change` event with `domains: ['catalog']`**. The IndexLab event channel is only consumed by Runtime Ops; Overview reads `cefLastRunAt` … `kfLastRunAt` from `['catalog', cat]`, which never gets invalidated.

User sees: "PIF ran 4 minutes ago" instead of "just now" until the 5-second `staleTime` expires (and only if the user is actively interacting).

**Fix shape (preferred):** at run finalize, emit `data-change`:
```
event: 'run-completed',
domains: ['catalog'],
entities: { productIds: [<finalized product>] },
```
This routes through `patchCatalogRowsFromDataChange` and updates exactly the affected row.

**Fallback:** subscribe `useWsEventBridge` to `indexlab-event`, detect `run_completed`, and trigger a per-product catalog row patch.

### G2. Deleted runs linger in IndexLab picker — MEDIUM
**File:** `tools/gui-react/src/features/storage-manager/state/useStorageActions.ts:54`
`useDeleteRun()` emits only `storage-runs-deleted` mapped to `'catalog'`. `['indexlab','runs']` is never invalidated, so the picker shows the deleted run for up to 15 s (poll interval).

**Fix shape:** in `useDeleteRun().onSuccess`, `queryClient.invalidateQueries({ queryKey: ['indexlab', 'runs'] })`. OR add `'indexlab'` to the `storage-runs-deleted` domain list and add `['indexlab', 'runs', :cat]` to the `'indexlab'` domain template.

### G3. Storage detail page refresh cadence is unverified — MEDIUM
**File:** `tools/gui-react/src/features/storage-manager/state/useRunDetail.ts` (not inspected)
Detail-page `refetchInterval`/`staleTime` not confirmed. If it's poll-only, mid-run progress lags.

**Fix shape:** subscribe to `indexlab-event` filtered by `runId === activeRunDetail.runId` and invalidate the detail query on each pulse.

### G4. Command Console selection persists after row delete — LOW
**Files:** `tools/gui-react/src/pages/overview/CommandConsole.tsx`, `pages/overview/overviewSelectionStore.ts`
Selecting a product, then deleting it from Storage leaves the product label dangling in the active badge.

**Fix shape:** in the selection store, subscribe to catalog row removals and prune deleted ids from selection.

### G5. Active-run invalidation prefix is too broad — MEDIUM
**File:** `tools/gui-react/src/pages/layout/hooks/useWsEventBridge.ts:39–41`
On `activeRunId` change:
```
invalidateQueries(['indexlab', 'run']);
invalidateQueries(['runtime-ops']);   // ← entire runtime-ops domain
invalidateQueries(['indexing', 'domain-checklist']);
```
`['runtime-ops']` blows away every run's runtime data, not just the new active run.

**Fix shape:** narrow to `['runtime-ops', activeRunId]`.

### G6. `data-change` domain mapping not exported as source — LOW
**File:** `tools/gui-react/src/features/data-change/invalidationResolver.d.ts`
`DATA_CHANGE_EVENT_DOMAIN_FALLBACK` is declared in `.d.ts` only; the implementation lives in compiled JS. Hard to audit which events have which domains.

**Fix shape:** move the source to a `.ts` file in the same folder and re-export. Document the mapping in `docs/03-architecture/live-updates.md`.

## Polling intervals (fallback coverage)

| Surface | Active | Idle |
|---|---|---|
| Runtime Ops summary | 2 s | 10 s |
| Runtime Ops workers/docs | 2 s | 10 s |
| Overview catalog | 5 s staleTime | 5 s staleTime |
| IndexLab runs list | 3 s | 15 s |
| Storage detail | unknown | unknown |

Even if all WS events worked, stale data window is up to 15 s on the picker.

## Confirmed-good patterns

- `useWsEventBridge.ts:33–42` — `activeRunId` change invalidates 3 critical queries (good shape, just needs narrower keys per G5).
- `runtimeOpsInvalidationScheduler.ts` — debounced 150 ms scheduler avoids thundering-herd on rapid pulses; exact-key invalidation.
- `catalogRowPatch.ts` — surgical row upsert/delete, falls back to invalidate on fetch failure.
- WS reconnect (`ws.ts:81–93`) re-runs all handlers → caches refresh without page reload.

## Recommended fix order

1. **G1** — backend emits `data-change` with `domains: ['catalog']` on run finalize. Fixes Overview last-run for every finder. (Pairs with the KF `'catalog'` fix in `finder-cross-screen-propagation.md`.)
2. **G2** — invalidate `['indexlab','runs']` from delete-run. 1-line frontend fix.
3. **G5** — narrow `['runtime-ops']` to `['runtime-ops', activeRunId]`. 1-line frontend fix.
4. **G3** — confirm + fix Storage detail refetch cadence.
5. **G4** — selection store subscribes to row removals.
6. **G6** — move resolver mapping to `.ts` source for auditability.
