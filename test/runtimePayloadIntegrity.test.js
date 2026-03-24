import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from './helpers/loadBundledModule.js';

/**
 * Contract: Every key emitted by the frontend runtime settings payload
 * serializer must be accepted by the backend PUT handler. No noise keys
 * should pollute the rejected field.
 */

test('every runtime payload key is accepted by the backend PUT handler', async () => {
  const { RUNTIME_SETTINGS_ROUTE_PUT } = await import(
    '../src/features/settings-authority/runtimeSettingsRoutePut.js'
  );

  const ALL_KNOWN_KEYS = new Set([
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.boolMap),
  ]);

  const mod = await loadBundledModule(
    'tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsPayload.ts',
    {
      prefix: 'payload-integrity-',
      stubs: {
        './runtimeSettingsParsing': `
          export function parseRuntimeInt(v, fallback) {
            const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
            return Number.isFinite(n) ? n : (typeof fallback === 'number' ? fallback : 0);
          }
          export function parseRuntimeFloat(v, fallback) {
            const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
            return Number.isFinite(n) ? n : (typeof fallback === 'number' ? fallback : 0);
          }
          export function parseRuntimeString(v, fallback, trim) {
            return String(v ?? fallback ?? '');
          }
          export function clampTokenForModel(model, value, resolver) {
            return typeof value === 'number' ? value : 0;
          }
        `,
        './runtimeSettingsAuthority': 'export {};',
        './runtimeSettingsDomainTypes': 'export {};',
      },
    },
  );

  // Build a dummy payload with all required fields
  const dummyInput = {
    searchEngines: 'bing,google',
    searxngBaseUrl: '',
    llmPlanApiKey: '',
    llmModelPlan: 'test-model',
    llmModelReasoning: 'test-model',
    llmPlanFallbackModel: '',
    llmReasoningFallbackModel: '',
    outputMode: 'local',
    localInputRoot: '',
    localOutputRoot: '',
    runtimeEventsKey: '',
    s3InputPrefix: '',
    s3OutputPrefix: '',
    llmProvider: '',
    llmBaseUrl: '',
    openaiApiKey: '',
    anthropicApiKey: '',
    geminiApiKey: '',
    deepseekApiKey: '',
    llmPlanProvider: '',
    llmPlanBaseUrl: '',
    resumeMode: 'auto',
    runtimeSettingsFallbackBaseline: new Proxy({}, { get: () => 0 }),
    resolveModelTokenDefaults: () => ({ max_output_tokens: 4096, default_output_tokens: 2048 }),
  };

  // Fill in all numeric/boolean/string fields with defaults
  const fillProxy = new Proxy(dummyInput, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return 0;
    },
  });

  const payload = mod.collectRuntimeSettingsPayload(fillProxy);
  const payloadKeys = Object.keys(payload);

  const unknownKeys = payloadKeys.filter((key) => !ALL_KNOWN_KEYS.has(key));

  assert.deepEqual(
    unknownKeys,
    [],
    `Frontend payload contains keys NOT accepted by backend PUT handler (would be rejected as unknown_key): ${unknownKeys.join(', ')}`,
  );

  // Sanity: payload should have at least 100 keys
  assert.ok(payloadKeys.length >= 100, `payload should have 100+ keys, got ${payloadKeys.length}`);
});
