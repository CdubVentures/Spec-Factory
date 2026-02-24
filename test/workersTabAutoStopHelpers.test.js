import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { shouldAutoStopOnSearchResults } from '../tools/gui-react/src/pages/runtime-ops/panels/workersTabAutoStopHelpers.js';

describe('shouldAutoStopOnSearchResults', () => {
  it('returns true when live prefetch is active and search results arrived', () => {
    const result = shouldAutoStopOnSearchResults({
      isRunning: true,
      isPrefetchActive: true,
      hasStopBeenRequested: false,
      searchResults: [{ query: 'q1', result_count: 1 }],
    });
    assert.equal(result, true);
  });

  it('returns false when process is not running', () => {
    const result = shouldAutoStopOnSearchResults({
      isRunning: false,
      isPrefetchActive: true,
      hasStopBeenRequested: false,
      searchResults: [{ query: 'q1', result_count: 1 }],
    });
    assert.equal(result, false);
  });

  it('returns false when prefetch panel is inactive', () => {
    const result = shouldAutoStopOnSearchResults({
      isRunning: true,
      isPrefetchActive: false,
      hasStopBeenRequested: false,
      searchResults: [{ query: 'q1', result_count: 1 }],
    });
    assert.equal(result, false);
  });

  it('returns false when no search results are present', () => {
    const result = shouldAutoStopOnSearchResults({
      isRunning: true,
      isPrefetchActive: true,
      hasStopBeenRequested: false,
      searchResults: [],
    });
    assert.equal(result, false);
  });

  it('returns false when stop was already requested for the run', () => {
    const result = shouldAutoStopOnSearchResults({
      isRunning: true,
      isPrefetchActive: true,
      hasStopBeenRequested: true,
      searchResults: [{ query: 'q1', result_count: 0 }],
    });
    assert.equal(result, false);
  });
});
