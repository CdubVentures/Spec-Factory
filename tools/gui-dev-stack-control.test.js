import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SPEC_FACTORY_PORTS,
  getSpecFactoryServerContract,
  planSpecFactoryAction,
} from './dev-stack-control.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

describe('Spec Factory dev stack control contract', () => {
  it('keeps the launcher on port 8788 for both API and browser entry', () => {
    assert.deepEqual(SPEC_FACTORY_PORTS, {
      api: 8788,
      gui: 8788,
    });
  });

  it('assigns stable urls while keeping 8788 as the single browser endpoint', () => {
    const contract = getSpecFactoryServerContract(root);

    assert.equal(contract.api.pidFile, path.join(root, '.server-state', 'spec-factory-api.pid'));
    assert.equal(contract.api.browserUrl, 'http://127.0.0.1:8788');
    assert.equal(contract.gui.browserUrl, 'http://127.0.0.1:8788');
  });

  it('launches the managed api directly with node instead of cmd/npm shell wrappers', () => {
    const contract = getSpecFactoryServerContract(root);

    assert.equal(contract.api.command, process.execPath);
    assert.deepEqual(contract.api.args, [
      path.join(root, 'src', 'api', 'guiServer.js'),
      '--port',
      '8788',
      '--local',
    ]);
  });

  it('starts the 8788 app when the launcher is down', () => {
    const plan = planSpecFactoryAction({
      action: 'start-stack',
      root,
      apiTrackedPidRunning: false,
      apiPortOccupied: false,
      guiTrackedPidRunning: false,
      guiPortOccupied: false,
    });

    assert.equal(plan.ok, true);
    assert.equal(plan.startApi, true);
    assert.equal(plan.startGui, false);
    assert.equal(plan.openUrl, 'http://127.0.0.1:8788');
  });

  it('reuses the running 8788 app instead of spawning duplicate windows', () => {
    const plan = planSpecFactoryAction({
      action: 'start-stack',
      root,
      apiTrackedPidRunning: true,
      apiPortOccupied: true,
      guiTrackedPidRunning: true,
      guiPortOccupied: true,
    });

    assert.equal(plan.ok, true);
    assert.equal(plan.startApi, false);
    assert.equal(plan.startGui, false);
    assert.equal(plan.openUrl, 'http://127.0.0.1:8788');
  });

  it('does not require a second GUI process when only the API side is tracked', () => {
    const plan = planSpecFactoryAction({
      action: 'start-stack',
      root,
      apiTrackedPidRunning: true,
      apiPortOccupied: true,
      guiTrackedPidRunning: false,
      guiPortOccupied: false,
    });

    assert.equal(plan.ok, true);
    assert.equal(plan.startApi, false);
    assert.equal(plan.startGui, false);
    assert.equal(plan.openUrl, 'http://127.0.0.1:8788');
  });

  it('blocks startup when an untracked process owns port 8788', () => {
    const plan = planSpecFactoryAction({
      action: 'start-stack',
      root,
      apiTrackedPidRunning: false,
      apiPortOccupied: true,
      guiTrackedPidRunning: false,
      guiPortOccupied: false,
    });

    assert.equal(plan.ok, false);
    assert.match(plan.error ?? '', /port 8788 is already in use/i);
  });

  it('starts api-only mode without spawning the GUI', () => {
    const plan = planSpecFactoryAction({
      action: 'start-api',
      root,
      apiTrackedPidRunning: false,
      apiPortOccupied: false,
      guiTrackedPidRunning: false,
      guiPortOccupied: false,
    });

    assert.equal(plan.ok, true);
    assert.equal(plan.startApi, true);
    assert.equal(plan.startGui, false);
    assert.equal(plan.openUrl, 'http://127.0.0.1:8788');
  });

  it('refresh always opens the 8788 entry point', () => {
    const guiPlan = planSpecFactoryAction({
      action: 'refresh-page',
      root,
      apiTrackedPidRunning: false,
      apiPortOccupied: true,
      guiTrackedPidRunning: true,
      guiPortOccupied: true,
    });
    const apiPlan = planSpecFactoryAction({
      action: 'refresh-page',
      root,
      apiTrackedPidRunning: true,
      apiPortOccupied: true,
      guiTrackedPidRunning: false,
      guiPortOccupied: false,
    });

    assert.match(guiPlan.openUrl ?? '', /^http:\/\/127\.0\.0\.1:8788\/\?refresh=\d+$/);
    assert.match(apiPlan.openUrl ?? '', /^http:\/\/127\.0\.0\.1:8788\/\?refresh=\d+$/);
  });
});
