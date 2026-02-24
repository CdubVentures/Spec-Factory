import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RUN_PRODUCT = path.resolve('src/pipeline/runProduct.js');
const SEARCH_DISCOVERY = path.resolve('src/discovery/searchDiscovery.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runProduct wires convergence identity and retrieval knobs into runtime behavior', () => {
  const runProductText = readText(RUN_PRODUCT);

  assert.equal(
    runProductText.includes('buildNeedSetIdentityCaps(config)'),
    true,
    'runProduct should derive identity caps from convergence settings',
  );
  assert.equal(
    runProductText.includes('identityCaps: needSetIdentityCaps'),
    true,
    'runProduct should pass identity caps to computeNeedSet',
  );
  assert.equal(
    runProductText.includes('config.needsetCapIdentityLocked'),
    true,
    'runProduct should wire needsetCapIdentityLocked',
  );
  assert.equal(
    runProductText.includes('config.needsetCapIdentityProvisional'),
    true,
    'runProduct should wire needsetCapIdentityProvisional',
  );
  assert.equal(
    runProductText.includes('config.needsetCapIdentityConflict'),
    true,
    'runProduct should wire needsetCapIdentityConflict',
  );
  assert.equal(
    runProductText.includes('config.needsetCapIdentityUnlocked'),
    true,
    'runProduct should wire needsetCapIdentityUnlocked',
  );
  assert.equal(
    runProductText.includes('identityFilterEnabled: Boolean(config.retrievalIdentityFilterEnabled)'),
    true,
    'runProduct should wire retrievalIdentityFilterEnabled into phase07 retrieval options',
  );
});

test('search discovery wires convergence serp triage and source strategy knobs', () => {
  const searchDiscoveryText = readText(SEARCH_DISCOVERY);

  assert.equal(
    searchDiscoveryText.includes('config.serpTriageEnabled'),
    true,
    'search discovery should read serpTriageEnabled',
  );
  assert.equal(
    searchDiscoveryText.includes('config.serpTriageMinScore'),
    true,
    'search discovery should read serpTriageMinScore',
  );
  assert.equal(
    searchDiscoveryText.includes('config.serpTriageMaxUrls'),
    true,
    'search discovery should read serpTriageMaxUrls',
  );
  assert.equal(
    searchDiscoveryText.includes('sourceStrategyRows'),
    true,
    'search discovery should support explicit sourceStrategyRows input for runtime source-strategy usage',
  );
});
