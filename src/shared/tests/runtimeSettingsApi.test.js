import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { SETTINGS_DEFAULTS } from '../settingsDefaults.js';
import { startInProcessGuiServer } from '../../api/tests/helpers/inProcessGuiServerHarness.js';

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
let _baseUrl;
let _helperRoot;
let _outputRoot;
let _inputRoot;

test('runtime-settings API', { timeout: 60_000 }, async (t) => {
  _helperRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-settings-helper-'));
  _outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-settings-output-'));
  _inputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-settings-input-'));
  await fs.mkdir(path.join(_helperRoot, '_runtime'), { recursive: true });
  t.after(async () => {
    await fs.rm(_helperRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(_outputRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(_inputRoot, { recursive: true, force: true }).catch(() => {});
  });
  const server = await startInProcessGuiServer(t, {
    env: {
      HELPER_FILES_ROOT: _helperRoot,
      CATEGORY_AUTHORITY_ROOT: _helperRoot,
      LOCAL_INPUT_ROOT: _inputRoot,
      LOCAL_OUTPUT_ROOT: _outputRoot,
      OUTPUT_MODE: 'local',
      LOCAL_MODE: 'true',
      SETTINGS_CANONICAL_ONLY_WRITES: 'true',
    },
    argv: ['--local'],
  });
  _port = server.port;
  _baseUrl = `${server.baseUrl}/api/v1`;

  await t.test('GET /runtime-settings returns all expected keys with correct types', async () => {
    const res = await fetch(`${_baseUrl}/runtime-settings`);
    assert.equal(res.status, 200, `unexpected status ${res.status}`);
    const body = await res.json();

    const STRING_KEYS = [
      'searchEngines',
      'searxngBaseUrl',
      'llmModelPlan', 'llmModelReasoning',
    ];
    for (const key of STRING_KEYS) {
      assert.equal(typeof body[key], 'string', `expected string for ${key}, got ${typeof body[key]}`);
    }

    const INT_KEYS = [
      'llmMaxOutputTokensPlan', 'llmMaxOutputTokensReasoning',
      'llmMaxOutputTokensPlanFallback',
      'crawleeRequestHandlerTimeoutSecs',
      'autoScrollPasses', 'autoScrollDelayMs',
    ];
    for (const key of INT_KEYS) {
      assert.equal(typeof body[key], 'number', `expected number for ${key}, got ${typeof body[key]}`);
      assert.ok(Number.isInteger(body[key]), `expected integer for ${key}, got ${body[key]}`);
    }

    const BOOL_KEYS = [
      'crawleeHeadless', 'runtimeScreencastEnabled',
      'autoScrollEnabled',
      'runtimeTraceEnabled', 'runtimeTraceLlmPayloads',
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
      'phase3LlmTriageEnabled',
      'llmSerpRerankEnabled',
      'llmModelFast',
      'llmMaxOutputTokensFast',
      'fetchConcurrency',
      'reextractAfterHours',
      'reextractIndexed',
      'robotsTxtCompliant',
    ];
    for (const key of RETIRED_KEYS) {
      assert.equal(Object.hasOwn(body, key), false, `retired key should not be surfaced: ${key}`);
    }
  });

  await t.test('GET /runtime-settings exposes canonical sampled defaults from settingsDefaults on a clean authority root', async () => {
    const res = await fetch(`${_baseUrl}/runtime-settings`);
    assert.equal(res.status, 200, `unexpected status ${res.status}`);
    const body = await res.json();

    const expected = {
      userAgent: SETTINGS_DEFAULTS.runtime.userAgent,
    };

    for (const [key, value] of Object.entries(expected)) {
      assert.deepEqual(body[key], value, `runtime-settings GET should serve canonical default for ${key}`);
    }

    assert.equal(Object.hasOwn(body, 'bingSearchEndpoint'), false, 'retired bingSearchEndpoint should stay removed');
  });

  await t.test('PUT with valid partial payload applies changes and returns applied', async () => {
    const payload = { domainClassifierUrlCap: 7, searchEngines: 'google' };
    const res = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.applied.domainClassifierUrlCap, 7);
    assert.equal(body.applied.searchEngines, 'google');

    const getRes = await fetch(`${_baseUrl}/runtime-settings`);
    const getBody = await getRes.json();
    assert.equal(getBody.domainClassifierUrlCap, 7);
    assert.equal(getBody.searchEngines, 'google');
  });

  await t.test('PUT with invalid values returns rejected for those keys', async () => {
    const payload = { domainClassifierUrlCap: 'not_a_number', llmMaxOutputTokensPlan: 'abc' };
    const res = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.rejected);
    assert.equal(body.rejected.domainClassifierUrlCap, 'invalid_integer');
    assert.equal(body.rejected.llmMaxOutputTokensPlan, 'invalid_integer');
  });

  await t.test('PUT clamps out-of-range values', async () => {
    const payload = {
      domainClassifierUrlCap: -5,
      maxRunSeconds: 999999,
    };
    const res = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.applied.domainClassifierUrlCap, 1);
    assert.equal(body.applied.maxRunSeconds, 86400);
  });

  await t.test('PUT validates active string enums', async () => {
    const payload = { searchEngines: 'invalid_provider' };
    const res = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.applied.searchEngines, '');
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

  await t.test('PUT persists runtime settings to SQL and subsequent GET reflects changes', async () => {
    const payload = { llmModelPlan: 'test-persist-model-xyz', domainClassifierUrlCap: 9 };
    const putRes = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(putRes.status, 200);
    const putBody = await putRes.json();
    assert.equal(putBody.applied.llmModelPlan, 'test-persist-model-xyz');
    assert.equal(putBody.applied.domainClassifierUrlCap, 9);

    // WHY: Verify persistence via GET — SQL writes are synchronous, no polling needed.
    const getRes = await fetch(`${_baseUrl}/runtime-settings`);
    assert.equal(getRes.status, 200);
    const getBody = await getRes.json();
    assert.equal(getBody.llmModelPlan, 'test-persist-model-xyz');
    assert.equal(getBody.domainClassifierUrlCap, 9);

    const legacySettingsExists = await Promise.all([
      fs.access(path.join(_helperRoot, '_runtime', 'settings.json')).then(() => true).catch(() => false),
    ]).then((results) => results.some(Boolean));
    assert.equal(legacySettingsExists, false, 'legacy settings.json should not be written');
  });

});
