#!/usr/bin/env node
// WHY: End-to-end diagnostic for the jsonStrict two-phase LLM routing.
// Exercises the full path: configPostMerge → routing → callLlmProvider
// with a real config assembly and intercepted fetch to prove the wiring works.
//
// Usage: node tools/test-jsonstrict-e2e.js
//
// This does NOT call a real LLM. It intercepts fetch to capture exactly what
// callLlmWithRouting sends, then reports whether the two-phase split happened.

import { applyPostMergeNormalization, resolvePhaseOverrides } from '../src/core/config/configPostMerge.js';
import { callLlmWithRouting } from '../src/core/llm/client/routing.js';
import { COLOR_EDITION_FINDER_SPEC } from '../src/features/color-edition/colorEditionLlmAdapter.js';
import { zodToLlmSchema } from '../src/core/llm/zodToLlmSchema.js';
import { colorEditionFinderResponseSchema } from '../src/features/color-edition/colorEditionSchema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PASS = '\x1b[32m✔\x1b[0m';
const FAIL = '\x1b[31m✖\x1b[0m';
const WARN = '\x1b[33m⚠\x1b[0m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function header(msg) { console.log(`\n${BOLD}── ${msg} ──${RESET}`); }
function pass(msg) { console.log(`  ${PASS} ${msg}`); }
function fail(msg) { console.log(`  ${FAIL} ${msg}`); }
function warn(msg) { console.log(`  ${WARN} ${msg}`); }
function info(msg) { console.log(`  ${msg}`); }

let failures = 0;
function assert(condition, passMsg, failMsg) {
  if (condition) { pass(passMsg); }
  else { fail(failMsg); failures++; }
}

// ---------------------------------------------------------------------------
// Build a realistic config as configPostMerge would produce
// ---------------------------------------------------------------------------

function buildTestConfig(phaseOverrides = {}) {
  // Minimal registry with a primary and a writer model
  const registry = [
    {
      id: 'test-gemini',
      name: 'Gemini',
      type: 'openai-compatible',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: 'test-gemini-key',
      enabled: true,
      models: [
        { id: 'gf', modelId: 'gemini-2.5-flash', role: 'primary',
          costInputPer1M: 0.15, costOutputPer1M: 0.60, costCachedPer1M: 0.04,
          maxContextTokens: 1048576, maxOutputTokens: 65536, webSearch: true },
      ],
    },
    {
      id: 'test-openai',
      name: 'OpenAI',
      type: 'openai-compatible',
      baseUrl: 'https://api.openai.com',
      apiKey: 'test-openai-key',
      enabled: true,
      models: [
        { id: 'gpt', modelId: 'gpt-4.1-mini', role: 'primary',
          costInputPer1M: 0.40, costOutputPer1M: 1.60, costCachedPer1M: 0.10,
          maxContextTokens: 1048576, maxOutputTokens: 16384 },
      ],
    },
  ];

  const overridesJson = JSON.stringify({ colorFinder: phaseOverrides });

  // WHY: Simulate the REAL production flow.
  // Step 1: applyPostMergeNormalization builds config with canonical defaults.
  //   applyCanonicalSettingsDefaults resets llmPhaseOverridesJson to '{}' (the default).
  //   This is by design — env-based config doesn't carry phase overrides.
  // Step 2: User settings service applies saved DB values (including phaseOverridesJson).
  //   This mutates config in place and triggers rebuildDerivedConfigState.
  // Step 3: resolvePhaseOverrides re-runs with the real phaseOverridesJson.
  //
  // We simulate steps 1+2+3 here to match production exactly.
  const config = applyPostMergeNormalization(
    {
      llmModelPlan: 'gemini-2.5-flash',
      llmModelReasoning: 'gemini-2.5-flash',
      llmPlanFallbackModel: '',
      llmProviderRegistryJson: JSON.stringify(registry),
      geminiApiKey: 'test-gemini-key',
      openaiApiKey: 'test-openai-key',
    },
    {},  // overrides
    new Set(), // explicitEnvKeys
  );

  // Simulate userSettingsService applying saved settings from DB
  config.llmPhaseOverridesJson = overridesJson;
  config.llmProviderRegistryJson = JSON.stringify(registry);
  // Simulate rebuildDerivedConfigState
  resolvePhaseOverrides(config);

  return config;
}

// ---------------------------------------------------------------------------
// Intercept fetch to capture LLM calls
// ---------------------------------------------------------------------------

function interceptFetch() {
  const calls = [];
  const originalFetch = global.fetch;

  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({
      url,
      model: body.model,
      hasResponseFormat: Boolean(body.response_format),
      hasWebSearch: Boolean(body.request_options?.web_search),
      systemSnippet: (body.messages?.find(m => m.role === 'system')?.content || '').slice(0, 500),
      responseFormatType: body.response_format?.type || null,
    });

    const hasSchema = Boolean(body.response_format);
    const content = hasSchema
      ? JSON.stringify({
          colors: ['black', 'white', 'red'],
          color_names: { black: 'Black', white: 'White', red: 'Red' },
          editions: { 'launch-edition': { display_name: 'Launch Edition', colors: ['red'] } },
          default_color: 'black',
          siblings_excluded: [],
          discovery_log: { confirmed_from_known: ['black', 'white'], added_new: ['red'], rejected_from_known: [], urls_checked: [], queries_run: [] },
        })
      : 'RESEARCH FINDINGS:\n- Found 3 colors: black, white, red\n- Found 1 edition: Launch Edition (red)\n- Confirmed black and white from known colors\n- Added red as new discovery\n- No siblings found';

    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          choices: [{ message: { content } }],
          model: body.model || 'test-model',
          usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
        });
      },
    };
  };

  return { calls, restore: () => { global.fetch = originalFetch; } };
}

// ---------------------------------------------------------------------------
// The actual jsonSchema used by CEF
// ---------------------------------------------------------------------------
const CEF_JSON_SCHEMA = zodToLlmSchema(colorEditionFinderResponseSchema);

// ---------------------------------------------------------------------------
// Test 1: configPostMerge resolves jsonStrict correctly
// ---------------------------------------------------------------------------

async function testConfigResolution() {
  header('Test 1: configPostMerge resolves jsonStrict from phaseOverrides');

  const configTrue = buildTestConfig({ jsonStrict: true });
  assert(
    configTrue._resolvedColorFinderJsonStrict === true,
    'jsonStrict: true → _resolvedColorFinderJsonStrict === true',
    `jsonStrict: true → got ${configTrue._resolvedColorFinderJsonStrict} (expected true)`
  );

  const configFalse = buildTestConfig({ jsonStrict: false });
  assert(
    configFalse._resolvedColorFinderJsonStrict === false,
    'jsonStrict: false → _resolvedColorFinderJsonStrict === false',
    `jsonStrict: false → got ${configFalse._resolvedColorFinderJsonStrict} (expected false)`
  );

  const configDefault = buildTestConfig({});
  assert(
    configDefault._resolvedColorFinderJsonStrict === true,
    'jsonStrict omitted → _resolvedColorFinderJsonStrict defaults to true',
    `jsonStrict omitted → got ${configDefault._resolvedColorFinderJsonStrict} (expected true)`
  );

  // Writer model resolution
  const configWriter = buildTestConfig({ jsonStrict: false, writerModel: 'gpt-4.1-mini' });
  assert(
    configWriter._resolvedColorFinderWriterModel === 'gpt-4.1-mini',
    'writerModel: gpt-4.1-mini → _resolvedColorFinderWriterModel === gpt-4.1-mini',
    `writerModel → got '${configWriter._resolvedColorFinderWriterModel}' (expected gpt-4.1-mini)`
  );
}

// ---------------------------------------------------------------------------
// Test 2: jsonStrict TRUE → single call WITH schema (existing behavior)
// ---------------------------------------------------------------------------

async function testSingleCallWithSchema() {
  header('Test 2: jsonStrict=true → single LLM call with JSON schema');

  const config = buildTestConfig({ jsonStrict: true, webSearch: true });
  const { calls, restore } = interceptFetch();

  try {
    const result = await callLlmWithRouting({
      config,
      phase: 'colorFinder',
      reason: 'color_edition_finding',
      role: 'triage',
      system: 'Find all colors.',
      user: JSON.stringify({ brand: 'Corsair', model: 'M75 Wireless' }),
      jsonSchema: CEF_JSON_SCHEMA,
    });

    assert(calls.length === 1,
      `Single call made (${calls.length} call)`,
      `Expected 1 call, got ${calls.length}`);
    assert(calls[0].hasResponseFormat,
      'Call has response_format (strict JSON mode)',
      'Call missing response_format');
    assert(typeof result === 'object' && result.colors,
      `Result is parsed JSON with colors: [${result?.colors?.join(', ')}]`,
      `Result unexpected: ${JSON.stringify(result).slice(0, 100)}`);

    info(`  URL: ${calls[0].url}`);
    info(`  Model: ${calls[0].model}`);
    info(`  Web search: ${calls[0].hasWebSearch}`);
  } finally {
    restore();
  }
}

// ---------------------------------------------------------------------------
// Test 3: jsonStrict FALSE, no writer → two-phase, Phase 2 uses primary
// ---------------------------------------------------------------------------

async function testTwoPhaseNoWriter() {
  header('Test 3: jsonStrict=false, no writer → two-phase (primary does both)');

  const config = buildTestConfig({ jsonStrict: false, webSearch: true });
  const { calls, restore } = interceptFetch();

  try {
    const result = await callLlmWithRouting({
      config,
      phase: 'colorFinder',
      reason: 'color_edition_finding',
      role: 'triage',
      system: 'Find all colors.',
      user: JSON.stringify({ brand: 'Corsair', model: 'M75 Wireless' }),
      jsonSchema: CEF_JSON_SCHEMA,
    });

    assert(calls.length === 2,
      `Two calls made (${calls.length} calls)`,
      `Expected 2 calls, got ${calls.length}`);

    if (calls.length >= 1) {
      assert(!calls[0].hasResponseFormat,
        'Phase 1 (research): NO response_format — free-form output',
        'Phase 1 STILL has response_format — jsonStrict not working!');
      info(`  Phase 1 URL: ${calls[0].url}`);
      info(`  Phase 1 model: ${calls[0].model}`);
      info(`  Phase 1 web search: ${calls[0].hasWebSearch}`);
      info(`  Phase 1 system: "${calls[0].systemSnippet}..."`);
    }

    if (calls.length >= 2) {
      assert(calls[1].hasResponseFormat,
        'Phase 2 (writer): HAS response_format — strict JSON formatting',
        'Phase 2 missing response_format');
      assert(calls[1].systemSnippet.includes('JSON formatter'),
        'Phase 2 system prompt contains "JSON formatter" instructions',
        `Phase 2 system prompt: "${calls[1].systemSnippet}"`);
      assert(calls[1].systemSnippet.includes('RESEARCH FINDINGS'),
        'Phase 2 system prompt embeds Phase 1 research text',
        'Phase 2 system prompt missing research text');
      info(`  Phase 2 URL: ${calls[1].url}`);
      info(`  Phase 2 model: ${calls[1].model}`);
    }

    assert(typeof result === 'object' && result.colors,
      `Final result is parsed JSON with colors: [${result?.colors?.join(', ')}]`,
      `Result unexpected: ${JSON.stringify(result).slice(0, 100)}`);
  } finally {
    restore();
  }
}

// ---------------------------------------------------------------------------
// Test 4: jsonStrict FALSE + writer model → Phase 2 uses writer route
// ---------------------------------------------------------------------------

async function testTwoPhaseWithWriter() {
  header('Test 4: jsonStrict=false + writerModel → Phase 2 uses dedicated writer');

  const config = buildTestConfig({
    jsonStrict: false,
    webSearch: true,
    writerModel: 'gpt-4.1-mini',
  });
  const { calls, restore } = interceptFetch();

  try {
    await callLlmWithRouting({
      config,
      phase: 'colorFinder',
      reason: 'color_edition_finding',
      role: 'triage',
      system: 'Find all colors.',
      user: JSON.stringify({ brand: 'Corsair', model: 'M75 Wireless' }),
      jsonSchema: CEF_JSON_SCHEMA,
    });

    assert(calls.length === 2,
      `Two calls made (${calls.length} calls)`,
      `Expected 2 calls, got ${calls.length}`);

    if (calls.length >= 2) {
      const phase1IsGemini = calls[0].url.includes('googleapis.com');
      const phase2IsOpenAI = calls[1].url.includes('api.openai.com');

      assert(phase1IsGemini,
        `Phase 1 uses primary (Gemini): ${calls[0].url.split('/v1')[0]}`,
        `Phase 1 unexpected URL: ${calls[0].url}`);
      assert(phase2IsOpenAI,
        `Phase 2 uses writer (OpenAI): ${calls[1].url.split('/v1')[0]}`,
        `Phase 2 unexpected URL: ${calls[1].url} — writer model NOT routed correctly!`);
      assert(calls[0].model === 'gemini-2.5-flash',
        `Phase 1 model: gemini-2.5-flash`,
        `Phase 1 model: ${calls[0].model}`);
      assert(calls[1].model === 'gpt-4.1-mini',
        `Phase 2 model: gpt-4.1-mini`,
        `Phase 2 model: ${calls[1].model}`);
    }
  } finally {
    restore();
  }
}

// ---------------------------------------------------------------------------
// Test 5: Verify the actual CEF spec wires correctly
// ---------------------------------------------------------------------------

async function testCefSpecIntegration() {
  header('Test 5: COLOR_EDITION_FINDER_SPEC phase/schema wires into routing');

  assert(COLOR_EDITION_FINDER_SPEC.phase === 'colorFinder',
    `CEF spec phase: '${COLOR_EDITION_FINDER_SPEC.phase}'`,
    `CEF spec phase: '${COLOR_EDITION_FINDER_SPEC.phase}' (expected 'colorFinder')`);

  const schema = typeof COLOR_EDITION_FINDER_SPEC.jsonSchema === 'function'
    ? COLOR_EDITION_FINDER_SPEC.jsonSchema()
    : COLOR_EDITION_FINDER_SPEC.jsonSchema;

  assert(schema && typeof schema === 'object',
    'CEF jsonSchema resolves to an object',
    `CEF jsonSchema: ${typeof schema}`);

  assert(schema.properties?.colors,
    'CEF schema has colors property',
    'CEF schema missing colors property');

  assert(schema.properties?.discovery_log,
    'CEF schema has discovery_log property',
    'CEF schema missing discovery_log property');

  // Verify the phase name matches what configPostMerge capitalizes
  const cap = 'colorFinder'.charAt(0).toUpperCase() + 'colorFinder'.slice(1);
  const expectedKey = `_resolved${cap}JsonStrict`;
  assert(expectedKey === '_resolvedColorFinderJsonStrict',
    `Config key: ${expectedKey} (capitalization matches)`,
    `Config key mismatch: ${expectedKey}`);
}

// ---------------------------------------------------------------------------
// Test 6: Simulate settings save round-trip
// ---------------------------------------------------------------------------

async function testSettingsRoundTrip() {
  header('Test 6: Settings JSON round-trip (UI → save → settings service → config)');

  // Simulate what the UI writes and saves to DB
  const uiOverrides = {
    colorFinder: {
      jsonStrict: false,
      writerModel: 'gpt-4.1-mini',
      webSearch: true,
    },
  };
  const serialized = JSON.stringify(uiOverrides);

  info(`  Serialized JSON: ${serialized}`);

  // Step 1: Server boots with canonical defaults (no phase overrides)
  const config = applyPostMergeNormalization(
    { llmModelPlan: 'gemini-2.5-flash', llmProviderRegistryJson: '[]', geminiApiKey: 'test-key' },
    {}, new Set(),
  );

  info(`  After boot: llmPhaseOverridesJson = '${config.llmPhaseOverridesJson}'`);
  info(`  After boot: _resolvedColorFinderJsonStrict = ${config._resolvedColorFinderJsonStrict} (default)`);

  // Step 2: User settings service loads saved value from DB and applies it
  // (this is what rebuildDerivedConfigState does in production)
  config.llmPhaseOverridesJson = serialized;
  resolvePhaseOverrides(config);

  info(`  After settings apply: llmPhaseOverridesJson = '${config.llmPhaseOverridesJson}'`);

  assert(config._resolvedColorFinderJsonStrict === false,
    'After settings apply: _resolvedColorFinderJsonStrict === false',
    `After settings apply: got ${config._resolvedColorFinderJsonStrict}`);
  assert(config._resolvedColorFinderWriterModel === 'gpt-4.1-mini',
    'After settings apply: _resolvedColorFinderWriterModel === gpt-4.1-mini',
    `After settings apply: got '${config._resolvedColorFinderWriterModel}'`);
  assert(config._resolvedColorFinderWebSearch === true,
    'After settings apply: _resolvedColorFinderWebSearch === true',
    `After settings apply: got ${config._resolvedColorFinderWebSearch}`);
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

console.log(`${BOLD}jsonStrict Two-Phase Routing — End-to-End Diagnostic${RESET}`);
console.log('Exercises: UI JSON → configPostMerge → routing → callLlmProvider dispatch\n');

await testConfigResolution();
await testSingleCallWithSchema();
await testTwoPhaseNoWriter();
await testTwoPhaseWithWriter();
await testCefSpecIntegration();
await testSettingsRoundTrip();

console.log(`\n${BOLD}─────────────────────────────${RESET}`);
if (failures === 0) {
  console.log(`${PASS} ${BOLD}All checks passed.${RESET} Two-phase routing is correctly wired.`);
} else {
  console.log(`${FAIL} ${BOLD}${failures} check(s) failed.${RESET} See above for details.`);
}
console.log();
process.exit(failures > 0 ? 1 : 0);
