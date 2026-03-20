// WHY: Type declarations for frontend TS imports of the prefetch contract.

export declare const PREFETCH_TAB_KEYS: readonly string[];
export declare const PREFETCH_LLM_REASON_MAP: Readonly<Record<string, string>>;
export declare const PREFETCH_LLM_REASON_PREFIX_MAP: readonly { prefix: string; tabKey: string }[];
export declare const PREFETCH_LLM_REASON_SUBSTRING_MAP: readonly { substring: string; tabKey: string }[];
export declare function classifyPrefetchLlmReason(reason: string | null | undefined): string | null;
