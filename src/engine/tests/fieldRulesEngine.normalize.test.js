import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  FieldRulesEngine,
  createEngineFixtureRoot,
  createAdvancedEngineFixtureRoot,
} from './helpers/fieldRulesEngineHarness.js';

test('normalizeCandidate converts units and enforces range', async () => {
  const fixture = await createEngineFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const ok = engine.normalizeCandidate('weight', '3.5 oz');
    assert.equal(ok.ok, true);
    assert.equal(Math.round(ok.normalized), 99);

    const outOfRange = engine.normalizeCandidate('weight', '500 g');
    assert.equal(outOfRange.ok, false);
    assert.equal(outOfRange.reason_code, 'out_of_range');
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('normalizeCandidate enforces scalar shape for array and object payloads', async () => {
  const fixture = await createEngineFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });

    const singleton = engine.normalizeCandidate('connection', ['wireless']);
    assert.equal(singleton.ok, true);
    assert.equal(singleton.normalized, 'wireless');

    const arrayMismatch = engine.normalizeCandidate('connection', ['wireless', 'bluetooth']);
    assert.equal(arrayMismatch.ok, false);
    assert.equal(arrayMismatch.reason_code, 'shape_mismatch');

    const objectMismatch = engine.normalizeCandidate('connection', { value: 'wireless', source: 'pipeline' });
    assert.equal(objectMismatch.ok, false);
    assert.equal(objectMismatch.reason_code, 'shape_mismatch');
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('applyKeyMigrations rewrites legacy keys and normalizeFullRecord produces unknowns', async () => {
  const fixture = await createEngineFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const migrated = engine.applyKeyMigrations({
      mouse_side_connector: 'wired'
    });
    assert.equal(migrated.connection, 'wired');
    assert.equal(migrated.mouse_side_connector, undefined);

    const normalized = engine.normalizeFullRecord(
      {
        mouse_side_connector: 'wireless',
        weight: '54 g'
      },
      {
        provenanceByField: {
          weight: {
            url: 'https://example.com/specs',
            snippet_id: 's1',
            quote: '54 g'
          },
          connection: {
            url: 'https://example.com/specs',
            snippet_id: 's2',
            quote: 'wireless'
          }
        },
        evidencePack: {
          snippets: {
            s1: { text: 'Weight: 54 g' },
            s2: { text: 'Connection mode is wireless.' }
          }
        }
      }
    );
    assert.equal(normalized.normalized.weight, 54);
    assert.equal(normalized.normalized.connection, 'wireless');
    assert.equal(normalized.normalized.battery_hours?.value, 'unk');
    assert.equal(normalized.unknowns.some((row) => row.field_key === 'battery_hours'), true);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('normalizeCandidate validates url fields and resolves component_ref aliases', async () => {
  const fixture = await createAdvancedEngineFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });

    const okUrl = engine.normalizeCandidate('spec_url', 'https://example.com/specs');
    assert.equal(okUrl.ok, true);
    assert.equal(okUrl.normalized, 'https://example.com/specs');

    const badUrl = engine.normalizeCandidate('spec_url', 'not a url');
    assert.equal(badUrl.ok, false);
    assert.equal(badUrl.reason_code, 'url_required');

    const sensor = engine.normalizeCandidate('sensor', 'pixart 3395');
    assert.equal(sensor.ok, true);
    assert.equal(sensor.normalized, 'PAW3395');
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('normalizeCandidate reports curation signal for open enums', async () => {
  const fixture = await createAdvancedEngineFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const curationQueue = [];
    const row = engine.normalizeCandidate('coating', 'satin microtexture', { curationQueue });
    assert.equal(row.ok, true);
    assert.equal(row.normalized, 'satin microtexture');
    assert.equal(curationQueue.length, 1);
    assert.equal(curationQueue[0].field_key, 'coating');
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('normalizeCandidate applies normalization_fn for polling list fields', async () => {
  const fixture = await createAdvancedEngineFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const row = engine.normalizeCandidate('polling_rates', '1000, 4000, 2000,1000');
    assert.equal(row.ok, true);
    assert.deepEqual(row.normalized, [4000, 2000, 1000]);
    assert.equal(row.applied_rules.includes('fn:parse_polling_list'), true);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test('normalizeFullRecord is deterministic across repeated runs', async () => {
  const fixture = await createEngineFixtureRoot();
  try {
    const engine = await FieldRulesEngine.create('mouse', {
      config: { categoryAuthorityRoot: fixture.helperRoot }
    });
    const input = {
      mouse_side_connector: 'wireless',
      weight: '3.5 oz'
    };
    const context = {
      provenanceByField: {
        weight: {
          url: 'https://example.com/specs',
          snippet_id: 's1',
          quote: '3.5 oz'
        },
        connection: {
          url: 'https://example.com/specs',
          snippet_id: 's2',
          quote: 'wireless'
        }
      },
      evidencePack: {
        snippets: {
          s1: { text: 'Weight is listed as 3.5 oz.' },
          s2: { text: 'Connection mode is wireless.' }
        }
      }
    };
    const first = engine.normalizeFullRecord(input, context);
    const second = engine.normalizeFullRecord(input, context);
    assert.deepEqual(second, first);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
