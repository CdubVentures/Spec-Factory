import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { registerPublisherRoutes } from '../publisherRoutes.js';

const PRODUCT_ROOT = path.join('.tmp', '_test_publisher_routes');

function makeCtx(specDb, overrides = {}) {
  const responses = [];
  return {
    ctx: {
      jsonRes: (_res, status, body) => { responses.push({ status, body }); },
      readJsonBody: async () => ({}),
      getSpecDb: (cat) => cat === 'mouse' ? specDb : null,
      broadcastWs: () => {},
      config: { publishConfidenceThreshold: 0.7 },
      productRoot: PRODUCT_ROOT,
      ...overrides,
    },
    responses,
  };
}

function ensureProductJson(productId, data = {}) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  const base = {
    schema_version: 2, checkpoint_type: 'product',
    product_id: productId, category: 'mouse',
    identity: { brand: 'Test', model: 'Test' },
    sources: [], fields: {}, candidates: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...data,
  };
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify(base, null, 2));
}

function seedCandidate(specDb, productId, fieldKey, value, confidence, status = 'candidate', meta = {}) {
  const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
  specDb.upsertFieldCandidate({
    productId, fieldKey, value: serialized,
    confidence, sourceCount: 1,
    sourcesJson: [{ source: 'test', confidence }],
    validationJson: { valid: true, repairs: [], rejections: [] },
    metadataJson: meta, status,
  });
}

describe('publisher routes', () => {
  let specDb;

  before(() => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  });

  after(() => {
    specDb.close();
    fs.rmSync(PRODUCT_ROOT, { recursive: true, force: true });
  });

  // --- GET /publisher/:category/candidates ---

  it('GET /publisher/:category/candidates returns paginated rows', async () => {
    seedCandidate(specDb, 'rt-cand', 'weight', 58, 90);
    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);

    const handled = await handler(
      ['publisher', 'mouse', 'candidates'],
      new URLSearchParams('page=1&limit=10'),
      'GET', {}, {},
    );

    assert.equal(handled, true);
    assert.equal(responses.length, 1);
    assert.equal(responses[0].status, 200);
    assert.ok(Array.isArray(responses[0].body.rows));
    assert.ok(responses[0].body.total >= 1);
    assert.ok(responses[0].body.stats);
  });

  // --- GET /publisher/:category/stats ---

  it('GET /publisher/:category/stats returns stats object', async () => {
    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);

    const handled = await handler(
      ['publisher', 'mouse', 'stats'],
      new URLSearchParams(),
      'GET', {}, {},
    );

    assert.equal(handled, true);
    assert.equal(responses[0].status, 200);
    assert.ok('total' in responses[0].body);
    assert.ok('resolved' in responses[0].body);
    assert.ok('pending' in responses[0].body);
  });

  // --- GET /publisher/:category/published/:productId ---

  it('GET /publisher/:category/published/:productId returns published fields', async () => {
    seedCandidate(specDb, 'rt-pub', 'weight', 60, 95, 'resolved');
    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);

    const handled = await handler(
      ['publisher', 'mouse', 'published', 'rt-pub'],
      new URLSearchParams(),
      'GET', {}, {},
    );

    assert.equal(handled, true);
    assert.equal(responses[0].status, 200);
    assert.equal(responses[0].body.product_id, 'rt-pub');
    assert.ok(responses[0].body.fields.weight);
  });

  it('GET /publisher/:category/published/:productId returns empty for no resolved', async () => {
    seedCandidate(specDb, 'rt-nopub', 'sensor', 'PAW3950', 80, 'candidate');
    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);

    await handler(
      ['publisher', 'mouse', 'published', 'rt-nopub'],
      new URLSearchParams(),
      'GET', {}, {},
    );

    assert.equal(responses[0].status, 200);
    assert.deepEqual(responses[0].body.fields, {});
  });

  // WHY: Published state for colors/editions must come from field_candidates
  // resolved rows (the review grid's source of truth), NOT from the variant
  // aggregate. An active variant is "discovered" but not "published" until a
  // resolved field_candidates row exists for that value.
  it('GET /publisher/:category/published/:productId reads colors/editions from resolved field_candidates (not CEF summary)', async () => {
    seedCandidate(specDb, 'rt-fc-colors', 'colors', ['black', 'white+silver'], 0.95, 'resolved');
    seedCandidate(specDb, 'rt-fc-colors', 'editions', ['special-ed'], 0.9, 'resolved');

    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);

    await handler(
      ['publisher', 'mouse', 'published', 'rt-fc-colors'],
      new URLSearchParams(),
      'GET', {}, {},
    );

    assert.equal(responses[0].status, 200);
    assert.ok(responses[0].body.fields.colors, 'colors populated from field_candidates');
    assert.deepEqual(responses[0].body.fields.colors.value, ['black', 'white+silver']);

    assert.ok(responses[0].body.fields.editions, 'editions populated from field_candidates');
    assert.deepEqual(responses[0].body.fields.editions.value, ['special-ed']);
  });

  it('GET /publisher/:category/published/:productId omits colors/editions when field_candidates has no resolved rows — even if CEF summary has variant-derived data', async () => {
    // Variants exist in CEF summary, but NO resolved candidate for colors/editions.
    // Expect: endpoint returns empty fields (review grid is empty → nothing published).
    specDb.getFinderStore('colorEditionFinder').upsert({
      category: 'mouse',
      product_id: 'rt-variants-no-resolve',
      colors: ['black', 'white+silver'],
      editions: ['special-ed'],
      default_color: 'black',
      variant_registry: [],
      latest_ran_at: '2026-04-16T00:00:00Z',
      run_count: 1,
    });

    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);

    await handler(
      ['publisher', 'mouse', 'published', 'rt-variants-no-resolve'],
      new URLSearchParams(),
      'GET', {}, {},
    );

    assert.equal(responses[0].status, 200);
    assert.equal(responses[0].body.fields.colors, undefined);
    assert.equal(responses[0].body.fields.editions, undefined);
  });

  it('GET /publisher/:category/published/:productId omits colors/editions when neither field_candidates nor CEF summary has data', async () => {
    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);

    await handler(
      ['publisher', 'mouse', 'published', 'rt-nothing'],
      new URLSearchParams(),
      'GET', {}, {},
    );

    assert.equal(responses[0].status, 200);
    assert.equal(responses[0].body.fields.colors, undefined);
    assert.equal(responses[0].body.fields.editions, undefined);
  });

  // WHY: An edition IS a color — its combo must cascade into the published
  // colors list. Resolving an edition implicitly publishes its color combo.
  it('GET /publisher/:category/published/:productId cascades resolved edition combos into published colors', async () => {
    const pid = 'rt-edition-cascade';
    // Colors: only 'black' explicitly resolved as standalone
    seedCandidate(specDb, pid, 'colors', ['black'], 0.95, 'resolved');
    // Editions: 'cod-bo6' resolved — its combo 'dark-gray+black+orange' must cascade
    seedCandidate(specDb, pid, 'editions', ['cod-bo6'], 0.9, 'resolved');
    // Seed an edition variant so the endpoint can look up its combo
    specDb.variants.upsert({
      productId: pid,
      variantId: 'v_cod_bo6',
      variantKey: 'edition:cod-bo6',
      variantType: 'edition',
      variantLabel: 'Call of Duty: Black Ops 6 Edition',
      colorAtoms: ['dark-gray', 'black', 'orange'],
      editionSlug: 'cod-bo6',
      editionDisplayName: 'Call of Duty: Black Ops 6 Edition',
    });

    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);

    await handler(
      ['publisher', 'mouse', 'published', pid],
      new URLSearchParams(),
      'GET', {}, {},
    );

    assert.equal(responses[0].status, 200);
    assert.ok(responses[0].body.fields.colors, 'colors present');
    assert.ok(responses[0].body.fields.colors.value.includes('black'), 'standalone color published');
    assert.ok(responses[0].body.fields.colors.value.includes('dark-gray+black+orange'), 'edition combo cascaded into colors');
  });

  it('GET /publisher/:category/published/:productId does not cascade an edition combo twice when the combo is also resolved as a standalone color', async () => {
    const pid = 'rt-edition-dedupe';
    seedCandidate(specDb, pid, 'colors', ['dark-gray+black+orange'], 0.95, 'resolved');
    seedCandidate(specDb, pid, 'editions', ['cod-bo6-dup'], 0.9, 'resolved');
    specDb.variants.upsert({
      productId: pid,
      variantId: 'v_cod_bo6_dup',
      variantKey: 'edition:cod-bo6-dup',
      variantType: 'edition',
      variantLabel: 'Dup',
      colorAtoms: ['dark-gray', 'black', 'orange'],
      editionSlug: 'cod-bo6-dup',
      editionDisplayName: 'Dup',
    });

    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);

    await handler(
      ['publisher', 'mouse', 'published', pid],
      new URLSearchParams(),
      'GET', {}, {},
    );

    assert.equal(responses[0].status, 200);
    const combos = responses[0].body.fields.colors.value.filter(c => c === 'dark-gray+black+orange');
    assert.equal(combos.length, 1, 'combo present exactly once');
  });

  // --- GET /publisher/:category/reconcile (dry-run) ---

  it('GET /publisher/:category/reconcile returns preview counts', async () => {
    ensureProductJson('rt-rec');
    seedCandidate(specDb, 'rt-rec', 'dpi', 16000, 80, 'candidate');

    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);

    const handled = await handler(
      ['publisher', 'mouse', 'reconcile'],
      new URLSearchParams(),
      'GET', {}, {},
    );

    assert.equal(handled, true);
    assert.equal(responses[0].status, 200);
    assert.equal(responses[0].body.threshold, 0.7);
    assert.ok('would_unpublish' in responses[0].body || 'unpublished' in responses[0].body);
  });

  // --- POST /publisher/:category/reconcile ---

  it('POST /publisher/:category/reconcile applies reconciliation', async () => {
    ensureProductJson('rt-apply');
    seedCandidate(specDb, 'rt-apply', 'polling_rate', 1000, 90, 'candidate');

    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);

    const handled = await handler(
      ['publisher', 'mouse', 'reconcile'],
      new URLSearchParams(),
      'POST', {}, {},
    );

    assert.equal(handled, true);
    assert.equal(responses[0].status, 200);
    assert.ok(responses[0].body.result);
  });

  // --- Error cases ---

  it('returns 400 when category is missing', async () => {
    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);

    await handler(['publisher'], new URLSearchParams(), 'GET', {}, {});

    assert.equal(responses[0].status, 400);
    assert.equal(responses[0].body.error, 'category required');
  });

  it('returns 404 when specDb is unavailable', async () => {
    const { ctx, responses } = makeCtx(specDb, { getSpecDb: () => null });
    const handler = registerPublisherRoutes(ctx);

    await handler(['publisher', 'keyboard', 'candidates'], new URLSearchParams(), 'GET', {}, {});

    assert.equal(responses[0].status, 404);
  });

  it('returns false for non-publisher routes', async () => {
    const { ctx } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);

    const handled = await handler(['other', 'route'], new URLSearchParams(), 'GET', {}, {});
    assert.equal(handled, false);
  });
});
