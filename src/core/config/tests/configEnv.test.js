import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadDotEnvFile } from '../../../config.js';
import { withSavedEnv, withTempDirSync } from './helpers/configTestHarness.js';

test('loadDotEnvFile loads dotenv values without overriding existing env vars', async () => {
  const keys = [
    'TEST_DOTENV_KEY',
    'TEST_DOTENV_QUOTED',
    'TEST_DOTENV_EXPORT',
    'TEST_DOTENV_EXISTING',
  ];

  await withSavedEnv(keys, () => withTempDirSync('spec-harvester-dotenv-', async (tempRoot) => {
    const envPath = path.join(tempRoot, '.env');
    process.env.TEST_DOTENV_EXISTING = 'keep-existing';
    delete process.env.TEST_DOTENV_KEY;
    delete process.env.TEST_DOTENV_QUOTED;
    delete process.env.TEST_DOTENV_EXPORT;

    await fs.writeFile(
      envPath,
      [
        '# comment',
        'TEST_DOTENV_KEY=value-1',
        'TEST_DOTENV_QUOTED="quoted value"',
        'export TEST_DOTENV_EXPORT=exported',
        'TEST_DOTENV_EXISTING=override-attempt',
      ].join('\n'),
      'utf8',
    );

    const loaded = loadDotEnvFile(envPath);
    assert.equal(loaded, true);
    assert.equal(process.env.TEST_DOTENV_KEY, 'value-1');
    assert.equal(process.env.TEST_DOTENV_QUOTED, 'quoted value');
    assert.equal(process.env.TEST_DOTENV_EXPORT, 'exported');
    assert.equal(process.env.TEST_DOTENV_EXISTING, 'keep-existing');
  }));
});

test('loadDotEnvFile can override existing env vars when overrideExisting is true', async () => {
  const keys = ['TEST_DOTENV_OVERRIDE_KEY'];

  await withSavedEnv(keys, () => withTempDirSync('spec-harvester-dotenv-override-', async (tempRoot) => {
    const envPath = path.join(tempRoot, '.env');
    process.env.TEST_DOTENV_OVERRIDE_KEY = 'from-env';

    await fs.writeFile(
      envPath,
      'TEST_DOTENV_OVERRIDE_KEY=from-dotenv\n',
      'utf8',
    );

    const loaded = loadDotEnvFile(envPath, { overrideExisting: true });
    assert.equal(loaded, true);
    assert.equal(process.env.TEST_DOTENV_OVERRIDE_KEY, 'from-dotenv');
  }));
});

test('loadDotEnvFile can override only selected keys when overrideExistingKeys is provided', async () => {
  const keys = [
    'TEST_DOTENV_SELECTIVE_OVERRIDE',
    'TEST_DOTENV_SELECTIVE_KEEP',
  ];

  await withSavedEnv(keys, () => withTempDirSync('spec-harvester-dotenv-selective-', async (tempRoot) => {
    const envPath = path.join(tempRoot, '.env');
    process.env.TEST_DOTENV_SELECTIVE_OVERRIDE = 'from-env-override';
    process.env.TEST_DOTENV_SELECTIVE_KEEP = 'from-env-keep';

    await fs.writeFile(
      envPath,
      [
        'TEST_DOTENV_SELECTIVE_OVERRIDE=from-dotenv-override',
        'TEST_DOTENV_SELECTIVE_KEEP=from-dotenv-keep',
      ].join('\n'),
      'utf8',
    );

    const loaded = loadDotEnvFile(envPath, {
      overrideExistingKeys: ['TEST_DOTENV_SELECTIVE_OVERRIDE'],
    });
    assert.equal(loaded, true);
    assert.equal(process.env.TEST_DOTENV_SELECTIVE_OVERRIDE, 'from-dotenv-override');
    assert.equal(process.env.TEST_DOTENV_SELECTIVE_KEEP, 'from-env-keep');
  }));
});

test('loadDotEnvFile returns false when file does not exist', () => {
  return withTempDirSync('spec-harvester-dotenv-missing-', (tempRoot) => {
    const loaded = loadDotEnvFile(path.join(tempRoot, 'missing.env'));
    assert.equal(loaded, false);
  });
});
