import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type { RunDetailResponse } from '../types.ts';

interface RunDetailPageOptions {
  readonly sourcesLimit?: number;
  readonly sourcesOffset?: number;
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOffset(value: number | undefined): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function runDetailPath(runId: string, sourcesLimit: number, sourcesOffset: number): string {
  const params = new URLSearchParams({
    sourcesLimit: String(sourcesLimit),
    sourcesOffset: String(sourcesOffset),
  });
  return `/storage/runs/${encodeURIComponent(runId)}?${params.toString()}`;
}

export function useRunDetail(runId: string | null, options: RunDetailPageOptions = {}) {
  const sourcesLimit = normalizePositiveInt(options.sourcesLimit, 100);
  const sourcesOffset = normalizeOffset(options.sourcesOffset);
  return useQuery({
    queryKey: ['storage', 'runs', runId, 'sources', sourcesLimit, sourcesOffset],
    queryFn: () => api.get<RunDetailResponse>(runDetailPath(runId!, sourcesLimit, sourcesOffset)),
    enabled: Boolean(runId),
    staleTime: 60_000,
  });
}
