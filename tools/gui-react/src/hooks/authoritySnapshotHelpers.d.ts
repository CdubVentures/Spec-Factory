import type { DataChangeMessage } from './useDataChangeSubscription.js';

export declare const AUTHORITY_SNAPSHOT_DOMAINS: readonly string[];

export declare function buildAuthorityVersionToken(snapshot: unknown): string;

export declare function shouldRefreshAuthoritySnapshot(options: {
  message: DataChangeMessage | null | undefined;
  category: string;
  domains?: string[] | readonly string[];
}): boolean;

export declare function resolveAuthoritySnapshotInvalidationQueryKeys(options: {
  message: DataChangeMessage | null | undefined;
  category: string;
}): unknown[][];
