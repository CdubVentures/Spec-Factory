import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { buildProcessStartLaunchPlan } from '../builders/processStartLaunchPlan.js';

function buildPlan(bodyOverrides = {}, optionOverrides = {}) {
  return buildProcessStartLaunchPlan({
    body: {
      category: 'mouse',
      mode: 'indexlab',
      productId: 'mouse-acme-orbit-x1',
      ...bodyOverrides,
    },
    helperRoot: path.resolve('category_authority'),
    outputRoot: path.resolve('gui-output-root'),
    indexLabRoot: path.resolve('gui-indexlab-root'),
    runDataStorageState: {
      enabled: false,
      destinationType: 'local',
      localDirectory: '',
    },
    env: {},
    pathApi: path,
    buildRunIdFn: () => 'generated-run-1234',
    ...optionOverrides,
  });
}

test('buildProcessStartLaunchPlan normalizes launch request into preflight paths, cli args, and env overrides', () => {
  const overrideRoot = path.resolve('category_authority_override');
  const localStorageRoot = path.resolve('C:/SpecFactoryRuns');
  const result = buildPlan({
    requestedRunId: 'bad',
    categoryAuthorityRoot: overrideRoot,
    seedUrls: [' https://example.com/a ', '', 'https://example.com/b'],
    fields: ['dpi', 'weight', ''],
    providers: ['manufacturer', ' search '],
    discoveryEnabled: true,
    searchProvider: 'SEARXNG',
    profile: 'thorough',
    dryRun: true,
    localOutputRoot: path.resolve('ignored-local-output-root'),
    indexlabOut: path.resolve('ignored-indexlab-root'),
    specDbDir: path.resolve('ignored-spec-db-root'),
    llmExtractionCacheDir: path.resolve('ignored-cache-root'),
    fetchCandidateSources: false,
    runtimeTraceFetchRing: 9_999,
    llmModelTriage: 'triage-model',
    llmFallbackEnabled: false,
  }, {
    runDataStorageState: {
      enabled: true,
      destinationType: 'local',
      localDirectory: localStorageRoot,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.requestedRunId, 'generated-run-1234');
  assert.equal(result.replaceRunning, true);
  assert.equal(result.effectiveHelperRoot, overrideRoot);
  assert.deepEqual(result.generatedRulesCandidates, [
    path.join(overrideRoot, 'mouse', '_generated', 'field_rules.json'),
    path.join(overrideRoot, 'mouse', '_generated', 'field_rules.runtime.json'),
  ]);

  assert.deepEqual(result.cliArgs, [
    'indexlab',
    '--local',
    '--run-id',
    'generated-run-1234',
    '--category',
    'mouse',
    '--product-id',
    'mouse-acme-orbit-x1',
    '--seed-urls',
    'https://example.com/a,https://example.com/b',
    '--fields',
    'dpi,weight',
    '--providers',
    'manufacturer,search',
    '--search-provider',
    'searxng',
    '--out',
    path.join(localStorageRoot, 'indexlab'),
    '--profile',
    'thorough',
    '--dry-run',
  ]);

  assert.equal(result.envOverrides.FETCH_CANDIDATE_SOURCES, 'false');
  assert.equal(result.envOverrides.LOCAL_OUTPUT_ROOT, path.join(localStorageRoot, 'output'));
  assert.equal(result.envOverrides.SPEC_DB_DIR, path.join(localStorageRoot, '.specfactory_tmp'));
  assert.equal(
    result.envOverrides.LLM_EXTRACTION_CACHE_DIR,
    path.join(localStorageRoot, '.specfactory_tmp', 'llm_cache'),
  );
  assert.equal(result.envOverrides.HELPER_FILES_ROOT, overrideRoot);
  assert.equal(result.envOverrides.CATEGORY_AUTHORITY_ROOT, overrideRoot);
  assert.equal(result.envOverrides.RUNTIME_TRACE_FETCH_RING, '2000');
  assert.equal(result.envOverrides.LLM_MODEL_TRIAGE, 'triage-model');
  assert.equal(result.envOverrides.CORTEX_MODEL_RERANK_FAST, 'triage-model');
  assert.equal(result.envOverrides.CORTEX_MODEL_SEARCH_FAST, 'triage-model');
  assert.equal(
    Object.hasOwn(result.envOverrides, 'LLM_ENABLED'),
    false,
    'LLM_ENABLED env var retired — LLM is core, not a knob',
  );
  assert.equal(result.envOverrides.LLM_PLAN_FALLBACK_MODEL, '');
  assert.equal(result.envOverrides.LLM_EXTRACT_FALLBACK_MODEL, '');
  assert.equal(result.envOverrides.LLM_VALIDATE_FALLBACK_MODEL, '');
  assert.equal(result.envOverrides.LLM_WRITE_FALLBACK_MODEL, '');
});

test('buildProcessStartLaunchPlan rejects unsupported process mode', () => {
  const result = buildPlan({ mode: 'legacy' });
  assert.deepEqual(result, {
    ok: false,
    status: 400,
    body: {
      error: 'unsupported_process_mode',
      message: 'Only indexlab mode is supported in GUI process/start.',
    },
  });
});

test('buildProcessStartLaunchPlan rejects unsupported search provider', () => {
  const result = buildPlan({ searchProvider: 'duckduckgo' });
  assert.deepEqual(result, {
    ok: false,
    status: 400,
    body: {
      error: 'invalid_search_provider',
      message: "Unsupported searchProvider 'duckduckgo'.",
    },
  });
});

test('buildProcessStartLaunchPlan validates object-shaped JSON map overrides', () => {
  const invalidJsonResult = buildPlan({
    dynamicFetchPolicyMapJson: '{bad json',
  });
  assert.deepEqual(invalidJsonResult, {
    ok: false,
    status: 400,
    body: {
      error: 'invalid_dynamic_fetch_policy_json',
      message: 'dynamicFetchPolicyMapJson must be valid JSON.',
    },
  });

  const arrayResult = buildPlan({
    dynamicFetchPolicyMapJson: '[]',
  });
  assert.deepEqual(arrayResult, {
    ok: false,
    status: 400,
    body: {
      error: 'invalid_dynamic_fetch_policy_json',
      message: 'dynamicFetchPolicyMapJson must be a JSON object.',
    },
  });
});
