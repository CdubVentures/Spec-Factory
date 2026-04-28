// WHY: IndexLab seed planning reads URL history from SQL runtime projection.
// product.json remains durable rebuild/audit memory and must not be parsed on
// the planning hot path.

import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { readIndexlabUrlHistory } from '../indexlabUrlHistoryReader.js';

describe('readIndexlabUrlHistory', () => {
  it('prefers SQL crawl history and does not read product.json when rows exist', () => {
    const result = readIndexlabUrlHistory('mouse-sql', {
      specDb: {
        getUrlCrawlEntriesByProduct: (productId) => {
          strictEqual(productId, 'mouse-sql');
          return [
            { canonical_url: 'https://sql.example.com/a', original_url: 'https://raw.example.com/a' },
            { canonical_url: 'https://sql.example.com/b' },
            { canonical_url: 'https://sql.example.com/a' },
          ];
        },
      },
      fsReadFile: () => {
        throw new Error('product.json should not be read when SQL URL history exists');
      },
    });

    deepStrictEqual(result, {
      urls: ['https://sql.example.com/a', 'https://sql.example.com/b'],
    });
  });

  it('empty productId returns empty URL history', () => {
    deepStrictEqual(readIndexlabUrlHistory('', {}), { urls: [] });
    deepStrictEqual(readIndexlabUrlHistory(null, {}), { urls: [] });
    deepStrictEqual(readIndexlabUrlHistory(undefined, {}), { urls: [] });
  });

  it('returns empty URL history instead of falling back to product.json when SQL has no rows', () => {
    let readProductJson = false;
    const result = readIndexlabUrlHistory('mouse-json-blocked', {
      specDb: {
        getUrlCrawlEntriesByProduct: () => [],
      },
      fsReadFile: () => {
        readProductJson = true;
        throw new Error('product.json must not be read during IndexLab seed planning');
      },
    });

    deepStrictEqual(result, { urls: [] });
    strictEqual(readProductJson, false);
  });
});
