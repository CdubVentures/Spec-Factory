import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveComponent } from '../checks/resolveComponent.js';

const sensorDb = {
  items: [
    { name: 'Focus Pro 45K', aliases: ['FocusPro45K', 'Focus Pro 45000'], maker: 'razer' },
    { name: 'PAW3395', aliases: ['PAW 3395', 'PixArt 3395'], maker: 'pixart' },
    { name: 'TTC Gold', aliases: [], maker: 'ttc' },
  ],
};

describe('resolveComponent — exact name match', () => {
  it('exact match → pass, not repaired', () => {
    const r = resolveComponent('Focus Pro 45K', 'sensor', sensorDb);
    assert.equal(r.pass, true);
    assert.equal(r.canonical, 'Focus Pro 45K');
    assert.equal(r.repaired, undefined);
  });

  it('exact match (PAW3395)', () => {
    const r = resolveComponent('PAW3395', 'sensor', sensorDb);
    assert.equal(r.pass, true);
    assert.equal(r.canonical, 'PAW3395');
  });

  it('exact match (TTC Gold)', () => {
    const r = resolveComponent('TTC Gold', 'sensor', sensorDb);
    assert.equal(r.pass, true);
    assert.equal(r.canonical, 'TTC Gold');
  });
});

describe('resolveComponent — case-insensitive name match', () => {
  it('lowercase → repair', () => {
    const r = resolveComponent('focus pro 45k', 'sensor', sensorDb);
    assert.equal(r.pass, true);
    assert.equal(r.canonical, 'Focus Pro 45K');
    assert.equal(r.repaired, true);
  });

  it('uppercase → repair', () => {
    const r = resolveComponent('FOCUS PRO 45K', 'sensor', sensorDb);
    assert.equal(r.pass, true);
    assert.equal(r.canonical, 'Focus Pro 45K');
    assert.equal(r.repaired, true);
  });

  it('mixed case (paw3395)', () => {
    const r = resolveComponent('paw3395', 'sensor', sensorDb);
    assert.equal(r.pass, true);
    assert.equal(r.canonical, 'PAW3395');
    assert.equal(r.repaired, true);
  });
});

describe('resolveComponent — alias match', () => {
  it('exact alias → repair to canonical', () => {
    const r = resolveComponent('FocusPro45K', 'sensor', sensorDb);
    assert.equal(r.pass, true);
    assert.equal(r.canonical, 'Focus Pro 45K');
    assert.equal(r.repaired, true);
  });

  it('case-insensitive alias → repair', () => {
    const r = resolveComponent('focuspro45k', 'sensor', sensorDb);
    assert.equal(r.pass, true);
    assert.equal(r.canonical, 'Focus Pro 45K');
    assert.equal(r.repaired, true);
  });

  it('alias with space (PAW 3395)', () => {
    const r = resolveComponent('PAW 3395', 'sensor', sensorDb);
    assert.equal(r.pass, true);
    assert.equal(r.canonical, 'PAW3395');
    assert.equal(r.repaired, true);
  });

  it('alias (PixArt 3395)', () => {
    const r = resolveComponent('PixArt 3395', 'sensor', sensorDb);
    assert.equal(r.pass, true);
    assert.equal(r.canonical, 'PAW3395');
    assert.equal(r.repaired, true);
  });
});

describe('resolveComponent — no match', () => {
  it('unknown name → fail', () => {
    const r = resolveComponent('Mystery Sensor 9000', 'sensor', sensorDb);
    assert.equal(r.pass, false);
    assert.equal(r.reason, 'not_in_component_db');
  });

  it('partial match is not a match', () => {
    const r = resolveComponent('Focus', 'sensor', sensorDb);
    assert.equal(r.pass, false);
  });
});

describe('resolveComponent — passthrough', () => {
  it('unk → pass', () => {
    const r = resolveComponent('unk', 'sensor', sensorDb);
    assert.equal(r.pass, true);
  });

  it('null componentDb → pass', () => {
    const r = resolveComponent('anything', 'sensor', null);
    assert.equal(r.pass, true);
  });

  it('empty items → pass', () => {
    const r = resolveComponent('anything', 'sensor', { items: [] });
    assert.equal(r.pass, true);
  });

  it('non-string value → pass', () => {
    const r = resolveComponent(42, 'sensor', sensorDb);
    assert.equal(r.pass, true);
  });

  it('null value → pass', () => {
    const r = resolveComponent(null, 'sensor', sensorDb);
    assert.equal(r.pass, true);
  });
});

describe('resolveComponent — entities without aliases', () => {
  it('entity with empty aliases array', () => {
    const r = resolveComponent('TTC Gold', 'encoder', sensorDb);
    assert.equal(r.pass, true);
    assert.equal(r.canonical, 'TTC Gold');
  });

  it('no aliases property at all', () => {
    const db = { items: [{ name: 'Plastic', maker: 'generic' }] };
    const r = resolveComponent('Plastic', 'material', db);
    assert.equal(r.pass, true);
    assert.equal(r.canonical, 'Plastic');
  });
});
