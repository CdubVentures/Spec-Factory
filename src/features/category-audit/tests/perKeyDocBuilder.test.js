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
      product_variants: ['sku'],
      sensor_performance: ['dpi', 'ips'],
      ergonomics: ['form_factor'],
      general: ['colors'],
    },
  };
}

function fieldKeyOrderFixture() {
  return [
    '__grp::Product & Variants',
    'sku',
    '__grp::Sensor',
    'dpi',
    'ips',
    '__grp::General',
    'colors',
    'form_factor',
  ];
}

function contextFieldGroupsFixture() {
  return {
    group_index: {
      general: ['release_date'],
      sensor_performance: ['sensor', 'dpi', 'sensor_date'],
    },
  };
}

test('generatePerKeyDocs writes flat sorted Markdown files under per-key', async () => {
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
      fieldKeyOrder: fieldKeyOrderFixture(),
    });

    assert.equal(result.written.length, 3, 'three non-reserved keys written');
    assert.deepEqual(result.skipped.map((entry) => entry.fieldKey).sort(), ['colors', 'sku']);
    assert.ok(result.sorted, 'flat sorted summary returned');
    assert.equal(result.sorted.basePath, result.basePath);

    const dirents = await fs.readdir(result.basePath, { withFileTypes: true });
    assert.equal(dirents.filter((entry) => entry.isDirectory()).length, 0, 'per-key contains no group or sorted folders');
    assert.deepEqual(dirents.map((entry) => entry.name).sort(), [
      '01-sku--product_variants.reserved.md',
      '02-dpi--sensor_performance.md',
      '03-ips--sensor_performance.md',
      '04-colors--general.reserved.md',
      '05-form_factor--ergonomics.md',
      '_reserved-keys.md',
    ].sort());

    for (const entry of result.written) {
      const mdExists = await fs.access(entry.mdPath).then(() => true).catch(() => false);
      assert.ok(mdExists, `md exists for ${entry.fieldKey}`);
      assert.equal(entry.htmlPath, null, 'per-key HTML is not emitted');
      assert.equal(path.dirname(entry.mdPath), result.basePath, 'file is directly under per-key');
      assert.match(path.basename(entry.mdPath), new RegExp(`^\\d+-${entry.fieldKey}--${entry.group}\\.md$`));
    }

    // Reserved-keys summary
    assert.ok(result.reservedKeysPath, 'reservedKeysPath returned');
    const reservedSummary = await fs.readFile(result.reservedKeysPath, 'utf8');
    assert.match(reservedSummary, /colors/);
    assert.match(reservedSummary, /sku/);
    assert.match(reservedSummary, /CEF|colorEditionFinder/i);
    await fs.access(path.join(outputRoot, 'mouse', 'auditors-responses'));
  } finally {
    await cleanupDir(outputRoot);
  }
});

test('output path is <outputRoot>/<category>/per-key/<NN>-<fieldKey>--<group>.md', async () => {
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
      fieldKeyOrder: fieldKeyOrderFixture(),
    });
    const dpiEntry = result.written.find((e) => e.fieldKey === 'dpi');
    assert.ok(dpiEntry, 'dpi entry present');
    const expected = path.join(outputRoot, 'mouse', 'per-key', '02-dpi--sensor_performance.md');
    assert.equal(dpiEntry.mdPath, expected);
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
      fieldKeyOrder: fieldKeyOrderFixture(),
    });
    const firstResult = await generatePerKeyDocs({
      category: 'mouse',
      loadedRules: loadedRulesFixture(),
      fieldGroups: fieldGroupsFixture(),
      globalFragments: {},
      tierBundles: {},
      outputRoot,
      now: new Date('2026-04-24T00:00:00Z'),
      fieldKeyOrder: fieldKeyOrderFixture(),
    });
    const dpiMd = firstResult.written.find((e) => e.fieldKey === 'dpi').mdPath;
    const content = await fs.readFile(dpiMd, 'utf8');
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
      fieldKeyOrder: fieldKeyOrderFixture(),
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
      fieldKeyOrder: fieldKeyOrderFixture(),
    });

    const archivedDpi = path.join(
      outputRoot,
      'mouse',
      'archive',
      '2026-04-15T00-00-00-000Z',
      'per-key',
      '02-dpi--sensor_performance.md',
    );
    const archived = await fs.readFile(archivedDpi, 'utf8');
    assert.match(archived, /2026-01-01T00:00:00.000Z/);
    await assert.rejects(() => fs.access(staleArchive), /ENOENT/);
  } finally {
    await cleanupDir(outputRoot);
  }
});

test('regeneration removes stale files from old flat names and old group folders', async () => {
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
      fieldKeyOrder: fieldKeyOrderFixture(),
    });

    const oldDpiPath = path.join(outputRoot, 'mouse', 'per-key', '02-dpi--sensor_performance.md');
    await fs.access(oldDpiPath);
    const legacyGroupPath = path.join(outputRoot, 'mouse', 'per-key', 'sensor_performance', 'legacy.md');
    await fs.mkdir(path.dirname(legacyGroupPath), { recursive: true });
    await fs.writeFile(legacyGroupPath, 'legacy', 'utf8');

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
      fieldKeyOrder: fieldKeyOrderFixture(),
    });

    const newDpiPath = secondResult.written.find((e) => e.fieldKey === 'dpi').mdPath;
    assert.equal(newDpiPath, path.join(outputRoot, 'mouse', 'per-key', '02-dpi--sensor_identity.md'));
    await fs.access(newDpiPath);
    await assert.rejects(
      () => fs.access(oldDpiPath),
      /ENOENT/,
      'old flat path is removed so stale per-key docs cannot survive',
    );
    await assert.rejects(() => fs.access(legacyGroupPath), /ENOENT/);
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
      fieldKeyOrder: fieldKeyOrderFixture(),
    });
    const dpiMd = await fs.readFile(result.written.find((e) => e.fieldKey === 'dpi').mdPath, 'utf8');
    assert.match(dpiMd, /^# `02-dpi--sensor_performance`/m);
    assert.match(dpiMd, /Contract schema/i);
    assert.match(dpiMd, /<BRAND>/i);
    assert.match(dpiMd, /priority\.difficulty/i);
    assert.match(dpiMd, /no contract change/i);
    assert.match(dpiMd, /Consumer-surface impact/i);
    assert.match(dpiMd, /n\/a/i);
    assert.match(dpiMd, /Boolean keys use the closed yes\/no\/n\/a list/i);
    assert.match(dpiMd, /Never add/i);
    assert.match(dpiMd, /enum values/i);
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
      fieldKeyOrder: ['release_date', 'sensor', 'dpi', 'sensor_date'],
    });
    const dpiEntry = result.written.find((e) => e.fieldKey === 'dpi');
    assert.ok(dpiEntry, 'dpi entry present');
    const dpiMd = await fs.readFile(dpiEntry.mdPath, 'utf8');
    assert.match(dpiMd, /^# `03-dpi--sensor_performance`/m);
    assert.match(dpiMd, /Category key map/i);
    assert.match(dpiMd, /release_date/i);
    assert.match(dpiMd, /sensor_date <= release_date/i);
    assert.match(dpiMd, /All current components/i);
    assert.match(dpiMd, /switch/i);
    assert.match(dpiMd, /PAW3950/i);
    assert.match(dpiMd, /upper_bound/i);
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

test('fieldKeyOrder writes direct numbered .md files in navigator order', async () => {
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
      fieldKeyOrder: fieldKeyOrderFixture(),
    });

    assert.ok(result.sorted, 'sorted summary returned');
    assert.equal(result.sorted.basePath, path.join(outputRoot, 'mouse', 'per-key'));
    assert.equal(result.sorted.count, 5, 'five entries: 2 reserved + 3 fields');

    const expected = [
      '01-sku--product_variants.reserved.md',
      '02-dpi--sensor_performance.md',
      '03-ips--sensor_performance.md',
      '04-colors--general.reserved.md',
      '05-form_factor--ergonomics.md',
      '_reserved-keys.md',
    ].sort();
    assert.deepEqual((await fs.readdir(result.basePath)).sort(), expected);

    // Reserved stub points back at _reserved-keys.md and names the owner
    const skuStub = await fs.readFile(path.join(result.basePath, '01-sku--product_variants.reserved.md'), 'utf8');
    assert.match(skuStub, /reserved/i);
    assert.match(skuStub, /_reserved-keys\.md/);
    assert.match(skuStub, /SKF|skuFinder/i);
    assert.match(skuStub, /^# 01-sku--product_variants/m);

    const dpiDoc = await fs.readFile(path.join(result.basePath, '02-dpi--sensor_performance.md'), 'utf8');
    assert.match(dpiDoc, /^# `02-dpi--sensor_performance`/m);
    assert.match(dpiDoc, /mouse-02-dpi\.field-studio-patch\.v1\.json/);
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
    // dpi is at position 11, ips at position 12, and both keep their group suffix.
    assert.ok(listing.includes('11-dpi--sensor_performance.md'), 'dpi at zero-padded position 11');
    assert.ok(listing.includes('12-ips--sensor_performance.md'), 'ips at zero-padded position 12');
  } finally {
    await cleanupDir(outputRoot);
  }
});

test('omitting fieldKeyOrder still writes flat files without a sorted/ folder', async () => {
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
    assert.ok(result.sorted, 'flat sorted summary is returned when fieldKeyOrder absent');
    assert.equal(result.sorted.basePath, result.basePath);
    const sortedDir = path.join(outputRoot, 'mouse', 'per-key', 'sorted');
    await assert.rejects(() => fs.access(sortedDir), /ENOENT/);
    const dirents = await fs.readdir(result.basePath, { withFileTypes: true });
    assert.equal(dirents.filter((entry) => entry.isDirectory()).length, 0);
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
