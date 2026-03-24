import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { SETTINGS_DEFAULTS } from '../settingsDefaults.js';
import {
  getFreePort,
  waitForHttpReady,
} from '../../api/tests/helpers/guiServerHttpHarness.js';
import { skipIfSpawnEperm } from './helpers/spawnEperm.js';

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
  t.after(() => { if (_proc && !_proc.killed) _proc.kill('SIGTERM'); });
  t.after(async () => {
    await fs.rm(_helperRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(_outputRoot, { recursive: true, force: true }).catch(() => {});
  });
  try {
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
  } catch (error) {
    if (skipIfSpawnEperm(t, error)) return;
    throw error;
  }
  let stderr = '';
  _proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  _baseUrl = `http://127.0.0.1:${_port}/api/v1`;
  await waitForHttpReady(`${_baseUrl}/health`);

  await t.test('GET /runtime-settings returns all expected keys with correct types', async () => {
    const res = await fetch(`${_baseUrl}/runtime-settings`);
    assert.equal(res.status, 200, `unexpected status ${res.status} stderr=${stderr}`);
    const body = await res.json();

    const STRING_KEYS = [
      'searchEngines',
      'searxngBaseUrl',
      'llmModelPlan', 'llmModelReasoning',
      'resumeMode',
    ];
    for (const key of STRING_KEYS) {
      assert.equal(typeof body[key], 'string', `expected string for ${key}, got ${typeof body[key]}`);
    }

    const INT_KEYS = [
      'llmMaxOutputTokensPlan', 'llmMaxOutputTokensReasoning',
      'llmMaxOutputTokensPlanFallback',
      'resumeWindowHours',
      'crawleeRequestHandlerTimeoutSecs',
      'autoScrollPasses', 'autoScrollDelayMs', 'robotsTxtTimeoutMs',
      'runtimeScreencastFps', 'runtimeScreencastQuality', 'runtimeScreencastMaxWidth', 'runtimeScreencastMaxHeight',
      'runtimeTraceFetchRing', 'runtimeTraceLlmRing',
    ];
    for (const key of INT_KEYS) {
      assert.equal(typeof body[key], 'number', `expected number for ${key}, got ${typeof body[key]}`);
      assert.ok(Number.isInteger(body[key]), `expected integer for ${key}, got ${body[key]}`);
    }

    const BOOL_KEYS = [
      'crawleeHeadless', 'runtimeScreencastEnabled',
      'autoScrollEnabled', 'robotsTxtCompliant',
      'runtimeTraceEnabled', 'runtimeTraceLlmPayloads',
      'eventsJsonWrite',
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
      userAgent: SETTINGS_DEFAULTS.runtime.userAgent,
    };

    for (const [key, value] of Object.entries(expected)) {
      assert.deepEqual(body[key], value, `runtime-settings GET should serve canonical default for ${key}`);
    }

    assert.equal(Object.hasOwn(body, 'bingSearchEndpoint'), false, 'retired bingSearchEndpoint should stay removed');
  });

  await t.test('PUT with valid partial payload applies changes and returns applied', async () => {
    const payload = { maxPagesPerDomain: 7, searchEngines: 'google' };
    const res = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.applied.maxPagesPerDomain, 7);
    assert.equal(body.applied.searchEngines, 'google');

    const getRes = await fetch(`${_baseUrl}/runtime-settings`);
    const getBody = await getRes.json();
    assert.equal(getBody.maxPagesPerDomain, 7);
    assert.equal(getBody.searchEngines, 'google');
  });

  await t.test('PUT with invalid values returns rejected for those keys', async () => {
    const payload = { maxPagesPerDomain: 'not_a_number', llmMaxOutputTokensPlan: 'abc' };
    const res = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.rejected);
    assert.equal(body.rejected.maxPagesPerDomain, 'invalid_integer');
    assert.equal(body.rejected.llmMaxOutputTokensPlan, 'invalid_integer');
  });

  await t.test('PUT clamps out-of-range values', async () => {
    const payload = {
      maxPagesPerDomain: -5,
      maxRunSeconds: 999999,
    };
    const res = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.applied.maxPagesPerDomain, 1);
    assert.equal(body.applied.maxRunSeconds, 86400);
  });

  await t.test('PUT validates active string enums', async () => {
    const payload = { searchEngines: 'invalid_provider', resumeMode: 'bogus' };
    const res = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.rejected);
    assert.equal(body.applied.searchEngines, '');
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
    const payload = { llmModelPlan: 'test-persist-model-xyz', maxPagesPerDomain: 9 };
    const putRes = await fetch(`${_baseUrl}/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(putRes.status, 200);
    const putBody = await putRes.json();
    assert.equal(putBody.applied.llmModelPlan, 'test-persist-model-xyz');
    assert.equal(putBody.applied.maxPagesPerDomain, 9);

    const userSettingsPaths = [
      path.join(_helperRoot, '_runtime', 'user-settings.json'),
    ];
    const userSettings = await readJsonFileUntil(
      userSettingsPaths,
      (json) => (
        json
        && json.runtime
        && json.runtime.llmModelPlan === 'test-persist-model-xyz'
        && json.runtime.maxPagesPerDomain === 9
      ),
      8_000,
    );
    assert.equal(userSettings.runtime.llmModelPlan, 'test-persist-model-xyz');
    assert.equal(userSettings.runtime.maxPagesPerDomain, 9);

    const legacySettingsExists = await Promise.all([
      fs.access(path.join(_helperRoot, '_runtime', 'settings.json')).then(() => true).catch(() => false),
    ]).then((results) => results.some(Boolean));
    assert.equal(legacySettingsExists, false, 'legacy settings.json should not be written');
  });

  await t.test('PUT convergence-settings with empty registry rejects all keys', async () => {
    // With empty convergence registry, all keys are unknown and rejected
    const payload = { serpTriageMinScore: 5 };
    const putRes = await fetch(`${_baseUrl}/convergence-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(putRes.status, 200);
    const putBody = await putRes.json();
    // No convergence keys in registry — serpTriageMinScore is rejected
    assert.deepStrictEqual(putBody.applied, {});
    assert.equal(putBody.rejected.serpTriageMinScore, 'unknown_key');
  });
});
