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

test('loadDotEnvFile can override existing env vars when overrideExisting is true', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-dotenv-override-'));
  const envPath = path.join(tempRoot, '.env');

  const keys = [
    'TEST_DOTENV_OVERRIDE_KEY'
  ];

  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.TEST_DOTENV_OVERRIDE_KEY = 'from-env';

  try {
    await fs.writeFile(
      envPath,
      'TEST_DOTENV_OVERRIDE_KEY=from-dotenv\n',
      'utf8'
    );

    const loaded = loadDotEnvFile(envPath, { overrideExisting: true });
    assert.equal(loaded, true);
    assert.equal(process.env.TEST_DOTENV_OVERRIDE_KEY, 'from-dotenv');
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

test('loadDotEnvFile can override only selected keys when overrideExistingKeys is provided', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-dotenv-selective-'));
  const envPath = path.join(tempRoot, '.env');

  const keys = [
    'TEST_DOTENV_SELECTIVE_OVERRIDE',
    'TEST_DOTENV_SELECTIVE_KEEP'
  ];

  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.TEST_DOTENV_SELECTIVE_OVERRIDE = 'from-env-override';
  process.env.TEST_DOTENV_SELECTIVE_KEEP = 'from-env-keep';

  try {
    await fs.writeFile(
      envPath,
      [
        'TEST_DOTENV_SELECTIVE_OVERRIDE=from-dotenv-override',
        'TEST_DOTENV_SELECTIVE_KEEP=from-dotenv-keep'
      ].join('\n'),
      'utf8'
    );

    const loaded = loadDotEnvFile(envPath, {
      overrideExistingKeys: ['TEST_DOTENV_SELECTIVE_OVERRIDE']
    });
    assert.equal(loaded, true);
    assert.equal(process.env.TEST_DOTENV_SELECTIVE_OVERRIDE, 'from-dotenv-override');
    assert.equal(process.env.TEST_DOTENV_SELECTIVE_KEEP, 'from-env-keep');
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

