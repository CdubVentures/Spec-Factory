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

test('runtime discovery endpoint knobs are defaulted, contract-backed, surfaced in runtime flow, and forwarded to process start env', async () => {
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

  const requiredStringFreeKeys = [
    'searxngBaseUrl',
    'bingSearchEndpoint',
    'googleCseCx',
    'duckduckgoBaseUrl',
    'llmPlanProvider',
    'llmPlanBaseUrl',
    'runtimeControlFile',
    'helperFilesRoot',
    'batchStrategy',
    'userAgent',
  ];
  const requiredStringEnumKeys = [
    'outputMode',
  ];
  const requiredBoolKeys = [
    'fetchCandidateSources',
    'manufacturerBroadDiscovery',
    'manufacturerSeedSearchUrls',
    'manufacturerDeepResearchEnabled',
    'helperFilesEnabled',
    'helperSupportiveEnabled',
    'helperSupportiveFillMissing',
    'helperAutoSeedTargets',
    'driftDetectionEnabled',
    'driftAutoRepublish',
    'allowBelowPassTargetFill',
    'indexingHelperFilesEnabled',
    'selfImproveEnabled',
    'disableGoogleCse',
    'cseRescueOnlyMode',
    'duckduckgoEnabled',
  ];
  const requiredIntKeys = [
    'discoveryMaxQueries',
    'discoveryResultsPerQuery',
    'discoveryMaxDiscovered',
    'discoveryQueryConcurrency',
    'maxUrlsPerProduct',
    'maxCandidateUrls',
    'maxPagesPerDomain',
    'uberMaxUrlsPerProduct',
    'uberMaxUrlsPerDomain',
    'maxRunSeconds',
    'maxJsonBytes',
    'maxManufacturerUrlsPerProduct',
    'maxManufacturerPagesPerDomain',
    'manufacturerReserveUrls',
    'maxHypothesisItems',
    'hypothesisAutoFollowupRounds',
    'hypothesisFollowupUrlsPerRound',
    'endpointSignalLimit',
    'endpointSuggestionLimit',
    'endpointNetworkScanLimit',
    'cseRescueRequiredIteration',
    'duckduckgoTimeoutMs',
    'convergenceIdentityFailFastRounds',
    'helperSupportiveMaxSources',
    'helperActiveSyncLimit',
    'fieldRewardHalfLifeDays',
    'driftPollSeconds',
    'driftScanMaxProducts',
  ];

  for (const key of requiredStringFreeKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(runtimeDefaults, key),
      true,
      `runtime defaults should include ${key}`,
    );
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(
      Object.prototype.hasOwnProperty.call(routeGet.stringMap || {}, key),
      true,
      `runtime GET string map should expose ${key}`,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(routePut.stringFreeMap || {}, key),
      true,
      `runtime PUT string map should expose ${key}`,
    );
    assert.equal(
      runtimeDomainText.includes(`${key}: String(input.${key} || '').trim()`),
      true,
      `runtime payload serializer should include normalized string for ${key}`,
    );
    assert.equal(
      indexingText.includes(`${key},`),
      true,
      `indexing payload builder should include ${key}`,
    );
  }

  for (const key of requiredStringEnumKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(runtimeDefaults, key),
      true,
      `runtime defaults should include ${key}`,
    );
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(
      Object.prototype.hasOwnProperty.call(routeGet.stringMap || {}, key),
      true,
      `runtime GET string map should expose ${key}`,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(routePut.stringEnumMap || {}, key),
      true,
      `runtime PUT enum map should expose ${key}`,
    );
    assert.equal(
      runtimeDomainText.includes(`${key}: String(input.${key} || '').trim()`),
      true,
      `runtime payload serializer should include normalized string for ${key}`,
    );
    assert.equal(
      indexingText.includes(`${key},`),
      true,
      `indexing payload builder should include ${key}`,
    );
  }

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
    runtimeFlowText.includes('label="Fetch Candidate Sources"'),
    true,
    'runtime flow should expose fetch candidate sources toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Discovery Max Queries"'),
    true,
    'runtime flow should expose discovery max queries control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Discovery Results / Query"'),
    true,
    'runtime flow should expose discovery results per query control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Discovery Max Discovered"'),
    true,
    'runtime flow should expose discovery max discovered control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Discovery Query Concurrency"'),
    true,
    'runtime flow should expose discovery query concurrency control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Manufacturer Broad Discovery"'),
    true,
    'runtime flow should expose manufacturer broad discovery toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Manufacturer Seed Search URLs"'),
    true,
    'runtime flow should expose manufacturer seed search urls toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Manufacturer Deep Research Enabled"'),
    true,
    'runtime flow should expose manufacturer deep research toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Max URLs / Product"'),
    true,
    'runtime flow should expose max urls per product control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Max Candidate URLs"'),
    true,
    'runtime flow should expose max candidate urls control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Max Pages / Domain"'),
    true,
    'runtime flow should expose max pages per domain control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Uber Max URLs / Product"'),
    true,
    'runtime flow should expose uber max urls per product control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Uber Max URLs / Domain"'),
    true,
    'runtime flow should expose uber max urls per domain control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Max Run Seconds"'),
    true,
    'runtime flow should expose max run seconds control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Max JSON Bytes"'),
    true,
    'runtime flow should expose max json bytes control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Max Manufacturer URLs / Product"'),
    true,
    'runtime flow should expose max manufacturer urls control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Max Manufacturer Pages / Domain"'),
    true,
    'runtime flow should expose max manufacturer pages control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Manufacturer Reserve URLs"'),
    true,
    'runtime flow should expose manufacturer reserve urls control',
  );
  assert.equal(
    runtimeFlowText.includes('label="User Agent"'),
    true,
    'runtime flow should expose user agent control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Self Improve Enabled"'),
    true,
    'runtime flow should expose self improve toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Max Hypothesis Items"'),
    true,
    'runtime flow should expose max hypothesis items control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Hypothesis Auto Followup Rounds"'),
    true,
    'runtime flow should expose hypothesis auto followup rounds control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Hypothesis Followup URLs / Round"'),
    true,
    'runtime flow should expose hypothesis followup urls per round control',
  );
  assert.equal(
    runtimeFlowText.includes('label="SearXNG Base URL"'),
    true,
    'runtime flow should expose SearXNG endpoint control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Bing Search Endpoint"'),
    true,
    'runtime flow should expose Bing endpoint control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Google CSE CX"'),
    true,
    'runtime flow should expose Google CSE CX control',
  );
  assert.equal(
    runtimeFlowText.includes('label="DuckDuckGo Base URL"'),
    true,
    'runtime flow should expose DuckDuckGo endpoint control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Disable Google CSE"'),
    true,
    'runtime flow should expose Disable Google CSE toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="CSE Rescue Only Mode"'),
    true,
    'runtime flow should expose CSE rescue-only toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="CSE Rescue Required Iteration"'),
    true,
    'runtime flow should expose CSE rescue iteration control',
  );
  assert.equal(
    runtimeFlowText.includes('label="DuckDuckGo Enabled"'),
    true,
    'runtime flow should expose DuckDuckGo enabled toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="DuckDuckGo Timeout (ms)"'),
    true,
    'runtime flow should expose DuckDuckGo timeout control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Endpoint Signal Limit"'),
    true,
    'runtime flow should expose endpoint signal limit control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Endpoint Suggestion Limit"'),
    true,
    'runtime flow should expose endpoint suggestion limit control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Endpoint Network Scan Limit"'),
    true,
    'runtime flow should expose endpoint network scan limit control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Convergence Identity Fail-Fast Rounds"'),
    true,
    'runtime flow should expose convergence identity fail-fast rounds control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Output Mode"'),
    true,
    'runtime flow should expose output mode control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Runtime Control File"'),
    true,
    'runtime flow should expose runtime control file control',
  );
  assert.equal(
    runtimeFlowText.includes('label="LLM Plan Provider"'),
    true,
    'runtime flow should expose llm plan provider control',
  );
  assert.equal(
    runtimeFlowText.includes('label="LLM Plan Base URL"'),
    true,
    'runtime flow should expose llm plan base url control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Batch Strategy"'),
    true,
    'runtime flow should expose batch strategy control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Field Reward Half-Life (days)"'),
    true,
    'runtime flow should expose field reward half-life control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Allow Below Pass-Target Fill"'),
    true,
    'runtime flow should expose below pass-target fill toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Drift Detection Enabled"'),
    true,
    'runtime flow should expose drift detection toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Drift Poll Seconds"'),
    true,
    'runtime flow should expose drift poll seconds control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Drift Scan Max Products"'),
    true,
    'runtime flow should expose drift scan max products control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Drift Auto Republish"'),
    true,
    'runtime flow should expose drift auto republish toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Helper Files Enabled"'),
    true,
    'runtime flow should expose helper files enabled toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Helper Files Root"'),
    true,
    'runtime flow should expose helper files root control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Indexing Helper Files Enabled"'),
    true,
    'runtime flow should expose indexing helper files enabled toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Helper Supportive Enabled"'),
    true,
    'runtime flow should expose helper supportive enabled toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Helper Supportive Fill Missing"'),
    true,
    'runtime flow should expose helper supportive fill-missing toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Helper Supportive Max Sources"'),
    true,
    'runtime flow should expose helper supportive max sources control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Helper Auto Seed Targets"'),
    true,
    'runtime flow should expose helper auto-seed targets toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Helper Active Sync Limit"'),
    true,
    'runtime flow should expose helper active sync limit control',
  );

  assert.equal(
    infraRoutesText.includes('fetchCandidateSources'),
    true,
    'process start infra route should accept fetch candidate sources override',
  );
  assert.equal(
    infraRoutesText.includes('FETCH_CANDIDATE_SOURCES'),
    true,
    'process start infra route should map fetch candidate sources env override',
  );
  assert.equal(
    infraRoutesText.includes('DISCOVERY_MAX_QUERIES'),
    true,
    'process start infra route should map discovery max queries env override',
  );
  assert.equal(
    infraRoutesText.includes('DISCOVERY_RESULTS_PER_QUERY'),
    true,
    'process start infra route should map discovery results per query env override',
  );
  assert.equal(
    infraRoutesText.includes('DISCOVERY_MAX_DISCOVERED'),
    true,
    'process start infra route should map discovery max discovered env override',
  );
  assert.equal(
    infraRoutesText.includes('DISCOVERY_QUERY_CONCURRENCY'),
    true,
    'process start infra route should map discovery query concurrency env override',
  );
  assert.equal(
    infraRoutesText.includes('MANUFACTURER_BROAD_DISCOVERY'),
    true,
    'process start infra route should map manufacturer broad discovery env override',
  );
  assert.equal(
    infraRoutesText.includes('MANUFACTURER_SEED_SEARCH_URLS'),
    true,
    'process start infra route should map manufacturer seed search urls env override',
  );
  assert.equal(
    infraRoutesText.includes('MANUFACTURER_DEEP_RESEARCH_ENABLED'),
    true,
    'process start infra route should map manufacturer deep research env override',
  );
  assert.equal(
    infraRoutesText.includes('MAX_URLS_PER_PRODUCT'),
    true,
    'process start infra route should map max urls per product env override',
  );
  assert.equal(
    infraRoutesText.includes('MAX_CANDIDATE_URLS'),
    true,
    'process start infra route should map max candidate urls env override',
  );
  assert.equal(
    infraRoutesText.includes('MAX_PAGES_PER_DOMAIN'),
    true,
    'process start infra route should map max pages per domain env override',
  );
  assert.equal(
    infraRoutesText.includes('UBER_MAX_URLS_PER_PRODUCT'),
    true,
    'process start infra route should map uber max urls per product env override',
  );
  assert.equal(
    infraRoutesText.includes('UBER_MAX_URLS_PER_DOMAIN'),
    true,
    'process start infra route should map uber max urls per domain env override',
  );
  assert.equal(
    infraRoutesText.includes('MAX_RUN_SECONDS'),
    true,
    'process start infra route should map max run seconds env override',
  );
  assert.equal(
    infraRoutesText.includes('MAX_JSON_BYTES'),
    true,
    'process start infra route should map max json bytes env override',
  );
  assert.equal(
    infraRoutesText.includes('MAX_MANUFACTURER_URLS_PER_PRODUCT'),
    true,
    'process start infra route should map max manufacturer urls env override',
  );
  assert.equal(
    infraRoutesText.includes('MAX_MANUFACTURER_PAGES_PER_DOMAIN'),
    true,
    'process start infra route should map max manufacturer pages env override',
  );
  assert.equal(
    infraRoutesText.includes('MANUFACTURER_RESERVE_URLS'),
    true,
    'process start infra route should map manufacturer reserve urls env override',
  );
  assert.equal(
    infraRoutesText.includes('USER_AGENT'),
    true,
    'process start infra route should map user agent env override',
  );
  assert.equal(
    infraRoutesText.includes('SELF_IMPROVE_ENABLED'),
    true,
    'process start infra route should map self improve env override',
  );
  assert.equal(
    infraRoutesText.includes('MAX_HYPOTHESIS_ITEMS'),
    true,
    'process start infra route should map max hypothesis items env override',
  );
  assert.equal(
    infraRoutesText.includes('HYPOTHESIS_AUTO_FOLLOWUP_ROUNDS'),
    true,
    'process start infra route should map hypothesis rounds env override',
  );
  assert.equal(
    infraRoutesText.includes('HYPOTHESIS_FOLLOWUP_URLS_PER_ROUND'),
    true,
    'process start infra route should map hypothesis urls per round env override',
  );
  assert.equal(
    infraRoutesText.includes('ENDPOINT_SIGNAL_LIMIT'),
    true,
    'process start infra route should map endpoint signal limit env override',
  );
  assert.equal(
    infraRoutesText.includes('ENDPOINT_SUGGESTION_LIMIT'),
    true,
    'process start infra route should map endpoint suggestion limit env override',
  );
  assert.equal(
    infraRoutesText.includes('ENDPOINT_NETWORK_SCAN_LIMIT'),
    true,
    'process start infra route should map endpoint network scan limit env override',
  );
  assert.equal(
    infraRoutesText.includes('SEARXNG_BASE_URL'),
    true,
    'process start infra route should map SearXNG endpoint env override',
  );
  assert.equal(
    infraRoutesText.includes('BING_SEARCH_ENDPOINT'),
    true,
    'process start infra route should map Bing endpoint env override',
  );
  assert.equal(
    infraRoutesText.includes('GOOGLE_CSE_CX'),
    true,
    'process start infra route should map Google CSE CX env override',
  );
  assert.equal(
    infraRoutesText.includes('DUCKDUCKGO_BASE_URL'),
    true,
    'process start infra route should map DuckDuckGo endpoint env override',
  );
  assert.equal(
    infraRoutesText.includes('DISABLE_GOOGLE_CSE'),
    true,
    'process start infra route should map disable Google CSE env override',
  );
  assert.equal(
    infraRoutesText.includes('CSE_RESCUE_ONLY_MODE'),
    true,
    'process start infra route should map CSE rescue mode env override',
  );
  assert.equal(
    infraRoutesText.includes('CSE_RESCUE_REQUIRED_ITERATION'),
    true,
    'process start infra route should map CSE rescue iteration env override',
  );
  assert.equal(
    infraRoutesText.includes('DUCKDUCKGO_ENABLED'),
    true,
    'process start infra route should map DuckDuckGo enabled env override',
  );
  assert.equal(
    infraRoutesText.includes('DUCKDUCKGO_TIMEOUT_MS'),
    true,
    'process start infra route should map DuckDuckGo timeout env override',
  );
  assert.equal(
    infraRoutesText.includes('CONVERGENCE_IDENTITY_FAIL_FAST_ROUNDS'),
    true,
    'process start infra route should map convergence identity fail-fast env override',
  );
  assert.equal(
    infraRoutesText.includes('OUTPUT_MODE'),
    true,
    'process start infra route should map output mode env override',
  );
  assert.equal(
    infraRoutesText.includes('RUNTIME_CONTROL_FILE'),
    true,
    'process start infra route should map runtime control file env override',
  );
  assert.equal(
    infraRoutesText.includes('LLM_PLAN_PROVIDER'),
    true,
    'process start infra route should map llm plan provider env override',
  );
  assert.equal(
    infraRoutesText.includes('LLM_PLAN_BASE_URL'),
    true,
    'process start infra route should map llm plan base url env override',
  );
  assert.equal(
    infraRoutesText.includes('BATCH_STRATEGY'),
    true,
    'process start infra route should map batch strategy env override',
  );
  assert.equal(
    infraRoutesText.includes('FIELD_REWARD_HALF_LIFE_DAYS'),
    true,
    'process start infra route should map field reward half-life env override',
  );
  assert.equal(
    infraRoutesText.includes('ALLOW_BELOW_PASS_TARGET_FILL'),
    true,
    'process start infra route should map allow-below-pass-target env override',
  );
  assert.equal(
    infraRoutesText.includes('DRIFT_DETECTION_ENABLED'),
    true,
    'process start infra route should map drift detection env override',
  );
  assert.equal(
    infraRoutesText.includes('DRIFT_POLL_SECONDS'),
    true,
    'process start infra route should map drift poll seconds env override',
  );
  assert.equal(
    infraRoutesText.includes('DRIFT_SCAN_MAX_PRODUCTS'),
    true,
    'process start infra route should map drift scan max products env override',
  );
  assert.equal(
    infraRoutesText.includes('DRIFT_AUTO_REPUBLISH'),
    true,
    'process start infra route should map drift auto republish env override',
  );
  assert.equal(
    infraRoutesText.includes('HELPER_FILES_ENABLED'),
    true,
    'process start infra route should map helper files enabled env override',
  );
  assert.equal(
    infraRoutesText.includes('HELPER_FILES_ROOT'),
    true,
    'process start infra route should map helper files root env override',
  );
  assert.equal(
    infraRoutesText.includes('INDEXING_HELPER_FILES_ENABLED'),
    true,
    'process start infra route should map indexing helper files env override',
  );
  assert.equal(
    infraRoutesText.includes('HELPER_SUPPORTIVE_ENABLED'),
    true,
    'process start infra route should map helper supportive enabled env override',
  );
  assert.equal(
    infraRoutesText.includes('HELPER_SUPPORTIVE_FILL_MISSING'),
    true,
    'process start infra route should map helper supportive fill-missing env override',
  );
  assert.equal(
    infraRoutesText.includes('HELPER_SUPPORTIVE_MAX_SOURCES'),
    true,
    'process start infra route should map helper supportive max sources env override',
  );
  assert.equal(
    infraRoutesText.includes('HELPER_AUTO_SEED_TARGETS'),
    true,
    'process start infra route should map helper auto-seed targets env override',
  );
  assert.equal(
    infraRoutesText.includes('HELPER_ACTIVE_SYNC_LIMIT'),
    true,
    'process start infra route should map helper active sync limit env override',
  );
});
