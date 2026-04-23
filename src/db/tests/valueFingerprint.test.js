import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintValue } from '../valueFingerprint.js';

const scalarRule = { contract: { shape: 'scalar', type: 'string' } };
const listRuleWinnerOnly = { contract: { shape: 'list', type: 'string', list_rules: { item_union: 'winner_only' } } };
const listRuleSetUnion = { contract: { shape: 'list', type: 'string', list_rules: { item_union: 'set_union' } } };

describe('fingerprintValue — scalars', () => {
  it('returns empty string for null/undefined', () => {
    assert.equal(fingerprintValue(null, scalarRule), '');
    assert.equal(fingerprintValue(undefined, scalarRule), '');
  });

  it('normalizes casing and whitespace for strings', () => {
    assert.equal(fingerprintValue('PAW3395', scalarRule), 'paw3395');
    assert.equal(fingerprintValue('  PAW3395  ', scalarRule), 'paw3395');
    assert.equal(fingerprintValue('paw3395', scalarRule), 'paw3395');
  });

  it('NFC-normalizes unicode', () => {
    const composed = '\u00e9'; // é
    const decomposed = 'e\u0301'; // e + combining acute
    assert.equal(
      fingerprintValue(composed, scalarRule),
      fingerprintValue(decomposed, scalarRule),
    );
  });

  it('coerces numeric scalars to their string form', () => {
    assert.equal(fingerprintValue(58, scalarRule), '58');
    assert.equal(fingerprintValue(58.5, scalarRule), '58.5');
  });

  it('same-value rows share a fingerprint regardless of case/whitespace', () => {
    const a = fingerprintValue('Hall Effect', scalarRule);
    const b = fingerprintValue('hall effect', scalarRule);
    const c = fingerprintValue(' HALL EFFECT ', scalarRule);
    assert.equal(a, b);
    assert.equal(b, c);
  });
});

describe('fingerprintValue — lists (set-equality)', () => {
  it('returns empty string for null/undefined/non-array on a list rule', () => {
    assert.equal(fingerprintValue(null, listRuleWinnerOnly), '');
    assert.equal(fingerprintValue(undefined, listRuleWinnerOnly), '');
  });

  it('is order-independent', () => {
    const a = fingerprintValue(['Optical', 'Hall Effect'], listRuleWinnerOnly);
    const b = fingerprintValue(['Hall Effect', 'Optical'], listRuleWinnerOnly);
    assert.equal(a, b);
  });

  it('deduplicates repeated items via the normalized form', () => {
    const a = fingerprintValue(['Optical', 'Optical'], listRuleWinnerOnly);
    const b = fingerprintValue(['Optical'], listRuleWinnerOnly);
    assert.equal(a, b);
  });

  it('normalizes each element like scalars (case, whitespace, NFC)', () => {
    const a = fingerprintValue(['Optical', 'Hall Effect'], listRuleWinnerOnly);
    const b = fingerprintValue([' optical ', 'HALL EFFECT'], listRuleWinnerOnly);
    assert.equal(a, b);
  });

  it('distinguishes set-unequal lists', () => {
    const a = fingerprintValue(['x', 'y'], listRuleWinnerOnly);
    const b = fingerprintValue(['x', 'y', 'z'], listRuleWinnerOnly);
    const c = fingerprintValue(['x', 'z'], listRuleWinnerOnly);
    assert.notEqual(a, b);
    assert.notEqual(a, c);
    assert.notEqual(b, c);
  });

  it('treats set_union lists the same way as winner_only for fingerprint purposes', () => {
    const a = fingerprintValue(['x', 'y'], listRuleWinnerOnly);
    const b = fingerprintValue(['y', 'x'], listRuleSetUnion);
    assert.equal(a, b);
  });

  it('uses a delimiter that cannot appear in normalized content', () => {
    const fp = fingerprintValue(['a', 'b'], listRuleWinnerOnly);
    assert.ok(fp.includes('\u0001'), 'expected \\u0001 separator in list fingerprint');
  });

  it('coerces numeric list elements consistently', () => {
    const a = fingerprintValue([1, 2], listRuleWinnerOnly);
    const b = fingerprintValue(['1', '2'], listRuleWinnerOnly);
    assert.equal(a, b);
  });
});

describe('fingerprintValue — objects (stable stringify for nested)', () => {
  it('uses sorted-key JSON for object scalars', () => {
    const a = fingerprintValue({ foo: 1, bar: 2 }, { contract: { shape: 'scalar' } });
    const b = fingerprintValue({ bar: 2, foo: 1 }, { contract: { shape: 'scalar' } });
    assert.equal(a, b);
  });

  it('sorts nested object keys recursively', () => {
    const a = fingerprintValue({ a: { x: 1, y: 2 } }, { contract: { shape: 'scalar' } });
    const b = fingerprintValue({ a: { y: 2, x: 1 } }, { contract: { shape: 'scalar' } });
    assert.equal(a, b);
  });

  it('distinguishes objects with different values', () => {
    const a = fingerprintValue({ foo: 1 }, { contract: { shape: 'scalar' } });
    const b = fingerprintValue({ foo: 2 }, { contract: { shape: 'scalar' } });
    assert.notEqual(a, b);
  });
});

describe('fingerprintValue — no/empty fieldRule', () => {
  it('defaults to scalar treatment when fieldRule is missing', () => {
    assert.equal(fingerprintValue('ABC'), 'abc');
    assert.equal(fingerprintValue('ABC', null), 'abc');
    assert.equal(fingerprintValue('ABC', {}), 'abc');
    assert.equal(fingerprintValue('ABC', { contract: {} }), 'abc');
  });

  it('handles a list value on a missing fieldRule as a list anyway', () => {
    const a = fingerprintValue(['x', 'y']);
    const b = fingerprintValue(['y', 'x']);
    assert.equal(a, b);
    assert.ok(a.includes('\u0001'));
  });
});
