import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import type {
  BillingSummaryResponse,
  BillingDailyResponse,
  BillingByModelResponse,
  BillingByReasonResponse,
  BillingByCategoryResponse,
  BillingEntriesResponse,
} from './billingTypes.ts';

const BILLING_REFETCH = 30_000;

export function useBillingSummaryQuery() {
  return useQuery<BillingSummaryResponse>({
    queryKey: ['billing', 'summary'],
    queryFn: () => api.get<BillingSummaryResponse>('/billing/global/summary'),
    refetchInterval: BILLING_REFETCH,
  });
}

export function useBillingDailyQuery() {
  return useQuery<BillingDailyResponse>({
    queryKey: ['billing', 'daily'],
    queryFn: () => api.get<BillingDailyResponse>('/billing/global/daily?months=1'),
    refetchInterval: BILLING_REFETCH,
  });
}

export function useBillingByModelQuery() {
  return useQuery<BillingByModelResponse>({
    queryKey: ['billing', 'by-model'],
    queryFn: () => api.get<BillingByModelResponse>('/billing/global/by-model'),
    refetchInterval: BILLING_REFETCH,
  });
}

export function useBillingByReasonQuery() {
  return useQuery<BillingByReasonResponse>({
    queryKey: ['billing', 'by-reason'],
    queryFn: () => api.get<BillingByReasonResponse>('/billing/global/by-reason'),
    refetchInterval: BILLING_REFETCH,
  });
}

export function useBillingByCategoryQuery() {
  return useQuery<BillingByCategoryResponse>({
    queryKey: ['billing', 'by-category'],
    queryFn: () => api.get<BillingByCategoryResponse>('/billing/global/by-category'),
    refetchInterval: BILLING_REFETCH,
  });
}

interface EntriesQueryOpts {
  limit: number;
  offset: number;
  category: string;
  model: string;
  reason: string;
}

export function useBillingEntriesQuery(opts: EntriesQueryOpts) {
  const params = new URLSearchParams();
  params.set('limit', String(opts.limit));
  params.set('offset', String(opts.offset));
  if (opts.category) params.set('category', opts.category);
  if (opts.model) params.set('model', opts.model);
  if (opts.reason) params.set('reason', opts.reason);

  return useQuery<BillingEntriesResponse>({
    queryKey: ['billing', 'entries', opts],
    queryFn: () => api.get<BillingEntriesResponse>(`/billing/global/entries?${params.toString()}`),
    refetchInterval: BILLING_REFETCH,
  });
}
