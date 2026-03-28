import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { creditChipClass } from '../serperCreditHelpers.js';

describe('creditChipClass', () => {
  it('returns sf-chip-neutral for null', () => {
    assert.equal(creditChipClass(null), 'sf-chip-neutral');
  });

  it('returns sf-chip-success when credit > 500', () => {
    assert.equal(creditChipClass(2500), 'sf-chip-success');
    assert.equal(creditChipClass(501), 'sf-chip-success');
  });

  it('returns sf-chip-warning when credit 101–500', () => {
    assert.equal(creditChipClass(500), 'sf-chip-warning');
    assert.equal(creditChipClass(101), 'sf-chip-warning');
  });

  it('returns sf-chip-danger when credit <= 100', () => {
    assert.equal(creditChipClass(100), 'sf-chip-danger');
    assert.equal(creditChipClass(0), 'sf-chip-danger');
  });
});
