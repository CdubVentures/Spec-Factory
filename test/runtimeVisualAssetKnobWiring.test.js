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
const CONFIG_PATH = path.resolve('src/config.js');

test('runtime visual asset knobs are defaulted, contract-backed, surfaced in runtime flow, and forwarded to process start env', async () => {
  const settingsDefaultsModule = await import(pathToFileURL(SETTINGS_DEFAULTS_PATH).href);
  const settingsContractModule = await import(pathToFileURL(SETTINGS_CONTRACT_PATH).href);
  const runtimeFlowText = readText(RUNTIME_FLOW_PATH);
  const indexingText = readText(INDEXING_PAGE_PATH);
  const runtimeDomainText = readText(RUNTIME_DOMAIN_PATH);
  const infraRoutesText = readText(INFRA_ROUTES_PATH);
  const configText = readText(CONFIG_PATH);

  const runtimeDefaults = settingsDefaultsModule.SETTINGS_DEFAULTS?.runtime || {};
  const routeGet = settingsContractModule.RUNTIME_SETTINGS_ROUTE_GET || {};
  const routePut = settingsContractModule.RUNTIME_SETTINGS_ROUTE_PUT || {};
  const runtimeKeys = new Set(settingsContractModule.RUNTIME_SETTINGS_KEYS || []);

  const requiredStringKeys = [
    'visualAssetReviewFormat',
    'visualAssetHeroSelectorMapJson',
  ];
  const requiredBoolKeys = [
    'visualAssetCaptureEnabled',
    'visualAssetStoreOriginal',
    'visualAssetPhashEnabled',
    'chartExtractionEnabled',
  ];
  const requiredIntKeys = [
    'visualAssetCaptureMaxPerSource',
    'visualAssetRetentionDays',
    'visualAssetReviewLgMaxSide',
    'visualAssetReviewSmMaxSide',
    'visualAssetReviewLgQuality',
    'visualAssetReviewSmQuality',
    'visualAssetRegionCropMaxSide',
    'visualAssetRegionCropQuality',
    'visualAssetLlmMaxBytes',
    'visualAssetMinWidth',
    'visualAssetMinHeight',
    'visualAssetMaxPhashDistance',
  ];
  const requiredFloatKeys = [
    'visualAssetMinSharpness',
    'visualAssetMinEntropy',
  ];

  for (const key of requiredStringKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.stringMap || {}, key), true, `runtime GET string map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.stringFreeMap || {}, key), true, `runtime PUT string map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: String(input.${key} || '').trim()`), true, `runtime payload serializer should include normalized string for ${key}`);
    assert.equal(indexingText.includes(`${key},`), true, `indexing payload builder should include ${key}`);
  }

  for (const key of requiredBoolKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.boolMap || {}, key), true, `runtime GET bool map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.boolMap || {}, key), true, `runtime PUT bool map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: input.${key}`), true, `runtime payload serializer should include ${key}`);
    assert.equal(indexingText.includes(`${key},`), true, `indexing payload builder should include ${key}`);
  }

  for (const key of requiredIntKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.intMap || {}, key), true, `runtime GET int map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.intRangeMap || {}, key), true, `runtime PUT int map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: parseRuntimeInt(`), true, `runtime payload serializer should include integer parser for ${key}`);
    assert.equal(indexingText.includes(`${key},`), true, `indexing payload builder should include ${key}`);
  }

  for (const key of requiredFloatKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.floatMap || {}, key), true, `runtime GET float map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.floatRangeMap || {}, key), true, `runtime PUT float map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: parseRuntimeFloat(`), true, `runtime payload serializer should include float parser for ${key}`);
    assert.equal(indexingText.includes(`${key},`), true, `indexing payload builder should include ${key}`);
  }

  assert.equal(runtimeFlowText.includes('label="Visual Asset Capture Enabled"'), true, 'runtime flow should expose visual asset capture toggle');
  assert.equal(runtimeFlowText.includes('label="Visual Asset Capture Max Per Source"'), true, 'runtime flow should expose visual asset per-source cap');
  assert.equal(runtimeFlowText.includes('label="Visual Asset Store Original"'), true, 'runtime flow should expose visual asset store-original toggle');
  assert.equal(runtimeFlowText.includes('label="Visual Asset Retention Days"'), true, 'runtime flow should expose visual asset retention days');
  assert.equal(runtimeFlowText.includes('label="Visual Asset pHash Enabled"'), true, 'runtime flow should expose visual asset pHash toggle');
  assert.equal(runtimeFlowText.includes('label="Visual Asset Review Format"'), true, 'runtime flow should expose review format');
  assert.equal(runtimeFlowText.includes('label="Visual Asset Hero Selector Map JSON"'), true, 'runtime flow should expose hero selector map json');
  assert.equal(runtimeFlowText.includes('label="Chart Extraction Enabled"'), true, 'runtime flow should expose chart extraction toggle');
  assert.equal(runtimeFlowText.includes('label="Chart Vision Fallback Enabled"'), false, 'runtime flow should not expose chart vision fallback toggle');

  assert.equal(infraRoutesText.includes('VISUAL_ASSET_CAPTURE_ENABLED'), true, 'process start route should forward VISUAL_ASSET_CAPTURE_ENABLED');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_CAPTURE_MAX_PER_SOURCE'), true, 'process start route should forward VISUAL_ASSET_CAPTURE_MAX_PER_SOURCE');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_STORE_ORIGINAL'), true, 'process start route should forward VISUAL_ASSET_STORE_ORIGINAL');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_RETENTION_DAYS'), true, 'process start route should forward VISUAL_ASSET_RETENTION_DAYS');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_PHASH_ENABLED'), true, 'process start route should forward VISUAL_ASSET_PHASH_ENABLED');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_REVIEW_FORMAT'), true, 'process start route should forward VISUAL_ASSET_REVIEW_FORMAT');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_REVIEW_LG_MAX_SIDE'), true, 'process start route should forward VISUAL_ASSET_REVIEW_LG_MAX_SIDE');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_REVIEW_SM_MAX_SIDE'), true, 'process start route should forward VISUAL_ASSET_REVIEW_SM_MAX_SIDE');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_REVIEW_LG_QUALITY'), true, 'process start route should forward VISUAL_ASSET_REVIEW_LG_QUALITY');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_REVIEW_SM_QUALITY'), true, 'process start route should forward VISUAL_ASSET_REVIEW_SM_QUALITY');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_REGION_CROP_MAX_SIDE'), true, 'process start route should forward VISUAL_ASSET_REGION_CROP_MAX_SIDE');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_REGION_CROP_QUALITY'), true, 'process start route should forward VISUAL_ASSET_REGION_CROP_QUALITY');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_LLM_MAX_BYTES'), true, 'process start route should forward VISUAL_ASSET_LLM_MAX_BYTES');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_MIN_WIDTH'), true, 'process start route should forward VISUAL_ASSET_MIN_WIDTH');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_MIN_HEIGHT'), true, 'process start route should forward VISUAL_ASSET_MIN_HEIGHT');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_MIN_SHARPNESS'), true, 'process start route should forward VISUAL_ASSET_MIN_SHARPNESS');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_MIN_ENTROPY'), true, 'process start route should forward VISUAL_ASSET_MIN_ENTROPY');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_MAX_PHASH_DISTANCE'), true, 'process start route should forward VISUAL_ASSET_MAX_PHASH_DISTANCE');
  assert.equal(infraRoutesText.includes('VISUAL_ASSET_HERO_SELECTOR_MAP_JSON'), true, 'process start route should forward VISUAL_ASSET_HERO_SELECTOR_MAP_JSON');
  assert.equal(infraRoutesText.includes('CHART_EXTRACTION_ENABLED'), true, 'process start route should forward CHART_EXTRACTION_ENABLED');
  assert.equal(infraRoutesText.includes('CHART_VISION_FALLBACK_ENABLED'), false, 'process start route should not forward CHART_VISION_FALLBACK_ENABLED');
  assert.equal(configText.includes("parseBoolEnv('CHART_VISION_FALLBACK_ENABLED', false)"), false, 'runtime config should not parse CHART_VISION_FALLBACK_ENABLED');
});
