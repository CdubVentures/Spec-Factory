import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendEnumCurationSuggestions,
} from '../curationSuggestions.js';

function createMockSpecDb() {
  const store = [];
  return {
    upsertCurationSuggestion(row) {
      const idx = store.findIndex(
        (r) => r.suggestion_type === row.suggestion_type && r.field_key === row.field_key && r.value === row.value
      );
      if (idx >= 0) {
        store[idx] = { ...store[idx], ...row };
      } else {
        store.push({ ...row });
      }
    },
    getCurationSuggestions(suggestionType) {
      return store.filter((r) => r.suggestion_type === suggestionType);
    }
  };
}

test('appendEnumCurationSuggestions appends and de-duplicates enum suggestions', async () => {
  const specDb = createMockSpecDb();
  const config = { categoryAuthorityRoot: '/tmp/unused' };

  const first = await appendEnumCurationSuggestions({
    config,
    category: 'mouse',
    productId: 'mouse-logitech-g-pro-x-superlight-2',
    runId: 'run-1',
    suggestions: [
      {
        field_key: 'coating',
        normalized_value: 'satin microtexture'
      }
    ],
    specDb
  });
  assert.equal(first.appended_count, 1);
  assert.equal(first.total_count, 1);

  const second = await appendEnumCurationSuggestions({
    config,
    category: 'mouse',
    productId: 'mouse-logitech-g-pro-x-superlight-2',
    runId: 'run-2',
    suggestions: [
      {
        field_key: 'coating',
        normalized_value: 'satin microtexture'
      },
      {
        field_key: 'coating',
        normalized_value: 'frosted polymer'
      }
    ],
    specDb
  });
  assert.equal(second.appended_count, 1);
  assert.equal(second.total_count, 2);
});

test('appendEnumCurationSuggestions returns zeros when no specDb provided', async () => {
  const result = await appendEnumCurationSuggestions({
    config: {},
    category: 'mouse',
    productId: 'test-product',
    runId: 'run-1',
    suggestions: [{ field_key: 'coating', normalized_value: 'matte' }]
  });
  assert.equal(result.appended_count, 0);
  assert.equal(result.total_count, 0);
});
