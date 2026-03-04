import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RUN_PRODUCT = path.resolve('src/pipeline/runProduct.js');
const RUN_PRODUCT_ORCH_HELPERS = path.resolve('src/pipeline/helpers/runProductOrchestrationHelpers.js');
const SEARCH_DISCOVERY = path.resolve('src/discovery/searchDiscovery.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runProduct wires convergence identity and retrieval knobs into runtime behavior', () => {
  const runProductText = readText(RUN_PRODUCT);
  const orchestrationHelpersText = readText(RUN_PRODUCT_ORCH_HELPERS);

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
    orchestrationHelpersText.includes('config.needsetCapIdentityLocked'),
    true,
    'orchestration helpers should wire needsetCapIdentityLocked',
  );
  assert.equal(
    orchestrationHelpersText.includes('config.needsetCapIdentityProvisional'),
    true,
    'orchestration helpers should wire needsetCapIdentityProvisional',
  );
  assert.equal(
    orchestrationHelpersText.includes('config.needsetCapIdentityConflict'),
    true,
    'orchestration helpers should wire needsetCapIdentityConflict',
  );
  assert.equal(
    orchestrationHelpersText.includes('config.needsetCapIdentityUnlocked'),
    true,
    'orchestration helpers should wire needsetCapIdentityUnlocked',
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
