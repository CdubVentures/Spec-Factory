import test from 'node:test';
import assert from 'node:assert/strict';

import { loadLearningStoreHintsForRun } from '../src/features/indexing/orchestration/bootstrap/loadLearningStoreHintsForRun.js';

test('loadLearningStoreHintsForRun returns null when self-improve is disabled', async () => {
  const result = await loadLearningStoreHintsForRun({
    config: {
      selfImproveEnabled: false,
    },
  });

  assert.equal(result, null);
});

test('loadLearningStoreHintsForRun opens SpecDb, reads hints, and closes the database', async () => {
  const storeCtorCalls = [];
  const closeCalls = [];

  class FakeSpecDb {
    constructor({ dbPath, category }) {
      this.dbPath = dbPath;
      this.category = category;
      this.db = { marker: 'db' };
    }

    close() {
      closeCalls.push({
        dbPath: this.dbPath,
        category: this.category,
      });
    }
  }

  const result = await loadLearningStoreHintsForRun({
    config: {
      selfImproveEnabled: true,
      specDbDir: '.specfactory_tmp/',
    },
    category: 'Mouse',
    roundContext: {
      missing_required_fields: ['weight_g'],
    },
    requiredFields: ['sensor'],
    categoryConfig: {
      fieldOrder: ['weight_g', 'sensor'],
    },
    importSpecDbFn: async () => ({ SpecDb: FakeSpecDb }),
    createUrlMemoryStoreFn: (db) => {
      storeCtorCalls.push({ kind: 'urlMemory', db });
      return { kind: 'urlMemory' };
    },
    createDomainFieldYieldStoreFn: (db) => {
      storeCtorCalls.push({ kind: 'domainFieldYield', db });
      return { kind: 'domainFieldYield' };
    },
    createFieldAnchorsStoreFn: (db) => {
      storeCtorCalls.push({ kind: 'fieldAnchors', db });
      return { kind: 'fieldAnchors' };
    },
    createComponentLexiconStoreFn: (db) => {
      storeCtorCalls.push({ kind: 'componentLexicon', db });
      return { kind: 'componentLexicon' };
    },
    normalizeFieldListFn: (fields, options) => {
      assert.deepEqual(fields, ['weight_g']);
      assert.deepEqual(options, { fieldOrder: ['weight_g', 'sensor'] });
      return ['weight_g'];
    },
    readLearningHintsFromStoresFn: ({ stores, category, focusFields, config }) => ({
      stores,
      category,
      focusFields,
      config,
      loaded: true,
    }),
  });

  assert.deepEqual(storeCtorCalls, [
    { kind: 'urlMemory', db: { marker: 'db' } },
    { kind: 'domainFieldYield', db: { marker: 'db' } },
    { kind: 'fieldAnchors', db: { marker: 'db' } },
    { kind: 'componentLexicon', db: { marker: 'db' } },
  ]);
  assert.deepEqual(closeCalls, [
    {
      dbPath: '.specfactory_tmp/mouse/spec.sqlite',
      category: 'mouse',
    },
  ]);
  assert.deepEqual(result, {
    stores: {
      urlMemory: { kind: 'urlMemory' },
      domainFieldYield: { kind: 'domainFieldYield' },
      fieldAnchors: { kind: 'fieldAnchors' },
      componentLexicon: { kind: 'componentLexicon' },
    },
    category: 'mouse',
    focusFields: ['weight_g'],
    config: {
      selfImproveEnabled: true,
      specDbDir: '.specfactory_tmp/',
    },
    loaded: true,
  });
});
