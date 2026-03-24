import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_BOOTSTRAP_KEYS = [
  'config',
  'configGate',
  'PORT',
  'HELPER_ROOT',
  'OUTPUT_ROOT',
  'INDEXLAB_ROOT',
  'LAUNCH_CWD',
  'storage',
  'runDataStorageState',
  'getIndexLabRoot',
  'broadcastWs',
  'setupWatchers',
  'attachWebSocketUpgrade',
  'getLastScreencastFrame',
  'processStatus',
  'startProcess',
  'stopProcess',
  'isProcessRunning',
  'waitForProcessExit',
  'getSearxngStatus',
  'startSearxngStack',
  'jsonRes',
  'corsHeaders',
  'readJsonBody',
  'safeReadJson',
  'safeStat',
  'listFiles',
  'listDirs',
  'readJsonlEvents',
  'safeJoin',
  'canonicalSlugify',
  'invalidateFieldRulesCache',
  'loadProductCatalog',
  'loadCategoryConfig',
  'buildCatalog',
  'patchCompiledComponentDb',
  'markEnumSuggestionStatusBound',
];

const REQUIRED_ENVIRONMENT_KEYS = [
  'config',
  'configGate',
  'PORT',
  'HELPER_ROOT',
  'OUTPUT_ROOT',
  'INDEXLAB_ROOT',
  'LAUNCH_CWD',
  'storage',
  'runDataStorageState',
  'runDataArchiveStorage',
  'getRunDataArchiveStorage',
  'resolveProjectPath',
  'cleanVariant',
  'catalogKey',
  'markEnumSuggestionStatusBound',
  'userSettings',
];

function extractReturnKeys(sourceText) {
  const returnMatch = sourceText.match(/return\s*\{([\s\S]*?)\};\s*\}/);
  if (!returnMatch) return { keys: [], spreads: [] };
  const returnBody = returnMatch[1].replace(/\/\/.*$/gm, '');
  const spreads = [...returnBody.matchAll(/\.\.\.(\w+)/g)].map((match) => match[1]);
  const withoutSpreads = returnBody.replace(/\.\.\.\w+/g, '');
  const keys = withoutSpreads.match(/\b([a-zA-Z_]\w*)\b/g) || [];
  return { keys: [...new Set(keys)], spreads };
}

function collectBootstrapReturnKeys() {
  const assemblerSource = fs.readFileSync(path.resolve('src/api/serverBootstrap.js'), 'utf8');
  const { keys: directKeys, spreads } = extractReturnKeys(assemblerSource);
  const spreadKeys = [];

  for (const spreadName of spreads) {
    if (spreadName !== 'domain') continue;
    const domainSource = fs.readFileSync(
      path.resolve('src/api/bootstrap/createBootstrapDomainRuntimes.js'),
      'utf8',
    );
    spreadKeys.push(...extractReturnKeys(domainSource).keys);
  }

  return [...new Set([...directKeys, ...spreadKeys])];
}

test('serverBootstrap exposes the required route-context contract', () => {
  const bootstrapKeys = collectBootstrapReturnKeys();

  assert.equal(bootstrapKeys.length, new Set(bootstrapKeys).size, 'bootstrap return keys must be unique');
  for (const key of REQUIRED_BOOTSTRAP_KEYS) {
    assert.ok(bootstrapKeys.includes(key), `missing bootstrap capability: ${key}`);
  }
});

test('createBootstrapEnvironment exposes the required environment contract', () => {
  const source = fs.readFileSync(
    path.resolve('src/api/bootstrap/createBootstrapEnvironment.js'),
    'utf8',
  );
  const environmentKeys = extractReturnKeys(source).keys;

  assert.equal(environmentKeys.length, new Set(environmentKeys).size, 'environment return keys must be unique');
  for (const key of REQUIRED_ENVIRONMENT_KEYS) {
    assert.ok(environmentKeys.includes(key), `missing environment capability: ${key}`);
  }
});
