import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isSharedLanePending,
} from '../candidateInfrastructure.js';

test('isSharedLanePending returns expected states', () => {
  assert.equal(isSharedLanePending({ user_override_ai_shared: true }, true), false);
  assert.equal(isSharedLanePending({ ai_confirm_shared_status: 'confirmed' }), false);
  assert.equal(isSharedLanePending({ ai_confirm_shared_status: 'pending' }), true);
  assert.equal(isSharedLanePending({}, true), true);
  assert.equal(isSharedLanePending({}, false), false);
});
