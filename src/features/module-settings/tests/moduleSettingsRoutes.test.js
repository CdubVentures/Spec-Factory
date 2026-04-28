// WHY: Boundary contract — the module-settings route dispatches on the first
// URL segment ('global' vs category name). Global-scope finders must only
// accept /global/:moduleId; category-scope finders must only accept /:cat/:mod.
// Crossing these lanes must 404 so stale clients fail loudly rather than
// silently writing to the wrong store.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { registerModuleSettingsRoutes } from '../api/moduleSettingsRoutes.js';
import { AppDb } from '../../../db/appDb.js';
import { SpecDb } from '../../../db/specDb.js';
import { writeProductImages } from '../../product-image/productImageStore.js';

function makeRes() {
  return { statusCode: 0, body: null };
}

function makeJsonRes(res) {
  return (response, status, body) => {
    response.statusCode = status;
    response.body = body;
    return true;
  };
}

function makeReadJsonBody(payload) {
  return async () => payload;
}

function createHarness({ appDb, specDbByCategory = new Map(), helperRoot }) {
  const handler = registerModuleSettingsRoutes({
    jsonRes: makeJsonRes(),
    readJsonBody: () => Promise.resolve({}),
    getSpecDb: (cat) => specDbByCategory.get(cat) || null,
    broadcastWs: () => {},
    helperRoot,
    appDb,
  });
  return handler;
}

function makePifImage(view, filename, overrides = {}) {
  return {
    view,
    filename,
    url: `https://example.com/${filename}`,
    variant_id: 'v_black',
    variant_key: 'color:black',
    variant_label: 'Black',
    variant_type: 'color',
    quality_pass: true,
    eval_best: true,
    eval_actual_view: view,
    eval_usable_as_required_view: true,
    ...overrides,
  };
}

describe('moduleSettingsRoutes — /global/:moduleId (scope=global)', () => {
  let tmpDir, appDb;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-factory-msr-'));
    appDb = new AppDb({ dbPath: ':memory:' });
  });

  afterEach(() => {
    appDb.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('GET returns defaults merged with stored values', async () => {
    appDb.upsertFinderGlobalSetting('colorEditionFinder', 'urlHistoryEnabled', 'true');
    const handler = registerModuleSettingsRoutes({
      jsonRes: (res, status, body) => { res.statusCode = status; res.body = body; return true; },
      readJsonBody: () => Promise.resolve({}),
      getSpecDb: () => null,
      broadcastWs: () => {},
      helperRoot: tmpDir,
      appDb,
    });

    const res = makeRes();
    await handler(['module-settings', 'global', 'colorEditionFinder'], {}, 'GET', {}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.scope, 'global');
    assert.equal(res.body.module, 'colorEditionFinder');
    // Stored value wins over schema default.
    assert.equal(res.body.settings.urlHistoryEnabled, 'true');
    // Schema default for unset key is present.
    assert.equal(res.body.settings.queryHistoryEnabled, 'false');
  });

  it('PUT writes SQL + dual-writes JSON to _global/', async () => {
    let captured = null;
    const handler = registerModuleSettingsRoutes({
      jsonRes: (res, status, body) => { res.statusCode = status; res.body = body; return true; },
      readJsonBody: async () => ({ settings: { urlHistoryEnabled: 'true' } }),
      getSpecDb: () => null,
      broadcastWs: (ev) => { captured = ev; },
      helperRoot: tmpDir,
      appDb,
    });

    const res = makeRes();
    await handler(['module-settings', 'global', 'colorEditionFinder'], {}, 'PUT', {}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(appDb.getFinderGlobalSetting('colorEditionFinder', 'urlHistoryEnabled'), 'true');

    const jsonPath = path.join(tmpDir, '_global', 'color_edition_settings.json');
    assert.ok(fs.existsSync(jsonPath));
    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    assert.equal(parsed.urlHistoryEnabled, 'true');
    // JSON mirror includes schema defaults for untouched keys.
    assert.equal(parsed.queryHistoryEnabled, 'false');
  });

  it('GET /global/productImageFinder returns only PIF global-scoped settings', async () => {
    appDb.upsertFinderGlobalSetting('productImageFinder', 'heroCount', '1');
    appDb.upsertFinderGlobalSetting('productImageFinder', 'evalThumbSize', '1024');
    const handler = registerModuleSettingsRoutes({
      jsonRes: (res, status, body) => { res.statusCode = status; res.body = body; return true; },
      readJsonBody: () => Promise.resolve({}),
      getSpecDb: () => null,
      broadcastWs: () => {},
      helperRoot: tmpDir,
      appDb,
    });

    const res = makeRes();
    await handler(['module-settings', 'global', 'productImageFinder'], {}, 'GET', {}, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.scope, 'global');
    assert.equal(res.body.module, 'productImageFinder');
    assert.equal(res.body.settings.heroCount, '1');
    assert.equal(res.body.settings.evalThumbSize, '1024');
    assert.equal(res.body.settings.loopRunImageHistoryEnabled, 'false');
    assert.equal(res.body.settings.viewBudget, undefined);
    assert.equal(res.body.settings.carouselScoredViews, undefined);
  });

  it('GET /global/:unknown returns 404', async () => {
    const handler = registerModuleSettingsRoutes({
      jsonRes: (res, status, body) => { res.statusCode = status; res.body = body; return true; },
      readJsonBody: () => Promise.resolve({}),
      getSpecDb: () => null,
      broadcastWs: () => {},
      helperRoot: tmpDir,
      appDb,
    });
    const res = makeRes();
    await handler(['module-settings', 'global', 'doesNotExist'], {}, 'GET', {}, res);
    assert.equal(res.statusCode, 404);
  });
});

describe('moduleSettingsRoutes — /:category/:moduleId (scope=category)', () => {
  let tmpDir, appDb, specDb;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-factory-msr-cat-'));
    appDb = new AppDb({ dbPath: ':memory:' });
    specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse', globalDb: appDb.db });
  });

  afterEach(() => {
    specDb.close();
    appDb.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('GET /:category/productImageFinder reads per-category store', async () => {
    const store = specDb.getFinderStore('productImageFinder');
    store.setSetting('satisfactionThreshold', '7');
    store.setSetting('viewBudget', '["top","left"]');
    appDb.upsertFinderGlobalSetting('productImageFinder', 'heroCount', '1');

    const handler = registerModuleSettingsRoutes({
      jsonRes: (res, status, body) => { res.statusCode = status; res.body = body; return true; },
      readJsonBody: () => Promise.resolve({}),
      getSpecDb: () => specDb,
      broadcastWs: () => {},
      helperRoot: tmpDir,
      appDb,
    });
    const res = makeRes();
    await handler(['module-settings', 'mouse', 'productImageFinder'], {}, 'GET', {}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.category, 'mouse');
    assert.equal(res.body.settings.satisfactionThreshold, '7');
    assert.equal(res.body.settings.viewBudget, '["top","left"]');
    assert.equal(res.body.settings.heroCount, '1');
  });

  it('GET /:category/<global-scoped-module> returns 404', async () => {
    const handler = registerModuleSettingsRoutes({
      jsonRes: (res, status, body) => { res.statusCode = status; res.body = body; return true; },
      readJsonBody: () => Promise.resolve({}),
      getSpecDb: () => specDb,
      broadcastWs: () => {},
      helperRoot: tmpDir,
      appDb,
    });
    const res = makeRes();
    // CEF is global-scope — per-category endpoint must redirect to /global/.
    await handler(['module-settings', 'mouse', 'colorEditionFinder'], {}, 'GET', {}, res);
    assert.equal(res.statusCode, 404);
  });

  it('PUT /:category/productImageFinder writes per-category JSON', async () => {
    const handler = registerModuleSettingsRoutes({
      jsonRes: (res, status, body) => { res.statusCode = status; res.body = body; return true; },
      readJsonBody: async () => ({ settings: { satisfactionThreshold: '9', heroCount: '1', evalEnabled: 'false' } }),
      getSpecDb: () => specDb,
      broadcastWs: () => {},
      helperRoot: tmpDir,
      appDb,
    });
    const res = makeRes();
    await handler(['module-settings', 'mouse', 'productImageFinder'], {}, 'PUT', {}, res);
    assert.equal(res.statusCode, 200);
    const categoryJsonPath = path.join(tmpDir, 'mouse', 'product_images_settings.json');
    assert.ok(fs.existsSync(categoryJsonPath));
    const categoryParsed = JSON.parse(fs.readFileSync(categoryJsonPath, 'utf8'));
    assert.equal(categoryParsed.satisfactionThreshold, '9');
    assert.equal(categoryParsed.heroCount, undefined);
    assert.equal(categoryParsed.evalEnabled, undefined);

    const globalJsonPath = path.join(tmpDir, '_global', 'product_images_settings.json');
    assert.ok(fs.existsSync(globalJsonPath));
    const globalParsed = JSON.parse(fs.readFileSync(globalJsonPath, 'utf8'));
    assert.equal(globalParsed.heroCount, '1');
    assert.equal(globalParsed.evalEnabled, 'false');
    assert.equal(globalParsed.viewBudget, undefined);
    assert.equal(appDb.getFinderGlobalSetting('productImageFinder', 'heroCount'), '1');
  });

  it('PUT /:category/productImageFinder carousel settings rebuilds PIF progress before broadcast', async () => {
    const productRoot = path.join(tmpDir, 'products');
    const settings = {
      viewBudget: '["top","left"]',
      carouselScoredViews: '["top","left"]',
      carouselOptionalViews: '',
      carouselExtraTarget: '3',
      heroEnabled: 'false',
      heroCount: '1',
    };
    const upserted = [];
    const fakeSpecDb = {
      category: 'mouse',
      variants: {
        listActive(productId) {
          return productId === 'mouse-001'
            ? [{ variant_id: 'v_black', variant_key: 'color:black' }]
            : [];
        },
      },
      getFinderStore(moduleId) {
        if (moduleId !== 'productImageFinder') return null;
        return {
          setSetting(key, value) {
            settings[key] = String(value);
          },
          getSetting(key) {
            return settings[key] ?? null;
          },
          getAllSettings() {
            return { ...settings };
          },
        };
      },
      upsertPifVariantProgress(row) {
        upserted.push(row);
      },
    };

    writeProductImages({
      productId: 'mouse-001',
      productRoot,
      data: {
        product_id: 'mouse-001',
        category: 'mouse',
        selected: {
          images: [
            makePifImage('top', 'top.png'),
            makePifImage('right', 'right.png', { eval_usable_as_carousel_extra: false }),
          ],
        },
        runs: [],
      },
    });

    let captured = null;
    const handler = registerModuleSettingsRoutes({
      jsonRes: (res, status, body) => { res.statusCode = status; res.body = body; return true; },
      readJsonBody: async () => ({
        settings: {
          carouselScoredViews: '["top"]',
          carouselOptionalViews: '["right"]',
          carouselExtraTarget: '5',
        },
      }),
      getSpecDb: () => fakeSpecDb,
      broadcastWs: (_channel, payload) => { captured = payload; },
      helperRoot: tmpDir,
      productRoot,
      appDb,
    });

    const res = makeRes();
    await handler(['module-settings', 'mouse', 'productImageFinder'], {}, 'PUT', {}, res);

    assert.equal(res.statusCode, 200);
    assert.equal(upserted.length, 1);
    assert.equal(upserted[0].priorityFilled, 2);
    assert.equal(upserted[0].priorityTotal, 1);
    assert.equal(upserted[0].loopFilled, 1);
    assert.equal(upserted[0].loopTotal, 5);
    assert.ok(captured.domains.includes('module-settings'));
    assert.ok(captured.domains.includes('product-image-finder'));
    assert.ok(captured.domains.includes('catalog'));
  });
});
