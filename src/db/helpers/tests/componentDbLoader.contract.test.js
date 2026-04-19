import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../../specDb.js';
import { loadComponentDbsFromSpecDb } from '../componentDbLoader.js';

function createDb() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

describe('loadComponentDbsFromSpecDb contract', () => {
  let db;
  beforeEach(() => { db = createDb(); });
  afterEach(() => { db.close(); });

  test('empty db returns {}', () => {
    assert.deepEqual(loadComponentDbsFromSpecDb(db), {});
  });

  test('null specDb returns {}', () => {
    assert.deepEqual(loadComponentDbsFromSpecDb(null), {});
  });

  test('undefined specDb returns {}', () => {
    assert.deepEqual(loadComponentDbsFromSpecDb(undefined), {});
  });

  test('single identity, no properties, no aliases', () => {
    db.upsertComponentIdentity({ componentType: 'sensor', canonicalName: 'PAW3950', maker: 'PixArt', links: null, source: 'component_db' });
    const out = loadComponentDbsFromSpecDb(db);
    assert.ok(out.sensor);
    assert.equal(out.sensor.db_name, 'sensor');
    assert.equal(out.sensor.component_type, 'sensor');
    const entries = out.sensor.entries;
    assert.equal(Object.keys(entries).length, 1);
    const entry = entries['PAW3950::PixArt'];
    assert.equal(entry.canonical_name, 'PAW3950');
    assert.equal(entry.name, 'PAW3950');
    assert.equal(entry.maker, 'PixArt');
    assert.deepEqual(entry.aliases, []);
    assert.deepEqual(entry.links, []);
    assert.deepEqual(entry.properties, {});
    assert.ok(out.sensor.__index instanceof Map);
    assert.ok(out.sensor.__indexAll instanceof Map);
  });

  test('links stored as JSON string are parsed to array', () => {
    db.upsertComponentIdentity({
      componentType: 'sensor', canonicalName: 'PAW3950', maker: 'PixArt',
      links: ['https://example.com', 'https://foo.bar'],
      source: 'component_db',
    });
    const out = loadComponentDbsFromSpecDb(db);
    const entry = out.sensor.entries['PAW3950::PixArt'];
    assert.deepEqual(entry.links, ['https://example.com', 'https://foo.bar']);
  });

  test('null links produce empty array', () => {
    db.upsertComponentIdentity({ componentType: 'sensor', canonicalName: 'PAW3950', maker: 'PixArt', links: null, source: 'component_db' });
    const out = loadComponentDbsFromSpecDb(db);
    assert.deepEqual(out.sensor.entries['PAW3950::PixArt'].links, []);
  });

  test('malformed links string is tolerated (empty array)', () => {
    db.upsertComponentIdentity({ componentType: 'sensor', canonicalName: 'PAW3950', maker: 'PixArt', links: null, source: 'component_db' });
    db.db.prepare('UPDATE component_identity SET links = ? WHERE category = ? AND canonical_name = ?')
      .run('not-a-json-array', 'mouse', 'PAW3950');
    const out = loadComponentDbsFromSpecDb(db);
    assert.deepEqual(out.sensor.entries['PAW3950::PixArt'].links, []);
  });

  test('aliases exclude canonical_name but keep others', () => {
    const idRow = db.upsertComponentIdentity({ componentType: 'sensor', canonicalName: 'PAW3950', maker: 'PixArt', links: null, source: 'component_db' });
    db.insertAlias(idRow.id, 'PAW3950', 'component_db');
    db.insertAlias(idRow.id, 'PMW3950', 'component_db');
    db.insertAlias(idRow.id, 'HERO', 'component_db');
    const out = loadComponentDbsFromSpecDb(db);
    const aliases = [...out.sensor.entries['PAW3950::PixArt'].aliases].sort();
    assert.deepEqual(aliases, ['HERO', 'PMW3950']);
  });

  test('properties folded into dict, variance_policies and constraints reconstructed', () => {
    db.upsertComponentIdentity({ componentType: 'sensor', canonicalName: 'PAW3950', maker: 'PixArt', links: null, source: 'component_db' });
    db.upsertComponentValue({
      componentType: 'sensor', componentName: 'PAW3950', componentMaker: 'PixArt',
      propertyKey: 'max_dpi', value: 30000, confidence: 1.0,
      variancePolicy: 'upper_bound', source: 'component_db',
      constraints: ['max_dpi <= 30000'],
    });
    db.upsertComponentValue({
      componentType: 'sensor', componentName: 'PAW3950', componentMaker: 'PixArt',
      propertyKey: 'sensor_type', value: 'optical', confidence: 1.0,
      variancePolicy: null, source: 'component_db',
      constraints: null,
    });
    const entry = loadComponentDbsFromSpecDb(db).sensor.entries['PAW3950::PixArt'];
    assert.deepEqual(entry.properties, { max_dpi: '30000', sensor_type: 'optical' });
    assert.deepEqual(entry.__variance_policies, { max_dpi: 'upper_bound' });
    assert.deepEqual(entry.__constraints, { max_dpi: ['max_dpi <= 30000'] });
  });

  test('__variance_policies and __constraints omitted when all rows empty', () => {
    db.upsertComponentIdentity({ componentType: 'sensor', canonicalName: 'PAW3950', maker: 'PixArt', links: null, source: 'component_db' });
    db.upsertComponentValue({
      componentType: 'sensor', componentName: 'PAW3950', componentMaker: 'PixArt',
      propertyKey: 'sensor_type', value: 'optical', confidence: 1.0,
      variancePolicy: null, source: 'component_db', constraints: null,
    });
    const entry = loadComponentDbsFromSpecDb(db).sensor.entries['PAW3950::PixArt'];
    assert.equal(entry.__variance_policies, undefined);
    assert.equal(entry.__constraints, undefined);
  });

  test('multiple types keyed separately under top-level dict', () => {
    db.upsertComponentIdentity({ componentType: 'sensor', canonicalName: 'PAW3950', maker: 'PixArt', links: null, source: 'component_db' });
    db.upsertComponentIdentity({ componentType: 'switch', canonicalName: 'Red', maker: 'Kailh', links: null, source: 'component_db' });
    const out = loadComponentDbsFromSpecDb(db);
    assert.ok(out.sensor);
    assert.ok(out.switch);
    assert.equal(Object.keys(out.sensor.entries).length, 1);
    assert.equal(Object.keys(out.switch.entries).length, 1);
  });

  test('empty maker preserved in key and entry', () => {
    db.upsertComponentIdentity({ componentType: 'sensor', canonicalName: 'Unknown', maker: '', links: null, source: 'component_db' });
    const entries = loadComponentDbsFromSpecDb(db).sensor.entries;
    assert.ok(entries['Unknown::']);
    assert.equal(entries['Unknown::'].maker, '');
  });

  test('__index resolves alias tokens to entry (normalizeComponentDbPayload wiring)', () => {
    const idRow = db.upsertComponentIdentity({ componentType: 'sensor', canonicalName: 'PAW3950', maker: 'PixArt', links: null, source: 'component_db' });
    db.insertAlias(idRow.id, 'PMW3950', 'component_db');
    const out = loadComponentDbsFromSpecDb(db);
    const byAlias = out.sensor.__index.get('pmw3950');
    assert.ok(byAlias, 'alias token must resolve');
    assert.equal(byAlias.canonical_name, 'PAW3950');
    const byCanonical = out.sensor.__index.get('paw3950');
    assert.ok(byCanonical, 'canonical token must resolve');
    assert.equal(byCanonical.canonical_name, 'PAW3950');
  });

  test('types with no identities are omitted', () => {
    db.upsertComponentIdentity({ componentType: 'switch', canonicalName: 'Red', maker: 'Kailh', links: null, source: 'component_db' });
    const out = loadComponentDbsFromSpecDb(db);
    assert.ok(out.switch);
    assert.equal(out.sensor, undefined);
  });

  test('null/empty property value is skipped in properties dict but still contributes to variance reconstruction', () => {
    db.upsertComponentIdentity({ componentType: 'sensor', canonicalName: 'PAW3950', maker: 'PixArt', links: null, source: 'component_db' });
    db.upsertComponentValue({
      componentType: 'sensor', componentName: 'PAW3950', componentMaker: 'PixArt',
      propertyKey: 'max_dpi', value: null, confidence: 0,
      variancePolicy: 'upper_bound', source: 'component_db', constraints: null,
    });
    const entry = loadComponentDbsFromSpecDb(db).sensor.entries['PAW3950::PixArt'];
    assert.deepEqual(entry.properties, {}, 'null value excluded from properties dict');
    assert.deepEqual(entry.__variance_policies, { max_dpi: 'upper_bound' }, 'variance policy still captured');
  });
});
