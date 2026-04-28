import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { generatePerKeyDocs } from '../perKeyDocBuilder.js';

function mkRule(over = {}) {
  return {
    priority: { required_level: 'non_mandatory', availability: 'always', difficulty: 'medium' },
    contract: { type: 'string', shape: 'scalar' },
    enum: { policy: 'closed', values: ['a', 'b'] },
    aliases: [],
    ai_assist: { reasoning_note: '' },
    search_hints: { domain_hints: [], query_terms: [] },
    ui: { label: 'Field' },
    ...over,
  };
}

async function mkTmpDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'per-key-docs-'));
  return dir;
}

async function cleanupDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

function loadedRulesFixture() {
  return {
    rules: {
      fields: {
        dpi: mkRule({ ui: { label: 'DPI', group: 'sensor_performance' }, contract: { type: 'number', shape: 'scalar', unit: 'dpi' }, enum: { policy: '', values: [] } }),
        ips: mkRule({ ui: { label: 'IPS', group: 'sensor_performance' }, contract: { type: 'number', shape: 'scalar', unit: 'ips' }, enum: { policy: '', values: [] } }),
        form_factor: mkRule({ ui: { label: 'Form Factor', group: 'ergonomics' }, enum: { policy: 'closed', values: ['ambidextrous', 'right'] } }),
        colors: mkRule({ ui: { label: 'Colors', group: 'general' } }), // reserved
      },
    },
    knownValues: { enums: {} },
    componentDBs: {},
  };
}

function loadedRulesContextFixture() {
  return {
    rules: {
      fields: {
        sensor: mkRule({
          field_key: 'sensor',
          ui: { label: 'Sensor', group: 'sensor_performance' },
          component: { type: 'sensor', source: 'component_db.sensor' },
          enum: { policy: 'open_prefer_known', source: 'data_lists.sensor', values: [] },
          variance_policy: 'authoritative',
        }),
        dpi: mkRule({
          field_key: 'dpi',
          ui: { label: 'DPI', group: 'sensor_performance' },
          contract: { type: 'number', shape: 'scalar', unit: 'dpi' },
          enum: { policy: '', values: [] },
          variance_policy: 'upper_bound',
        }),
        sensor_date: mkRule({
          field_key: 'sensor_date',
          ui: { label: 'Sensor Date', group: 'sensor_performance' },
          contract: { type: 'date', shape: 'scalar' },
          constraints: ['sensor_date <= release_date'],
          variance_policy: 'authoritative',
        }),
        release_date: mkRule({
          field_key: 'release_date',
          ui: { label: 'Release Date', group: 'general' },
          contract: { type: 'date', shape: 'scalar' },
          enum: { policy: '', values: [] },
        }),
      },
    },
    knownValues: { enums: { sensor: { policy: 'open_prefer_known', values: ['PAW3950'] } } },
    componentDBs: {
      sensor: {
        component_type: 'sensor',
        items: [
          {
            name: 'PAW3950',
            maker: 'PixArt',
            aliases: ['3950'],
            properties: { dpi: 30000, sensor_date: '2023-01' },
            __variance_policies: { dpi: 'upper_bound', sensor_date: 'authoritative' },
            __constraints: { sensor_date: ['sensor_date <= release_date'] },
          },
        ],
      },
      switch: {
        component_type: 'switch',
        items: [{ name: 'Optical Gen 3', properties: { switch_type: 'optical' } }],
      },
    },
  };
}

function fieldGroupsFixture() {
  return {
    group_index: {
      sensor_performance: ['dpi', 'ips'],
      ergonomics: ['form_factor'],
      general: ['colors'],
    },
  };
}

function contextFieldGroupsFixture() {
  return {
    group_index: {
      general: ['release_date'],
      sensor_performance: ['sensor', 'dpi', 'sensor_date'],
    },
  };
}

test('generatePerKeyDocs writes one pair per non-reserved key', async () => {
  const outputRoot = await mkTmpDir();
  try {
    const result = await generatePerKeyDocs({
      category: 'mouse',
      loadedRules: loadedRulesFixture(),
      fieldGroups: fieldGroupsFixture(),
      globalFragments: {},
      tierBundles: { fallback: { model: 'test-model' } },
      outputRoot,
      now: new Date('2026-04-23T00:00:00Z'),
    });

    assert.equal(result.written.length, 3, 'three non-reserved keys written');
    assert.equal(result.skipped.length, 1, 'one reserved key skipped');
    assert.equal(result.skipped[0].fieldKey, 'colors');

    // Verify the file tree
    for (const entry of result.written) {
      const htmlExists = await fs.access(entry.htmlPath).then(() => true).catch(() => false);
      const mdExists = await fs.access(entry.mdPath).then(() => true).catch(() => false);
      assert.ok(htmlExists, `html exists for ${entry.fieldKey}`);
      assert.ok(mdExists, `md exists for ${entry.fieldKey}`);
      assert.ok(entry.htmlPath.includes(entry.group), 'path includes group');
      assert.ok(entry.htmlPath.includes(entry.fieldKey), 'path includes field key');
    }

    // Reserved-keys summary
    assert.ok(result.reservedKeysPath, 'reservedKeysPath returned');
    const reservedSummary = await fs.readFile(result.reservedKeysPath, 'utf8');
    assert.match(reservedSummary, /colors/);
    assert.match(reservedSummary, /CEF|colorEditionFinder/i);
    await fs.access(path.join(outputRoot, 'mouse', 'auditors-responses'));
  } finally {
    await cleanupDir(outputRoot);
  }
});

test('output path is <outputRoot>/<category>/per-key/<group>/<fieldKey>.{html,md}', async () => {
  const outputRoot = await mkTmpDir();
  try {
    const result = await generatePerKeyDocs({
      category: 'mouse',
      loadedRules: loadedRulesFixture(),
      fieldGroups: fieldGroupsFixture(),
      globalFragments: {},
      tierBundles: {},
      outputRoot,
      now: new Date('2026-04-23T00:00:00Z'),
    });
    const dpiEntry = result.written.find((e) => e.fieldKey === 'dpi');
    assert.ok(dpiEntry, 'dpi entry present');
    const expected = path.join(outputRoot, 'mouse', 'per-key', 'sensor_performance', 'dpi.html');
    assert.equal(dpiEntry.htmlPath, expected);
  } finally {
    await cleanupDir(outputRoot);
  }
});

test('rolling overwrite — running twice replaces the prior contents', async () => {
  const outputRoot = await mkTmpDir();
  try {
    await generatePerKeyDocs({
      category: 'mouse',
      loadedRules: loadedRulesFixture(),
      fieldGroups: fieldGroupsFixture(),
      globalFragments: {},
      tierBundles: {},
      outputRoot,
      now: new Date('2026-04-23T00:00:00Z'),
    });
    const firstResult = await generatePerKeyDocs({
      category: 'mouse',
      loadedRules: loadedRulesFixture(),
      fieldGroups: fieldGroupsFixture(),
      globalFragments: {},
      tierBundles: {},
      outputRoot,
      now: new Date('2026-04-24T00:00:00Z'),
    });
    const dpiHtml = firstResult.written.find((e) => e.fieldKey === 'dpi').htmlPath;
    const content = await fs.readFile(dpiHtml, 'utf8');
    assert.ok(content.includes('2026-04-24T00:00:00.000Z'), 'second run timestamp present');
    assert.ok(!content.includes('2026-04-23T00:00:00.000Z'), 'first run timestamp replaced');
  } finally {
    await cleanupDir(outputRoot);
  }
});

test('regeneration archives previous per-key tree and prunes archives older than 90 days', async () => {
  const outputRoot = await mkTmpDir();
  try {
    await generatePerKeyDocs({
      category: 'mouse',
      loadedRules: loadedRulesFixture(),
      fieldGroups: fieldGroupsFixture(),
      globalFragments: {},
      tierBundles: {},
      outputRoot,
      now: new Date('2026-01-01T00:00:00Z'),
    });

    const staleArchive = path.join(outputRoot, 'mouse', 'archive', 'stale-old-run');
    await fs.mkdir(path.join(staleArchive, 'per-key'), { recursive: true });
    await fs.writeFile(path.join(staleArchive, 'per-key', 'old.md'), 'old', 'utf8');
    await fs.utimes(staleArchive, new Date('2025-01-01T00:00:00Z'), new Date('2025-01-01T00:00:00Z'));

    await generatePerKeyDocs({
      category: 'mouse',
      loadedRules: loadedRulesFixture(),
      fieldGroups: fieldGroupsFixture(),
      globalFragments: {},
      tierBundles: {},
      outputRoot,
      now: new Date('2026-04-15T00:00:00Z'),
    });

    const archivedDpi = path.join(
      outputRoot,
      'mouse',
      'archive',
      '2026-04-15T00-00-00-000Z',
      'per-key',
      'sensor_performance',
      'dpi.md',
    );
    const archived = await fs.readFile(archivedDpi, 'utf8');
    assert.match(archived, /2026-01-01T00:00:00.000Z/);
    await assert.rejects(() => fs.access(staleArchive), /ENOENT/);
  } finally {
    await cleanupDir(outputRoot);
  }
});

test('regeneration removes stale files from old group folders', async () => {
  const outputRoot = await mkTmpDir();
  try {
    await generatePerKeyDocs({
      category: 'mouse',
      loadedRules: loadedRulesFixture(),
      fieldGroups: fieldGroupsFixture(),
      globalFragments: {},
      tierBundles: {},
      outputRoot,
      now: new Date('2026-04-23T00:00:00Z'),
    });

    const oldDpiPath = path.join(outputRoot, 'mouse', 'per-key', 'sensor_performance', 'dpi.md');
    await fs.access(oldDpiPath);

    const movedRules = loadedRulesFixture();
    movedRules.rules.fields.dpi = {
      ...movedRules.rules.fields.dpi,
      ui: { ...movedRules.rules.fields.dpi.ui, group: 'sensor_identity' },
    };

    const secondResult = await generatePerKeyDocs({
      category: 'mouse',
      loadedRules: movedRules,
      fieldGroups: {
        group_index: {
          sensor_identity: ['dpi'],
          sensor_performance: ['ips'],
          ergonomics: ['form_factor'],
          general: ['colors'],
        },
      },
      globalFragments: {},
      tierBundles: {},
      outputRoot,
      now: new Date('2026-04-24T00:00:00Z'),
    });

    const newDpiPath = secondResult.written.find((e) => e.fieldKey === 'dpi').mdPath;
    assert.equal(newDpiPath, path.join(outputRoot, 'mouse', 'per-key', 'sensor_identity', 'dpi.md'));
    await fs.access(newDpiPath);
    await assert.rejects(
      () => fs.access(oldDpiPath),
      /ENOENT/,
      'old group path is removed so stale per-key docs cannot survive',
    );
  } finally {
    await cleanupDir(outputRoot);
  }
});

test('generated file contains the full contract schema table and placeholder prompt', async () => {
  const outputRoot = await mkTmpDir();
  try {
    const result = await generatePerKeyDocs({
      category: 'mouse',
      loadedRules: loadedRulesFixture(),
      fieldGroups: fieldGroupsFixture(),
      globalFragments: {},
      tierBundles: {},
      outputRoot,
      now: new Date('2026-04-23T00:00:00Z'),
    });
    const dpiHtml = await fs.readFile(result.written.find((e) => e.fieldKey === 'dpi').htmlPath, 'utf8');
    assert.match(dpiHtml, /Contract schema/i);
    assert.match(dpiHtml, /&lt;BRAND&gt;/i); // escaped placeholder in HTML
    assert.match(dpiHtml, /priority\.difficulty/i);
    assert.match(dpiHtml, /no contract change/i);
    assert.match(dpiHtml, /Consumer-surface impact/i);
    assert.match(dpiHtml, /n\/a/i);
    assert.match(dpiHtml, /Use boolean only for true two-state facts/i);
    assert.match(dpiHtml, /Never add/i);
    assert.match(dpiHtml, /enum values/i);
  } finally {
    await cleanupDir(outputRoot);
  }
});

test('generated per-key file includes category key map, constraints, and component variance context', async () => {
  const outputRoot = await mkTmpDir();
  try {
    const result = await generatePerKeyDocs({
      category: 'mouse',
      loadedRules: loadedRulesContextFixture(),
      fieldGroups: contextFieldGroupsFixture(),
      globalFragments: {},
      tierBundles: {},
      outputRoot,
      now: new Date('2026-04-23T00:00:00Z'),
    });
    const dpiEntry = result.written.find((e) => e.fieldKey === 'dpi');
    assert.ok(dpiEntry, 'dpi entry present');
    const dpiHtml = await fs.readFile(dpiEntry.htmlPath, 'utf8');
    assert.match(dpiHtml, /Category key map/i);
    assert.match(dpiHtml, /release_date/i);
    assert.match(dpiHtml, /sensor_date &lt;= release_date/i);
    assert.match(dpiHtml, /All current components/i);
    assert.match(dpiHtml, /switch/i);
    assert.match(dpiHtml, /PAW3950/i);
    assert.match(dpiHtml, /upper_bound/i);
  } finally {
    await cleanupDir(outputRoot);
  }
});

test('rejects missing category / outputRoot', async () => {
  await assert.rejects(
    () => generatePerKeyDocs({ category: '', loadedRules: loadedRulesFixture(), fieldGroups: fieldGroupsFixture(), globalFragments: {}, tierBundles: {}, outputRoot: '/tmp/x' }),
    /category/,
  );
  await assert.rejects(
    () => generatePerKeyDocs({ category: 'mouse', loadedRules: loadedRulesFixture(), fieldGroups: fieldGroupsFixture(), globalFragments: {}, tierBundles: {}, outputRoot: '' }),
    /outputRoot/,
  );
});

test('fieldKeyOrder writes a sorted/ folder of numbered .md files in navigator order', async () => {
  const outputRoot = await mkTmpDir();
  try {
    const result = await generatePerKeyDocs({
      category: 'mouse',
      loadedRules: loadedRulesFixture(),
      fieldGroups: fieldGroupsFixture(),
      globalFragments: {},
      tierBundles: {},
      outputRoot,
      now: new Date('2026-04-23T00:00:00Z'),
      fieldKeyOrder: [
        '__grp::Identity',
        'sku',                  // reserved, not in rules
        '__grp::Sensor',
        'dpi',
        'ips',
        '__grp::General',
        'colors',               // reserved, in rules
        'form_factor',
      ],
    });

    assert.ok(result.sorted, 'sorted summary returned');
    assert.equal(result.sorted.basePath, path.join(outputRoot, 'mouse', 'per-key', 'sorted'));
    assert.equal(result.sorted.count, 5, 'five entries: 2 reserved + 3 fields');

    const sortedDir = result.sorted.basePath;
    const expected = [
      '01-sku.reserved.md',
      '02-dpi.md',
      '03-ips.md',
      '04-colors.reserved.md',
      '05-form_factor.md',
    ].sort();
    assert.deepEqual((await fs.readdir(sortedDir)).sort(), expected);

    // Reserved stub points back at _reserved-keys.md and names the owner
    const skuStub = await fs.readFile(path.join(sortedDir, '01-sku.reserved.md'), 'utf8');
    assert.match(skuStub, /reserved/i);
    assert.match(skuStub, /_reserved-keys\.md/);
    assert.match(skuStub, /SKF|skuFinder/i);

    // Non-reserved sorted file is byte-identical to the canonical group-folder .md
    const dpiCanonical = await fs.readFile(
      path.join(outputRoot, 'mouse', 'per-key', 'sensor_performance', 'dpi.md'),
      'utf8',
    );
    const dpiSorted = await fs.readFile(path.join(sortedDir, '02-dpi.md'), 'utf8');
    assert.equal(dpiSorted, dpiCanonical);
    assert.match(dpiSorted, /mouse-02-dpi\.field-studio-patch\.v1\.json/);
  } finally {
    await cleanupDir(outputRoot);
  }
});

test('zero-padding width matches total non-separator entries', async () => {
  const outputRoot = await mkTmpDir();
  try {
    // Build a fieldKeyOrder with 12 entries → width 2
    const order = [];
    for (let i = 0; i < 10; i += 1) order.push('extra' + i); // not in rules → silently skipped
    order.push('dpi');
    order.push('ips');

    const result = await generatePerKeyDocs({
      category: 'mouse',
      loadedRules: loadedRulesFixture(),
      fieldGroups: fieldGroupsFixture(),
      globalFragments: {},
      tierBundles: {},
      outputRoot,
      now: new Date('2026-04-23T00:00:00Z'),
      fieldKeyOrder: order,
    });

    assert.ok(result.sorted);
    const listing = await fs.readdir(result.sorted.basePath);
    // dpi is at position 11 → "11-dpi.md", ips at position 12 → "12-ips.md"
    assert.ok(listing.includes('11-dpi.md'), 'dpi at zero-padded position 11');
    assert.ok(listing.includes('12-ips.md'), 'ips at zero-padded position 12');
  } finally {
    await cleanupDir(outputRoot);
  }
});

test('omitting fieldKeyOrder leaves no sorted/ folder', async () => {
  const outputRoot = await mkTmpDir();
  try {
    const result = await generatePerKeyDocs({
      category: 'mouse',
      loadedRules: loadedRulesFixture(),
      fieldGroups: fieldGroupsFixture(),
      globalFragments: {},
      tierBundles: {},
      outputRoot,
      now: new Date('2026-04-23T00:00:00Z'),
    });
    assert.equal(result.sorted, null, 'sorted is null when fieldKeyOrder absent');
    const sortedDir = path.join(outputRoot, 'mouse', 'per-key', 'sorted');
    await assert.rejects(() => fs.access(sortedDir), /ENOENT/);
  } finally {
    await cleanupDir(outputRoot);
  }
});

test('creates output directories if absent', async () => {
  const outputRoot = await mkTmpDir();
  try {
    const deepRoot = path.join(outputRoot, 'nested', 'deeper');
    const result = await generatePerKeyDocs({
      category: 'mouse',
      loadedRules: loadedRulesFixture(),
      fieldGroups: fieldGroupsFixture(),
      globalFragments: {},
      tierBundles: {},
      outputRoot: deepRoot,
      now: new Date('2026-04-23T00:00:00Z'),
    });
    assert.ok(result.written.length > 0);
  } finally {
    await cleanupDir(outputRoot);
  }
});
