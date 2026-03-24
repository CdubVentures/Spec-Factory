import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildEnumReviewPayloads,
} from '../../tests/helpers/componentReviewHarness.js';

test('enum payload requires SpecDb authority when building review payloads', async () => {
  await assert.rejects(
    () => buildEnumReviewPayloads({
      config: {},
      category: CATEGORY,
    }),
    (err) => {
      assert.equal(err?.code, 'specdb_not_ready');
      assert.equal(String(err?.message || '').includes(CATEGORY), true);
      return true;
    },
  );
});
