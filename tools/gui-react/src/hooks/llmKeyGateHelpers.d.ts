export interface LlmKeyGateError {
  role: string;
  label: string;
  provider: string;
  model: string;
}

export declare function deriveLlmKeyGateErrors(
  routingSnapshot: Record<string, {
    primary?: { provider?: string | null; model?: string | null; api_key_present?: boolean } | null;
    fallback?: { provider?: string | null; model?: string | null; api_key_present?: boolean } | null;
  }> | null | undefined,
): LlmKeyGateError[];

export declare function hasLlmKeyGateErrors(
  routingSnapshot: Parameters<typeof deriveLlmKeyGateErrors>[0],
): boolean;

export declare function deriveSerperKeyGateError(
  serperData: { enabled?: boolean; configured?: boolean; credit?: number | null } | null | undefined,
): LlmKeyGateError | null;
