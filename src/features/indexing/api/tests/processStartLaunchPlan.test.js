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
  const snapshotsDir = optionOverrides.snapshotsDir || makeTmpDir();
  return {
    snapshotsDir,
    result: buildProcessStartLaunchPlan({
      body: {
        category: 'mouse',
        mode: 'indexlab',
        productId: 'mouse-acme-orbit-x1',
        ...bodyOverrides,
      },
      helperRoot: path.resolve('category_authority'),
      outputRoot: path.resolve('gui-output-root'),
      indexLabRoot: path.resolve('gui-indexlab-root'),
      snapshotsDir,
      env: {},
      pathApi: path,
      buildRunIdFn: () => 'generated-run-1234',
      ...optionOverrides,
    }),
  };
}

test('buildProcessStartLaunchPlan normalizes launch request into preflight paths, cli args, and env overrides', () => {
  const overrideRoot = makeTmpDir();
  const { result, snapshotsDir } = buildPlan({
    requestedRunId: 'bad',
    categoryAuthorityRoot: overrideRoot,
    fields: ['dpi', 'weight', ''],
    providers: ['manufacturer', ' search '],
    discoveryEnabled: true,
    searchEngines: 'bing,brave,duckduckgo',
    profile: 'thorough',
    dryRun: true,
    localOutputRoot: path.resolve('body-local-output-root'),
    indexlabOut: path.resolve('body-indexlab-root'),
    specDbDir: path.resolve('body-spec-db-root'),
    maxRunSeconds: 600,
    llmFallbackEnabled: false,
  });
  try {
    assert.equal(result.ok, true);
    assert.equal(result.requestedRunId, 'generated-run-1234');
    assert.equal(result.replaceRunning, true);
    assert.equal(result.effectiveHelperRoot, overrideRoot);
    assert.deepEqual(result.generatedRulesCandidates, [
      path.join(overrideRoot, 'mouse', '_generated', 'field_rules.json'),
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
      '--fields',
      'dpi,weight',
      '--providers',
      'manufacturer,search',
      '--search-engines',
      'bing,brave,duckduckgo',
      '--out',
      path.resolve('body-indexlab-root'),
      '--profile',
      'thorough',
      '--dry-run',
    ]);

    assert.equal(result.envOverrides.LOCAL_OUTPUT_ROOT, path.resolve('body-local-output-root'));
    assert.equal(result.envOverrides.SPEC_DB_DIR, path.resolve('body-spec-db-root'));
    assert.equal(result.envOverrides.CATEGORY_AUTHORITY_ROOT, overrideRoot);
    // WHY: Plan 05 Step 6 — runtime settings are snapshot-only, not individual env vars.
    assert.equal(Object.hasOwn(result.envOverrides, 'MAX_RUN_SECONDS'), false,
      'MAX_RUN_SECONDS is snapshot-only');
    assert.equal(Object.hasOwn(result.envOverrides, 'LLM_ENABLED'), false,
      'LLM_ENABLED env var retired');
    assert.equal(Object.hasOwn(result.envOverrides, 'LLM_PLAN_FALLBACK_MODEL'), false,
      'LLM_PLAN_FALLBACK_MODEL is snapshot-only');
    assert.ok(
      result.envOverrides.RUNTIME_SETTINGS_SNAPSHOT.startsWith(snapshotsDir),
      'snapshot path is inside the test-provided snapshotsDir',
    );
    assert.equal(fs.existsSync(result.envOverrides.RUNTIME_SETTINGS_SNAPSHOT), true);
  } finally {
    cleanup(overrideRoot);
    cleanup(snapshotsDir);
  }
});

test('buildProcessStartLaunchPlan rejects unsupported process mode', () => {
  const { result, snapshotsDir } = buildPlan({ mode: 'legacy' });
  try {
    assert.deepEqual(result, {
      ok: false,
      status: 400,
      body: {
        error: 'unsupported_process_mode',
        message: 'Only indexlab mode is supported in GUI process/start.',
      },
    });
  } finally {
    cleanup(snapshotsDir);
  }
});

test('buildProcessStartLaunchPlan passes searchEngines through to CLI args', () => {
  const { result, snapshotsDir } = buildPlan({ searchEngines: 'bing,brave' });
  try {
    assert.equal(result.ok, true);
    assert.ok(result.cliArgs.includes('--search-engines'), 'includes --search-engines flag');
    assert.ok(result.cliArgs.includes('bing,brave'), 'includes engine CSV value');
  } finally {
    cleanup(snapshotsDir);
  }
});

