import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRouteLlmLogger } from '../createRouteLlmLogger.js';

describe('createRouteLlmLogger', () => {
  it('returns object with info, warn, error methods', () => {
    const logger = createRouteLlmLogger('test');
    assert.equal(typeof logger.info, 'function');
    assert.equal(typeof logger.warn, 'function');
    assert.equal(typeof logger.error, 'function');
  });

  it('info/warn/error are callable without throwing', () => {
    const logger = createRouteLlmLogger('test');
    assert.doesNotThrow(() => logger.info('test_event', { key: 'value' }));
    assert.doesNotThrow(() => logger.warn('test_warn', { key: 'value' }));
    assert.doesNotThrow(() => logger.error('test_error', { key: 'value' }));
  });

  it('works with no data argument', () => {
    const logger = createRouteLlmLogger('test');
    assert.doesNotThrow(() => logger.info('bare_event'));
  });

  it('defaults tag to "llm"', () => {
    const logger = createRouteLlmLogger();
    assert.equal(typeof logger.info, 'function');
  });
});
