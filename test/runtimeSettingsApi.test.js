import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';

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

async function readJsonFileUntil(filePath, predicate, timeoutMs = 3_000) {
  const started = Date.now();
  let lastValue = null;
  while ((Date.now() - started) < timeoutMs) {
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timeout_waiting_for_json_persist:${filePath}:${JSON.stringify(lastValue)}`);
}

let _port;
let _proc;
let _baseUrl;

test('runtime-settings API', { timeout: 60_000 }, async (t) => {
  _port = await getFreePort();
  _proc = spawn(
    process.execPath,
    ['src/api/guiServer.js', '--port', String(_port), '--local'],
    { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'pipe'] }
  );
  let stderr = '';
  _proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  t.after(() => { if (_proc && !_proc.killed) _proc.kill('SIGTERM'); });
  t.after(async () => {
    const runtimeDir = path.join(process.cwd(), 'helper_files', '_runtime');
    await fs.rm(path.join(runtimeDir, 'user-settings.json'), { force: true }).catch(() => {});
  });

  _baseUrl = `http://127.0.0.1:${_port}/api/v1`;
  await waitForHttpReady(`${_baseUrl}/health`);

  await t.test('GET /runtime-settings returns all expected keys with correct types', async () => {
    const res = await fetch(`${_baseUrl}/runtime-settings`);
    assert.equal(res.status, 200, `unexpected status ${res.status} stderr=${stderr}`);
    const body = await res.json();

    const STRING_KEYS = [
      'profile', 'searchProvider',
      'searxngBaseUrl', 'bingSearchEndpoint', 'googleCseCx', 'duckduckgoBaseUrl',
      'frontierDbPath',
      'phase2LlmModel', 'phase3LlmModel', 'llmModelFast', 'llmModelReasoning',
      'llmModelExtract', 'llmModelValidate', 'llmModelWrite',
      'llmFallbackPlanModel', 'llmFallbackExtractModel', 'llmFallbackValidateModel', 'llmFallbackWriteModel',
      'resumeMode', 'scannedPdfOcrBackend',
    ];
    for (const key of STRING_KEYS) {
      assert.equal(typeof body[key], 'string', `expected string for ${key}, got ${typeof body[key]}`);
    }

    const INT_KEYS = [
      'fetchConcurrency', 'perHostMinDelayMs',
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
      'cseRescueRequiredIteration',
      'duckduckgoTimeoutMs',
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
      'discoveryEnabled', 'phase2LlmEnabled', 'phase3LlmTriageEnabled', 'llmFallbackEnabled',
      'reextractIndexed', 'scannedPdfOcrEnabled', 'scannedPdfOcrPromoteCandidates',
      'dynamicCrawleeEnabled', 'crawleeHeadless', 'fetchSchedulerEnabled', 'preferHttpFetcher', 'runtimeScreencastEnabled',
      'frontierEnableSqlite', 'frontierStripTrackingParams', 'frontierRepairSearchEnabled',
      'autoScrollEnabled', 'graphqlReplayEnabled', 'robotsTxtCompliant',
      'fetchCandidateSources', 'manufacturerBroadDiscovery', 'manufacturerSeedSearchUrls',
      'disableGoogleCse', 'cseRescueOnlyMode', 'duckduckgoEnabled',
      'runtimeTraceEnabled', 'runtimeTraceLlmPayloads',
      'eventsJsonWrite', 'authoritySnapshotEnabled',
    ];
    for (const key of BOOL_KEYS) {
      assert.equal(typeof body[key], 'boolean', `expected boolean for ${key}, got ${typeof body[key]}`);
    }
  });

  await t.test('PUT with valid partial payload applies changes and returns applied', async () => {
    const payload = { fetchConcurrency: 8, discoveryEnabled: false, profile: 'thorough' };
    const res = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.applied.fetchConcurrency, 8);
    assert.equal(body.applied.discoveryEnabled, false);
    assert.equal(body.applied.profile, 'thorough');

    const getRes = await fetch(`${_baseUrl}/runtime-settings`);
    const getBody = await getRes.json();
    assert.equal(getBody.fetchConcurrency, 8);
    assert.equal(getBody.discoveryEnabled, false);
    assert.equal(getBody.profile, 'thorough');
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
    const payload = { fetchConcurrency: 999, perHostMinDelayMs: -5 };
    const res = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.applied.fetchConcurrency, 64);
    assert.equal(body.applied.perHostMinDelayMs, 0);
  });

  await t.test('PUT validates string enums (profile must be fast/standard/thorough)', async () => {
    const payload = { profile: 'invalid_profile', resumeMode: 'bogus' };
    const res = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.rejected);
    assert.equal(body.rejected.profile, 'invalid_enum');
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

    const userSettingsPath = path.join(process.cwd(), 'helper_files', '_runtime', 'user-settings.json');
    const userSettings = await readJsonFileUntil(
      userSettingsPath,
      (json) => (
        json
        && json.runtime
        && json.runtime.llmModelExtract === 'test-persist-model-xyz'
        && json.runtime.concurrency === 7
        && json.runtime.perHostMinDelayMs === 1234
      ),
    );
    assert.equal(userSettings.runtime.llmModelExtract, 'test-persist-model-xyz');
    assert.equal(userSettings.runtime.concurrency, 7);
    assert.equal(userSettings.runtime.perHostMinDelayMs, 1234);

    const legacySettingsExists = await fs.access(path.join(process.cwd(), 'helper_files', '_runtime', 'settings.json'))
      .then(() => true)
      .catch(() => false);
    assert.equal(legacySettingsExists, false, 'legacy settings.json should not be written');
  });

  await t.test('PUT persists convergence settings to canonical user-settings snapshot', async () => {
    const payload = { convergenceMaxRounds: 12, serpTriageEnabled: false };
    const putRes = await fetch(`${_baseUrl}/convergence-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(putRes.status, 200);
    const putBody = await putRes.json();
    assert.equal(putBody.applied.convergenceMaxRounds, 12);
    assert.equal(putBody.applied.serpTriageEnabled, false);

    const userSettingsPath = path.join(process.cwd(), 'helper_files', '_runtime', 'user-settings.json');
    const userSettings = await readJsonFileUntil(
      userSettingsPath,
      (json) => (
        json
        && json.convergence
        && json.convergence.convergenceMaxRounds === 12
        && json.convergence.serpTriageEnabled === false
      ),
    );
    assert.equal(userSettings.convergence.convergenceMaxRounds, 12);
    assert.equal(userSettings.convergence.serpTriageEnabled, false);

    const legacyConvergenceExists = await fs.access(path.join(process.cwd(), 'helper_files', '_runtime', 'convergence-settings.json'))
      .then(() => true)
      .catch(() => false);
    assert.equal(legacyConvergenceExists, false, 'legacy convergence-settings.json should not be written');
  });
});
