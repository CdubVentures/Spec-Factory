## Purpose

Billing feature domain - call type registry, data transforms, query hooks, and dashboard components for the `/billing` page. Maps backend `reason` keys to display labels and semantic color tokens, including model-cost catalog presentation.

## Public API (The Contract)

- `BILLING_CALL_TYPE_REGISTRY` - frozen array of `{ reason, label, color }` entries (SSOT)
- `resolveBillingCallType(reason)` - accessor with fallback for unknown reasons
- `chartColor(varStr)` - extracts hex fallback from `var(--token, #hex)` for SVG fills
- `pivotDailyByReason(byDayReason)` - pivots flat daily data for recharts stacked bars
- `computeDonutSlices(reasons)` - reasons to labeled/colored donut slices with percentages
- `computeHorizontalBars(items)` - normalizes items for horizontal bar widths
- `buildModelCostDashboard(response)` - combines API/Lab transport rows into one model row per provider family
- `filterModelCostRows(rows, filter)` - applies provider-family and used-only cost catalog filters
- `resolveProviderDisplay(provider, label)` - preserves registry provider IDs while deriving logo/display kind
- `useBillingSummary/PriorSummary/Daily/ByModel/ByReason/ByCategory/Entries/ModelCostsQuery` - React Query hooks

## Dependencies

Allowed: `@/api/client`, `@/shared/ui`, `@/stores/uiStore`, `@/utils/formatting`, `recharts`, `@tanstack/react-table`
Forbidden: Other feature folders

## Domain Invariants

- Registry is immutable (Object.freeze)
- All chart colors use `var(--sf-*)` semantic tokens - no hardcoded hex in components
- Adding a new LLM call source = add one row to the registry array (O(1) scaling)
- All query hooks use 30s refetch interval
- Unknown reason keys resolve to a visible fallback, never crash
- Model cost rows are model-first: API/Lab transport duplicates collapse into one provider-family row while original registry provider IDs stay in `source_provider_ids`
