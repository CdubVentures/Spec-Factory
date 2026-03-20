import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSuggestionId,
  deduplicateByKey,
  stableSortSuggestions,
} from '../src/engine/curationPureDomain.js';

// ---------------------------------------------------------------------------
// generateSuggestionId
// ---------------------------------------------------------------------------

test('generateSuggestionId produces prefix_slugged_tokens', () => {
  assert.equal(
    generateSuggestionId('enum', 'coating', 'Satin Microtexture'),
    'enum_coating_satin_microtexture'
  );
});

test('generateSuggestionId strips non-alphanumeric characters', () => {
  assert.equal(
    generateSuggestionId('comp', 'IC / Chipset', 'Quad-Core ARM'),
    'comp_ic_chipset_quad_core_arm'
  );
});

test('generateSuggestionId handles empty tokens', () => {
  assert.equal(generateSuggestionId('comp', '', 'value'), 'comp_value');
  assert.equal(generateSuggestionId('comp', null, undefined), 'comp_');
});

// ---------------------------------------------------------------------------
// deduplicateByKey
// ---------------------------------------------------------------------------

test('deduplicateByKey filters out existing entries', () => {
  const existing = [
    { field_key: 'color', value: 'red' },
    { field_key: 'color', value: 'blue' },
  ];
  const incoming = [
    { field_key: 'color', value: 'red' },
    { field_key: 'color', value: 'green' },
  ];
  const keyFn = (row) => `${row.field_key}::${row.value}`;
  const { appended, index } = deduplicateByKey(existing, incoming, keyFn);

  assert.equal(appended.length, 1);
  assert.equal(appended[0].value, 'green');
  assert.equal(index.size, 3);
});

test('deduplicateByKey handles empty existing', () => {
  const incoming = [{ field_key: 'a', value: 'b' }];
  const keyFn = (row) => `${row.field_key}::${row.value}`;
  const { appended } = deduplicateByKey([], incoming, keyFn);
  assert.equal(appended.length, 1);
});

test('deduplicateByKey skips entries with null key', () => {
  const incoming = [{ field_key: '', value: '' }];
  const keyFn = (row) => row.field_key ? `${row.field_key}::${row.value}` : '';
  const { appended } = deduplicateByKey([], incoming, keyFn);
  assert.equal(appended.length, 0);
});

test('deduplicateByKey deduplicates within incoming too', () => {
  const incoming = [
    { field_key: 'a', value: 'x' },
    { field_key: 'a', value: 'x' },
  ];
  const keyFn = (row) => `${row.field_key}::${row.value}`;
  const { appended } = deduplicateByKey([], incoming, keyFn);
  assert.equal(appended.length, 1);
});

// ---------------------------------------------------------------------------
// stableSortSuggestions
// ---------------------------------------------------------------------------

test('stableSortSuggestions sorts by field_key, then value, then first_seen_at', () => {
  const rows = [
    { field_key: 'z', value: 'a', first_seen_at: '2026-01-01' },
    { field_key: 'a', value: 'b', first_seen_at: '2026-01-02' },
    { field_key: 'a', value: 'a', first_seen_at: '2026-01-03' },
    { field_key: 'a', value: 'a', first_seen_at: '2026-01-01' },
  ];
  const sorted = stableSortSuggestions(rows);
  assert.deepEqual(sorted.map((r) => r.first_seen_at), [
    '2026-01-01',
    '2026-01-03',
    '2026-01-02',
    '2026-01-01',
  ]);
});

test('stableSortSuggestions does not mutate input', () => {
  const rows = [{ field_key: 'b' }, { field_key: 'a' }];
  const sorted = stableSortSuggestions(rows);
  assert.notEqual(sorted, rows);
  assert.equal(rows[0].field_key, 'b');
});

test('stableSortSuggestions handles empty/null', () => {
  assert.deepEqual(stableSortSuggestions([]), []);
  assert.deepEqual(stableSortSuggestions(), []);
});
