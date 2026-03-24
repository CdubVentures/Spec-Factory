import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const RUN_PRODUCT_HELPERS = path.resolve('src/features/indexing/orchestration/shared/runProductOrchestrationHelpers.js');

test('runProduct orchestration helper returns empty source entries for missing/blank category', async () => {
  const helpers = await import(pathToFileURL(RUN_PRODUCT_HELPERS).href);
  assert.equal(typeof helpers.loadEnabledSourceEntries, 'function');
  await assert.doesNotReject(async () => {
    const noCategoryEntries = await helpers.loadEnabledSourceEntries({ config: {}, category: '' });
    const blankCategoryEntries = await helpers.loadEnabledSourceEntries({ config: {}, category: '   ' });
    assert.deepEqual(noCategoryEntries, []);
    assert.deepEqual(blankCategoryEntries, []);
  });
});

test('runProduct orchestration helper loads enabled file-backed source entries without flattening discovery fields', async () => {
  const helpers = await import(pathToFileURL(RUN_PRODUCT_HELPERS).href);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'source-entries-'));
  const categoryRoot = path.join(tempRoot, 'mouse');

  try {
    fs.mkdirSync(categoryRoot, { recursive: true });
    fs.writeFileSync(path.join(categoryRoot, 'sources.json'), JSON.stringify({
      category: 'mouse',
      version: '1.0.0',
      approved: { manufacturer: [], lab: ['rtings.com'], database: [], retailer: [] },
      denylist: [],
      sources: {
        rtings_com: {
          display_name: 'RTINGS',
          tier: 'tier2_lab',
          authority: 'instrumented',
          base_url: 'https://www.rtings.com',
          content_types: ['review'],
          doc_kinds: ['review'],
          crawl_config: { method: 'playwright', rate_limit_ms: 3000, timeout_ms: 20000, robots_txt_compliant: true },
          field_coverage: { high: ['weight'], medium: [], low: [] },
          discovery: { method: 'search_first', source_type: 'lab_review', search_pattern: '', priority: 90, enabled: true, notes: '' },
        },
        disabled_com: {
          display_name: 'Disabled',
          tier: 'tier2_lab',
          authority: 'unknown',
          base_url: 'https://disabled.example.com',
          content_types: [],
          doc_kinds: [],
          crawl_config: { method: 'http', rate_limit_ms: 2000, timeout_ms: 12000, robots_txt_compliant: true },
          field_coverage: { high: [], medium: [], low: [] },
          discovery: { method: 'manual', source_type: '', search_pattern: '', priority: 10, enabled: false, notes: '' },
        },
      },
    }, null, 2));

    const sourceEntries = await helpers.loadEnabledSourceEntries({
      config: { categoryAuthorityRoot: tempRoot },
      category: 'mouse',
    });

    assert.equal(sourceEntries.length, 1);
    assert.equal(sourceEntries[0].sourceId, 'rtings_com');
    assert.equal(sourceEntries[0].host, 'rtings.com');
    assert.equal(sourceEntries[0].discovery.method, 'search_first');
    assert.equal(Object.hasOwn(sourceEntries[0], 'discovery_method'), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
