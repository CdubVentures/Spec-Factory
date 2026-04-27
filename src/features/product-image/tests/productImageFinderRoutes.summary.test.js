import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { registerProductImageFinderRoutes } from '../api/productImageFinderRoutes.js';

const CATEGORY = 'mouse';
const PRODUCT_ID = 'pif-summary-product';

function makeFinderStore({ latestRunEmpty = false, includeRowSelected = true } = {}) {
  const selectedImage = {
    view: 'top',
    filename: 'top-black.png',
    variant_key: 'color:black',
    bytes: 987,
    width: 1200,
    height: 900,
  };
  const row = {
    product_id: PRODUCT_ID,
    category: CATEGORY,
    images: JSON.stringify([{ view: 'top', filename: 'top-black.png', variant_key: 'color:black', variant_id: 'v-black' }]),
    image_count: 1,
    run_count: 1,
    latest_ran_at: '2026-04-26T10:00:00.000Z',
    carousel_slots: JSON.stringify({ 'color:black': { top: 'top-black.png' } }),
    eval_state: JSON.stringify({ 'top-black.png': { eval_best: true, eval_reasoning: 'sharp candidate' } }),
    evaluations: JSON.stringify([{ eval_number: 1, variant_key: 'color:black' }]),
  };
  if (includeRowSelected) row.selected = { images: [selectedImage] };
  const runs = [{
    run_number: 1,
    ran_at: '2026-04-26T10:00:00.000Z',
    model: 'gpt-test',
    fallback_used: false,
    selected: {
      images: [{
        ...selectedImage,
        url: 'https://heavy.example.test/source/top-black.png',
        source_page: 'https://heavy.example.test/source',
        alt_text: 'large alt text should not be in summary',
        variant_id: 'v-black',
      }],
    },
    prompt: { system: 'heavy prompt should not be in summary', user: 'heavy user prompt should not be in summary' },
    response: {
      images: [{ filename: 'top-black.png' }],
      download_errors: [],
      discovery_log: { urls_checked: ['https://example.test/top'], queries_run: ['black top mouse'] },
      variant_id: 'v-black',
      variant_key: 'color:black',
      mode: 'view',
      run_scope_key: 'priority-view',
    },
  }];
  if (latestRunEmpty) {
    runs.push({
      run_number: 2,
      ran_at: '2026-04-26T11:00:00.000Z',
      model: 'gpt-test',
      fallback_used: false,
      selected: { images: [] },
      prompt: {},
      response: { images: [], variant_key: 'color:black', mode: 'hero' },
    });
  }
  return {
    get: (productId) => (productId === PRODUCT_ID ? row : null),
    listRuns: (productId) => (productId === PRODUCT_ID ? runs : []),
    getSetting: (key) => {
      if (key === 'viewBudget') return 'top,left,angle';
      if (key === 'heroEnabled') return 'true';
      return '';
    },
  };
}

function makeSpecDb({ withRow = true, latestRunEmpty = false, includeRowSelected = true } = {}) {
  const finderStore = makeFinderStore({ latestRunEmpty, includeRowSelected });
  return {
    getProduct: () => ({ product_id: PRODUCT_ID, category: CATEGORY, brand: 'Brand', model: 'Model' }),
    getCompiledRules: () => ({ fields: {} }),
    getFieldCandidatesByProductAndField: () => [],
    getResolvedFieldCandidate: () => null,
    getFinderStore: () => ({
      ...finderStore,
      get: (productId) => (withRow ? finderStore.get(productId) : null),
      listRuns: (productId) => (withRow ? finderStore.listRuns(productId) : []),
    }),
  };
}

function makeCtx({ withRow = true, latestRunEmpty = false, includeRowSelected = true } = {}) {
  return {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    getSpecDb: (category) => (category === CATEGORY ? makeSpecDb({ withRow, latestRunEmpty, includeRowSelected }) : null),
    broadcastWs: () => {},
    config: {},
    appDb: {},
    logger: { error: () => {}, warn: () => {}, info: () => {} },
  };
}

describe('Product Image Finder summary route', () => {
  it('returns lightweight carousel data without prompt or response image payloads', async () => {
    const handler = registerProductImageFinderRoutes(makeCtx());

    const result = await handler(
      ['product-image-finder', CATEGORY, PRODUCT_ID, 'summary'],
      new URLSearchParams(),
      'GET',
      {},
      {},
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.product_id, PRODUCT_ID);
    assert.equal(result.body.images.length, 1);
    assert.equal(result.body.images[0].url, undefined);
    assert.deepEqual(result.body.carousel_slots, { 'color:black': { top: 'top-black.png' } });
    assert.equal(result.body.runs[0].prompt, undefined);
    assert.equal(result.body.runs[0].response.images, undefined);
    assert.equal(result.body.runs[0].response.discovery_log, undefined);
    assert.deepEqual(result.body.historyCounts['v-black'], { urls: 1, queries: 1 });
    assert.equal(result.body.runs[0].selected.images[0].eval_best, true);
    assert.equal(result.body.runs[0].selected.images[0].url, '');
    assert.equal(result.body.runs[0].selected.images[0].source_page, '');
    assert.equal(result.body.runs[0].selected.images[0].alt_text, '');
  });

  it('returns accumulated selected images when the latest PIF run selected nothing', async () => {
    const handler = registerProductImageFinderRoutes(makeCtx({
      latestRunEmpty: true,
      includeRowSelected: false,
    }));

    const result = await handler(
      ['product-image-finder', CATEGORY, PRODUCT_ID],
      new URLSearchParams(),
      'GET',
      {},
      {},
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.selected.images.length, 1);
    assert.equal(result.body.selected.images[0].filename, 'top-black.png');
    assert.equal(result.body.selected.images[0].eval_best, true);
    assert.equal(result.body.runs.length, 2);
  });

  it('returns an empty summary with dependency status before a PIF row exists', async () => {
    const handler = registerProductImageFinderRoutes(makeCtx({ withRow: false }));

    const result = await handler(
      ['product-image-finder', CATEGORY, PRODUCT_ID, 'summary'],
      new URLSearchParams(),
      'GET',
      {},
      {},
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.product_id, PRODUCT_ID);
    assert.deepEqual(result.body.images, []);
    assert.deepEqual(result.body.runs, []);
    assert.equal(result.body.dependencyStatus.ready, true);
  });
});
