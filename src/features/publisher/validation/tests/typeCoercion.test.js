import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { coerceByType } from '../typeCoercion.js';

// ── string ──────────────────────────────────────────────────────────────────
describe('coerceByType — string', () => {
  it('string passthrough', () => {
    const r = coerceByType('hello', 'string');
    assert.equal(r.pass, true);
    assert.equal(r.value, 'hello');
  });

  it('number → string', () => {
    const r = coerceByType(42, 'string');
    assert.equal(r.pass, true);
    assert.equal(r.repaired, '42');
    assert.equal(r.rule, 'number_to_string');
  });

  it('boolean true → "yes"', () => {
    const r = coerceByType(true, 'string');
    assert.equal(r.pass, true);
    assert.equal(r.repaired, 'yes');
    assert.equal(r.rule, 'bool_to_string');
  });

  it('boolean false → "no"', () => {
    const r = coerceByType(false, 'string');
    assert.equal(r.pass, true);
    assert.equal(r.repaired, 'no');
    assert.equal(r.rule, 'bool_to_string');
  });

  it('object → reject', () => {
    const r = coerceByType({ a: 1 }, 'string');
    assert.equal(r.pass, false);
    assert.ok(r.reason);
  });

  it('null → passthrough (absence)', () => {
    const r = coerceByType(null, 'string');
    assert.equal(r.pass, true);
    assert.equal(r.value, null);
  });
});

// ── number ──────────────────────────────────────────────────────────────────
describe('coerceByType — number', () => {
  it('finite number passthrough', () => {
    const r = coerceByType(3.14, 'number');
    assert.equal(r.pass, true);
    assert.equal(r.value, 3.14);
  });

  it('numeric string → number', () => {
    const r = coerceByType('42', 'number');
    assert.equal(r.pass, true);
    assert.equal(r.repaired, 42);
    assert.equal(r.rule, 'string_to_number');
  });

  it('string with unit → stripped number', () => {
    const r = coerceByType('42g', 'number');
    assert.equal(r.pass, true);
    assert.equal(r.repaired, 42);
  });

  it('absence token → null', () => {
    const r = coerceByType('n/a', 'number');
    assert.equal(r.pass, true);
    assert.equal(r.repaired, null);
    assert.equal(r.rule, 'absence_token');
  });

  it('empty string → null', () => {
    const r = coerceByType('', 'number');
    assert.equal(r.pass, true);
    assert.equal(r.repaired, null);
  });

  it('non-numeric string → reject', () => {
    const r = coerceByType('abc-def', 'number');
    assert.equal(r.pass, false);
    assert.ok(r.reason);
  });

  it('object → reject', () => {
    const r = coerceByType({ a: 1 }, 'number');
    assert.equal(r.pass, false);
  });

  it('NaN → reject', () => {
    const r = coerceByType(NaN, 'number');
    assert.equal(r.pass, false);
  });

  it('Infinity → reject', () => {
    const r = coerceByType(Infinity, 'number');
    assert.equal(r.pass, false);
  });
});

// ── integer ─────────────────────────────────────────────────────────────────
describe('coerceByType — integer', () => {
  it('integer passthrough', () => {
    const r = coerceByType(7, 'integer');
    assert.equal(r.pass, true);
    assert.equal(r.value, 7);
  });

  it('numeric string → number (integer enforcement via rounding)', () => {
    const r = coerceByType('42', 'integer');
    assert.equal(r.pass, true);
    assert.equal(r.repaired, 42);
  });

  it('absence token → null', () => {
    const r = coerceByType('unk', 'integer');
    assert.equal(r.pass, true);
    assert.equal(r.repaired, null);
  });
});

// ── boolean ─────────────────────────────────────────────────────────────────
describe('coerceByType — boolean', () => {
  const yesCases = [['true', 'yes'], ['yes', 'yes'], ['y', 'yes'], ['1', 'yes'], ['on', 'yes']];
  const noCases = [['false', 'no'], ['no', 'no'], ['n', 'no'], ['0', 'no'], ['off', 'no']];

  for (const [input, expected] of yesCases) {
    it(`"${input}" → "${expected}"`, () => {
      const r = coerceByType(input, 'boolean');
      assert.equal(r.pass, true);
      assert.equal(r.repaired ?? r.value, expected);
    });
  }

  for (const [input, expected] of noCases) {
    it(`"${input}" → "${expected}"`, () => {
      const r = coerceByType(input, 'boolean');
      assert.equal(r.pass, true);
      assert.equal(r.repaired ?? r.value, expected);
    });
  }

  it('JS true → "yes"', () => {
    const r = coerceByType(true, 'boolean');
    assert.equal(r.pass, true);
    assert.equal(r.repaired ?? r.value, 'yes');
  });

  it('JS false → "no"', () => {
    const r = coerceByType(false, 'boolean');
    assert.equal(r.pass, true);
    assert.equal(r.repaired ?? r.value, 'no');
  });

  it('null → null', () => {
    const r = coerceByType(null, 'boolean');
    assert.equal(r.pass, true);
    assert.equal(r.repaired ?? r.value, null);
  });

  it('"n/a" → "n/a"', () => {
    const r = coerceByType('n/a', 'boolean');
    assert.equal(r.pass, true);
    assert.equal(r.repaired ?? r.value, 'n/a');
  });

  it('unrecognized string → reject', () => {
    const r = coerceByType('maybe', 'boolean');
    assert.equal(r.pass, false);
  });
});

// ── date ────────────────────────────────────────────────────────────────────
describe('coerceByType — date', () => {
  it('ISO date string → YYYY-MM-DD', () => {
    const r = coerceByType('2024-10-01', 'date');
    assert.equal(r.pass, true);
    assert.equal(r.repaired ?? r.value, '2024-10-01');
  });

  it('Date object → YYYY-MM-DD', () => {
    const r = coerceByType(new Date('2024-06-15T12:00:00Z'), 'date');
    assert.equal(r.pass, true);
    assert.equal(r.repaired ?? r.value, '2024-06-15');
  });

  it('unparseable → reject', () => {
    const r = coerceByType('not-a-date', 'date');
    assert.equal(r.pass, false);
  });

  it('empty string → reject', () => {
    const r = coerceByType('', 'date');
    assert.equal(r.pass, false);
  });
});

// ── url ─────────────────────────────────────────────────────────────────────
describe('coerceByType — url', () => {
  it('https URL passthrough', () => {
    const r = coerceByType('https://example.com', 'url');
    assert.equal(r.pass, true);
    assert.equal(r.value, 'https://example.com');
  });

  it('http URL passthrough', () => {
    const r = coerceByType('http://example.com/path', 'url');
    assert.equal(r.pass, true);
  });

  it('bare domain → reject', () => {
    const r = coerceByType('example.com', 'url');
    assert.equal(r.pass, false);
  });

  it('non-URL string → reject', () => {
    const r = coerceByType('not-a-url', 'url');
    assert.equal(r.pass, false);
  });

  it('null passthrough', () => {
    const r = coerceByType(null, 'url');
    assert.equal(r.pass, true);
    assert.equal(r.value, null);
  });
});

// ── range ───────────────────────────────────────────────────────────────────
describe('coerceByType — range', () => {
  it('"1-5" → {min:1, max:5}', () => {
    const r = coerceByType('1-5', 'range');
    assert.equal(r.pass, true);
    const val = r.repaired ?? r.value;
    assert.equal(val.min, 1);
    assert.equal(val.max, 5);
  });

  it('"2.4-3.2" → {min:2.4, max:3.2}', () => {
    const r = coerceByType('2.4-3.2', 'range');
    assert.equal(r.pass, true);
    const val = r.repaired ?? r.value;
    assert.equal(val.min, 2.4);
    assert.equal(val.max, 3.2);
  });

  it('single number → reject (not a range)', () => {
    const r = coerceByType('42', 'range');
    assert.equal(r.pass, false);
  });

  it('non-numeric → reject', () => {
    const r = coerceByType('abc', 'range');
    assert.equal(r.pass, false);
  });
});

// ── mixed_number_range ──────────────────────────────────────────────────────
describe('coerceByType — mixed_number_range', () => {
  it('single number → [number]', () => {
    const r = coerceByType(3.5, 'mixed_number_range');
    assert.equal(r.pass, true);
    assert.deepEqual(r.repaired ?? r.value, [3.5]);
  });

  it('string "1.2, 2.4-3.2" → [1.2, 2.4, 3.2]', () => {
    const r = coerceByType('1.2, 2.4-3.2', 'mixed_number_range');
    assert.equal(r.pass, true);
    assert.deepEqual(r.repaired ?? r.value, [1.2, 2.4, 3.2]);
  });

  it('null → []', () => {
    const r = coerceByType(null, 'mixed_number_range');
    assert.equal(r.pass, true);
    assert.deepEqual(r.repaired ?? r.value, []);
  });
});

// ── unknown type ────────────────────────────────────────────────────────────
describe('coerceByType — unknown type', () => {
  it('returns pass:false for unrecognized type', () => {
    const r = coerceByType('hello', 'object');
    assert.equal(r.pass, false);
    assert.ok(r.reason);
  });
});
