import test from 'node:test';
import assert from 'node:assert/strict';
import { FieldRulesEngine } from '../fieldRulesEngine.js';
import { applyRuntimeFieldRules } from '../runtimeGate.js';

const ENGINE_CACHE = new Map();

async function getEngine(category) {
  if (!ENGINE_CACHE.has(category)) {
    ENGINE_CACHE.set(category, FieldRulesEngine.create(category, {
      config: { categoryAuthorityRoot: 'category_authority' }
    }));
  }
  return ENGINE_CACHE.get(category);
}

test('mouse release_date uses date_field template normalization', async () => {
  const engine = await getEngine('mouse');
  const result = engine.normalizeCandidate('release_date', 'Oct 2024');
  assert.equal(result.ok, true);
  assert.equal(result.normalized, '2024-10-01');
});

test('mouse discontinued uses boolean_yes_no_unk template normalization', async () => {
  const engine = await getEngine('mouse');
  const result = engine.normalizeCandidate('discontinued', 'YES');
  assert.equal(result.ok, true);
  assert.equal(result.normalized, 'yes');
});

test('mouse encoder_link uses url_field template normalization', async () => {
  const engine = await getEngine('mouse');
  const result = engine.normalizeCandidate('encoder_link', 'example.com/spec');
  assert.equal(result.ok, true);
  assert.equal(result.normalized, 'https://example.com/spec');
});

test('mouse colors accepts multi-atom closed-enum values when each atom is known', async () => {
  const engine = await getEngine('mouse');
  const result = engine.normalizeCandidate('colors', 'white+black, gray+black');
  assert.equal(result.ok, true);
  assert.deepEqual(result.normalized, ['white+black', 'gray+black']);
});

test('mouse polling_rate uses list_of_numbers_with_unit template normalization', async () => {
  const engine = await getEngine('mouse');
  const result = engine.normalizeCandidate('polling_rate', '1k, 2k');
  assert.equal(result.ok, true);
  assert.deepEqual(result.normalized, [1000, 2000]);
});

test('mouse lift uses list_numbers_or_ranges_with_unit template normalization and display rounding', async () => {
  const engine = await getEngine('mouse');
  const result = engine.normalizeCandidate('lift', '1.24 mm');
  assert.equal(result.ok, true);
  assert.deepEqual(result.normalized, [1.2]);
});

test('mouse click_latency_list preserves structured latency objects', async () => {
  const engine = await getEngine('mouse');
  const result = engine.normalizeCandidate('click_latency_list', '1.1 wired, 1.3 wireless');
  assert.equal(result.ok, true);
  assert.deepEqual(result.normalized, [
    { ms: 1.1, mode: 'wired' },
    { ms: 1.3, mode: 'wireless' }
  ]);
});

test('runtime gate enforces field-rule constraints after normalization', async () => {
  const engine = await getEngine('mouse');
  const result = applyRuntimeFieldRules({
    engine,
    fields: {
      release_date: '2024-01-01',
      sensor_date: '2025-01-01'
    },
    provenance: {},
    fieldOrder: ['release_date', 'sensor_date'],
    respectPerFieldEvidence: false
  });

  assert.equal(result.fields.release_date, '2024-01-01');
  assert.equal(result.fields.sensor_date, 'unk');
  assert.equal(
    result.failures.some((row) => row.field === 'sensor_date' && row.reason_code === 'constraint_failed'),
    true
  );
});
