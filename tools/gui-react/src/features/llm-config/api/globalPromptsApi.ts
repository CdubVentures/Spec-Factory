import { api } from '../../../api/client.ts';

export const GLOBAL_PROMPTS_QUERY_KEY = ['llm-policy', 'global-prompts'] as const;

export interface GlobalPromptVariable {
  readonly name: string;
  readonly description?: string;
  readonly required?: boolean;
}

export interface GlobalPromptEntry {
  readonly label: string;
  readonly description: string;
  readonly appliesTo: readonly string[];
  readonly variables: readonly GlobalPromptVariable[];
  readonly defaultTemplate: string;
  readonly override: string;
}

export interface GlobalPromptsSnapshot {
  readonly ok: boolean;
  readonly keys: readonly string[];
  readonly prompts: Readonly<Record<string, GlobalPromptEntry>>;
}

export type GlobalPromptsPatch = Readonly<Record<string, string | null>>;

export function fetchGlobalPrompts(): Promise<GlobalPromptsSnapshot> {
  return api.get<GlobalPromptsSnapshot>('/llm-policy/global-prompts');
}

export function persistGlobalPrompts(patch: GlobalPromptsPatch): Promise<GlobalPromptsSnapshot> {
  return api.put<GlobalPromptsSnapshot>('/llm-policy/global-prompts', patch);
}
