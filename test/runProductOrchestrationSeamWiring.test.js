import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RUN_PRODUCT = path.resolve('src/pipeline/runProduct.js');
const RUN_PRODUCT_HELPERS = path.resolve('src/pipeline/helpers/runProductOrchestrationHelpers.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runProduct orchestration helper resolves need-set identity caps with defaults and overrides', async () => {
  const helpers = await import(pathToFileURL(RUN_PRODUCT_HELPERS).href);
  assert.equal(typeof helpers.buildNeedSetIdentityCaps, 'function');
  assert.deepEqual(helpers.buildNeedSetIdentityCaps({}), {
    locked: 1,
    provisional: 0.74,
    conflict: 0.39,
    unlocked: 0.59,
  });
  assert.deepEqual(helpers.buildNeedSetIdentityCaps({
    needsetCapIdentityLocked: '0.8',
    needsetCapIdentityProvisional: 0.6,
    needsetCapIdentityConflict: '0.25',
    needsetCapIdentityUnlocked: 0.5,
  }), {
    locked: 0.8,
    provisional: 0.6,
    conflict: 0.25,
    unlocked: 0.5,
  });
});

test('runProduct orchestration helper returns empty source-strategy rows for missing/blank category', async () => {
  const helpers = await import(pathToFileURL(RUN_PRODUCT_HELPERS).href);
  assert.equal(typeof helpers.loadEnabledSourceStrategyRows, 'function');
  await assert.doesNotReject(async () => {
    const noCategoryRows = await helpers.loadEnabledSourceStrategyRows({ config: {}, category: '' });
    const blankCategoryRows = await helpers.loadEnabledSourceStrategyRows({ config: {}, category: '   ' });
    assert.deepEqual(noCategoryRows, []);
    assert.deepEqual(blankCategoryRows, []);
  });
});

test('runProduct consumes external orchestration helper module for seam-bound helpers', () => {
  const runProductText = readText(RUN_PRODUCT);
  assert.equal(
    runProductText.includes("from './helpers/runProductOrchestrationHelpers.js'"),
    true,
    'runProduct should import orchestration helper seams from helper module',
  );
  assert.equal(
    runProductText.includes('function buildNeedSetIdentityCaps('),
    false,
    'runProduct should not keep inline need-set cap helper after seam extraction',
  );
  assert.equal(
    runProductText.includes('async function loadEnabledSourceStrategyRows('),
    false,
    'runProduct should not keep inline source-strategy helper after seam extraction',
  );
});
