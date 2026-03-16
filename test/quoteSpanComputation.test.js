import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeQuoteSpan } from '../src/scoring/consensusEngine.js';

describe('WP3 — computeQuoteSpan', () => {
  it('QS-01: exact match returns correct [start, end]', () => {
    const result = computeQuoteSpan('PAW3950', 'The sensor is PAW3950 with high accuracy');
    assert.deepEqual(result, [14, 21]);
  });

  it('QS-02: case-insensitive match works', () => {
    const result = computeQuoteSpan('paw3950', 'The sensor is PAW3950 with high accuracy');
    assert.deepEqual(result, [14, 21]);
  });

  it('QS-03: no match returns null', () => {
    const result = computeQuoteSpan('HERO26K', 'The sensor is PAW3950 with high accuracy');
    assert.equal(result, null);
  });

  it('QS-04: numeric value found in quote', () => {
    const result = computeQuoteSpan('26000', 'Maximum DPI is 26000 DPI for precision tracking');
    assert.deepEqual(result, [15, 20]);
  });

  it('QS-05: empty quote returns null', () => {
    assert.equal(computeQuoteSpan('value', ''), null);
    assert.equal(computeQuoteSpan('value', null), null);
  });

  it('QS-06: empty value returns null', () => {
    assert.equal(computeQuoteSpan('', 'some quote text'), null);
    assert.equal(computeQuoteSpan(null, 'some quote text'), null);
  });

  it('QS-07: multi-occurrence returns first', () => {
    const result = computeQuoteSpan('100', '100 Hz polling rate, also available at 100 Hz');
    assert.deepEqual(result, [0, 3]);
  });
});
