import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

async function waitForHttpReady(url, timeoutMs = 25_000) {
  const started = Date.now();
  while ((Date.now() - started) < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timeout_waiting_for_http_ready:${url}`);
}

async function readJsonFileUntil(filePathOrPaths, predicate, timeoutMs = 6_000) {
  const started = Date.now();
  const filePaths = Array.isArray(filePathOrPaths) ? filePathOrPaths : [filePathOrPaths];
  let lastValue = null;
  while ((Date.now() - started) < timeoutMs) {
    for (const filePath of filePaths) {
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        lastValue = parsed;
        if (predicate(parsed)) {
          return parsed;
        }
      } catch {
        // keep waiting
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timeout_waiting_for_json_persist:${filePaths.join('|')}:${JSON.stringify(lastValue)}`);
}

let _port;
let _proc;
let _baseUrl;
let _helperRoot;
let _outputRoot;

test('runtime-settings API', { timeout: 60_000 }, async (t) => {
  _helperRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-settings-helper-'));
  _outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-settings-output-'));
  await fs.mkdir(path.join(_helperRoot, '_runtime'), { recursive: true });
  _port = await getFreePort();
  _proc = spawn(
    process.execPath,
    ['src/api/guiServer.js', '--port', String(_port), '--local'],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'ignore', 'pipe'],
      env: {
        ...process.env,
        HELPER_FILES_ROOT: _helperRoot,
        LOCAL_OUTPUT_ROOT: _outputRoot,
        OUTPUT_MODE: 'local',
        LOCAL_MODE: 'true',
      },
    }
  );
  let stderr = '';
  _proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  t.after(() => { if (_proc && !_proc.killed) _proc.kill('SIGTERM'); });
  t.after(async () => {
    await fs.rm(_helperRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(_outputRoot, { recursive: true, force: true }).catch(() => {});
  });

  _baseUrl = `http://127.0.0.1:${_port}/api/v1`;
  await waitForHttpReady(`${_baseUrl}/health`);

  await t.test('GET /runtime-settings returns all expected keys with correct types', async () => {
    const res = await fetch(`${_baseUrl}/runtime-settings`);
    assert.equal(res.status, 200, `unexpected status ${res.status} stderr=${stderr}`);
    const body = await res.json();

    const STRING_KEYS = [
      'searchProvider',
      'searxngBaseUrl',
      'frontierDbPath',
      'phase2LlmModel', 'phase3LlmModel', 'llmModelFast', 'llmModelReasoning',
      'llmModelExtract', 'llmModelValidate', 'llmModelWrite',
      'resumeMode', 'scannedPdfOcrBackend',
    ];
    for (const key of STRING_KEYS) {
      assert.equal(typeof body[key], 'string', `expected string for ${key}, got ${typeof body[key]}`);
    }

    const INT_KEYS = [
      'fetchConcurrency', 'perHostMinDelayMs',
      'searchGlobalRps', 'searchGlobalBurst',
      'searchPerHostRps', 'searchPerHostBurst',
      'domainRequestRps', 'domainRequestBurst',
      'globalRequestRps', 'globalRequestBurst',
      'fetchPerHostConcurrencyCap',
      'llmTokensPlan', 'llmTokensTriage', 'llmTokensFast', 'llmTokensReasoning',
      'llmTokensExtract', 'llmTokensValidate', 'llmTokensWrite',
      'llmTokensPlanFallback', 'llmTokensExtractFallback', 'llmTokensValidateFallback', 'llmTokensWriteFallback',
      'resumeWindowHours', 'reextractAfterHours',
      'scannedPdfOcrMaxPages', 'scannedPdfOcrMaxPairs', 'scannedPdfOcrMinCharsPerPage', 'scannedPdfOcrMinLinesPerPage',
      'crawleeRequestHandlerTimeoutSecs', 'dynamicFetchRetryBudget', 'dynamicFetchRetryBackoffMs',
      'fetchSchedulerMaxRetries', 'fetchSchedulerFallbackWaitMs', 'pageGotoTimeoutMs', 'pageNetworkIdleTimeoutMs', 'postLoadWaitMs',
      'frontierQueryCooldownSeconds', 'frontierCooldown404Seconds', 'frontierCooldown404RepeatSeconds',
      'frontierCooldown410Seconds', 'frontierCooldownTimeoutSeconds', 'frontierCooldown403BaseSeconds',
      'frontierCooldown429BaseSeconds', 'frontierBlockedDomainThreshold',
      'autoScrollPasses', 'autoScrollDelayMs', 'maxGraphqlReplays', 'maxNetworkResponsesPerPage', 'robotsTxtTimeoutMs',
      'runtimeScreencastFps', 'runtimeScreencastQuality', 'runtimeScreencastMaxWidth', 'runtimeScreencastMaxHeight',
      'endpointSignalLimit', 'endpointSuggestionLimit', 'endpointNetworkScanLimit',
      'runtimeTraceFetchRing', 'runtimeTraceLlmRing',
    ];
    for (const key of INT_KEYS) {
      assert.equal(typeof body[key], 'number', `expected number for ${key}, got ${typeof body[key]}`);
      assert.ok(Number.isInteger(body[key]), `expected integer for ${key}, got ${body[key]}`);
    }

    const FLOAT_KEYS = ['scannedPdfOcrMinConfidence'];
    for (const key of FLOAT_KEYS) {
      assert.equal(typeof body[key], 'number', `expected number for ${key}, got ${typeof body[key]}`);
    }

    const BOOL_KEYS = [
      // discoveryEnabled removed — hardcoded invariant, no longer in GET boolMap
      'phase2LlmEnabled',
      'reextractIndexed', 'scannedPdfOcrEnabled', 'scannedPdfOcrPromoteCandidates',
      'dynamicCrawleeEnabled', 'crawleeHeadless', 'fetchSchedulerEnabled', 'preferHttpFetcher', 'runtimeScreencastEnabled',
      'frontierEnableSqlite', 'frontierStripTrackingParams', 'frontierRepairSearchEnabled',
      'autoScrollEnabled', 'graphqlReplayEnabled', 'robotsTxtCompliant',
      'fetchCandidateSources', 'manufacturerBroadDiscovery', 'manufacturerSeedSearchUrls',
      'runtimeTraceEnabled', 'runtimeTraceLlmPayloads',
      'eventsJsonWrite', 'authoritySnapshotEnabled',
    ];
    for (const key of BOOL_KEYS) {
      assert.equal(typeof body[key], 'boolean', `expected boolean for ${key}, got ${typeof body[key]}`);
    }

    const RETIRED_KEYS = [
      'bingSearchKey',
      'googleCseCx',
      'googleCseKey',
      'disableGoogleCse',
      'cseRescueOnlyMode',
      'cseRescueRequiredIteration',
    ];
    for (const key of RETIRED_KEYS) {
      assert.equal(Object.hasOwn(body, key), false, `retired key should not be surfaced: ${key}`);
    }
  });

  await t.test('GET /runtime-settings exposes canonical sampled defaults from settingsDefaults on a clean authority root', async () => {
    const res = await fetch(`${_baseUrl}/runtime-settings`);
    assert.equal(res.status, 200, `unexpected status ${res.status} stderr=${stderr}`);
    const body = await res.json();

    const expected = {
      fetchConcurrency: SETTINGS_DEFAULTS.runtime.fetchConcurrency,
      fetchPerHostConcurrencyCap: SETTINGS_DEFAULTS.runtime.fetchPerHostConcurrencyCap,
      discoveryMaxDiscovered: SETTINGS_DEFAULTS.runtime.discoveryMaxDiscovered,
      pageGotoTimeoutMs: SETTINGS_DEFAULTS.runtime.pageGotoTimeoutMs,
      postLoadWaitMs: SETTINGS_DEFAULTS.runtime.postLoadWaitMs,
      frontierCooldown403BaseSeconds: SETTINGS_DEFAULTS.runtime.frontierCooldown403BaseSeconds,
      frontierCooldown429BaseSeconds: SETTINGS_DEFAULTS.runtime.frontierCooldown429BaseSeconds,
      frontierBlockedDomainThreshold: SETTINGS_DEFAULTS.runtime.frontierBlockedDomainThreshold,
      dynamicFetchRetryBudget: SETTINGS_DEFAULTS.runtime.dynamicFetchRetryBudget,
      dynamicFetchRetryBackoffMs: SETTINGS_DEFAULTS.runtime.dynamicFetchRetryBackoffMs,
      fetchSchedulerEnabled: SETTINGS_DEFAULTS.runtime.fetchSchedulerEnabled,
      fetchSchedulerInternalsMapJson: SETTINGS_DEFAULTS.runtime.fetchSchedulerInternalsMapJson,
      serpRerankerWeightMapJson: SETTINGS_DEFAULTS.runtime.serpRerankerWeightMapJson,
      preferHttpFetcher: SETTINGS_DEFAULTS.runtime.preferHttpFetcher,
      userAgent: SETTINGS_DEFAULTS.runtime.userAgent,
    };

    for (const [key, value] of Object.entries(expected)) {
      assert.deepEqual(body[key], value, `runtime-settings GET should serve canonical default for ${key}`);
    }

    assert.equal(Object.hasOwn(body, 'bingSearchEndpoint'), false, 'retired bingSearchEndpoint should stay removed');
  });

  await t.test('PUT with valid partial payload applies changes and returns applied', async () => {
    // discoveryEnabled removed from PUT boolMap — it's a hardcoded invariant.
    const payload = { fetchConcurrency: 8, searchProvider: 'google' };
    const res = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.applied.fetchConcurrency, 8);
    assert.equal(body.applied.searchProvider, 'google');

    const getRes = await fetch(`${_baseUrl}/runtime-settings`);
    const getBody = await getRes.json();
    assert.equal(getBody.fetchConcurrency, 8);
    assert.equal(getBody.searchProvider, 'google');
  });

  await t.test('PUT with invalid values returns rejected for those keys', async () => {
    const payload = { fetchConcurrency: 'not_a_number', llmTokensPlan: 'abc' };
    const res = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.rejected);
    assert.equal(body.rejected.fetchConcurrency, 'invalid_integer');
    assert.equal(body.rejected.llmTokensPlan, 'invalid_integer');
  });

  await t.test('PUT clamps out-of-range values', async () => {
    const payload = {
      fetchConcurrency: 999,
      perHostMinDelayMs: -5,
      searchGlobalRps: -1,
      searchGlobalBurst: 9999,
      fetchPerHostConcurrencyCap: 999,
    };
    const res = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.applied.fetchConcurrency, 64);
    assert.equal(body.applied.perHostMinDelayMs, 0);
    assert.equal(body.applied.searchGlobalRps, 0);
    assert.equal(body.applied.searchGlobalBurst, 1000);
    assert.equal(body.applied.fetchPerHostConcurrencyCap, 64);
  });

  await t.test('PUT validates active string enums', async () => {
    const payload = { searchProvider: 'invalid_provider', resumeMode: 'bogus' };
    const res = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.rejected);
    assert.equal(body.rejected.searchProvider, 'invalid_enum');
    assert.equal(body.rejected.resumeMode, 'invalid_enum');
  });

  await t.test('PUT with empty body returns ok with empty applied', async () => {
    const res = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.applied, {});
  });

  await t.test('PUT persists runtime settings to canonical user-settings snapshot', async () => {
    const payload = { llmModelExtract: 'test-persist-model-xyz', fetchConcurrency: 7, perHostMinDelayMs: 1234 };
    const putRes = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(putRes.status, 200);
    const putBody = await putRes.json();
    assert.equal(putBody.applied.llmModelExtract, 'test-persist-model-xyz');
    assert.equal(putBody.applied.fetchConcurrency, 7);
    assert.equal(putBody.applied.perHostMinDelayMs, 1234);

    const userSettingsPaths = [
      path.join(_helperRoot, '_runtime', 'user-settings.json'),
    ];
    const userSettings = await readJsonFileUntil(
      userSettingsPaths,
      (json) => (
        json
        && json.runtime
        && json.runtime.llmModelExtract === 'test-persist-model-xyz'
        && json.runtime.concurrency === 7
        && json.runtime.perHostMinDelayMs === 1234
      ),
      8_000,
    );
    assert.equal(userSettings.runtime.llmModelExtract, 'test-persist-model-xyz');
    assert.equal(userSettings.runtime.concurrency, 7);
    assert.equal(userSettings.runtime.perHostMinDelayMs, 1234);

    const legacySettingsExists = await Promise.all([
      fs.access(path.join(_helperRoot, '_runtime', 'settings.json')).then(() => true).catch(() => false),
    ]).then((results) => results.some(Boolean));
    assert.equal(legacySettingsExists, false, 'legacy settings.json should not be written');
  });

  await t.test('PUT persists convergence settings to canonical user-settings snapshot', async () => {
    const payload = { serpTriageMinScore: 5 };
    const putRes = await fetch(`${_baseUrl}/convergence-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(putRes.status, 200);
    const putBody = await putRes.json();
    assert.equal(putBody.applied.serpTriageMinScore, 5);

    const userSettingsPaths = [
      path.join(_helperRoot, '_runtime', 'user-settings.json'),
    ];
    const userSettings = await readJsonFileUntil(
      userSettingsPaths,
      (json) => (
        json
        && json.convergence
        && json.convergence.serpTriageMinScore === 5
      ),
      8_000,
    );
    assert.equal(userSettings.convergence.serpTriageMinScore, 5);

    const legacyConvergenceExists = await Promise.all([
      fs.access(path.join(_helperRoot, '_runtime', 'convergence-settings.json')).then(() => true).catch(() => false),
    ]).then((results) => results.some(Boolean));
    assert.equal(legacyConvergenceExists, false, 'legacy convergence-settings.json should not be written');
  });
});
