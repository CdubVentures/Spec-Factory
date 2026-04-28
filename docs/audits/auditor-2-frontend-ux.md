# Auditor 2 - Frontend UX, Routing, Review, Studio, Registry Pages

Date: 2026-04-28

## Ownership

Auditor 2 owns user-facing frontend workflow and UI state:

- Review/Overview selection and drawer state.
- StudioPage and BrandManager frontend mutation behavior.
- Routing/deep links.
- Loading/error UX and page skeletons.
- Drawer/popover freshness.
- UI-facing registry pages.

Do not edit backend persistence, event registry contracts, WS transport, or generated code without coordinating with Auditor 1 or Auditor 3.

## Current Audit Snapshot

Verification refreshed on 2026-04-28:

| Command | Result |
|---|---|
| `npm test` | RED: 12,531 tests, 12,511 passed, 20 failed. Frontend-owned failures are listed below. |
| `npm run gui:check` | PASS. |

H11, H12, and H15 are no longer active findings. H14 remains partial. The current critical frontend work is limited to red test clusters that block the full suite.

## Critical Priority

| ID | Issue | Primary Area | Current Evidence | Work Shape |
|---|---|---|---|---|
| C1 | Two GUI page tests fail because the React test stub does not export `createContext` | GUI test harness / page contracts | `billingQueryRefreshContracts.test.js` and `overviewRdfDateFormatting.test.js` fail with missing `createContext` export from a generated stub. | Fix the shared page-test harness/stub contract without weakening the page assertions. |
| C2 | Evidence kind color-class expectations drifted from token names | Evidence UI registry | `evidenceKindRegistry.test.ts`: tests expect `emerald`/`red-`, implementation now uses semantic classes like `sf-status-text-success`. | Decide whether semantic token classes are the new contract; update test or registry consistently. |

## High Priority

| ID | Issue | Primary Area | Work Shape | Proof |
|---|---|---|---|---|
| H14 | Major pages lack consistent skeleton/loading structure | Page loading UX | PARTIAL 2026-04-28: Catalog ProductManager uses a full-shape loading skeleton matching header, actions, search, table columns/rows, and open drawer state. Remaining: apply the same pattern to other major pages and stale-refetch indicators. | Test: `ProductManagerSkeleton.test.js`. GUI proof: `.tmp/h14-catalog-full-shape-skeleton.png`. |
| H15 | Review drawer can keep stale `activeCell` after deletion | Review focus state | DONE 2026-04-28: Review focus is pruned when the active product/field disappears from the products index; stale drawers close with an info notification. | Test: `reviewFocusPruning.test.js`. GUI proof: `.tmp/h15-review-focus-deletion-notice.png`. |

## Closed Since Last Audit

| ID | Closed Finding | Proof |
|---|---|---|
| H11-old | No global error toast/notification contract | Shared notification queue, root renderer, React Query error routing, focused tests, and GUI proof screenshots. |
| H12-old | Mutation rollback is invisible to users | Product Catalog rollback notices with focused test and GUI proof screenshot. |

## Medium Priority

| ID | Issue | Primary Area | Work Shape |
|---|---|---|---|
| M1 | LLM policy edits propagate to other tabs only after save | Settings / LLM config | Publish settings propagation optimistically and rollback/refetch on save error. |
| M3 | Manual enum/list edit model needs a product decision | Field Studio / compile UX | Choose auto-compile-on-save or draft-until-compile with visible state. Coordinate backend compile contract with Auditor 1. |
| M4 | StudioPage still has manual/broad invalidation paths | Studio / data-change propagation | Inventory direct invalidations; request backend events from Auditor 1 where needed. |
| M5 | Storage detail page lacks active-run refresh | Storage Manager UI | Subscribe visible run detail to active run events after Auditor 1 confirms the exact data contract. |
| M8 | CommandConsole still has manual/broad invalidation leftovers | Overview Command Console | Split local optimistic updates from cross-screen data-change events. |
| M11 | Review drawer state is not refresh-safe | Routing / Review drawer | Encode drawer context in hash query params and hydrate on mount. |
| M12 | Overview multi-select is not refresh-safe | Overview selection | Persist or otherwise recover bulk selection per category. |
| M13 | Contextual deep links are missing | Routing / deep links | Define URL contracts for Review, IndexLab, Component Review, and Storage focused states. |
| M14 | IndexLab picker requires session state | Routing / IndexLab picker | Encode picker brand/product/run state in URL and hydrate before store read. |
| M15 | PIF variant popover uses a 30-second stale window | PIF drawer/popover freshness | Lower stale time or invalidate on relevant PIF events. |
| M16 | Component Review impact drawer uses a 60-second stale window | Component Review freshness | Lower stale time or invalidate on relevant component/enum events. |
| M17 | BrandManager bypasses shared data-change mutation pattern | Brand registry propagation | Convert BrandManager mutations to `useDataChangeMutation`. |
| M18 | Component-review batch paths have manual/broad invalidation leftovers | Component Review batch mutations | Add backend event requests where missing, then narrow frontend invalidation. |
| M34 | Indexing action errors are terse | Indexing error UX | Route failures through global error UX with clearer recovery messages. |
| M35 | Retry/backoff UX is not explicit | Query/retry UX | Add query retry/backoff defaults and visible retry state. |

## Low Priority

| ID | Issue | Primary Area | Work Shape |
|---|---|---|---|
| L1 | Review optimistic patches do not synchronously patch Overview | Review / Overview sync | Defer unless latency is visible; then add shared Review-to-Catalog patch helper. |
| L2 | `publishConfidenceThreshold` local invalidation is broad | Review threshold invalidation | Narrow local invalidation to active category. |
| L4 | Settings queries rely on implicit stale-time defaults | Settings query freshness | Add explicit small or zero stale times where settings are edited live. |
| L5 | No central knob-consumer registry | Settings registry | Add consumer annotations if more knob-driven UI drift appears. |
| L6 | Command Console selection can persist after row deletion | Overview selection | Prune selected ids when deletion events remove visible rows. |
| L13 | Discovery history drawer has no explicit freshness contract | Discovery drawer freshness | Add explicit freshness policy only if stale-data complaints appear. |
| L14 | Unit registry has no cross-feature event contract | Unit registry | Add unit events only when a second consumer exists; coordinate backend event with Auditor 1. |
| L15 | 404 or rejected evidence is not visually surfaced in Review | Evidence UI | Add rejected-evidence indicator in Review evidence drawer. |
| L23 | Discovery history drawer state is not persistent | Routing / discovery drawer | Defer unless shareable discovery-history links are needed. |
| L24 | No deletion-to-route auto-close contract | Routing / deletion handling | Pair with selection-focus deletion pruning. |
| L25 | Component Review flagged items are row-index based | Component Review state | Store stable entity ids instead of row indexes. |
| L26 | Future multi-category selection mismatch | Selection model | Keep selection category-scoped. |
| L27 | PIF variant ring click does not sync Review filter | PIF to Review navigation | Defer unless ring-to-review drilldown is expected. |
| L31 | Stale-refetch indication is inconsistent | Loading UX | Reuse Billing stale/refetch pattern on high-traffic pages. |
| L32 | Empty-state copy is inconsistent | Empty-state UX | Standardize `EmptyState` primitive/copy contract. |
| L33 | Error boundary does not catch async failures | Error UX | Cover through global query/mutation error UX. |
| L34 | Global Suspense fallback is undifferentiated | Loading UX | Defer until route-level skeletons exist. |

## Coordination Rules

- Auditor 2 owns frontend UI and local state. Backend event/payload/schema changes go through Auditor 1.
- Avoid touching WS transport handlers owned by Auditor 3.
- GUI proof is required for visible UX changes.
