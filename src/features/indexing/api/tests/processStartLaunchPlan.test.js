import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildProcessStartLaunchPlan } from '../builders/processStartLaunchPlan.js';

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sf-launch-plan-'));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

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
  const overrideRoot = makeTmpDir();
  const localStorageRoot = path.resolve('C:/SpecFactoryRuns');
  try {
    const result = buildPlan({
      requestedRunId: 'bad',
      categoryAuthorityRoot: overrideRoot,
      seedUrls: [' https://example.com/a ', '', 'https://example.com/b'],
      fields: ['dpi', 'weight', ''],
      providers: ['manufacturer', ' search '],
      discoveryEnabled: true,
      searchEngines: 'bing,brave,duckduckgo',
      profile: 'thorough',
      dryRun: true,
      localOutputRoot: path.resolve('ignored-local-output-root'),
      indexlabOut: path.resolve('ignored-indexlab-root'),
      specDbDir: path.resolve('ignored-spec-db-root'),
      llmExtractionCacheDir: path.resolve('ignored-cache-root'),
      fetchCandidateSources: false,
      runtimeTraceFetchRing: 9_999,
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
      '--search-engines',
      'bing,brave,duckduckgo',
      '--out',
      path.join(localStorageRoot, 'indexlab'),
      '--profile',
      'thorough',
      '--dry-run',
    ]);

    // WHY: fetchCandidateSources retired - always true, no env override emitted.
    assert.equal(result.envOverrides.FETCH_CANDIDATE_SOURCES, undefined);
    assert.equal(result.envOverrides.LOCAL_OUTPUT_ROOT, path.join(localStorageRoot, 'output'));
    assert.equal(result.envOverrides.SPEC_DB_DIR, path.join(localStorageRoot, '.specfactory_tmp'));
    assert.equal(
      result.envOverrides.LLM_EXTRACTION_CACHE_DIR,
      path.join(localStorageRoot, '.specfactory_tmp', 'llm_cache'),
    );
    assert.equal(result.envOverrides.HELPER_FILES_ROOT, overrideRoot);
    assert.equal(result.envOverrides.CATEGORY_AUTHORITY_ROOT, overrideRoot);
    assert.equal(result.envOverrides.RUNTIME_TRACE_FETCH_RING, '2000');
    assert.equal(
      Object.hasOwn(result.envOverrides, 'LLM_ENABLED'),
      false,
      'LLM_ENABLED env var retired - LLM is core, not a knob',
    );
    assert.equal(result.envOverrides.LLM_PLAN_FALLBACK_MODEL, '');
    assert.ok(
      result.envOverrides.RUNTIME_SETTINGS_SNAPSHOT.startsWith(path.join(overrideRoot, '_runtime', 'snapshots')),
      'snapshot path stays inside the requested override root',
    );
    assert.equal(fs.existsSync(result.envOverrides.RUNTIME_SETTINGS_SNAPSHOT), true);
  } finally {
    cleanup(overrideRoot);
  }
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

test('buildProcessStartLaunchPlan passes searchEngines through to CLI args', () => {
  const result = buildPlan({ searchEngines: 'bing,brave' });
  assert.equal(result.ok, true);
  assert.ok(result.cliArgs.includes('--search-engines'), 'includes --search-engines flag');
  assert.ok(result.cliArgs.includes('bing,brave'), 'includes engine CSV value');
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
