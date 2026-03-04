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
const SETTINGS_MANIFEST_PATH = path.resolve('tools/gui-react/src/stores/settingsManifest.ts');

test('identity gate publish threshold is wired through defaults, manifest, contract, payload serializer, runtime flow, and env bridge', async () => {
  const settingsDefaultsModule = await import(pathToFileURL(SETTINGS_DEFAULTS_PATH).href);
  const settingsContractModule = await import(pathToFileURL(SETTINGS_CONTRACT_PATH).href);
  const runtimeFlowText = readText(RUNTIME_FLOW_PATH);
  const indexingText = readText(INDEXING_PAGE_PATH);
  const runtimeDomainText = readText(RUNTIME_DOMAIN_PATH);
  const infraRoutesText = readText(INFRA_ROUTES_PATH);
  const settingsManifestText = readText(SETTINGS_MANIFEST_PATH);

  const runtimeDefaults = settingsDefaultsModule.SETTINGS_DEFAULTS?.runtime || {};
  const routeGet = settingsContractModule.RUNTIME_SETTINGS_ROUTE_GET || {};
  const routePut = settingsContractModule.RUNTIME_SETTINGS_ROUTE_PUT || {};
  const runtimeKeys = new Set(settingsContractModule.RUNTIME_SETTINGS_KEYS || []);

  assert.equal(
    Object.prototype.hasOwnProperty.call(runtimeDefaults, 'identityGatePublishThreshold'),
    true,
    'runtime defaults should include identityGatePublishThreshold',
  );
  assert.equal(
    runtimeKeys.has('identityGatePublishThreshold'),
    true,
    'runtime key registry should include identityGatePublishThreshold',
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(routeGet.floatMap || {}, 'identityGatePublishThreshold'),
    true,
    'runtime GET float map should expose identityGatePublishThreshold',
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(routePut.floatRangeMap || {}, 'identityGatePublishThreshold'),
    true,
    'runtime PUT float map should expose identityGatePublishThreshold',
  );

  const putRange = routePut.floatRangeMap.identityGatePublishThreshold;
  assert.equal(putRange.cfgKey, 'identityGatePublishThreshold');
  assert.equal(putRange.min, 0);
  assert.equal(putRange.max, 1);

  assert.equal(
    settingsManifestText.includes('identityGatePublishThreshold: number;'),
    true,
    'runtime settings manifest typing should include identityGatePublishThreshold',
  );
  assert.equal(
    runtimeDomainText.includes('identityGatePublishThreshold: parseRuntimeFloat('),
    true,
    'runtime payload serializer should include float parser for identityGatePublishThreshold',
  );
  assert.equal(
    indexingText.includes('identityGatePublishThreshold,'),
    true,
    'indexing payload builder should include identityGatePublishThreshold',
  );
  assert.equal(
    runtimeFlowText.includes('label="Identity Gate Publish Threshold"'),
    true,
    'runtime flow should expose Identity Gate Publish Threshold',
  );
  assert.equal(
    infraRoutesText.includes('IDENTITY_GATE_PUBLISH_THRESHOLD'),
    true,
    'process env override bridge should include IDENTITY_GATE_PUBLISH_THRESHOLD',
  );
});
