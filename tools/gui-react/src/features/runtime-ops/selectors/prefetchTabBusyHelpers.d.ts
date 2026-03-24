import type { PrefetchTabKey, PreFetchPhasesResponse } from '../types.ts';

export declare const DEFAULT_PREFETCH_TAB_KEYS: PrefetchTabKey[];

export interface PrefetchBusyTabOptions {
  isRunning?: boolean;
  workers?: Array<{ pool: string; state: string; call_type?: string | null }>;
  prefetchData?: PreFetchPhasesResponse | undefined;
  phaseCursor?: string;
  tabKeys?: PrefetchTabKey[] | readonly PrefetchTabKey[];
}

export declare function hasPrefetchTabData(
  tab: PrefetchTabKey,
  prefetchData?: PreFetchPhasesResponse | undefined,
): boolean;

export declare function buildBusyPrefetchTabs(
  options?: PrefetchBusyTabOptions,
): Set<PrefetchTabKey>;
