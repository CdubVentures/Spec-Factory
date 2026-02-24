import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEnumReviewPayloads } from '../src/review/componentReviewData.js';

function makeSpecDb() {
  const listRows = {
    lighting: [
      {
        id: 10,
        list_id: 1,
        field_key: 'lighting',
        value: 'RGB LED',
        normalized_value: 'rgb led',
        source: 'pipeline',
        needs_review: 1,
        enum_policy: 'open',
        accepted_candidate_id: null,
        overridden: 0,
      },
    ],
    connection: [
      {
        id: 11,
        list_id: 2,
        field_key: 'connection',
        value: '2.4GHz',
        normalized_value: '2.4ghz',
        source: 'pipeline',
        needs_review: 1,
        enum_policy: 'closed',
        accepted_candidate_id: null,
        overridden: 0,
      },
    ],
  };

  return {
    getAllEnumFields() {
      return ['lighting', 'connection'];
    },
    getEnumList(fieldKey) {
      if (fieldKey === 'lighting') return { id: 1, field_key: 'lighting' };
      if (fieldKey === 'connection') return { id: 2, field_key: 'connection' };
      return null;
    },
    getListValues(fieldKey) {
      return listRows[fieldKey] ? [...listRows[fieldKey]] : [];
    },
    getKeyReviewState() {
      return null;
    },
    getProductsByListValueId(listValueId) {
      if (listValueId === 10) return [{ product_id: 'mouse-a', field_key: 'lighting' }];
      if (listValueId === 11) return [{ product_id: 'mouse-a', field_key: 'connection' }];
      return [];
    },
    getCandidatesByListValue() {
      return [];
    },
    getReviewsForContext() {
      return [];
    },
  };
}

test('buildEnumReviewPayloads excludes enum fields when review consumer disables enum.source', async () => {
  const fieldRules = {
    rules: {
      fields: {
        lighting: {
          enum: {
            policy: 'open',
            source: 'data_lists.lighting',
          },
          consumers: {
            'enum.source': {
              review: false,
            },
          },
        },
        connection: {
          enum: {
            policy: 'closed',
            source: 'data_lists.connection',
          },
        },
      },
    },
  };

  const payload = await buildEnumReviewPayloads({
    config: {},
    category: 'mouse',
    specDb: makeSpecDb(),
    fieldRules,
  });

  assert.deepEqual(
    payload.fields.map((row) => row.field),
    ['connection'],
  );
});
