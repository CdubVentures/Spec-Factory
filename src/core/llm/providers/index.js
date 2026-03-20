import { requestOpenAICompatibleChatCompletion } from './openaiCompatible.js';

// WHY: All providers use the OpenAI-compatible protocol. The dedicated deepseek.js / gemini.js
// wrappers only differed by default baseUrl, which routing.js already resolves.
// Dispatch by registry `type` field OR by provider name — both land here.
const PROVIDER_DISPATCH = new Map([
  ['openai-compatible', { name: 'openai', request: requestOpenAICompatibleChatCompletion }],
  ['openai', { name: 'openai', request: requestOpenAICompatibleChatCompletion }],
  ['deepseek', { name: 'deepseek', request: requestOpenAICompatibleChatCompletion }],
  ['gemini', { name: 'gemini', request: requestOpenAICompatibleChatCompletion }],
  ['anthropic', { name: 'anthropic', request: requestOpenAICompatibleChatCompletion }],
  ['chatmock', { name: 'chatmock', request: requestOpenAICompatibleChatCompletion }],
]);

const DEFAULT_PROVIDER = { name: 'openai', request: requestOpenAICompatibleChatCompletion };

export function selectLlmProvider(providerOrType) {
  const token = String(providerOrType || '').trim().toLowerCase();
  return PROVIDER_DISPATCH.get(token) || DEFAULT_PROVIDER;
}
