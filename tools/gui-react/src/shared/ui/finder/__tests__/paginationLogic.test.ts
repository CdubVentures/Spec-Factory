import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computePagination, resolvePersistedPage } from '../paginationLogic.ts';

describe('computePagination', () => {
  it('returns totalPages = 1 for 0 items', () => {
    const r = computePagination({ totalItems: 0, page: 0, pageSize: 10 });
    assert.equal(r.totalPages, 1);
    assert.equal(r.startIndex, 0);
    assert.equal(r.endIndex, 0);
    assert.equal(r.showingLabel, 'No items');
  });

  it('returns totalPages = 1 when items fit on one page', () => {
    const r = computePagination({ totalItems: 7, page: 0, pageSize: 10 });
    assert.equal(r.totalPages, 1);
    assert.equal(r.startIndex, 0);
    assert.equal(r.endIndex, 7);
    assert.equal(r.showingLabel, `Showing 1\u20137 of 7`);
  });

  it('returns correct totalPages for exact fit', () => {
    const r = computePagination({ totalItems: 20, page: 0, pageSize: 10 });
    assert.equal(r.totalPages, 2);
  });

  it('returns correct totalPages for non-exact fit', () => {
    const r = computePagination({ totalItems: 21, page: 0, pageSize: 10 });
    assert.equal(r.totalPages, 3);
  });

  it('returns correct slice indices for page 0', () => {
    const r = computePagination({ totalItems: 47, page: 0, pageSize: 10 });
    assert.equal(r.startIndex, 0);
    assert.equal(r.endIndex, 10);
    assert.equal(r.showingLabel, 'Showing 1\u201310 of 47');
  });

  it('returns correct slice indices for middle page', () => {
    const r = computePagination({ totalItems: 47, page: 2, pageSize: 10 });
    assert.equal(r.startIndex, 20);
    assert.equal(r.endIndex, 30);
    assert.equal(r.showingLabel, 'Showing 21\u201330 of 47');
  });

  it('returns correct slice indices for last page (partial)', () => {
    const r = computePagination({ totalItems: 47, page: 4, pageSize: 10 });
    assert.equal(r.startIndex, 40);
    assert.equal(r.endIndex, 47);
    assert.equal(r.showingLabel, 'Showing 41\u201347 of 47');
  });

  it('clamps page to last valid page when page exceeds total', () => {
    const r = computePagination({ totalItems: 15, page: 99, pageSize: 10 });
    assert.equal(r.clampedPage, 1);
    assert.equal(r.startIndex, 10);
    assert.equal(r.endIndex, 15);
  });

  it('clamps negative page to 0', () => {
    const r = computePagination({ totalItems: 15, page: -3, pageSize: 10 });
    assert.equal(r.clampedPage, 0);
    assert.equal(r.startIndex, 0);
    assert.equal(r.endIndex, 10);
  });

  it('handles pageSize = 1 correctly', () => {
    const r = computePagination({ totalItems: 3, page: 1, pageSize: 1 });
    assert.equal(r.totalPages, 3);
    assert.equal(r.startIndex, 1);
    assert.equal(r.endIndex, 2);
    assert.equal(r.showingLabel, 'Showing 2\u20132 of 3');
  });

  it('handles pageSize = 50 with few items', () => {
    const r = computePagination({ totalItems: 5, page: 0, pageSize: 50 });
    assert.equal(r.totalPages, 1);
    assert.equal(r.startIndex, 0);
    assert.equal(r.endIndex, 5);
  });

  it('handles exactly 1 item', () => {
    const r = computePagination({ totalItems: 1, page: 0, pageSize: 10 });
    assert.equal(r.totalPages, 1);
    assert.equal(r.startIndex, 0);
    assert.equal(r.endIndex, 1);
    assert.equal(r.showingLabel, 'Showing 1\u20131 of 1');
  });
});

describe('resolvePersistedPage', () => {
  it('returns fallback for null', () => {
    assert.equal(resolvePersistedPage(null, 0), 0);
  });

  it('returns fallback for undefined', () => {
    assert.equal(resolvePersistedPage(undefined, 0), 0);
  });

  it('returns fallback for empty string', () => {
    assert.equal(resolvePersistedPage('', 0), 0);
  });

  it('returns fallback for non-numeric string', () => {
    assert.equal(resolvePersistedPage('abc', 0), 0);
  });

  it('returns fallback for negative number', () => {
    assert.equal(resolvePersistedPage('-1', 0), 0);
  });

  it('returns fallback for NaN', () => {
    assert.equal(resolvePersistedPage('NaN', 0), 0);
  });

  it('returns fallback for Infinity', () => {
    assert.equal(resolvePersistedPage('Infinity', 0), 0);
  });

  it('returns fallback for -Infinity', () => {
    assert.equal(resolvePersistedPage('-Infinity', 0), 0);
  });

  it('returns 0 for stored "0"', () => {
    assert.equal(resolvePersistedPage('0', 5), 0);
  });

  it('returns stored integer for valid positive', () => {
    assert.equal(resolvePersistedPage('3', 0), 3);
  });

  it('returns stored value for valid JSON number', () => {
    assert.equal(resolvePersistedPage('7', 0), 7);
  });

  it('returns fallback for float', () => {
    assert.equal(resolvePersistedPage('2.5', 0), 0);
  });

  it('respects non-zero fallback', () => {
    assert.equal(resolvePersistedPage(null, 4), 4);
  });
});
