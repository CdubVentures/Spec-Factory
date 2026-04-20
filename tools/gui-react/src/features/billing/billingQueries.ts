import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import type {
  BillingSummaryResponse,
  BillingDailyResponse,
  BillingByModelResponse,
  BillingByReasonResponse,
  BillingByCategoryResponse,
  BillingEntriesResponse,
  BillingFilterState,
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

export function useBillingSummaryQuery(filters: BillingFilterState) {
  return useQuery<BillingSummaryResponse>({
    queryKey: ['billing', 'summary', filters],
    queryFn: () => api.get<BillingSummaryResponse>(withFilters('/billing/global/summary', filters)),
    refetchInterval: BILLING_REFETCH,
    placeholderData: keepPreviousData,
  });
}

// WHY: Prior-month comparison for hero-band trend badges. Returns YYYY-MM one
// calendar month behind the current date in local time.
function priorMonth(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function useBillingPriorSummaryQuery(filters: BillingFilterState) {
  const month = priorMonth();
  const base = `/billing/global/summary?month=${month}`;
  return useQuery<BillingSummaryResponse>({
    queryKey: ['billing', 'summary', 'prior', month, filters],
    queryFn: () => api.get<BillingSummaryResponse>(withFilters(base, filters)),
    refetchInterval: BILLING_REFETCH,
    placeholderData: keepPreviousData,
  });
}

export function useBillingDailyQuery(filters: BillingFilterState) {
  return useQuery<BillingDailyResponse>({
    queryKey: ['billing', 'daily', filters],
    queryFn: () => api.get<BillingDailyResponse>(withFilters('/billing/global/daily?months=1', filters)),
    refetchInterval: BILLING_REFETCH,
    placeholderData: keepPreviousData,
  });
}

export function useBillingByModelQuery(filters: BillingFilterState) {
  return useQuery<BillingByModelResponse>({
    queryKey: ['billing', 'by-model', filters],
    queryFn: () => api.get<BillingByModelResponse>(withFilters('/billing/global/by-model', filters)),
    refetchInterval: BILLING_REFETCH,
    placeholderData: keepPreviousData,
  });
}

export function useBillingByReasonQuery(filters: BillingFilterState) {
  return useQuery<BillingByReasonResponse>({
    queryKey: ['billing', 'by-reason', filters],
    queryFn: () => api.get<BillingByReasonResponse>(withFilters('/billing/global/by-reason', filters)),
    refetchInterval: BILLING_REFETCH,
    placeholderData: keepPreviousData,
  });
}

export function useBillingByCategoryQuery(filters: BillingFilterState) {
  return useQuery<BillingByCategoryResponse>({
    queryKey: ['billing', 'by-category', filters],
    queryFn: () => api.get<BillingByCategoryResponse>(withFilters('/billing/global/by-category', filters)),
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
