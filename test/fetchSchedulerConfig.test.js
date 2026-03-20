import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

describe('FetchScheduler config knobs', () => {
  it('fetchSchedulerMaxRetries defaults to 1', () => {
    const config = loadConfig({});
    assert.equal(config.fetchSchedulerMaxRetries, 1);
  });

});
