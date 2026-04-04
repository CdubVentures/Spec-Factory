import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readLatestArtifacts,
  readPublishedCurrent,
  readPublishedProductChangelog,
  writePublishedProductFiles,
  listPublishedCurrentRecords,
  sortIndexItems,
  writeCategoryIndexAndChangelog,
  writeBulkExports
} from '../publishProductWriter.js';

function makeMockStorage(data = {}) {
  const written = [];
  return {
    written,
    resolveOutputKey(...parts) {
      return `legacy/${parts.join('/')}`;
    },
    async readJsonOrNull(key) {
      return data[key] || null;
    },
    async readTextOrNull(key) {
      return data[key] || null;
    },
    async writeObject(key, body, opts) {
      written.push({ key, body, opts });
    },
    async listKeys(prefix) {
      return Object.keys(data).filter((k) => k.startsWith(prefix));
    }
  };
}

test('readLatestArtifacts returns null normalized when specDb has no data', async () => {
  const storage = makeMockStorage();
  const result = await readLatestArtifacts(storage, 'mouse', 'p1');
  assert.equal(result.normalized, null);
  assert.deepEqual(result.provenance, {});
  assert.deepEqual(result.summary, {});
});

test('readLatestArtifacts returns data from specDb when populated', async () => {
  const storage = makeMockStorage();
  const specDb = {
    getNormalizedForProduct: () => ({ identity: {}, fields: { weight: '100g' } }),
    getProvenanceForProduct: () => ({ weight: { confidence: 0.9 } }),
    getSummaryForProduct: () => ({ generated_at: '2024-01-01' }),
  };
  const result = await readLatestArtifacts(storage, 'mouse', 'p1', specDb);
  assert.deepEqual(result.normalized.fields, { weight: '100g' });
  assert.ok(result.provenance.weight);
  assert.ok(result.summary.generated_at);
});

test('readPublishedProductChangelog returns default for missing', async () => {
  const storage = makeMockStorage();
  const result = await readPublishedProductChangelog(storage, 'mouse', 'p1');
  assert.equal(result.version, 1);
  assert.equal(result.category, 'mouse');
  assert.deepEqual(result.entries, []);
});

test('writePublishedProductFiles no-change short-circuits', async () => {
  const storage = makeMockStorage();
  const result = await writePublishedProductFiles({
    storage,
    category: 'mouse',
    productId: 'p1',
    fullRecord: {},
    previousRecord: { published_version: '1.0.0' },
    changes: [],
    warnings: []
  });
  assert.equal(result.changed, false);
  assert.equal(result.published_version, '1.0.0');
  assert.equal(storage.written.length, 0);
});

test('writePublishedProductFiles bumps version on changes', async () => {
  const storage = makeMockStorage();
  const result = await writePublishedProductFiles({
    storage,
    category: 'mouse',
    productId: 'p1',
    fullRecord: { provenance: {} },
    previousRecord: { published_version: '1.0.0' },
    changes: [{ field: 'weight', before: 100, after: 105 }],
    warnings: []
  });
  assert.equal(result.changed, true);
  assert.equal(result.published_version, '1.0.1');
  assert.ok(storage.written.length > 0);
});

test('writePublishedProductFiles first publish is 1.0.0', async () => {
  const storage = makeMockStorage();
  const result = await writePublishedProductFiles({
    storage,
    category: 'mouse',
    productId: 'p1',
    fullRecord: { provenance: {} },
    previousRecord: null,
    changes: [],
    warnings: []
  });
  assert.equal(result.changed, true);
  assert.equal(result.published_version, '1.0.0');
});

test('listPublishedCurrentRecords deduplicates by product, sorts by id', async () => {
  const data = {
    'output/mouse/published/p1/current.json': { product_id: 'p1', published_at: '2024-01-01' },
    'output/mouse/published/p2/current.json': { product_id: 'p2', published_at: '2024-01-02' }
  };
  const storage = makeMockStorage(data);
  const records = await listPublishedCurrentRecords(storage, 'mouse');
  assert.equal(records.length, 2);
  assert.equal(records[0].product_id, 'p1');
  assert.equal(records[1].product_id, 'p2');
});

test('sortIndexItems sorts by published_at desc then product_id', () => {
  const items = [
    { product_id: 'b', published_at: '2024-01-01', category: 'mouse', published_version: '1.0.0', identity: { brand: 'B' }, metrics: { coverage: 0.5 } },
    { product_id: 'a', published_at: '2024-01-02', category: 'mouse', published_version: '1.0.0', identity: { brand: 'A' }, metrics: { coverage: 0.8 } }
  ];
  const sorted = sortIndexItems(items);
  assert.equal(sorted[0].product_id, 'a');
  assert.equal(sorted[1].product_id, 'b');
  assert.ok(sorted[0].brand);
  assert.ok(typeof sorted[0].coverage === 'number');
});

test('sortIndexItems projects correct fields', () => {
  const items = [
    {
      product_id: 'p1',
      category: 'mouse',
      published_version: '1.0.0',
      published_at: '2024-01-01',
      identity: { brand: 'X', model: 'Y', variant: 'Z' },
      metrics: { coverage: 0.9, avg_confidence: 0.8 }
    }
  ];
  const [item] = sortIndexItems(items);
  assert.equal(item.brand, 'X');
  assert.equal(item.model, 'Y');
  assert.equal(item.variant, 'Z');
  assert.equal(item.coverage, 0.9);
  assert.equal(item.avg_confidence, 0.8);
});
