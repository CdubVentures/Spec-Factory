import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadDotEnvFile, loadConfig } from '../src/config.js';

test('loadDotEnvFile loads dotenv values without overriding existing env vars', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-dotenv-'));
  const envPath = path.join(tempRoot, '.env');

  const keys = [
    'TEST_DOTENV_KEY',
    'TEST_DOTENV_QUOTED',
    'TEST_DOTENV_EXPORT',
    'TEST_DOTENV_EXISTING'
  ];

  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.TEST_DOTENV_EXISTING = 'keep-existing';
  delete process.env.TEST_DOTENV_KEY;
  delete process.env.TEST_DOTENV_QUOTED;
  delete process.env.TEST_DOTENV_EXPORT;

  try {
    await fs.writeFile(
      envPath,
      [
        '# comment',
        'TEST_DOTENV_KEY=value-1',
        'TEST_DOTENV_QUOTED="quoted value"',
        'export TEST_DOTENV_EXPORT=exported',
        'TEST_DOTENV_EXISTING=override-attempt'
      ].join('\n'),
      'utf8'
    );

    const loaded = loadDotEnvFile(envPath);
    assert.equal(loaded, true);
    assert.equal(process.env.TEST_DOTENV_KEY, 'value-1');
    assert.equal(process.env.TEST_DOTENV_QUOTED, 'quoted value');
    assert.equal(process.env.TEST_DOTENV_EXPORT, 'exported');
    assert.equal(process.env.TEST_DOTENV_EXISTING, 'keep-existing');
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('loadDotEnvFile returns false when file does not exist', () => {
  const loaded = loadDotEnvFile(path.join(os.tmpdir(), `missing-${Date.now()}.env`));
  assert.equal(loaded, false);
});

test('loadConfig includes lane concurrency knobs with correct defaults', () => {
  const cfg = loadConfig();
  assert.equal(cfg.laneConcurrencySearch, 2);
  assert.equal(cfg.laneConcurrencyFetch, 4);
  assert.equal(cfg.laneConcurrencyParse, 4);
  assert.equal(cfg.laneConcurrencyLlm, 2);
});

test('loadConfig lane concurrency knobs respect env overrides', () => {
  const prev = {
    LANE_CONCURRENCY_SEARCH: process.env.LANE_CONCURRENCY_SEARCH,
    LANE_CONCURRENCY_FETCH: process.env.LANE_CONCURRENCY_FETCH,
    LANE_CONCURRENCY_PARSE: process.env.LANE_CONCURRENCY_PARSE,
    LANE_CONCURRENCY_LLM: process.env.LANE_CONCURRENCY_LLM
  };
  process.env.LANE_CONCURRENCY_SEARCH = '3';
  process.env.LANE_CONCURRENCY_FETCH = '6';
  process.env.LANE_CONCURRENCY_PARSE = '8';
  process.env.LANE_CONCURRENCY_LLM = '1';
  try {
    const cfg = loadConfig();
    assert.equal(cfg.laneConcurrencySearch, 3);
    assert.equal(cfg.laneConcurrencyFetch, 6);
    assert.equal(cfg.laneConcurrencyParse, 8);
    assert.equal(cfg.laneConcurrencyLlm, 1);
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
