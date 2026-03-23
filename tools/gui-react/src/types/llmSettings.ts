// WHY: O(1) — LlmRouteRow is now auto-generated from LLM_ROUTE_COLUMN_REGISTRY.
// Re-export for backward compat with all existing import sites.
export type { LlmRouteRow } from './llmRouteTypes.generated.ts';

export type LlmScope = 'field' | 'component' | 'list';

export interface LlmRouteResponse {
  category: string;
  scope?: string | null;
  rows: import('./llmRouteTypes.generated.ts').LlmRouteRow[];
  ok?: boolean;
  rejected?: Record<string, string>;
}
