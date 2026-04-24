// Types for the POST /:prefix/:category/:productId/preview-prompt response.
// Shared by all four IndexLab finders (CEF Phase 1; PIF / RDF / SKU in later phases).

export type PromptPreviewFinder = 'cef' | 'pif' | 'rdf' | 'sku' | 'key';

export interface PromptModelInfo {
  readonly id: string;
  readonly thinking_effort?: string;
  readonly web_search: boolean;
  readonly json_strict: boolean;
}

export interface PromptPreviewPrompt {
  readonly label: string;
  readonly system: string;
  readonly user: string;
  readonly schema: unknown;
  readonly model: PromptModelInfo;
  readonly notes: readonly string[];
  readonly images?: readonly {
    readonly url: string;
    readonly label?: string;
    readonly caption?: string;
    readonly filename?: string;
    readonly view?: string;
    readonly source?: string;
    readonly thumb_base64_size?: number;
  }[];
}

export interface PromptPreviewResponse {
  readonly finder: PromptPreviewFinder;
  readonly mode: string;
  readonly compiled_at: number;
  readonly prompts: readonly PromptPreviewPrompt[];
  readonly inputs_resolved: Readonly<Record<string, unknown>>;
  /** Top-level explanatory notes — populated when the preview cannot produce a prompt
   *  (e.g., eval mode with no candidates). UI renders these as an empty-state message. */
  readonly notes?: readonly string[];
}

export interface PromptPreviewRequestBody {
  readonly variant_key?: string;
  readonly variant_id?: string;
  readonly mode?: string;
  readonly view?: string;
  readonly field_key?: string;
  readonly passenger_field_keys_snapshot?: readonly string[];
}
