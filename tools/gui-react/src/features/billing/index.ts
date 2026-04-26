export {
  BILLING_CALL_TYPE_REGISTRY,
  BILLING_CALL_TYPE_MAP,
  BILLING_CALL_TYPE_FALLBACK,
  resolveBillingCallType,
} from './billingCallTypeRegistry.generated.ts';
export type { BillingCallTypeEntry } from './billingCallTypeRegistry.generated.ts';

export {
  pivotDailyByReason,
  computeAvgPerCall,
  computeDonutSlices,
  computeHorizontalBars,
  chartColor,
  computePeriodDeltas,
  computeFilterChipCounts,
  computeTokenSegments,
} from './billingTransforms.ts';

export {
  useBillingDashboardQuery,
  useBillingEntriesQuery,
  useBillingModelCostsQuery,
} from './billingQueries.ts';

export type { BillingDashboardResponse } from './billingQueries.ts';

export {
  buildModelCostDashboard,
  filterModelCostRows,
  resolveProviderDisplay,
} from './modelCostDashboard.ts';

export type {
  ModelCostDashboard,
  ModelCostDashboardRow,
  ModelCostProviderCard,
  ModelCostFilterState,
  ProviderDisplay,
} from './modelCostDashboard.ts';

export type {
  BillingSummaryResponse,
  BillingDailyResponse,
  BillingByModelResponse,
  BillingByReasonResponse,
  BillingByCategoryResponse,
  BillingEntry,
  BillingEntriesResponse,
  BillingFilterState,
  BillingGroupedItem,
  PivotedDailyRow,
  DonutSlice,
  HorizontalBarItem,
  BillingTrendDelta,
  BillingPeriodDeltas,
  FilterChipCounts,
  TokenSegments,
  TrendDirection,
  BillingProviderKind,
  BillingModelPricingSource,
  BillingModelCostUsage,
  BillingModelCostRow,
  BillingModelCostProvider,
  BillingModelCostsResponse,
} from './billingTypes.ts';
