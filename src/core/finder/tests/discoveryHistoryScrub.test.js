import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  scrubFinderDiscoveryHistory,
  resolveDiscoveryHistoryScope,
} from '../discoveryHistoryScrub.js';

const TMP_ROOT = path.join(os.tmpdir(), `finder-history-scrub-${Date.now()}`);

function writeDoc({ productId = 'p1', filePrefix, doc }) {
  const dir = path.join(TMP_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${filePrefix}.json`), JSON.stringify(doc, null, 2), 'utf8');
}

function readDoc(productId, filePrefix) {
  return JSON.parse(fs.readFileSync(path.join(TMP_ROOT, productId, `${filePrefix}.json`), 'utf8'));
}

function makeSqlStore() {
  const calls = [];
  return {
    updateRunJson(productId, runNumber, payload) {
      calls.push({ productId, runNumber, payload });
    },
    calls,
  };
}

function makeSpecDb(sqlStore) {
  return {
    getFinderStore() {
      return sqlStore;
    },
  };
}

function run({
  runNumber,
  urls = [],
  queries = [],
  response = {},
  selected = { untouched: true },
}) {
  return {
    run_number: runNumber,
    ran_at: `2026-04-2${runNumber}T00:00:00Z`,
    model: 'test-model',
    selected,
    prompt: { user: `prompt-${runNumber}` },
    response: {
      ...response,
      discovery_log: {
        urls_checked: urls,
        queries_run: queries,
        notes: ['keep-note'],
      },
    },
  };
}

describe('resolveDiscoveryHistoryScope', () => {
  it('derives history scope from finder module class', () => {
    assert.equal(resolveDiscoveryHistoryScope({ moduleClass: 'variantGenerator' }), 'product');
    assert.equal(resolveDiscoveryHistoryScope({ moduleClass: 'variantArtifactProducer' }), 'variant_mode');
    assert.equal(resolveDiscoveryHistoryScope({ moduleClass: 'variantFieldProducer' }), 'variant');
    assert.equal(resolveDiscoveryHistoryScope({ moduleClass: 'productFieldProducer' }), 'field_key');
  });
});

describe('scrubFinderDiscoveryHistory', () => {
  before(() => fs.mkdirSync(TMP_ROOT, { recursive: true }));
  after(() => { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); });

  it('scrubs CEF product URLs only while preserving runs, queries, notes, selected, and nested identity data', () => {
    const productId = 'cef-product';
    const module = {
      id: 'colorEditionFinder',
      filePrefix: 'color_edition',
      moduleClass: 'variantGenerator',
    };
    const doc = {
      product_id: productId,
      category: 'mouse',
      selected: { colors: ['black'], editions: { standard: {} } },
      run_count: 2,
      next_run_number: 3,
      variant_registry: [{ variant_id: 'v1' }],
      runs: [
        run({
          runNumber: 1,
          urls: ['https://a.example', 'https://b.example'],
          queries: ['query a'],
          response: {
            discovery: {
              discovery_log: {
                urls_checked: ['https://nested.example'],
                queries_run: ['nested query'],
                notes: ['nested-note'],
              },
            },
            identity_check: { confidence: 91 },
          },
        }),
        run({ runNumber: 2, urls: ['https://c.example'], queries: ['query c'] }),
      ],
    };
    writeDoc({ productId, filePrefix: module.filePrefix, doc });
    const sqlStore = makeSqlStore();

    const result = scrubFinderDiscoveryHistory({
      productId,
      productRoot: TMP_ROOT,
      module,
      specDb: makeSpecDb(sqlStore),
      request: { kind: 'url', scope: 'product' },
    });

    assert.deepEqual(result, {
      ok: true,
      finderId: 'colorEditionFinder',
      productId,
      scope: 'product',
      kind: 'url',
      runsTouched: 2,
      urlsRemoved: 4,
      queriesRemoved: 0,
      affectedRunNumbers: [1, 2],
    });

    const afterDoc = readDoc(productId, module.filePrefix);
    assert.equal(afterDoc.run_count, 2);
    assert.deepEqual(afterDoc.selected, doc.selected);
    assert.deepEqual(afterDoc.variant_registry, doc.variant_registry);
    assert.deepEqual(afterDoc.runs.map((r) => r.run_number), [1, 2]);
    assert.deepEqual(afterDoc.runs[0].response.discovery_log.urls_checked, []);
    assert.deepEqual(afterDoc.runs[0].response.discovery_log.queries_run, ['query a']);
    assert.deepEqual(afterDoc.runs[0].response.discovery.discovery_log.urls_checked, []);
    assert.deepEqual(afterDoc.runs[0].response.discovery.discovery_log.queries_run, ['nested query']);
    assert.deepEqual(afterDoc.runs[0].response.discovery.discovery_log.notes, ['nested-note']);
    assert.deepEqual(afterDoc.runs[0].response.identity_check, { confidence: 91 });
    assert.deepEqual(sqlStore.calls.map((c) => c.runNumber), [1, 2]);
  });

  it('scrubs PIF by variant and mode without touching other modes, variants, images, evals, or carousel slots', () => {
    const productId = 'pif-variant-mode';
    const module = {
      id: 'productImageFinder',
      filePrefix: 'product_images',
      moduleClass: 'variantArtifactProducer',
    };
    const doc = {
      product_id: productId,
      category: 'mouse',
      selected: { images: [{ filename: 'black-top.png', variant_id: 'v_black' }] },
      evaluations: [{ filename: 'black-top.png', score: 1 }],
      carousel_slots: { v_black: { top: 'black-top.png' } },
      run_count: 3,
      next_run_number: 4,
      runs: [
        run({
          runNumber: 1,
          urls: ['https://black-view.example'],
          queries: ['black view'],
          response: { variant_id: 'v_black', variant_key: 'color:black', mode: 'view' },
          selected: { images: [{ filename: 'black-view.png', variant_id: 'v_black' }] },
        }),
        run({
          runNumber: 2,
          urls: ['https://black-hero.example'],
          queries: ['black hero'],
          response: { variant_id: 'v_black', variant_key: 'color:black', mode: 'hero' },
        }),
        run({
          runNumber: 3,
          urls: ['https://white-view.example'],
          queries: ['white view'],
          response: { variant_id: 'v_white', variant_key: 'color:white', mode: 'view' },
        }),
      ],
    };
    writeDoc({ productId, filePrefix: module.filePrefix, doc });
    const sqlStore = makeSqlStore();

    const result = scrubFinderDiscoveryHistory({
      productId,
      productRoot: TMP_ROOT,
      module,
      specDb: makeSpecDb(sqlStore),
      request: { kind: 'all', scope: 'variant_mode', variantId: 'v_black', mode: 'view' },
    });

    assert.equal(result.runsTouched, 1);
    assert.deepEqual(result.affectedRunNumbers, [1]);
    assert.equal(result.urlsRemoved, 1);
    assert.equal(result.queriesRemoved, 1);

    const afterDoc = readDoc(productId, module.filePrefix);
    assert.deepEqual(afterDoc.selected, doc.selected);
    assert.deepEqual(afterDoc.evaluations, doc.evaluations);
    assert.deepEqual(afterDoc.carousel_slots, doc.carousel_slots);
    assert.deepEqual(afterDoc.runs[0].response.discovery_log, {
      urls_checked: [],
      queries_run: [],
      notes: ['keep-note'],
    });
    assert.deepEqual(afterDoc.runs[1].response.discovery_log.urls_checked, ['https://black-hero.example']);
    assert.deepEqual(afterDoc.runs[2].response.discovery_log.urls_checked, ['https://white-view.example']);
    assert.deepEqual(sqlStore.calls.map((c) => c.runNumber), [1]);
  });

  it('scrubs PIF by pool key (run_scope_key) without touching other pools on the same variant', () => {
    const productId = 'pif-pool-isolation';
    const module = {
      id: 'productImageFinder',
      filePrefix: 'product_images',
      moduleClass: 'variantArtifactProducer',
    };
    const doc = {
      product_id: productId,
      category: 'mouse',
      run_count: 3,
      next_run_number: 4,
      runs: [
        run({
          runNumber: 1,
          urls: ['https://prio.example'],
          queries: ['prio query'],
          response: { variant_id: 'v_black', mode: 'view', run_scope_key: 'priority-view' },
        }),
        run({
          runNumber: 2,
          urls: ['https://top.example'],
          queries: ['top query'],
          response: { variant_id: 'v_black', mode: 'view', run_scope_key: 'view:top' },
        }),
        run({
          runNumber: 3,
          urls: ['https://loop.example'],
          queries: ['loop query'],
          response: { variant_id: 'v_black', mode: 'view', run_scope_key: 'loop-view' },
        }),
      ],
    };
    writeDoc({ productId, filePrefix: module.filePrefix, doc });

    const result = scrubFinderDiscoveryHistory({
      productId,
      productRoot: TMP_ROOT,
      module,
      specDb: makeSpecDb(makeSqlStore()),
      request: { kind: 'all', scope: 'variant_mode', variantId: 'v_black', mode: 'view:top' },
    });

    assert.deepEqual(result.affectedRunNumbers, [2]);
    const afterDoc = readDoc(productId, module.filePrefix);
    assert.deepEqual(afterDoc.runs[0].response.discovery_log.urls_checked, ['https://prio.example']);
    assert.deepEqual(afterDoc.runs[1].response.discovery_log.urls_checked, []);
    assert.deepEqual(afterDoc.runs[1].response.discovery_log.queries_run, []);
    assert.deepEqual(afterDoc.runs[2].response.discovery_log.urls_checked, ['https://loop.example']);
  });

  it('scrubs legacy PIF runs (no run_scope_key) by mode using the same wire format', () => {
    const productId = 'pif-legacy-mode';
    const module = {
      id: 'productImageFinder',
      filePrefix: 'product_images',
      moduleClass: 'variantArtifactProducer',
    };
    const doc = {
      product_id: productId,
      category: 'mouse',
      run_count: 2,
      next_run_number: 3,
      runs: [
        run({
          runNumber: 1,
          urls: ['https://legacy-view.example'],
          queries: ['legacy view query'],
          response: { variant_id: 'v_black', mode: 'view' },
        }),
        run({
          runNumber: 2,
          urls: ['https://legacy-hero.example'],
          queries: ['legacy hero query'],
          response: { variant_id: 'v_black', mode: 'hero' },
        }),
      ],
    };
    writeDoc({ productId, filePrefix: module.filePrefix, doc });

    const result = scrubFinderDiscoveryHistory({
      productId,
      productRoot: TMP_ROOT,
      module,
      specDb: makeSpecDb(makeSqlStore()),
      request: { kind: 'all', scope: 'variant_mode', variantId: 'v_black', mode: 'view' },
    });

    assert.deepEqual(result.affectedRunNumbers, [1]);
    const afterDoc = readDoc(productId, module.filePrefix);
    assert.deepEqual(afterDoc.runs[0].response.discovery_log.urls_checked, []);
    assert.deepEqual(afterDoc.runs[1].response.discovery_log.urls_checked, ['https://legacy-hero.example']);
  });

  it('does not cross-match coarse mode (hero) and pool key (loop-hero) for variant_mode scrubs', () => {
    const productId = 'pif-loop-hero-isolation';
    const module = {
      id: 'productImageFinder',
      filePrefix: 'product_images',
      moduleClass: 'variantArtifactProducer',
    };
    const doc = {
      product_id: productId,
      category: 'mouse',
      run_count: 2,
      next_run_number: 3,
      runs: [
        run({
          runNumber: 1,
          urls: ['https://standalone-hero.example'],
          queries: ['standalone hero'],
          response: { variant_id: 'v_black', mode: 'hero', run_scope_key: 'hero' },
        }),
        run({
          runNumber: 2,
          urls: ['https://loop-hero.example'],
          queries: ['loop hero'],
          response: { variant_id: 'v_black', mode: 'hero', run_scope_key: 'loop-hero' },
        }),
      ],
    };
    writeDoc({ productId, filePrefix: module.filePrefix, doc });

    const result = scrubFinderDiscoveryHistory({
      productId,
      productRoot: TMP_ROOT,
      module,
      specDb: makeSpecDb(makeSqlStore()),
      request: { kind: 'all', scope: 'variant_mode', variantId: 'v_black', mode: 'loop-hero' },
    });

    assert.deepEqual(result.affectedRunNumbers, [2]);
    const afterDoc = readDoc(productId, module.filePrefix);
    assert.deepEqual(afterDoc.runs[0].response.discovery_log.urls_checked, ['https://standalone-hero.example']);
    assert.deepEqual(afterDoc.runs[1].response.discovery_log.urls_checked, []);
  });

  it('scrubs variant-scoped scalar finder queries by variant id with variant_key fallback support', () => {
    const productId = 'rdf-variant';
    const module = {
      id: 'releaseDateFinder',
      filePrefix: 'release_date',
      moduleClass: 'variantFieldProducer',
    };
    const doc = {
      product_id: productId,
      category: 'mouse',
      selected: { candidates: [{ variant_id: 'v_black', value: '2025-01-01' }] },
      run_count: 3,
      next_run_number: 4,
      runs: [
        run({
          runNumber: 1,
          urls: ['https://black.example'],
          queries: ['black query'],
          response: { variant_id: 'v_black', variant_key: 'color:black' },
        }),
        run({
          runNumber: 2,
          urls: ['https://legacy.example'],
          queries: ['legacy black query'],
          response: { variant_key: 'color:black' },
        }),
        run({
          runNumber: 3,
          urls: ['https://white.example'],
          queries: ['white query'],
          response: { variant_id: 'v_white', variant_key: 'color:white' },
        }),
      ],
    };
    writeDoc({ productId, filePrefix: module.filePrefix, doc });

    const result = scrubFinderDiscoveryHistory({
      productId,
      productRoot: TMP_ROOT,
      module,
      specDb: makeSpecDb(makeSqlStore()),
      request: { kind: 'query', scope: 'variant', variantId: 'v_black', variantKey: 'color:black' },
    });

    assert.deepEqual(result.affectedRunNumbers, [1, 2]);
    assert.equal(result.urlsRemoved, 0);
    assert.equal(result.queriesRemoved, 2);

    const afterDoc = readDoc(productId, module.filePrefix);
    assert.deepEqual(afterDoc.selected, doc.selected);
    assert.deepEqual(afterDoc.runs[0].response.discovery_log.urls_checked, ['https://black.example']);
    assert.deepEqual(afterDoc.runs[0].response.discovery_log.queries_run, []);
    assert.deepEqual(afterDoc.runs[1].response.discovery_log.queries_run, []);
    assert.deepEqual(afterDoc.runs[2].response.discovery_log.queries_run, ['white query']);
  });

  it('scrubs Key Finder primary field-key history without touching passenger-only shared sessions by default', () => {
    const productId = 'key-primary';
    const module = {
      id: 'keyFinder',
      filePrefix: 'key_finder',
      moduleClass: 'productFieldProducer',
    };
    const doc = {
      product_id: productId,
      category: 'mouse',
      selected: { keys: { grip_width: { value: '60mm' }, weight: { value: '80g' } } },
      run_count: 2,
      next_run_number: 3,
      runs: [
        run({
          runNumber: 1,
          urls: ['https://primary.example'],
          queries: ['grip width query'],
          response: {
            primary_field_key: 'grip_width',
            results: { grip_width: { value: '60mm' }, weight: { value: '80g' } },
          },
        }),
        run({
          runNumber: 2,
          urls: ['https://passenger.example'],
          queries: ['weight primary query'],
          response: {
            primary_field_key: 'weight',
            results: { weight: { value: '80g' }, grip_width: { value: '60mm' } },
          },
        }),
      ],
    };
    writeDoc({ productId, filePrefix: module.filePrefix, doc });

    const result = scrubFinderDiscoveryHistory({
      productId,
      productRoot: TMP_ROOT,
      module,
      specDb: makeSpecDb(makeSqlStore()),
      request: { kind: 'all', scope: 'field_key', fieldKey: 'grip_width' },
    });

    assert.deepEqual(result.affectedRunNumbers, [1]);
    const afterDoc = readDoc(productId, module.filePrefix);
    assert.deepEqual(afterDoc.selected, doc.selected);
    assert.deepEqual(afterDoc.runs[0].response.discovery_log.urls_checked, []);
    assert.deepEqual(afterDoc.runs[0].response.discovery_log.queries_run, []);
    assert.deepEqual(afterDoc.runs[1].response.discovery_log.urls_checked, ['https://passenger.example']);
    assert.deepEqual(afterDoc.runs[1].response.discovery_log.queries_run, ['weight primary query']);
  });

  it('rejects a scope that does not match the finder module history contract', () => {
    const productId = 'invalid-scope';
    const module = {
      id: 'releaseDateFinder',
      filePrefix: 'release_date',
      moduleClass: 'variantFieldProducer',
    };
    writeDoc({
      productId,
      filePrefix: module.filePrefix,
      doc: { product_id: productId, category: 'mouse', runs: [] },
    });

    assert.throws(
      () => scrubFinderDiscoveryHistory({
        productId,
        productRoot: TMP_ROOT,
        module,
        specDb: makeSpecDb(makeSqlStore()),
        request: { kind: 'url', scope: 'field_key', fieldKey: 'weight' },
      }),
      /scope "field_key" is not valid/,
    );
  });
});
