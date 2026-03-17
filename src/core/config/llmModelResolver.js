// WHY: LLM provider/model resolution logic extracted from config.js (Phase 5).
// Handles DeepSeek detection, provider inference, S3 credential checking,
// and ChatMock directory defaults.

import path from 'node:path';
import { normalizeBaseUrl } from './configNormalizers.js';

export function inferLlmProvider(baseUrl, model, hasDeepSeekKey) {
  const baseToken = normalizeBaseUrl(baseUrl).toLowerCase();
  const modelToken = String(model || '').toLowerCase();
  if (baseToken.includes('deepseek.com') || modelToken.startsWith('deepseek') || hasDeepSeekKey) {
    return 'deepseek';
  }
  return 'openai';
}

export function hasS3EnvCreds() {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
}

export function defaultChatmockDir() {
  const profile = String(process.env.USERPROFILE || '').trim();
  if (!profile) {
    return '';
  }
  return path.join(profile, 'Desktop', 'ChatMock');
}
