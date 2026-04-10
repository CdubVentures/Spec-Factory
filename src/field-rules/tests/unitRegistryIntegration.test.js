import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AppDb } from '../../db/appDb.js';
import { seedAppDb } from '../../db/appDbSeed.js';
import { validateField } from '../../features/publisher/validation/validateField.js';
import { invalidateUnitRegistryCache } from '../unitRegistry.js';

// WHY: Integration test proving the full chain:
// seed JSON → app.sqlite → unitRegistry cache → checkUnit → validateField
// This exercises synonym resolution and unit conversion with a REAL database.

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'unit-reg-test-'));
}

function createTestAppDb(tmpDir) {
  return new AppDb({ dbPath: path.join(tmpDir, 'app.sqlite') });
}

function seedWithRegistry(appDb, tmpDir) {
  const registryJson = {
    schema_version: 1,
    units: [
      { canonical: 'g', label: 'Grams', synonyms: ['gram', 'grams', 'gr'], conversions: [{ from: 'kg', factor: 1000 }, { from: 'lb', factor: 453.592 }] },
      { canonical: 'Hz', label: 'Hertz', synonyms: ['hz', 'hertz'], conversions: [{ from: 'kHz', factor: 1000 }] },
      { canonical: 'mm', label: 'Millimeters', synonyms: ['millimeter', 'millimeters'], conversions: [{ from: 'in', factor: 25.4 }] },
    ],
  };
  const registryPath = path.join(tmpDir, 'unit_registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(registryJson));
  seedAppDb({ appDb, unitRegistryPath: registryPath });
  return appDb;
}

describe('unit registry integration — validateField with real appDb', () => {
  let tmpDir;
  let appDb;

  beforeEach(() => {
    invalidateUnitRegistryCache();
    tmpDir = createTempDir();
    appDb = createTestAppDb(tmpDir);
    seedWithRegistry(appDb, tmpDir);
  });

  after(() => {
    invalidateUnitRegistryCache();
  });

  function numericRule(unit) {
    return { contract: { shape: 'scalar', type: 'number', unit }, parse: {}, enum: {} };
  }

  it('synonym "hertz" resolves to Hz and strips to number', () => {
    const r = validateField({ fieldKey: 'polling_rate', value: '120 hertz', fieldRule: numericRule('Hz'), appDb });
    assert.equal(r.valid, true);
    assert.equal(r.value, 120);
    assert.equal(r.unit, 'Hz');
    assert.ok(r.repairs.some(rep => rep.step === 'unit'));
  });

  it('synonym "grams" resolves to g and strips to number', () => {
    const r = validateField({ fieldKey: 'weight', value: '80 grams', fieldRule: numericRule('g'), appDb });
    assert.equal(r.valid, true);
    assert.equal(r.value, 80);
    assert.equal(r.unit, 'g');
  });

  it('conversion lb → g applies factor 453.592', () => {
    const r = validateField({ fieldKey: 'weight', value: '2.65 lb', fieldRule: numericRule('g'), appDb });
    assert.equal(r.valid, true);
    assert.ok(Math.abs(r.value - 2.65 * 453.592) < 0.01, `expected ~1202, got ${r.value}`);
    assert.equal(r.unit, 'g');
    assert.ok(r.repairs.some(rep => rep.rule === 'unit_converted'));
  });

  it('conversion kHz → Hz applies factor 1000', () => {
    const r = validateField({ fieldKey: 'polling_rate', value: '1 kHz', fieldRule: numericRule('Hz'), appDb });
    assert.equal(r.valid, true);
    assert.equal(r.value, 1000);
    assert.equal(r.unit, 'Hz');
  });

  it('conversion in → mm applies factor 25.4', () => {
    const r = validateField({ fieldKey: 'length', value: '10 in', fieldRule: numericRule('mm'), appDb });
    assert.equal(r.valid, true);
    assert.equal(r.value, 254);
    assert.equal(r.unit, 'mm');
  });

  it('unknown unit "foobar" is rejected on a g field', () => {
    const r = validateField({ fieldKey: 'weight', value: '100 foobar', fieldRule: numericRule('g'), appDb });
    assert.equal(r.valid, false);
    assert.ok(r.rejections.some(rej => rej.reason_code === 'wrong_unit'));
  });

  it('bare number passes through without rejection', () => {
    const r = validateField({ fieldKey: 'weight', value: 80, fieldRule: numericRule('g'), appDb });
    assert.equal(r.valid, true);
    assert.equal(r.value, 80);
    assert.equal(r.unit, 'g');
  });

  it('canonical match still works (case-insensitive)', () => {
    const r = validateField({ fieldKey: 'weight', value: '80 g', fieldRule: numericRule('g'), appDb });
    assert.equal(r.valid, true);
    assert.equal(r.value, 80);
  });

  it('unregistered custom unit still matches itself', () => {
    const r = validateField({ fieldKey: 'custom_field', value: '42 foobar', fieldRule: numericRule('foobar'), appDb });
    assert.equal(r.valid, true);
    assert.equal(r.value, 42);
  });

  it('without appDb, synonym resolution fails gracefully to rejection', () => {
    invalidateUnitRegistryCache();
    const r = validateField({ fieldKey: 'polling_rate', value: '120 hertz', fieldRule: numericRule('Hz') });
    // Without appDb, 'hertz' can't be resolved as synonym — rejected
    assert.equal(r.valid, false);
  });

  it('without appDb, case-insensitive canonical match still works', () => {
    invalidateUnitRegistryCache();
    const r = validateField({ fieldKey: 'polling_rate', value: '120 hz', fieldRule: numericRule('Hz') });
    assert.equal(r.valid, true);
    assert.equal(r.value, 120);
  });
});
