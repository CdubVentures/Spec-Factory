import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useReviewStore } from '../reviewStore.ts';

describe('reviewStore setFilter', () => {
  beforeEach(() => {
    useReviewStore.setState({
      confidenceFilter: 'all',
      coverageFilter: 'all',
      runStatusFilter: 'all',
    });
  });

  it('sets confidenceFilter to a valid value', () => {
    useReviewStore.getState().setFilter('confidenceFilter', 'high');
    assert.equal(useReviewStore.getState().confidenceFilter, 'high');
  });

  it('sets coverageFilter to a valid value', () => {
    useReviewStore.getState().setFilter('coverageFilter', 'sparse');
    assert.equal(useReviewStore.getState().coverageFilter, 'sparse');
  });

  it('sets runStatusFilter to a valid value', () => {
    useReviewStore.getState().setFilter('runStatusFilter', 'ran');
    assert.equal(useReviewStore.getState().runStatusFilter, 'ran');
  });

  it('is a no-op for unknown key', () => {
    useReviewStore.getState().setFilter('bogusFilter', 'high');
    assert.equal(useReviewStore.getState().confidenceFilter, 'all');
    assert.equal(useReviewStore.getState().coverageFilter, 'all');
    assert.equal(useReviewStore.getState().runStatusFilter, 'all');
  });

  it('is a no-op for invalid value on a known key', () => {
    useReviewStore.getState().setFilter('confidenceFilter', 'bogus');
    assert.equal(useReviewStore.getState().confidenceFilter, 'all');
  });

  it('does not affect other filter fields', () => {
    useReviewStore.getState().setFilter('confidenceFilter', 'low');
    assert.equal(useReviewStore.getState().coverageFilter, 'all');
    assert.equal(useReviewStore.getState().runStatusFilter, 'all');
  });
});
