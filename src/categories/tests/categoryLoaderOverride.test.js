import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { loadCategoryConfig } from '../loader.js';
import { withTempCategoryRoots, writeJson } from './helpers/categoryLoaderHarness.js';

test('loadCategoryConfig merges S3 source overrides into the resolved host contract', async () => {
  const category = 'mouse';
  const overrideReads = [];
  const overrideKey = 'specs/inputs/_sources/overrides/mouse/sources.override.json';
  const storage = {
    async readJsonOrNull(key) {
      overrideReads.push(key);
      if (key === overrideKey) {
        return {
          approved: {
            database: ['newdb.example.com'],
            lab: ['newlab.example.com'],
          },
          denylist: ['bad-source.example.com'],
        };
      }
      return null;
    },
  };

  await withTempCategoryRoots('category-loader-override-', async ({ helperRoot }) => {
    await writeJson(path.join(helperRoot, category, '_generated', 'field_rules.json'), {
      version: 1,
      fields: {
        weight: {
          required_level: 'required',
          availability: 'expected',
          difficulty: 'easy',
        },
      },
    });
    await writeJson(path.join(helperRoot, category, 'sources.json'), {
      approved: {
        manufacturer: ['base.example.com'],
        lab: [],
        database: [],
        retailer: [],
      },
      denylist: ['base-deny.example.com'],
      sources: {},
    });

    const categoryConfig = await loadCategoryConfig(category, {
      storage,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });

    assert.deepEqual(overrideReads, [overrideKey]);
    assert.deepEqual(
      [...categoryConfig.sourceHostMap.keys()].sort(),
      ['base.example.com', 'newdb.example.com', 'newlab.example.com'],
    );
    assert.equal(categoryConfig.sourceHostMap.get('base.example.com').tierName, 'manufacturer');
    assert.equal(categoryConfig.sourceHostMap.get('newdb.example.com').tierName, 'database');
    assert.equal(categoryConfig.sourceHostMap.get('newlab.example.com').tierName, 'lab');
    assert.deepEqual(
      [...categoryConfig.denylist].sort(),
      ['bad-source.example.com', 'base-deny.example.com'],
    );
    assert.equal(categoryConfig.sources_override_key, overrideKey);
  });
});

test('loadCategoryConfig leaves override metadata unset when no S3 override file exists', async () => {
  const category = 'keyboard';
  const overrideReads = [];
  const storage = {
    async readJsonOrNull(key) {
      overrideReads.push(key);
      return null;
    },
  };

  await withTempCategoryRoots('category-loader-override-miss-', async ({ helperRoot }) => {
    await writeJson(path.join(helperRoot, category, '_generated', 'field_rules.json'), {
      version: 1,
      fields: {
        polling_rate: {
          required_level: 'required',
          availability: 'expected',
          difficulty: 'easy',
        },
      },
    });
    await writeJson(path.join(helperRoot, category, 'sources.json'), {
      approved: {
        manufacturer: [],
        lab: ['rtings.com'],
        database: [],
        retailer: [],
      },
      denylist: [],
      sources: {},
    });

    const categoryConfig = await loadCategoryConfig(category, {
      storage,
      config: {
        categoryAuthorityRoot: helperRoot,
      },
    });

    assert.deepEqual(
      overrideReads,
      ['specs/inputs/_sources/overrides/keyboard/sources.override.json'],
    );
    assert.equal(categoryConfig.sources_override_key, undefined);
    assert.deepEqual(
      [...categoryConfig.sourceHostMap.keys()],
      ['rtings.com'],
    );
  });
});
