import { requestOpenAICompatibleChatCompletion } from './openaiCompatible.js';
import { KNOWN_PROVIDERS } from '../providerMeta.js';

// WHY: All providers use the OpenAI-compatible protocol. Dispatch table derived
// from KNOWN_PROVIDERS — adding a provider to providerMeta.js auto-adds it here.
const PROVIDER_DISPATCH = new Map([
  ['openai-compatible', { name: 'openai', request: requestOpenAICompatibleChatCompletion }],
  ...KNOWN_PROVIDERS.map((name) => [name, { name, request: requestOpenAICompatibleChatCompletion }]),
]);

const DEFAULT_PROVIDER = { name: 'openai', request: requestOpenAICompatibleChatCompletion };

export function selectLlmProvider(providerOrType) {
  const token = String(providerOrType || '').trim().toLowerCase();
  return PROVIDER_DISPATCH.get(token) || DEFAULT_PROVIDER;
}
