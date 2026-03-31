import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../../config.js';
import { withSavedEnv } from './helpers/configTestHarness.js';

test('config resolves categoryAuthorityRoot from CATEGORY_AUTHORITY_ROOT env', () => {
  return withSavedEnv(['CATEGORY_AUTHORITY_ROOT'], () => {
    process.env.CATEGORY_AUTHORITY_ROOT = '/tmp/category-authority-root';
    const cfg = loadConfig();
    assert.equal(cfg.categoryAuthorityRoot, '/tmp/category-authority-root');
  });
});

test('config defaults categoryAuthorityRoot to category_authority', () => {
  return withSavedEnv(['CATEGORY_AUTHORITY_ROOT'], () => {
    delete process.env.CATEGORY_AUTHORITY_ROOT;
    const cfg = loadConfig();
    assert.equal(cfg.categoryAuthorityRoot, 'category_authority');
  });
});
