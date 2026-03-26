import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../../config.js';
import { withSavedEnv } from './helpers/configTestHarness.js';

test('config resolves categoryAuthorityRoot with canonical env precedence and legacy fallback', () => {
  const keys = ['CATEGORY_AUTHORITY_ROOT', 'HELPER_FILES_ROOT'];
  return withSavedEnv(keys, () => {
    process.env.CATEGORY_AUTHORITY_ROOT = '/tmp/category-authority-root';
    process.env.HELPER_FILES_ROOT = '/tmp/legacy-helper-root';
    let cfg = loadConfig();
    assert.equal(cfg.categoryAuthorityRoot, '/tmp/category-authority-root');

    delete process.env.CATEGORY_AUTHORITY_ROOT;
    process.env.HELPER_FILES_ROOT = '/tmp/legacy-helper-root';
    cfg = loadConfig();
    assert.equal(cfg.categoryAuthorityRoot, '/tmp/legacy-helper-root');
  });
});

test('config defaults helper authority root to canonical category_authority token', () => {
  const keys = ['CATEGORY_AUTHORITY_ROOT', 'HELPER_FILES_ROOT'];
  return withSavedEnv(keys, () => {
    delete process.env.CATEGORY_AUTHORITY_ROOT;
    delete process.env.HELPER_FILES_ROOT;

    const cfg = loadConfig();
    assert.equal(cfg.categoryAuthorityRoot, 'category_authority');
    assert.strictEqual(cfg.helperFilesRoot, undefined, 'helperFilesRoot should no longer exist on config');
  });
});
