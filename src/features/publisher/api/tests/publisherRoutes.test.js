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

  it('GET /publisher/:category/candidates projects evidence + accepted/rejected counts per row', async () => {
    const pid = 'rt-evidence';
    specDb.insertFieldCandidate({
      productId: pid, fieldKey: 'colors', sourceId: 'cef-rt-evidence-1',
      sourceType: 'cef', value: '["black"]', unit: null, confidence: 95,
      model: 'gpt-5.4-mini', validationJson: { valid: true, repairs: [], rejections: [] },
      metadataJson: { variant_key: 'color:black' }, variantId: 'v_black',
    });
    const row = specDb.getFieldCandidateBySourceId(pid, 'colors', 'cef-rt-evidence-1');
    specDb.insertFieldCandidateEvidenceMany(row.id, [
      { url: 'https://good.example.com', tier: 'tier1', confidence: 95, http_status: 200, verified_at: '2026-04-18T22:30:00.000Z', accepted: 1 },
      { url: 'https://bad.example.com', tier: 'tier2', confidence: 80, http_status: 404, verified_at: '2026-04-18T22:30:01.000Z', accepted: 0 },
      { url: 'https://also-good.example.com', tier: 'tier3', confidence: 70, http_status: 200, verified_at: '2026-04-18T22:30:02.000Z', accepted: 1 },
    ]);

    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);
    await handler(
      ['publisher', 'mouse', 'candidates'],
      new URLSearchParams('page=1&limit=50'),
      'GET', {}, {},
    );

    assert.equal(responses[0].status, 200);
    const rtRow = responses[0].body.rows.find(r => r.source_id === 'cef-rt-evidence-1');
    assert.ok(rtRow, 'seeded row should appear in response');
    assert.equal(rtRow.evidence_accepted_count, 2);
    assert.equal(rtRow.evidence_rejected_count, 1);
    assert.ok(Array.isArray(rtRow.evidence));
    assert.equal(rtRow.evidence.length, 3);
    const good = rtRow.evidence.find(e => e.url === 'https://good.example.com');
    const bad = rtRow.evidence.find(e => e.url === 'https://bad.example.com');
    assert.equal(good.http_status, 200);
    assert.equal(good.accepted, 1);
    assert.equal(good.tier, 'tier1');
    assert.equal(bad.http_status, 404);
    assert.equal(bad.accepted, 0);
  });

  it('GET /publisher/:category/candidates shows zero counts + empty evidence for candidates without refs', async () => {
    seedCandidate(specDb, 'rt-no-evidence', 'weight', 70, 85);
    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);
    await handler(
      ['publisher', 'mouse', 'candidates'],
      new URLSearchParams('page=1&limit=50'),
      'GET', {}, {},
    );
    const rtRow = responses[0].body.rows.find(r => r.product_id === 'rt-no-evidence');
    assert.ok(rtRow);
    assert.equal(rtRow.evidence_accepted_count, 0);
    assert.equal(rtRow.evidence_rejected_count, 0);
    assert.deepEqual(rtRow.evidence, []);
  });

  it('GET /publisher/:category/candidates includes stripped-unk audit rows from finder history', async () => {
    const pid = 'rt-stripped-unk';
    const store = specDb.getFinderStore('keyFinder');
    store.upsert({
      category: 'mouse',
      product_id: pid,
      last_run_id: 7,
      latest_ran_at: '2026-04-24T10:00:00.000Z',
      run_count: 1,
    });
    store.insertRun({
      category: 'mouse',
      product_id: pid,
      run_number: 7,
      ran_at: '2026-04-24T10:00:00.000Z',
      model: 'gpt-5.4',
      selected: { keys: { sensor_model: { value: null, unknown_reason: 'not disclosed' } } },
      prompt: { system: 's', user: 'u' },
      response: {
        primary_field_key: 'sensor_model',
        results: {
          sensor_model: {
            value: 'unk',
            confidence: 0,
            unknown_reason: 'not disclosed',
            evidence_refs: [],
          },
        },
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      },
    });

    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);
    await handler(
      ['publisher', 'mouse', 'candidates'],
      new URLSearchParams('page=1&limit=50'),
      'GET', {}, {},
    );

    assert.equal(responses[0].status, 200);
    const auditRow = responses[0].body.rows.find(r => r.product_id === pid && r.field_key === 'sensor_model');
    assert.ok(auditRow, 'stripped unk run should be visible in publisher audit table');
    assert.equal(auditRow.row_kind, 'stripped_unknown');
    assert.equal(auditRow.unknown_stripped, true);
    assert.equal(auditRow.unknown_reason, 'not disclosed');
    assert.equal(auditRow.value, null);
    assert.equal(auditRow.status, 'stripped');
    assert.equal(auditRow.source_type, 'key_finder');
    assert.equal(auditRow.run_number, 7);
    assert.equal(auditRow.evidence_accepted_count, 0);
    assert.equal(auditRow.evidence_rejected_count, 0);
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
  // WHY (CEF rule): "variant is directly connected to published for colors
  // and editions". The variants table is the SSOT for these two fields —
  // field_candidates is evidence only, not the publish source.
  it('GET /publisher/:category/published/:productId reads colors/editions from the variants table (SSOT)', async () => {
    const pid = 'rt-variants-colors';
    specDb.variants.upsert({
      productId: pid, variantId: 'v_black',
      variantKey: 'color:black', variantType: 'color',
      variantLabel: 'black', colorAtoms: ['black'],
    });
    specDb.variants.upsert({
      productId: pid, variantId: 'v_frost',
      variantKey: 'color:white+silver', variantType: 'color',
      variantLabel: 'Frost White', colorAtoms: ['white', 'silver'],
    });
    specDb.variants.upsert({
      productId: pid, variantId: 'v_special',
      variantKey: 'edition:special-ed', variantType: 'edition',
      variantLabel: 'Special Edition', colorAtoms: ['ruby'],
      editionSlug: 'special-ed', editionDisplayName: 'Special Edition',
    });

    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);

    await handler(
      ['publisher', 'mouse', 'published', pid],
      new URLSearchParams(),
      'GET', {}, {},
    );

    assert.equal(responses[0].status, 200);
    assert.ok(responses[0].body.fields.colors, 'colors populated from variants');
    // WHY: Edition combo cascades into colors natively (edition IS a color variant).
    assert.deepEqual(responses[0].body.fields.colors.value, ['black', 'white+silver', 'ruby']);
    assert.equal(responses[0].body.fields.colors.source, 'variant_registry');

    assert.ok(responses[0].body.fields.editions, 'editions populated from variants');
    assert.deepEqual(responses[0].body.fields.editions.value, ['special-ed']);
    assert.equal(responses[0].body.fields.editions.source, 'variant_registry');
  });

  it('GET /publisher/:category/published/:productId: delete-all-runs scenario (candidates stripped, variants preserved) keeps colors/editions published', async () => {
    const pid = 'rt-post-delete-all';
    // NO candidates (they were stripped by delete-all-runs).
    // Variants survive — that's the CEF contract.
    specDb.variants.upsert({
      productId: pid, variantId: 'v_p',
      variantKey: 'color:black', variantType: 'color',
      variantLabel: 'black', colorAtoms: ['black'],
    });
    specDb.variants.upsert({
      productId: pid, variantId: 'v_e',
      variantKey: 'edition:launch', variantType: 'edition',
      variantLabel: 'Launch', colorAtoms: ['red', 'black'],
      editionSlug: 'launch', editionDisplayName: 'Launch',
    });

    const { ctx, responses } = makeCtx(specDb);
    const handler = registerPublisherRoutes(ctx);

    await handler(
      ['publisher', 'mouse', 'published', pid],
      new URLSearchParams(),
      'GET', {}, {},
    );

    assert.equal(responses[0].status, 200);
    assert.ok(responses[0].body.fields.colors, 'colors survive delete-all-runs');
    assert.deepEqual(responses[0].body.fields.colors.value, ['black', 'red+black']);
    assert.ok(responses[0].body.fields.editions, 'editions survive delete-all-runs');
    assert.deepEqual(responses[0].body.fields.editions.value, ['launch']);
  });

  it('GET /publisher/:category/published/:productId omits colors/editions when no variants exist — even if CEF summary has variant-derived data', async () => {
    // CEF summary has legacy data, but variants table is the SSOT and has nothing.
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

  // WHY: An edition IS a color — its combo cascades into published colors
  // natively via the variants table (no separate cascade step required).
  it('GET /publisher/:category/published/:productId cascades an edition variant combo into published colors', async () => {
    const pid = 'rt-edition-cascade';
    // Standalone color variant
    specDb.variants.upsert({
      productId: pid, variantId: 'v_black',
      variantKey: 'color:black', variantType: 'color',
      variantLabel: 'black', colorAtoms: ['black'],
    });
    // Edition variant with its own combo — combo must appear in colors too
    specDb.variants.upsert({
      productId: pid, variantId: 'v_cod_bo6',
      variantKey: 'edition:cod-bo6', variantType: 'edition',
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

  it('GET /publisher/:category/published/:productId does not cascade an edition combo twice when a color variant also uses the same combo', async () => {
    const pid = 'rt-edition-dedupe';
    // Color variant and edition variant with the same combo — combo must appear once.
    specDb.variants.upsert({
      productId: pid, variantId: 'v_combo',
      variantKey: 'color:dark-gray+black+orange', variantType: 'color',
      variantLabel: 'Dark Gray Black Orange',
      colorAtoms: ['dark-gray', 'black', 'orange'],
    });
    specDb.variants.upsert({
      productId: pid, variantId: 'v_cod_bo6_dup',
      variantKey: 'edition:cod-bo6-dup', variantType: 'edition',
      variantLabel: 'Dup', colorAtoms: ['dark-gray', 'black', 'orange'],
      editionSlug: 'cod-bo6-dup', editionDisplayName: 'Dup',
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
