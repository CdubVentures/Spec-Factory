import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SpecDb } from '../../../db/specDb.js';
import { runColorEditionFinder } from '../colorEditionFinder.js';

const TMP_ROOT = path.join(os.tmpdir(), `cef-finder-test-${Date.now()}`);
const DB_DIR = path.join(TMP_ROOT, '_db');
const DB_PATH = path.join(DB_DIR, 'spec.sqlite');
const PRODUCT_ROOT = path.join(TMP_ROOT, 'products');

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

// Stub appDb with in-memory color registry
function makeAppDbStub(colors = []) {
  const registry = new Map(colors.map(c => [c.name, c]));
  return {
    listColors: () => [...registry.values()],
    upsertColor: ({ name, hex, css_var }) => {
      registry.set(name, { name, hex, css_var });
    },
    _registry: registry,
  };
}

// Stub LLM caller that returns a canned response
function makeLlmStub(response) {
  let callCount = 0;
  const stub = async () => {
    callCount++;
    if (typeof response === 'function') return response(callCount);
    return response;
  };
  stub.callCount = () => callCount;
  return stub;
}

const PRODUCT = {
  product_id: 'mouse-001',
  category: 'mouse',
  brand: 'Corsair',
  model: 'M75 Air Wireless',
  variant: '',
  seed_urls: ['https://corsair.com/m75'],
};

describe('runColorEditionFinder', () => {
  let specDb;

  before(() => {
    fs.mkdirSync(DB_DIR, { recursive: true });
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    specDb = new SpecDb({ dbPath: DB_PATH, category: 'mouse' });
  });

  after(() => {
    specDb.close();
    cleanup(TMP_ROOT);
  });

  it('happy path: known colors returned, merged to JSON + SQL', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
      { name: 'white', hex: '#ffffff', css_var: '--color-white' },
    ]);

    const result = await runColorEditionFinder({
      product: PRODUCT,
      appDb,
      specDb,
      config: {},
      logger: null,
      colorRegistryPath: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'white'],
        editions: ['cyberpunk-2077-edition'],
        new_colors: [],
      }),
    });

    assert.deepEqual(result.colors, ['black', 'white']);
    assert.deepEqual(result.editions, ['cyberpunk-2077-edition']);
    assert.equal(result.newColorsRegistered.length, 0);

    // Verify SQL
    const row = specDb.getColorEditionFinder('mouse-001');
    assert.ok(row);
    assert.deepEqual(row.colors, ['black', 'white']);
    assert.deepEqual(row.editions, ['cyberpunk-2077-edition']);

    // Verify JSON
    const json = JSON.parse(fs.readFileSync(
      path.join(PRODUCT_ROOT, 'mouse-001', 'color_edition.json'), 'utf8'
    ));
    assert.ok(json.colors.black);
    assert.ok(json.colors.white);
    assert.ok(json.editions['cyberpunk-2077-edition']);
  });

  it('new color auto-registered in appDb', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
    ]);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-new-color' },
      appDb,
      specDb,
      config: {},
      logger: null,
      colorRegistryPath: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black', 'seafoam'],
        editions: [],
        new_colors: [{ name: 'seafoam', hex: '#20b2aa' }],
      }),
    });

    assert.equal(result.newColorsRegistered.length, 1);
    assert.equal(result.newColorsRegistered[0].name, 'seafoam');
    assert.ok(appDb._registry.has('seafoam'), 'seafoam registered in appDb');
    assert.equal(appDb._registry.get('seafoam').hex, '#20b2aa');
    assert.equal(appDb._registry.get('seafoam').css_var, '--color-seafoam');
  });

  it('default_color derived from colors[0]', async () => {
    const appDb = makeAppDbStub([
      { name: 'red', hex: '#ff0000', css_var: '--color-red' },
    ]);

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-default' },
      appDb,
      specDb,
      config: {},
      logger: null,
      colorRegistryPath: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['red'],
        editions: [],
        new_colors: [],
      }),
    });

    const row = specDb.getColorEditionFinder('mouse-default');
    assert.equal(row.default_color, 'red');

    const json = JSON.parse(fs.readFileSync(
      path.join(PRODUCT_ROOT, 'mouse-default', 'color_edition.json'), 'utf8'
    ));
    assert.equal(json.default_color, 'red');
  });

  it('empty colors/editions handled gracefully', async () => {
    const appDb = makeAppDbStub([]);

    const result = await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-empty' },
      appDb,
      specDb,
      config: {},
      logger: null,
      colorRegistryPath: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: [],
        editions: [],
        new_colors: [],
      }),
    });

    assert.deepEqual(result.colors, []);
    assert.deepEqual(result.editions, []);
  });

  it('cooldown set to 30 days from now', async () => {
    const appDb = makeAppDbStub([
      { name: 'black', hex: '#000000', css_var: '--color-black' },
    ]);
    const before = Date.now();

    await runColorEditionFinder({
      product: { ...PRODUCT, product_id: 'mouse-cooldown' },
      appDb,
      specDb,
      config: {},
      logger: null,
      colorRegistryPath: null,
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmStub({
        colors: ['black'],
        editions: [],
        new_colors: [],
      }),
    });

    const row = specDb.getColorEditionFinder('mouse-cooldown');
    const cooldownDate = new Date(row.cooldown_until).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const expectedMin = before + thirtyDaysMs - 5000;
    const expectedMax = Date.now() + thirtyDaysMs + 5000;
    assert.ok(cooldownDate >= expectedMin, 'cooldown at least ~30 days out');
    assert.ok(cooldownDate <= expectedMax, 'cooldown not more than ~30 days out');
  });
});
