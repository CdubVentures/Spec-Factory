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

test('runtime fetch/render knobs are defaulted, contract-backed, surfaced in runtime flow, and forwarded to process start env', async () => {
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

  const requiredStringKeys = [
    'frontierDbPath',
    'pdfPreferredBackend',
    'capturePageScreenshotFormat',
    'capturePageScreenshotSelectors',
    'runtimeScreenshotMode',
    'staticDomMode',
  ];
  const requiredBoolKeys = [
    'fetchSchedulerEnabled',
    'preferHttpFetcher',
    'frontierEnableSqlite',
    'frontierStripTrackingParams',
    'frontierRepairSearchEnabled',
    'autoScrollEnabled',
    'graphqlReplayEnabled',
    'robotsTxtCompliant',
    'pdfBackendRouterEnabled',
    'capturePageScreenshotEnabled',
    'runtimeCaptureScreenshots',
    'articleExtractorV2Enabled',
    'staticDomExtractorEnabled',
  ];
  const requiredIntKeys = [
    'fetchSchedulerMaxRetries',
    'fetchSchedulerFallbackWaitMs',
    'pageGotoTimeoutMs',
    'pageNetworkIdleTimeoutMs',
    'postLoadWaitMs',
    'frontierQueryCooldownSeconds',
    'frontierCooldown404Seconds',
    'frontierCooldown404RepeatSeconds',
    'frontierCooldown410Seconds',
    'frontierCooldownTimeoutSeconds',
    'frontierCooldown403BaseSeconds',
    'frontierCooldown429BaseSeconds',
    'frontierBlockedDomainThreshold',
    'autoScrollPasses',
    'autoScrollDelayMs',
    'maxGraphqlReplays',
    'maxNetworkResponsesPerPage',
    'robotsTxtTimeoutMs',
    'maxPdfBytes',
    'pdfBackendRouterTimeoutMs',
    'pdfBackendRouterMaxPages',
    'pdfBackendRouterMaxPairs',
    'pdfBackendRouterMaxTextPreviewChars',
    'capturePageScreenshotQuality',
    'capturePageScreenshotMaxBytes',
    'articleExtractorMinChars',
    'articleExtractorMinScore',
    'articleExtractorMaxChars',
  ];

  for (const key of requiredStringKeys) {
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
    runtimeFlowText.includes('label="Fetch Scheduler Enabled"'),
    true,
    'runtime flow should expose fetch scheduler enabled toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Fetch Scheduler Max Retries"'),
    true,
    'runtime flow should expose fetch scheduler max retries control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Fetch Scheduler Fallback Wait (ms)"'),
    true,
    'runtime flow should expose scheduler fallback wait control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Prefer HTTP Fetcher"'),
    true,
    'runtime flow should expose prefer http fetcher toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Page Goto Timeout (ms)"'),
    true,
    'runtime flow should expose page goto timeout control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Page Network Idle Timeout (ms)"'),
    true,
    'runtime flow should expose network idle timeout control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Post Load Wait (ms)"'),
    true,
    'runtime flow should expose post-load wait control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Frontier DB Path"'),
    true,
    'runtime flow should expose frontier db path control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Frontier SQLite Enabled"'),
    true,
    'runtime flow should expose frontier sqlite toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Frontier Strip Tracking Params"'),
    true,
    'runtime flow should expose frontier strip tracking toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Frontier Query Cooldown (sec)"'),
    true,
    'runtime flow should expose frontier query cooldown control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Frontier Cooldown 404 (sec)"'),
    true,
    'runtime flow should expose frontier 404 cooldown control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Frontier Cooldown 404 Repeat (sec)"'),
    true,
    'runtime flow should expose frontier repeat 404 cooldown control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Frontier Cooldown 410 (sec)"'),
    true,
    'runtime flow should expose frontier 410 cooldown control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Frontier Cooldown Timeout (sec)"'),
    true,
    'runtime flow should expose frontier timeout cooldown control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Frontier Cooldown 403 Base (sec)"'),
    true,
    'runtime flow should expose frontier 403 base cooldown control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Frontier Cooldown 429 Base (sec)"'),
    true,
    'runtime flow should expose frontier 429 base cooldown control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Frontier Blocked Domain Threshold"'),
    true,
    'runtime flow should expose frontier blocked-domain threshold control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Frontier Repair Search Enabled"'),
    true,
    'runtime flow should expose frontier repair-search toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Auto Scroll Enabled"'),
    true,
    'runtime flow should expose auto-scroll toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Auto Scroll Passes"'),
    true,
    'runtime flow should expose auto-scroll passes control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Auto Scroll Delay (ms)"'),
    true,
    'runtime flow should expose auto-scroll delay control',
  );
  assert.equal(
    runtimeFlowText.includes('label="GraphQL Replay Enabled"'),
    true,
    'runtime flow should expose graphql replay toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Max GraphQL Replays"'),
    true,
    'runtime flow should expose graphql replay max control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Max Network Responses / Page"'),
    true,
    'runtime flow should expose network responses per-page cap control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Robots.txt Compliant"'),
    true,
    'runtime flow should expose robots compliance toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Robots.txt Timeout (ms)"'),
    true,
    'runtime flow should expose robots timeout control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Max PDF Bytes"'),
    true,
    'runtime flow should expose max pdf bytes control',
  );
  assert.equal(
    runtimeFlowText.includes('label="PDF Router Enabled"'),
    true,
    'runtime flow should expose pdf router enabled toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Capture Page Screenshot Enabled"'),
    true,
    'runtime flow should expose screenshot enabled toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Runtime Screenshot Mode"'),
    true,
    'runtime flow should expose runtime screenshot mode control',
  );
  assert.equal(
    runtimeFlowText.includes('label="Article Extractor V2 Enabled"'),
    true,
    'runtime flow should expose article extractor v2 toggle',
  );
  assert.equal(
    runtimeFlowText.includes('label="Static DOM Mode"'),
    true,
    'runtime flow should expose static dom mode control',
  );

  assert.equal(
    infraRoutesText.includes('fetchSchedulerEnabled'),
    true,
    'process start infra route should accept fetch scheduler enabled override',
  );
  assert.equal(
    infraRoutesText.includes('FETCH_SCHEDULER_ENABLED'),
    true,
    'process start infra route should map fetch scheduler enabled env override',
  );
  assert.equal(
    infraRoutesText.includes('FETCH_SCHEDULER_MAX_RETRIES'),
    true,
    'process start infra route should map fetch scheduler retries env override',
  );
  assert.equal(
    infraRoutesText.includes('FETCH_SCHEDULER_FALLBACK_WAIT_MS'),
    true,
    'process start infra route should map scheduler fallback wait env override',
  );
  assert.equal(
    infraRoutesText.includes('PREFER_HTTP_FETCHER'),
    true,
    'process start infra route should map prefer http fetcher env override',
  );
  assert.equal(
    infraRoutesText.includes('PAGE_GOTO_TIMEOUT_MS'),
    true,
    'process start infra route should map page goto timeout env override',
  );
  assert.equal(
    infraRoutesText.includes('PAGE_NETWORK_IDLE_TIMEOUT_MS'),
    true,
    'process start infra route should map page network idle timeout env override',
  );
  assert.equal(
    infraRoutesText.includes('POST_LOAD_WAIT_MS'),
    true,
    'process start infra route should map post load wait env override',
  );
  assert.equal(
    infraRoutesText.includes('FRONTIER_DB_PATH'),
    true,
    'process start infra route should map frontier db path env override',
  );
  assert.equal(
    infraRoutesText.includes('FRONTIER_ENABLE_SQLITE'),
    true,
    'process start infra route should map frontier sqlite env override',
  );
  assert.equal(
    infraRoutesText.includes('FRONTIER_STRIP_TRACKING_PARAMS'),
    true,
    'process start infra route should map frontier strip tracking env override',
  );
  assert.equal(
    infraRoutesText.includes('FRONTIER_QUERY_COOLDOWN_SECONDS'),
    true,
    'process start infra route should map frontier query cooldown env override',
  );
  assert.equal(
    infraRoutesText.includes('FRONTIER_COOLDOWN_404'),
    true,
    'process start infra route should map frontier 404 cooldown env override',
  );
  assert.equal(
    infraRoutesText.includes('FRONTIER_COOLDOWN_404_REPEAT'),
    true,
    'process start infra route should map frontier repeated 404 cooldown env override',
  );
  assert.equal(
    infraRoutesText.includes('FRONTIER_COOLDOWN_410'),
    true,
    'process start infra route should map frontier 410 cooldown env override',
  );
  assert.equal(
    infraRoutesText.includes('FRONTIER_COOLDOWN_TIMEOUT'),
    true,
    'process start infra route should map frontier timeout cooldown env override',
  );
  assert.equal(
    infraRoutesText.includes('FRONTIER_COOLDOWN_403_BASE'),
    true,
    'process start infra route should map frontier 403 base cooldown env override',
  );
  assert.equal(
    infraRoutesText.includes('FRONTIER_COOLDOWN_429_BASE'),
    true,
    'process start infra route should map frontier 429 base cooldown env override',
  );
  assert.equal(
    infraRoutesText.includes('FRONTIER_BLOCKED_DOMAIN_THRESHOLD'),
    true,
    'process start infra route should map frontier blocked-domain threshold env override',
  );
  assert.equal(
    infraRoutesText.includes('FRONTIER_REPAIR_SEARCH_ENABLED'),
    true,
    'process start infra route should map frontier repair-search env override',
  );
  assert.equal(
    infraRoutesText.includes('AUTO_SCROLL_ENABLED'),
    true,
    'process start infra route should map auto-scroll enabled env override',
  );
  assert.equal(
    infraRoutesText.includes('AUTO_SCROLL_PASSES'),
    true,
    'process start infra route should map auto-scroll passes env override',
  );
  assert.equal(
    infraRoutesText.includes('AUTO_SCROLL_DELAY_MS'),
    true,
    'process start infra route should map auto-scroll delay env override',
  );
  assert.equal(
    infraRoutesText.includes('GRAPHQL_REPLAY_ENABLED'),
    true,
    'process start infra route should map graphql replay enabled env override',
  );
  assert.equal(
    infraRoutesText.includes('MAX_GRAPHQL_REPLAYS'),
    true,
    'process start infra route should map max graphql replays env override',
  );
  assert.equal(
    infraRoutesText.includes('MAX_NETWORK_RESPONSES_PER_PAGE'),
    true,
    'process start infra route should map max network responses env override',
  );
  assert.equal(
    infraRoutesText.includes('ROBOTS_TXT_COMPLIANT'),
    true,
    'process start infra route should map robots compliant env override',
  );
  assert.equal(
    infraRoutesText.includes('ROBOTS_TXT_TIMEOUT_MS'),
    true,
    'process start infra route should map robots timeout env override',
  );
  assert.equal(
    infraRoutesText.includes('MAX_PDF_BYTES'),
    true,
    'process start infra route should map max pdf bytes env override',
  );
  assert.equal(
    infraRoutesText.includes('PDF_BACKEND_ROUTER_ENABLED'),
    true,
    'process start infra route should map pdf router enabled env override',
  );
  assert.equal(
    infraRoutesText.includes('PDF_PREFERRED_BACKEND'),
    true,
    'process start infra route should map pdf preferred backend env override',
  );
  assert.equal(
    infraRoutesText.includes('PDF_BACKEND_ROUTER_TIMEOUT_MS'),
    true,
    'process start infra route should map pdf router timeout env override',
  );
  assert.equal(
    infraRoutesText.includes('PDF_BACKEND_ROUTER_MAX_PAGES'),
    true,
    'process start infra route should map pdf router max pages env override',
  );
  assert.equal(
    infraRoutesText.includes('PDF_BACKEND_ROUTER_MAX_PAIRS'),
    true,
    'process start infra route should map pdf router max pairs env override',
  );
  assert.equal(
    infraRoutesText.includes('PDF_BACKEND_ROUTER_MAX_TEXT_PREVIEW_CHARS'),
    true,
    'process start infra route should map pdf router preview chars env override',
  );
  assert.equal(
    infraRoutesText.includes('CAPTURE_PAGE_SCREENSHOT_ENABLED'),
    true,
    'process start infra route should map screenshot enabled env override',
  );
  assert.equal(
    infraRoutesText.includes('CAPTURE_PAGE_SCREENSHOT_FORMAT'),
    true,
    'process start infra route should map screenshot format env override',
  );
  assert.equal(
    infraRoutesText.includes('CAPTURE_PAGE_SCREENSHOT_QUALITY'),
    true,
    'process start infra route should map screenshot quality env override',
  );
  assert.equal(
    infraRoutesText.includes('CAPTURE_PAGE_SCREENSHOT_MAX_BYTES'),
    true,
    'process start infra route should map screenshot max bytes env override',
  );
  assert.equal(
    infraRoutesText.includes('CAPTURE_PAGE_SCREENSHOT_SELECTORS'),
    true,
    'process start infra route should map screenshot selectors env override',
  );
  assert.equal(
    infraRoutesText.includes('RUNTIME_CAPTURE_SCREENSHOTS'),
    true,
    'process start infra route should map runtime screenshot capture env override',
  );
  assert.equal(
    infraRoutesText.includes('RUNTIME_SCREENSHOT_MODE'),
    true,
    'process start infra route should map runtime screenshot mode env override',
  );
  assert.equal(
    infraRoutesText.includes('ARTICLE_EXTRACTOR_V2'),
    true,
    'process start infra route should map article extractor v2 env override',
  );
  assert.equal(
    infraRoutesText.includes('ARTICLE_EXTRACTOR_MIN_CHARS'),
    true,
    'process start infra route should map article extractor min chars env override',
  );
  assert.equal(
    infraRoutesText.includes('ARTICLE_EXTRACTOR_MIN_SCORE'),
    true,
    'process start infra route should map article extractor min score env override',
  );
  assert.equal(
    infraRoutesText.includes('ARTICLE_EXTRACTOR_MAX_CHARS'),
    true,
    'process start infra route should map article extractor max chars env override',
  );
  assert.equal(
    infraRoutesText.includes('STATIC_DOM_EXTRACTOR_ENABLED'),
    true,
    'process start infra route should map static dom extractor enabled env override',
  );
  assert.equal(
    infraRoutesText.includes('STATIC_DOM_MODE'),
    true,
    'process start infra route should map static dom mode env override',
  );
});
