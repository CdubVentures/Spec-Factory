---
name: live update audit + execution plan
description: Comprehensive 12-gap audit of cache-invalidation across the GUI. Approved staged execution plan (A+B+E first, C+D follow-up). Active work — not yet executed.
type: project
---

**Status as of 2026-04-25:** Audit complete, user approved Stages A+B+E for next session, with C+D as a follow-up after burn-in.

## Architecture truth (already in place)

- `tools/gui-react/src/pages/layout/hooks/useWsEventBridge.ts` is mounted at the app shell. **It is the global subscriber** — every `data-change` WS event hits the resolver regardless of which tab is mounted. The per-component `useDataChangeSubscription` in `KeyFinderPanel.tsx` is REDUNDANT.
- SSOT for event→domain→query-key map: `tools/gui-react/src/features/data-change/invalidationResolver.js` (`DOMAIN_QUERY_TEMPLATES` + `DATA_CHANGE_EVENT_DOMAIN_FALLBACK`).
- Server-side mirror: `src/core/events/dataChangeContract.js` (`DATA_CHANGE_EVENT_DOMAIN_MAP`) — must stay in sync with client.
- Finder-module registry derives both: `src/core/finder/finderModuleRegistry.js` `dataChangeEvents` per module.

**Real root cause of stale UI bugs:** map gaps, not subscription gaps.

## The 12 gaps (full inventory)

### HIGH — visible KF bug
1. **`useUnpublishKeyMutation`** missing catalog + publisher invalidation. Local `onSuccess` only hits `['key-finder', cat, pid]`. WS `key-finder-unpublished` → `[key-finder, review, product]` but NOT catalog/publisher. **Fix:** add `catalog` + `publisher` to the event entry in BOTH `invalidationResolver.js` and `dataChangeContract.js`.
2. **`key-finder-field-deleted`** has NO `dataChangeEvents` entry in `keyFinder` registry — only `discovery-history-scrubbed` standard. Falls through to FALLBACK_QUERY_TEMPLATES (~20-key shotgun). Works accidentally; fragile if message carries `domains`. **Fix:** add `dataChangeEvents: { run, run-deleted, deleted, unpublished, field-deleted }` to keyFinder entry in `finderModuleRegistry.js`. KF currently declares NONE.

### MED — review/publisher cross-update
3. **`publisher-reconcile`** missing `review` domain → Review Grid stays stale. Fix both event maps.
4. **`review-clear-published`** missing `publisher` → Publisher page stale. Fix both event maps.
5. **`review-manual-override`** missing `publisher` → Publisher page stale. Fix both event maps.

### MED — catalog ring on CEF run
7. **`color-edition-finder-run`** missing `catalog` domain → Overview ring stale until 10s poll. Fix `dataChangeEvents.run` in colorEditionFinder registry entry to include `catalog`.

### LOW-MED — over-invalidation / fragility
10. **`module-settings-updated`** event uses unmapped domain `module-settings` → falls to FALLBACK shotgun. Add `module-settings` domain to `DOMAIN_QUERY_TEMPLATES` + `KNOWN_DATA_CHANGE_DOMAINS`.
11. **`field-key-order-saved`** missing from `DATA_CHANGE_EVENT_DOMAIN_FALLBACK`. Add `['mapping', 'review-layout']`.

### MED — silent server mutations (no WS event)
6. **`useCarouselSlotMutation`**, **`useClearCarouselWinnersMutation`** — server route does NOT emit `data-change`. Cross-tab silent. Fix: add `emitDataChange()` in `src/features/product-image/api/productImageFinderRoutes.js` for `product-image-finder-carousel-updated` (or similar) with domain `[product-image-finder, catalog]`.
8. **`useDeleteEvalRecordMutation`** — silent. LOW (eval is PIF-only data).
12. **Storage actions** (delete/prune/purge) — silent. LOW (run list polled).

### LOW — same-tab WS roundtrip latency
9. **`ProductManager`/`BrandManager`** mutations rely on WS round-trip for `['catalog', cat]` refresh. Sub-second perceptible delay. Add local `invalidateDataChangeQueries` in onSuccess.

## Polling that masks gaps (REMOVE in Stage C, NOT in Stage A)

| Query | Interval | Tied to gaps |
|---|---|---|
| `['catalog', cat]` (OverviewPage) | 10s | #2, #7 |
| `['publisher', cat]` (PublisherPage) | 10s | #1, #3, #4, #5 |
| `['publisher', 'published', cat, pid]` (usePublishedFields) | 30s | #1 |
| `['publisher', 'reconcile', cat]` (PublisherReconcileSection) | 15s | #3 |

## Approved staged execution plan

### Stage A — Map fixes (lowest risk, biggest payoff)
Fix gaps #1, #2, #3, #4, #5, #7, #10, #11. Edit:
- `tools/gui-react/src/features/data-change/invalidationResolver.js`
- `src/core/events/dataChangeContract.js` (mirror)
- `src/core/finder/finderModuleRegistry.js` (keyFinder + colorEditionFinder dataChangeEvents)

Tests: extend `src/features/data-change/__tests__/dataChangeInvalidationMap.test.js` — assert each event resolves to expected domains. ~20 new test cases.

### Stage B — Server WS emit additions
Fix #6, #8, #12. Add `emitDataChange()` calls to carousel/eval/storage routes. Register new event names in registry + maps.

Tests: route handler tests verifying WS broadcast shape.

### Stage E — Local onSuccess defense in depth
Same-tab originating mutations get `invalidateDataChangeQueries({ event, category })` in onSuccess so they don't depend on WS roundtrip. Targets: KF mutations (`useUnpublishKeyMutation`, `useDeleteKeyMutation` in `tools/gui-react/src/features/key-finder/api/keyFinderQueries.ts`), Review mutations, Publisher mutations, ProductManager/BrandManager.

Tests: contract tests for each — assert `onSuccess` invokes `invalidateDataChangeQueries` with the right event name.

### Follow-up session (NOT in this batch)

**Stage C — Drop polling.** Remove `refetchInterval` from the 4 queries above. Only do this AFTER A+B+E land and user verifies live updates work. Polling is the safety net.

**Stage D — Cleanup.** Delete redundant `useDataChangeSubscription` in `KeyFinderPanel.tsx` (global bridge already covers it).

## Why staged: User explicitly chose D originally; assistant pushed back to split off C+D as follow-up because removing polling at the same time as adding WS coverage means a missed map entry becomes invisible. User agreed to A+B+E now, C+D after burn-in.

## Files for next-me to read first
- `tools/gui-react/src/features/data-change/invalidationResolver.js` — the map SSOT
- `src/core/events/dataChangeContract.js` — server mirror
- `src/core/finder/finderModuleRegistry.js` — derives FINDER_DATA_CHANGE_EVENTS (look for `dataChangeEvents:` per module — keyFinder is missing it entirely)
- `tools/gui-react/src/features/data-change/__tests__/dataChangeInvalidationMap.test.js` — extend this for Stage A tests
- Subagent ID for resume if needed: `ae61d89877054cb8d` (Explore agent that did the audit)
