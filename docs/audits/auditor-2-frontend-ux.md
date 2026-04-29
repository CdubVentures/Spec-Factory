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
| `npm test` | PASS: 12,613 tests, 12,613 passed, 0 failed. Log: `.tmp/npm-test-full-audit-all3-2026-04-28.log`. |
| `npm run gui:check` | PASS. |

H11, H12, H15, and the previous frontend red-suite blockers are no longer active findings. H14 remains the only high-priority frontend UX backlog item.

## Critical Priority

No active critical Auditor 2 findings remain after this audit.

## High Priority

| ID | Issue | Primary Area | Work Shape | Proof |
|---|---|---|---|---|
| H14 | Major pages lack consistent skeleton/loading structure | Page loading UX | CODE PASS COMPLETE / VISUAL PROOF PENDING 2026-04-28: Visual rework code pass shipped — `tools/gui-react/src/theme.css` skeleton primitives bumped to text-realistic heights (sf-skel-bar 0.5→0.875rem; sf-skel-caption 0.75→0.875rem; sf-skel-title 1→1.25rem; new sf-skel-text-lg/text-xl/block/sparkline/pill variants) AND all 17 inventory panel files reworked to (a) replace wrap-then-nest (`<div sf-input><SkeletonBlock sf-skel-bar/></div>`) with wrapper-shimmer (`<div sf-input sf-shimmer/>`), (b) swap undersized primitives for size-matched variants per slot, (c) introduce per-column / per-row varied widths so stacked rows don't read as identical strips, (d) preserve all `data-region` and `data-skeleton-*` attributes. 30/30 H14 structural tests stay green. Plan + per-panel breakdown at `C:\Users\Chris\.claude\plans\lively-finding-pie.md`. **H14 still NOT closed** — visual screenshot proof is the final gate. Remaining scope: per-finder variants for FinderContentLoadingSkeleton (CEF/PIF/RDF/SKU each have unique row shapes), route-aware AppShellLoadingSkeleton fallback, per-tab Studio sub-skeletons, stale-refetch indicators, and developer PowerShell + browser before/after screenshots per surface. | Structural tests: `ProductManagerSkeleton.test.js`, `OverviewPageSkeleton.test.js`, `UnitRegistryPageSkeleton.test.js`, `BrandManagerSkeleton.test.js`, `PublisherTableSkeleton.test.js`, `StorageLoadingSkeleton.test.js`, `StudioPageSkeleton.test.js`, `ComponentReviewPageSkeleton.test.js`, `ReviewPageSkeleton.test.js`, `ColorRegistryPageSkeleton.test.js`, `RuntimeOpsLoadingSkeleton.test.js`, `AppShellLoadingSkeleton.test.js`, `AppRouteFallbackSkeleton.test.js`, `SettingsPanelLoadingSkeleton.test.js`, `FinderContentLoadingSkeleton.test.js`, `ProductHistoryLoadingSkeleton.test.js`, `PickerLoadingSkeleton.test.js`, `FinderPanelSkeleton.test.js`, `PromptPreviewLoadingSkeleton.test.js` (combined H14 skeleton suite: 30/30 pass after rework — verified inline 2026-04-28). GUI proof still inadequate for final acceptance: `.tmp/h14-catalog-full-shape-skeleton.png` exists from the previous pass but post-rework screenshots are required because Codex Windows sandbox Playwright capture is blocked by `spawn EPERM`. |

## H14 Skeleton Handoff - Visual Rework Required

This section is a handoff for a new frontend team. It documents every H14 skeleton surface added or wired during the current pass, what it was trying to mimic, why it is not visually accepted yet, and what should be reviewed next.

### Current status

- The implementation goal was correct: replace blank centered spinners with placeholders that preserve loaded-page layout.
- **2026-04-28 update — visual rework code pass shipped.** Root cause of the original "sliver" complaint was identified in `tools/gui-react/src/theme.css` (`sf-skel-bar` was 0.5rem inside 28–40px slots; wrap-then-nest TSX pattern produced shimmer slivers floating inside oversized containers). Both fixed: theme.css primitives bumped + new size-matched variants added; all 17 inventory panels reworked to use wrapper-shimmer on real wrappers (sf-input, sf-cc-btn, sf-chip-*, sf-tab-item, sf-icon-button) instead of nesting tiny `<SkeletonBlock>` children. Per-column / per-row varied widths added so stacked rows read as content not identical strips.
- 30/30 H14 structural tests stay green after rework (verified inline). Detailed per-panel diff in plan: `C:\Users\Chris\.claude\plans\lively-finding-pie.md`.
- The tests prove that skeleton components render expected regions, rows, and columns. They do not prove visual fidelity, density, height, spacing, or side-by-side resemblance.
- **Do not mark H14 done until a developer captures loaded-state and loading-state screenshots for each surface and confirms they match in broad geometry.** The tests are a structural floor, not visual proof.

### Acceptance bar for the rework

- Loading state must preserve the same outer layout as loaded state: sidebars, drawers, headers, toolbars, cards, tables, tabs, modals, and scroll containers.
- Skeleton blocks must approximate the size of real controls, not just place small bars inside large empty containers.
- Tables need realistic row height, column widths, sticky header shape, toolbar/search/filter shape, and pagination/footer shape where present.
- Cards need realistic vertical mass: title area, value/body area, supporting rows, and action areas should occupy about the same footprint as loaded content.
- Drawer and modal skeletons must preserve open-state width/height and internal section rhythm.
- For every page below, produce a before/after screenshot pair: loaded data state and forced loading state in the same viewport.

### H14 skeleton inventory

| Surface | Skeleton file | Wired from | Structural test | Current concern / next action |
|---|---|---|---|---|
| Product Catalog manager | `tools/gui-react/src/features/catalog/components/ProductManagerSkeleton.tsx` | `ProductManager.tsx` | `ProductManagerSkeleton.test.js` | Best existing baseline, but still needs screenshot comparison for header/action/search/table/drawer density. |
| Overview page | `tools/gui-react/src/pages/overview/OverviewPageSkeleton.tsx` | `OverviewPage.tsx` | `OverviewPageSkeleton.test.js` | Large areas may still be mostly empty except shimmer bars. Compare against metrics, command console, active row, filters, and wide table. |
| Unit Registry | `tools/gui-react/src/pages/unit-registry/UnitRegistryPageSkeleton.tsx` | `UnitRegistryPage.tsx` | `UnitRegistryPageSkeleton.test.js` | Verify grouped table/footer mass; avoid thin rows floating inside large shell. |
| Brand Manager | `tools/gui-react/src/features/studio/components/BrandManagerSkeleton.tsx` | `BrandManager.tsx` | `BrandManagerSkeleton.test.js` | Confirm category tabs, DataTable, and optional drawer look like real loaded panels, not sparse placeholders. |
| Publisher candidates | `tools/gui-react/src/pages/publisher/PublisherTableSkeleton.tsx` | `PublisherPage.tsx` | `PublisherTableSkeleton.test.js` | Needs loaded DataTable and pagination screenshot parity. |
| Storage overview and product table | `tools/gui-react/src/features/storage-manager/components/StorageLoadingSkeleton.tsx` | `StorageOverviewBar.tsx`, `ProductTable.tsx` | `StorageLoadingSkeleton.test.js` | KPI cards and breakdown/status panels need more realistic filled mass; product table should match filter/table row heights. |
| Studio page | `tools/gui-react/src/features/studio/components/StudioPageSkeleton.tsx` | `StudioPage.tsx` | `StudioPageSkeleton.test.js` | Active-tab panels need per-tab visual parity, especially mapping, key navigator, contract workbench, and reports. |
| Component Review | `tools/gui-react/src/pages/component-review/ComponentReviewPageSkeleton.tsx` | `ComponentReviewPage.tsx` | `ComponentReviewPageSkeleton.test.js` | Component table and enum review skeletons need real row/card density, not small shimmers in a large area. |
| Review page | `tools/gui-react/src/features/review/components/ReviewPageSkeleton.tsx` | `ReviewPage.tsx` | `ReviewPageSkeleton.test.js` | Dashboard/toolbar/matrix/drawer shape exists structurally; verify loaded matrix cell sizing and drawer rhythm. |
| Color Registry | `tools/gui-react/src/features/color-registry/components/ColorRegistryPageSkeleton.tsx` | `ColorRegistryPage.tsx` | `ColorRegistryPageSkeleton.test.js` | Matrix cells may be too sparse; compare each color cell/card against loaded color metadata. |
| Runtime Ops | `tools/gui-react/src/features/runtime-ops/components/RuntimeOpsLoadingSkeleton.tsx` | `RuntimeOpsPage.tsx` | `RuntimeOpsLoadingSkeleton.test.js` | KPI/flow/chart/cost/lower-card surfaces need stronger same-height skeleton content. |
| AppShell startup | `tools/gui-react/src/pages/layout/AppShellLoadingSkeleton.tsx` | `AppShell.tsx` | `AppShellLoadingSkeleton.test.js` | Generic fallback may not match the first actual route. Consider route-aware fallback instead of one generic table page. |
| Lazy route fallback | `tools/gui-react/src/pages/layout/AppShellLoadingSkeleton.tsx` | `App.tsx` | `AppRouteFallbackSkeleton.test.js` | Same concern as AppShell startup: generic fallback can feel wrong when the loaded route is not table-shaped. |
| LLM and pipeline settings panels | `tools/gui-react/src/shared/ui/feedback/SettingsPanelLoadingSkeleton.tsx` | `LlmConfigPage.tsx`, `LlmGlobalSection.tsx`, `PipelineSettingsPage.tsx`, `CategoryPanel.tsx` | `SettingsPanelLoadingSkeleton.test.js` | Currently matches `SettingGroupBlock`/`SettingRow` structure, but real controls need more realistic input/toggle/dropdown mass. |
| Finder content body | `tools/gui-react/src/shared/ui/finder/FinderContentLoadingSkeleton.tsx` | `GenericScalarFinderPanel.tsx`, `ProductImageFinderPanel.tsx`, `ColorEditionFinderPanel.tsx` | `FinderContentLoadingSkeleton.test.js` | Shared fallback is too generic for CEF/PIF/RDF/SKU differences. Likely needs per-finder variants or richer content blocks. |
| Product History | `tools/gui-react/src/features/indexing/panels/ProductHistoryLoadingSkeleton.tsx` | `ProductHistoryPanel.tsx`, `ProductHistoryKpiRow.tsx` | `ProductHistoryLoadingSkeleton.test.js` | KPI strip and run-history body are structurally present; compare against real run pills, charts, tables, and summaries. |
| Product Picker | `tools/gui-react/src/features/indexing/panels/PickerLoadingSkeleton.tsx` | `PickerPanel.tsx` | `PickerLoadingSkeleton.test.js` | Drill columns exist, but options may look like thin bars. Match actual brand/model/variant rows and search height. |
| Lazy finder panel shell | `tools/gui-react/src/features/indexing/panels/FinderPanelSkeleton.tsx` | `IndexingPage.tsx` | `FinderPanelSkeleton.test.js` | Only a lightweight shell. Needs closer match to loaded `IndexingPanelHeader` plus first body block. |
| Prompt Preview modal | `tools/gui-react/src/shared/ui/finder/PromptPreviewModal.tsx` (`PromptPreviewLoadingSkeleton`) | `PromptPreviewModal.tsx` | `PromptPreviewLoadingSkeleton.test.js` | Should match real prompt preview sections, code/text block heights, and modal scroll body. |

### Wiring summary

- Top-level route loading now uses `AppShellLoadingSkeleton` in `App.tsx`.
- Shell settings hydration loading now uses `AppShellLoadingSkeleton` in `AppShell.tsx`.
- Settings lazy panels now use `SettingsPanelLoadingSkeleton`.
- Indexing finder body loaders now use `FinderContentLoadingSkeleton`, `ProductHistoryLoadingSkeleton`, `PickerLoadingSkeleton`, and `FinderPanelSkeleton`.
- Prompt preview loading now uses `PromptPreviewLoadingSkeleton`.
- Remaining `<Spinner>` usages are inline indicators for actions, row buttons, drawers, small progress indicators, and test-mode fetching. They are not currently classified as page/panel skeleton replacements.

### Suggested rework plan

1. Capture loaded-state screenshots for every surface in the inventory.
2. Add a forced-loading dev path or fixture per surface so screenshots can be captured deterministically.
3. For each skeleton, adjust dimensions first: container height, row height, card padding, tab/header height, drawer width, and modal body height.
4. Replace tiny single shimmer bars with blocks that occupy the same footprint as the loaded control or content group.
5. Keep the structural tests, but add screenshot proof to the audit row after manual visual acceptance.
6. Do not close H14 on passing unit tests alone.

## Closed Since Last Audit

| ID | Closed Finding | Proof |
|---|---|---|
| C1-old | GUI page test React `createContext` stub failure | Full suite now passes `billingQueryRefreshContracts.test.js` and `overviewRdfDateFormatting.test.js`. |
| C2-old | Evidence kind semantic color-class drift | Full suite now passes `evidenceKindRegistry.test.ts`. |
| H11-old | No global error toast/notification contract | Shared notification queue, root renderer, React Query error routing, focused tests, and GUI proof screenshots. |
| H12-old | Mutation rollback is invisible to users | Product Catalog rollback notices with focused test and GUI proof screenshot. |
| H15-old | Review drawer can keep stale `activeCell` after deletion | Review focus pruning test and GUI proof screenshot; full suite remains green. |

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
