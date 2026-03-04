import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

const SETTINGS_DEFAULTS_PATH = path.resolve('src/shared/settingsDefaults.js');
const SETTINGS_CONTRACT_PATH = path.resolve('src/api/services/settingsContract.js');
const RUNTIME_FLOW_PATH = path.resolve('tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx');
const INDEXING_PAGE_PATH = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const RUNTIME_DOMAIN_PATH = path.resolve('tools/gui-react/src/stores/runtimeSettingsDomain.ts');
const INFRA_ROUTES_PATH = path.resolve('src/api/routes/infraRoutes.js');

test('runtime screencast knobs are defaulted, contract-backed, surfaced in runtime flow, and forwarded to process start env', async () => {
  const settingsDefaultsModule = await import(pathToFileURL(SETTINGS_DEFAULTS_PATH).href);
  const settingsContractModule = await import(pathToFileURL(SETTINGS_CONTRACT_PATH).href);
  const runtimeFlowText = readText(RUNTIME_FLOW_PATH);
  const indexingText = readText(INDEXING_PAGE_PATH);
  const runtimeDomainText = readText(RUNTIME_DOMAIN_PATH);
  const infraRoutesText = readText(INFRA_ROUTES_PATH);

  const runtimeDefaults = settingsDefaultsModule.SETTINGS_DEFAULTS?.runtime || {};
  const routeGet = settingsContractModule.RUNTIME_SETTINGS_ROUTE_GET || {};
  const routePut = settingsContractModule.RUNTIME_SETTINGS_ROUTE_PUT || {};
  const runtimeKeys = new Set(settingsContractModule.RUNTIME_SETTINGS_KEYS || []);

  const requiredBoolKeys = [
    'runtimeScreencastEnabled',
  ];
  const requiredIntKeys = [
    'runtimeScreencastFps',
    'runtimeScreencastQuality',
    'runtimeScreencastMaxWidth',
    'runtimeScreencastMaxHeight',
  ];

  for (const key of requiredBoolKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(runtimeDefaults, key),
      true,
      `runtime defaults should include ${key}`,
    );
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(
      Object.prototype.hasOwnProperty.call(routeGet.boolMap || {}, key),
      true,
      `runtime GET bool map should expose ${key}`,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(routePut.boolMap || {}, key),
      true,
      `runtime PUT bool map should expose ${key}`,
    );
    assert.equal(
      runtimeDomainText.includes(`${key}: input.${key}`),
      true,
      `runtime payload serializer should include ${key}`,
    );
    assert.equal(
      indexingText.includes(`${key},`),
      true,
      `indexing payload builder should include ${key}`,
    );
  }

  for (const key of requiredIntKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(runtimeDefaults, key),
      true,
      `runtime defaults should include ${key}`,
    );
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(
      Object.prototype.hasOwnProperty.call(routeGet.intMap || {}, key),
      true,
      `runtime GET int map should expose ${key}`,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(routePut.intRangeMap || {}, key),
      true,
      `runtime PUT int map should expose ${key}`,
    );
    assert.equal(
      runtimeDomainText.includes(`${key}: parseRuntimeInt(`),
      true,
      `runtime payload serializer should include integer parser for ${key}`,
    );
    assert.equal(
      indexingText.includes(`${key},`),
      true,
      `indexing payload builder should include ${key}`,
    );
  }

  assert.equal(
    runtimeFlowText.includes('label="Runtime Screencast Enabled"'),
    true,
    'runtime flow should expose runtime screencast enabled toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Runtime Screencast FPS"'),
    true,
    'runtime flow should expose runtime screencast fps control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Runtime Screencast Quality"'),
    true,
    'runtime flow should expose runtime screencast quality control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Runtime Screencast Max Width"'),
    true,
    'runtime flow should expose runtime screencast max width control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Runtime Screencast Max Height"'),
    true,
    'runtime flow should expose runtime screencast max height control',
  );

  assert.equal(
    infraRoutesText.includes('runtimeScreencastEnabled'),
    true,
    'process start infra route should accept runtime screencast enabled override',
  );
  assert.equal(
    infraRoutesText.includes('RUNTIME_SCREENCAST_ENABLED'),
    true,
    'process start infra route should map runtime screencast enabled env override',
  );
  assert.equal(
    infraRoutesText.includes('RUNTIME_SCREENCAST_FPS'),
    true,
    'process start infra route should map runtime screencast fps env override',
  );
  assert.equal(
    infraRoutesText.includes('RUNTIME_SCREENCAST_QUALITY'),
    true,
    'process start infra route should map runtime screencast quality env override',
  );
  assert.equal(
    infraRoutesText.includes('RUNTIME_SCREENCAST_MAX_WIDTH'),
    true,
    'process start infra route should map runtime screencast max width env override',
  );
  assert.equal(
    infraRoutesText.includes('RUNTIME_SCREENCAST_MAX_HEIGHT'),
    true,
    'process start infra route should map runtime screencast max height env override',
  );
});
