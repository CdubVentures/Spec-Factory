import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import type {
  BillingSummaryResponse,
  BillingDailyResponse,
  BillingEntriesResponse,
  BillingModelCostsResponse,
  BillingFilterState,
  BillingGroupedItem,
} from './billingTypes.ts';

const BILLING_REFETCH = 30_000;

// WHY: Shared param builder so all billing queries apply the same filters.
function filterParams(filters: BillingFilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.category) p.set('category', filters.category);
  if (filters.model) p.set('model', filters.model);
  if (filters.reason) p.set('reason', filters.reason);
  if (filters.access) p.set('access', filters.access);
  return p;
}

function withFilters(base: string, filters: BillingFilterState): string {
  const p = filterParams(filters);
  const qs = p.toString();
  return qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base;
}

// WHY: Prior-month comparison for hero-band trend badges. Returns YYYY-MM one
// calendar month behind the current date in local time.
function priorMonth(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// WHY: Bundle hook — collapses 9 page-load queries (summary + prior summary +
// daily + 3× filtered rollups + 3× unfiltered chip rollups) into one request
// to /billing/global/dashboard. priorMonth() stays client-side so month-boundary
// behavior matches the user's local timezone.
export interface BillingDashboardResponse {
  month: string;
  prior_month: string;
  filtered: {
    summary: BillingSummaryResponse;
    prior_summary: BillingSummaryResponse;
    by_model: BillingGroupedItem[];
    by_reason: BillingGroupedItem[];
    by_category: BillingGroupedItem[];
    daily: BillingDailyResponse;
  };
  unfiltered: {
    by_model: BillingGroupedItem[];
    by_reason: BillingGroupedItem[];
    by_category: BillingGroupedItem[];
  };
}

export function useBillingDashboardQuery(filters: BillingFilterState) {
  const prior = priorMonth();
  const base = `/billing/global/dashboard?prior_month=${prior}&months=1`;
  return useQuery<BillingDashboardResponse>({
    queryKey: ['billing', 'dashboard', filters],
    queryFn: () => api.get<BillingDashboardResponse>(withFilters(base, filters)),
    refetchInterval: BILLING_REFETCH,
    placeholderData: keepPreviousData,
  });
}

interface EntriesQueryOpts {
  limit: number;
  offset: number;
  category: string;
  model: string;
  reason: string;
  access: string;
}

export function useBillingEntriesQuery(opts: EntriesQueryOpts) {
  const params = new URLSearchParams();
  params.set('limit', String(opts.limit));
  params.set('offset', String(opts.offset));
  if (opts.category) params.set('category', opts.category);
  if (opts.model) params.set('model', opts.model);
  if (opts.reason) params.set('reason', opts.reason);
  if (opts.access) params.set('access', opts.access);

  return useQuery<BillingEntriesResponse>({
    queryKey: ['billing', 'entries', opts],
    queryFn: () => api.get<BillingEntriesResponse>(`/billing/global/entries?${params.toString()}`),
    refetchInterval: BILLING_REFETCH,
    placeholderData: keepPreviousData,
  });
}

export function useBillingModelCostsQuery(filters: BillingFilterState, open: boolean) {
  return useQuery<BillingModelCostsResponse>({
    queryKey: ['billing', 'model-costs', filters],
    queryFn: () => api.get<BillingModelCostsResponse>(withFilters('/billing/global/model-costs', filters)),
    refetchInterval: BILLING_REFETCH,
    placeholderData: keepPreviousData,
    enabled: open,
  });
}
