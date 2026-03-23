import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  readSourcesFile,
  writeSourcesFile,
  generateSourceId,
  deriveApprovedFromSources,
  listSourceEntries,
  addSourceEntry,
  updateSourceEntry,
  removeSourceEntry,
  DISCOVERY_DEFAULTS,
} from '../src/features/indexing/sources/sourceFileService.js';

function makeTempRoot() {
  const tmpDir = path.join('test', '_tmp_source_file_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

const MINIMAL_SOURCE = {
  display_name: 'RTINGS',
  tier: 'tier2_lab',
  authority: 'instrumented',
  base_url: 'https://www.rtings.com',
  content_types: ['review'],
  doc_kinds: ['review'],
  crawl_config: { method: 'playwright', rate_limit_ms: 3000, timeout_ms: 20000, robots_txt_compliant: true },
  field_coverage: { high: ['weight'], medium: [], low: [] },
  discovery: { method: 'search_first', source_type: 'lab_review', search_pattern: '', priority: 90, enabled: true, notes: '' },
};

const MINIMAL_DATA = {
  category: 'mouse',
  version: '1.0.0',
  approved: { manufacturer: [], lab: ['rtings.com'], database: [], retailer: [] },
  denylist: [],
  sources: { rtings_com: MINIMAL_SOURCE },
};

describe('generateSourceId', () => {
  const cases = [
    ['rtings.com', 'rtingscom'],
    ['www.bestbuy.com', 'wwwbestbuycom'],
    ['duckychannel.com.tw', 'duckychannelcomtw'],
    ['pc-monitors.info', 'pcmonitorsinfo'],
    ['RTINGS.COM', 'rtingscom'],
    ['b&h.com', 'bhcom'],
  ];
  for (const [input, expected] of cases) {
    it(`${input} -> ${expected}`, () => {
      assert.equal(generateSourceId(input), expected);
    });
  }
});

describe('readSourcesFile', () => {
  let tmpDir;
  before(() => { tmpDir = makeTempRoot(); });
  after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns default structure when file does not exist', async () => {
    const data = await readSourcesFile(tmpDir, 'nonexistent');
    assert.equal(data.category, 'nonexistent');
    assert.deepEqual(data.sources, {});
    assert.deepEqual(data.approved, {});
  });

  it('reads valid sources.json', async () => {
    const catDir = path.join(tmpDir, 'mouse');
    fs.mkdirSync(catDir, { recursive: true });
    fs.writeFileSync(path.join(catDir, 'sources.json'), JSON.stringify(MINIMAL_DATA));
    const data = await readSourcesFile(tmpDir, 'mouse');
    assert.equal(data.category, 'mouse');
    assert.ok(data.sources.rtings_com);
    assert.equal(data.sources.rtings_com.display_name, 'RTINGS');
  });
});

describe('writeSourcesFile', () => {
  let tmpDir;
  before(() => { tmpDir = makeTempRoot(); });
  after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('writes and reads back identically', async () => {
    await writeSourcesFile(tmpDir, 'mouse', MINIMAL_DATA);
    const readBack = await readSourcesFile(tmpDir, 'mouse');
    assert.equal(readBack.category, 'mouse');
    assert.equal(readBack.sources.rtings_com.display_name, 'RTINGS');
  });

  it('creates directory if missing', async () => {
    await writeSourcesFile(tmpDir, 'newcat', { ...MINIMAL_DATA, category: 'newcat' });
    const readBack = await readSourcesFile(tmpDir, 'newcat');
    assert.equal(readBack.category, 'newcat');
  });
});

describe('deriveApprovedFromSources', () => {
  it('groups by tier role', () => {
    const sources = {
      razer_com: { ...MINIMAL_SOURCE, tier: 'tier1_manufacturer', base_url: 'https://razer.com' },
      rtings_com: { ...MINIMAL_SOURCE, tier: 'tier2_lab', base_url: 'https://rtings.com' },
      bestbuy_com: { ...MINIMAL_SOURCE, tier: 'tier3_retailer', base_url: 'https://bestbuy.com' },
      reddit_com: { ...MINIMAL_SOURCE, tier: 'tier4_community', base_url: 'https://reddit.com' },
      versus_com: { ...MINIMAL_SOURCE, tier: 'tier5_aggregator', base_url: 'https://versus.com' },
    };
    const approved = deriveApprovedFromSources(sources);
    assert.ok(approved.manufacturer.includes('razer.com'));
    assert.ok(approved.lab.includes('rtings.com'));
    assert.ok(approved.retailer.includes('bestbuy.com'));
    assert.ok(approved.database.includes('reddit.com') || approved.database.includes('versus.com'));
  });

  it('returns empty arrays for empty sources', () => {
    const approved = deriveApprovedFromSources({});
    assert.deepEqual(approved.manufacturer, []);
    assert.deepEqual(approved.lab, []);
  });
});

describe('listSourceEntries', () => {
  it('returns sorted array with sourceId and derived host attached', () => {
    const data = {
      ...MINIMAL_DATA,
      sources: {
        low_priority: { ...MINIMAL_SOURCE, discovery: { ...MINIMAL_SOURCE.discovery, priority: 10 } },
        high_priority: { ...MINIMAL_SOURCE, discovery: { ...MINIMAL_SOURCE.discovery, priority: 99 } },
      },
    };
    const entries = listSourceEntries(data);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].sourceId, 'high_priority');
    assert.equal(entries[0].host, 'rtings.com');
    assert.equal(entries[1].sourceId, 'low_priority');
    assert.equal(entries[1].host, 'rtings.com');
  });

  it('uses default discovery when absent', () => {
    const noDiscovery = { ...MINIMAL_SOURCE };
    delete noDiscovery.discovery;
    const data = { ...MINIMAL_DATA, sources: { test_com: noDiscovery } };
    const entries = listSourceEntries(data);
    assert.equal(entries[0].host, 'rtings.com');
    assert.equal(entries[0].discovery.method, DISCOVERY_DEFAULTS.method);
    assert.equal(entries[0].discovery.priority, DISCOVERY_DEFAULTS.priority);
  });

  it('falls back to sourceId-derived host when base_url is absent', () => {
    const noBaseUrl = { ...MINIMAL_SOURCE };
    delete noBaseUrl.base_url;
    const data = { ...MINIMAL_DATA, sources: { techpowerup_com: noBaseUrl } };
    const entries = listSourceEntries(data);
    assert.equal(entries[0].host, 'techpowerup.com');
    assert.equal(entries[0].discovery.method, 'search_first');
  });
});

describe('addSourceEntry', () => {
  it('adds entry and recomputes approved', () => {
    const result = addSourceEntry(MINIMAL_DATA, 'bestbuy_com', {
      ...MINIMAL_SOURCE,
      tier: 'tier3_retailer',
      base_url: 'https://bestbuy.com',
    });
    assert.ok(result.sources.bestbuy_com);
    assert.ok(result.sources.rtings_com);
    assert.ok(result.approved.retailer.includes('bestbuy.com'));
  });

  it('throws on duplicate sourceId', () => {
    assert.throws(
      () => addSourceEntry(MINIMAL_DATA, 'rtings_com', MINIMAL_SOURCE),
      /already exists/,
    );
  });
});

describe('updateSourceEntry', () => {
  it('patches entry and recomputes approved', () => {
    const result = updateSourceEntry(MINIMAL_DATA, 'rtings_com', {
      display_name: 'RTINGS Updated',
      discovery: { priority: 95 },
    });
    assert.equal(result.sources.rtings_com.display_name, 'RTINGS Updated');
    assert.equal(result.sources.rtings_com.discovery.priority, 95);
    assert.equal(result.sources.rtings_com.discovery.method, 'search_first');
  });

  it('throws on missing sourceId', () => {
    assert.throws(
      () => updateSourceEntry(MINIMAL_DATA, 'nonexistent_com', { display_name: 'x' }),
      /not found/,
    );
  });
});

describe('removeSourceEntry', () => {
  it('removes entry and recomputes approved', () => {
    const result = removeSourceEntry(MINIMAL_DATA, 'rtings_com');
    assert.equal(result.sources.rtings_com, undefined);
    assert.ok(!result.approved.lab.includes('rtings.com'));
  });

  it('throws on missing sourceId', () => {
    assert.throws(
      () => removeSourceEntry(MINIMAL_DATA, 'nonexistent_com'),
      /not found/,
    );
  });
});

