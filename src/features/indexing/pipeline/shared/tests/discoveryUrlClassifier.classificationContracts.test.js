import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyUrlCandidate } from '../urlClassifier.js';

test('classifyUrlCandidate returns the expected classified shape for valid URLs', () => {
  const categoryConfig = {
    sourceHosts: [{ host: 'rtings.com', role: 'review' }],
  };
  const result = classifyUrlCandidate(
    {
      url: 'https://rtings.com/mouse/reviews/razer/viper-v3-pro',
      title: 'Razer Viper V3 Pro',
      snippet: 'Review',
    },
    categoryConfig,
    { identityLock: { brand: 'Razer', base_model: 'Viper V3', model: 'Viper V3 Pro', variant: 'Pro' } },
  );

  assert.equal(typeof result.url, 'string');
  assert.equal(typeof result.host, 'string');
  assert.equal(typeof result.doc_kind_guess, 'string');
  assert.equal(typeof result.identity_match_level, 'string');
  assert.equal(typeof result.variant_guard_hit, 'boolean');
  assert.equal(typeof result.multi_model_hint, 'boolean');
  assert.ok(['strong', 'partial', 'weak', 'none'].includes(result.identity_match_level));
});

test('classifyUrlCandidate returns null for invalid URLs', () => {
  const result = classifyUrlCandidate(
    { url: 'not-a-valid-url', title: 'Test', snippet: '' },
    { sourceHosts: [] },
  );
  assert.equal(result, null);
});
