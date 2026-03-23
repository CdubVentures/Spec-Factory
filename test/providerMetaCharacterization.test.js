import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { llmProviderFromModel } from '../src/api/helpers/llmHelpers.js';
import { resolveLlmRoute } from '../src/core/llm/client/routing.js';

// ── llmProviderFromModel prefix fallback (no registry) ──

describe('llmProviderFromModel prefix detection (characterization)', () => {
  it('gemini model → gemini', () => {
    assert.equal(llmProviderFromModel('gemini-2.5-flash'), 'gemini');
  });

  it('deepseek model → deepseek', () => {
    assert.equal(llmProviderFromModel('deepseek-chat'), 'deepseek');
  });

  it('deepseek-reasoner → deepseek', () => {
    assert.equal(llmProviderFromModel('deepseek-reasoner'), 'deepseek');
  });

  it('gpt model → openai', () => {
    assert.equal(llmProviderFromModel('gpt-4o'), 'openai');
  });

  it('empty model → openai (default)', () => {
    assert.equal(llmProviderFromModel(''), 'openai');
  });

  it('unknown model → openai (default)', () => {
    assert.equal(llmProviderFromModel('some-unknown-model'), 'openai');
  });

  it('chatmock model → chatmock', () => {
    assert.equal(llmProviderFromModel('chatmock-test'), 'chatmock');
  });
});

// ── resolveLlmRoute provider inference ──

describe('resolveLlmRoute provider inference (characterization)', () => {
  it('gemini model → gemini provider in route', () => {
    const config = { llmModelPlan: 'gemini-2.5-flash', geminiApiKey: 'test-key' };
    const route = resolveLlmRoute(config, { role: 'extract' });
    assert.equal(route.provider, 'gemini');
  });

  it('deepseek model → deepseek provider in route', () => {
    const config = { llmModelPlan: 'deepseek-chat', deepseekApiKey: 'test-key' };
    const route = resolveLlmRoute(config, { role: 'extract' });
    assert.equal(route.provider, 'deepseek');
  });

  it('gpt model → openai provider in route', () => {
    const config = { llmModelPlan: 'gpt-4o', openaiApiKey: 'test-key' };
    const route = resolveLlmRoute(config, { role: 'extract' });
    assert.equal(route.provider, 'openai');
  });

  it('gemini model → googleapis baseUrl in route', () => {
    const config = { llmModelPlan: 'gemini-2.5-flash', geminiApiKey: 'test-key' };
    const route = resolveLlmRoute(config, { role: 'extract' });
    assert.ok(route.baseUrl.includes('googleapis.com'), `expected googleapis URL, got ${route.baseUrl}`);
  });

  it('deepseek model → deepseek baseUrl in route', () => {
    const config = { llmModelPlan: 'deepseek-chat', deepseekApiKey: 'test-key' };
    const route = resolveLlmRoute(config, { role: 'extract' });
    assert.ok(route.baseUrl.includes('deepseek.com'), `expected deepseek URL, got ${route.baseUrl}`);
  });

  it('gemini model → reads geminiApiKey', () => {
    const config = { llmModelPlan: 'gemini-2.5-flash', geminiApiKey: 'gem-key-123' };
    const route = resolveLlmRoute(config, { role: 'extract' });
    assert.equal(route.apiKey, 'gem-key-123');
  });

  it('deepseek model → reads deepseekApiKey', () => {
    const config = { llmModelPlan: 'deepseek-chat', deepseekApiKey: 'ds-key-456' };
    const route = resolveLlmRoute(config, { role: 'extract' });
    assert.equal(route.apiKey, 'ds-key-456');
  });

  it('openai model → reads openaiApiKey', () => {
    const config = { llmModelPlan: 'gpt-4o', openaiApiKey: 'oai-key-789' };
    const route = resolveLlmRoute(config, { role: 'extract' });
    assert.equal(route.apiKey, 'oai-key-789');
  });
});
