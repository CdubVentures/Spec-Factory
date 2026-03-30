import test from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../../../../db/specDb.js';
import { appendReviewSuggestion } from '../suggestions.js';

test('appendReviewSuggestion writes enum/component/alias suggestions and deduplicates entries', async () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });

  const enumOne = await appendReviewSuggestion({
    specDb,
    category: 'mouse',
    type: 'enum',
    payload: {
      product_id: 'mouse-a',
      field: 'switch_type',
      value: 'optical-v2',
      evidence: {
        url: 'https://example.com/specs',
        quote: 'Switch Type: Optical V2',
      },
    },
  });
  assert.equal(enumOne.appended, true);
  assert.equal(enumOne.category, 'mouse');
  assert.equal(enumOne.type, 'enum');

  const enumDup = await appendReviewSuggestion({
    specDb,
    category: 'mouse',
    type: 'enum',
    payload: {
      product_id: 'mouse-a',
      field: 'switch_type',
      value: 'optical-v2',
      evidence: {
        url: 'https://example.com/specs',
        quote: 'Switch Type: Optical V2',
      },
    },
  });
  assert.equal(enumDup.appended, false);

  const component = await appendReviewSuggestion({
    specDb,
    category: 'mouse',
    type: 'component',
    payload: {
      product_id: 'mouse-a',
      field: 'sensor',
      value: 'Focus Pro 45K',
      evidence: {
        url: 'https://example.com/specs',
        quote: 'Sensor: Focus Pro 45K',
      },
    },
  });
  assert.equal(component.appended, true);
  assert.equal(component.category, 'mouse');
  assert.equal(component.type, 'component');

  const alias = await appendReviewSuggestion({
    specDb,
    category: 'mouse',
    type: 'alias',
    payload: {
      product_id: 'mouse-a',
      field: 'sensor',
      value: 'focus-45k',
      canonical: 'Focus Pro 45K',
      evidence: {
        url: 'https://example.com/specs',
        quote: 'Focus 45K',
      },
    },
  });
  assert.equal(alias.appended, true);
  assert.equal(alias.category, 'mouse');
  assert.equal(alias.type, 'alias');
});
