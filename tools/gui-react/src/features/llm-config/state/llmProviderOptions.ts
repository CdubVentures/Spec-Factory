export const LLM_PROVIDER_OPTIONS = [
  { value: '', label: '(inherit global)' },
  { value: 'gemini', label: 'Gemini (Direct API)' },
  { value: 'openai', label: 'OpenAI (Direct API)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'cortex', label: 'LLM Lab (Cortex)' },
] as const;
