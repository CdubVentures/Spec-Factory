import { describe, it } from 'node:test';
import { ok, strictEqual } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRuntimeSettingsSnapshot } from '../../../../../core/config/runtimeSettingsSnapshot.js';
import { buildProcessStartLaunchPlan } from '../processStartLaunchPlan.js';

function cleanup(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // Best-effort test cleanup.
  }
}

function createLaunchPlanHarness() {
  const categoryAuthorityRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-launch-plan-'));
  const snapshotsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-snapshots-'));

  return {
    categoryAuthorityRoot,
    snapshotsDir,
    buildRequest(overrides = {}) {
      return {
        category: 'mouse',
        mode: 'indexlab',
        productId: 'mouse-test-product-1',
        replaceRunning: true,
        categoryAuthorityRoot,
        ...overrides,
      };
    },
    buildPlan(bodyOverrides = {}, optionOverrides = {}) {
      return buildProcessStartLaunchPlan({
        body: this.buildRequest(bodyOverrides),
        helperRoot: path.resolve('category_authority'),
        outputRoot: path.resolve('test-output'),
        indexLabRoot: path.resolve('test-indexlab'),
        snapshotsDir,
        env: {},
        pathApi: path,
        buildRunIdFn: () => 'test-run-id-000',
        ...optionOverrides,
      });
    },
    cleanup() {
      cleanup(categoryAuthorityRoot);
      cleanup(snapshotsDir);
    },
  };
}

describe('buildProcessStartLaunchPlan contract', () => {
  it('returns a runnable launch plan for a valid request', (t) => {
    const harness = createLaunchPlanHarness();
    t.after(() => harness.cleanup());

    const result = harness.buildPlan({
      indexlabOut: path.resolve('custom-indexlab-output'),
    });

    strictEqual(result.ok, true);
    strictEqual(result.requestedRunId, 'test-run-id-000');
    strictEqual(result.replaceRunning, true);
    strictEqual(result.effectiveHelperRoot, path.resolve(harness.categoryAuthorityRoot));
    ok(result.cliArgs.includes('indexlab'));
    ok(result.cliArgs.includes('--local'));
    ok(result.cliArgs.includes('--product-id'));
    ok(result.cliArgs.includes('mouse-test-product-1'));
    ok(result.cliArgs.includes('--out'));
    ok(result.cliArgs.includes(path.resolve('custom-indexlab-output')));
  });

  it('writes a runtime settings snapshot with settings but not run-control fields', (t) => {
    const harness = createLaunchPlanHarness();
    t.after(() => harness.cleanup());

    const result = harness.buildPlan({
      dryRun: true,
      maxRunSeconds: 600,
      searchEngines: 'google',
    });

    strictEqual(result.ok, true);
    ok(result.envOverrides.RUNTIME_SETTINGS_SNAPSHOT);

    const snapshot = readRuntimeSettingsSnapshot(result.envOverrides.RUNTIME_SETTINGS_SNAPSHOT);
    strictEqual(snapshot.snapshotId, 'test-run-id-000');
    strictEqual(snapshot.source, 'gui');
    strictEqual(snapshot.settings.dryRun, true);
    strictEqual(snapshot.settings.maxRunSeconds, 600);
    strictEqual(snapshot.settings.searchEngines, 'google');
    strictEqual(snapshot.settings.category, undefined);
    strictEqual(snapshot.settings.productId, undefined);
    strictEqual(snapshot.settings.mode, undefined);
  });

  // WHY: Plan 05 Step 6 — runtime settings are snapshot-only. Env vars no longer carry them.
  it('does not forward runtime settings as individual env vars (snapshot-only)', (t) => {
    const harness = createLaunchPlanHarness();
    t.after(() => harness.cleanup());

    const result = harness.buildPlan({
      dryRun: false,
      maxRunSeconds: 600,
    });

    strictEqual(result.ok, true);
    strictEqual(Object.hasOwn(result.envOverrides, 'DRY_RUN'), false);
    strictEqual(Object.hasOwn(result.envOverrides, 'MAX_RUN_SECONDS'), false);
    ok(result.envOverrides.RUNTIME_SETTINGS_SNAPSHOT, 'snapshot path must be set');
  });

  it('rejects unsupported modes', (t) => {
    const harness = createLaunchPlanHarness();
    t.after(() => harness.cleanup());

    const result = harness.buildPlan({ mode: 'unsupported' });
    strictEqual(result.ok, false);
    strictEqual(result.status, 400);
  });
});
