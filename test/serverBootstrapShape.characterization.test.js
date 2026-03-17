import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const EXPECTED_KEYS = [
  // Config & paths
  'config', 'configGate', 'PORT', 'HELPER_ROOT', 'OUTPUT_ROOT', 'INDEXLAB_ROOT', 'LAUNCH_CWD',
  'storage', 'runDataStorageState',
  // Session & SpecDb
  'sessionCache', 'resolveCategoryAlias',
  'specDbCache', 'reviewLayoutByCategory', 'getSpecDb', 'getSpecDbReady',
  // Realtime
  'broadcastWs', 'setupWatchers', 'attachWebSocketUpgrade', 'getLastScreencastFrame',
  // Process
  'processStatus', 'startProcess', 'stopProcess', 'isProcessRunning',
  'waitForProcessExit', 'getSearxngStatus', 'startSearxngStack',
  // HTTP primitives (pass-through)
  'jsonRes', 'corsHeaders', 'readJsonBody',
  'toInt', 'toFloat', 'toUnitRatio', 'hasKnownValue',
  // File I/O (pass-through)
  'safeReadJson', 'safeStat', 'listFiles', 'listDirs', 'readJsonlEvents', 'safeJoin',
  'canonicalSlugify', 'invalidateFieldRulesCache',
  // Shared domain (pass-through)
  'loadProductCatalog', 'loadCategoryConfig',
  // Review grid state
  'ensureGridKeyReviewState', 'resolveKeyReviewForLaneMutation',
  'markPrimaryLaneReviewedInItemState', 'syncItemFieldStateFromPrimaryLaneAccept',
  'syncPrimaryLaneAcceptFromItemSelection',
  'purgeTestModeCategoryState', 'resetTestModeSharedReviewState',
  'resetTestModeProductReviewState',
  // Review candidate
  'normalizeLower', 'isMeaningfulValue', 'candidateLooksReference',
  'annotateCandidatePrimaryReviews', 'getPendingItemPrimaryCandidateIds',
  'getPendingComponentSharedCandidateIdsAsync', 'getPendingEnumSharedCandidateIds',
  'syncSyntheticCandidatesFromComponentReview',
  'remapPendingComponentReviewItemsForNameChange', 'propagateSharedLaneDecision',
  'markEnumSuggestionStatusBound',
  // Catalog
  'buildCatalog', 'patchCompiledComponentDb',
];

// WHY: serverBootstrap uses `...domain` spread for phase 3 keys,
// so we parse both the assembler return and the domain module return.
function extractReturnKeys(src) {
  const returnMatch = src.match(/return\s*\{([\s\S]*?)\};\s*\}/);
  if (!returnMatch) return { keys: [], spreads: [] };
  const returnBody = returnMatch[1];
  const stripped = returnBody.replace(/\/\/.*$/gm, '');
  const spreads = [...stripped.matchAll(/\.\.\.(\w+)/g)].map(m => m[1]);
  const withoutSpreads = stripped.replace(/\.\.\.\w+/g, '');
  const keyMatches = withoutSpreads.match(/\b([a-zA-Z_]\w*)\b/g) || [];
  return { keys: [...new Set(keyMatches)], spreads };
}

test('characterization: serverBootstrap return object has exactly 64 keys', () => {
  const assemblerSrc = fs.readFileSync(
    path.resolve('src/api/serverBootstrap.js'), 'utf8'
  );
  const { keys: directKeys, spreads } = extractReturnKeys(assemblerSrc);

  const spreadKeys = [];
  for (const spreadName of spreads) {
    if (spreadName === 'domain') {
      const domainSrc = fs.readFileSync(
        path.resolve('src/api/bootstrap/createBootstrapDomainRuntimes.js'), 'utf8'
      );
      const { keys } = extractReturnKeys(domainSrc);
      spreadKeys.push(...keys);
    }
  }

  const actualKeys = [...new Set([...directKeys, ...spreadKeys])];
  assert.equal(actualKeys.length, 64, `expected 64 keys, got ${actualKeys.length}: ${actualKeys.join(', ')}`);
  const expectedSet = new Set(EXPECTED_KEYS);
  const actualSet = new Set(actualKeys);
  for (const k of expectedSet) {
    assert.ok(actualSet.has(k), `missing key: ${k}`);
  }
  for (const k of actualSet) {
    assert.ok(expectedSet.has(k), `unexpected key: ${k}`);
  }
});

test('characterization: EXPECTED_KEYS has exactly 64 entries', () => {
  assert.equal(EXPECTED_KEYS.length, 64);
  assert.equal(new Set(EXPECTED_KEYS).size, 64, 'duplicate keys in EXPECTED_KEYS');
});

test('characterization: createBootstrapEnvironment returns configGate with gate API', () => {
  const envSrc = fs.readFileSync(
    path.resolve('src/api/bootstrap/createBootstrapEnvironment.js'), 'utf8'
  );
  assert.ok(envSrc.includes('configGate'), 'createBootstrapEnvironment must export configGate');
  assert.ok(envSrc.includes('createConfigMutationGate'), 'must import createConfigMutationGate');
});
