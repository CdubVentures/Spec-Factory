import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  readSourcesFile,
  writeSourcesFile,
  generateSourceId,
  listSourceEntries,
  addSourceEntry,
  updateSourceEntry,
  removeSourceEntry,
} from '../sourceFileService.js';

function makeTempRoot() {
  const tmpDir = path.join('test', '_tmp_source_strategy_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

const ENTRY = {
  display_name: 'RTINGS',
  tier: 'tier2_lab',
  authority: 'instrumented',
  base_url: 'https://www.rtings.com',
  content_types: ['review', 'benchmark'],
  doc_kinds: ['review'],
  crawl_config: { method: 'playwright', rate_limit_ms: 3000, timeout_ms: 20000, robots_txt_compliant: true },
  field_coverage: { high: ['click_latency', 'weight'], medium: ['sensor'], low: [] },
  discovery: { method: 'search_first', source_type: 'lab_review', search_pattern: '', priority: 90, enabled: true, notes: '' },
};

describe('sourceStrategy (file-backed)', () => {
  let tmpDir;
  let data;

  before(async () => {
    tmpDir = makeTempRoot();
    data = {
      category: 'mouse',
      version: '1.0.0',
      approved: {},
      denylist: [],
      sources: {},
    };
  });

  after(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  });

  it('CRUD: add, read, update, remove', async () => {
    data = addSourceEntry(data, 'rtings_com', ENTRY);
    assert.ok(data.sources.rtings_com);

    const entries = listSourceEntries(data);
    assert.ok(entries.length >= 1);
    const found = entries.find((entry) => entry.sourceId === 'rtings_com');
    assert.ok(found);
    assert.equal(found.display_name, 'RTINGS');
    assert.equal(found.discovery.priority, 90);

    data = updateSourceEntry(data, 'rtings_com', { display_name: 'RTINGS Updated', discovery: { priority: 95, notes: 'Top tier' } });
    assert.equal(data.sources.rtings_com.display_name, 'RTINGS Updated');
    assert.equal(data.sources.rtings_com.discovery.priority, 95);

    data = removeSourceEntry(data, 'rtings_com');
    assert.equal(data.sources.rtings_com, undefined);
  });

  it('discovery reads enabled sources from file entries', () => {
    let testData = addSourceEntry(data, 'techpowerup_com', {
      ...ENTRY,
      display_name: 'TechPowerUp',
      base_url: 'https://techpowerup.com',
      discovery: { method: 'search_first', source_type: 'lab_review', search_pattern: '', priority: 85, enabled: true, notes: '' },
    });
    testData = addSourceEntry(testData, 'eloshapes_com', {
      ...ENTRY,
      display_name: 'Eloshapes',
      base_url: 'https://eloshapes.com',
      discovery: { method: 'search_first', source_type: 'spec_database', search_pattern: '', priority: 70, enabled: true, notes: '' },
    });

    const entries = listSourceEntries(testData);
    const enabled = entries.filter((entry) => entry.discovery.enabled);
    assert.ok(enabled.length >= 2);
    assert.ok(enabled.some((entry) => entry.sourceId === 'techpowerup_com'));
    assert.ok(enabled.some((entry) => entry.sourceId === 'eloshapes_com'));
  });

  it('disabled sources stay in sources.json but are excluded from enabled source entry lists', () => {
    const testData = addSourceEntry(data, 'disabled_com', {
      ...ENTRY,
      base_url: 'https://disabled-site.com',
      discovery: { method: 'search_first', source_type: 'retail', search_pattern: '', priority: 10, enabled: false, notes: '' },
    });

    const entries = listSourceEntries(testData);
    const disabledEntry = entries.find((entry) => entry.host === 'disabled-site.com');
    const enabledEntries = entries.filter((entry) => entry.discovery.enabled !== false);
    assert.ok(disabledEntry);
    assert.equal(disabledEntry.discovery.enabled, false);
    assert.equal(enabledEntries.some((entry) => entry.host === 'disabled-site.com'), false);
  });

  it('search_first method remains nested under discovery on file-backed source entries', () => {
    const testData = addSourceEntry(data, 'techpowerup_com2', {
      ...ENTRY,
      display_name: 'TechPowerUp',
      base_url: 'https://techpowerup.com',
      discovery: { method: 'search_first', source_type: 'lab_review', search_pattern: '', priority: 85, enabled: true, notes: '' },
    });

    const entries = listSourceEntries(testData);
    const tpu = entries.find((entry) => entry.host === 'techpowerup.com');
    assert.ok(tpu);
    assert.equal(tpu.discovery.method, 'search_first');
    assert.equal(Object.hasOwn(tpu, 'discovery_method'), false);
    const siteQuery = `site:${tpu.host} Razer Viper V3 Pro`;
    assert.ok(siteQuery.includes('site:techpowerup.com'));
  });

  it('file write and readback round-trip', async () => {
    const testData = addSourceEntry(data, 'rtings_com', ENTRY);
    await writeSourcesFile(tmpDir, 'mouse', testData);
    const readBack = await readSourcesFile(tmpDir, 'mouse');
    assert.equal(readBack.sources.rtings_com.display_name, 'RTINGS');
    const entries = listSourceEntries(readBack);
    assert.equal(entries[0].sourceId, 'rtings_com');
  });
});
