import test from 'node:test';
import assert from 'node:assert/strict';

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
    RUNTIME_SETTINGS_ROUTE_PUT.dynamicFetchPolicyMapJsonKey,
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.boolMap),
  ]);

  // Build a minimal payload through the serializer via esbuild
  const path = await import('node:path');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const { fileURLToPath } = await import('node:url');
  const esbuild = await import('esbuild');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  const entryPath = path.resolve(
    __dirname,
    '..',
    'tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsPayload.ts',
  );

  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    loader: { '.ts': 'ts', '.tsx': 'tsx' },
    plugins: [{
      name: 'stub-imports',
      setup(build) {
        // Stub the parsing module
        build.onResolve({ filter: /runtimeSettingsParsing/ }, () => ({
          path: 'runtimeSettingsParsing',
          namespace: 'stub',
        }));
        build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: `
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
          loader: 'js',
        }));
        // Stub type-only imports
        build.onResolve({ filter: /runtimeSettingsAuthority\.ts$/ }, () => ({
          path: 'runtimeSettingsAuthority',
          namespace: 'stub-type',
        }));
        build.onLoad({ filter: /.*/, namespace: 'stub-type' }, () => ({
          contents: 'export {};',
          loader: 'js',
        }));
        build.onResolve({ filter: /runtimeSettingsDomainTypes\.ts$/ }, () => ({
          path: 'runtimeSettingsDomainTypes',
          namespace: 'stub-type',
        }));
      },
    }],
  });

  const code = result.outputFiles[0].text;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'payload-integrity-'));
  const tmpFile = path.join(tmpDir, 'module.mjs');
  fs.writeFileSync(tmpFile, code, 'utf8');

  let mod;
  try {
    mod = await import(`file://${tmpFile.replace(/\\/g, '/')}?v=${Date.now()}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

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
    eloSupabaseAnonKey: '',
    eloSupabaseEndpoint: '',
    llmProvider: '',
    llmBaseUrl: '',
    openaiApiKey: '',
    anthropicApiKey: '',
    geminiApiKey: '',
    deepseekApiKey: '',
    llmPlanProvider: '',
    llmPlanBaseUrl: '',
    importsRoot: '',
    llmExtractionCacheDir: '',
    resumeMode: 'auto',
    scannedPdfOcrBackend: 'tesseract',
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
