// WHY: IndexLab seed planning reads URL history from SQL runtime projection.
// product.json remains durable rebuild/audit memory and must not be parsed on
// the planning hot path.

import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { readIndexlabUrlHistory } from '../indexlabUrlHistoryReader.js';

describe('readIndexlabUrlHistory', () => {
  it('prefers indexed URL history projection with per-run provenance', () => {
    const result = readIndexlabUrlHistory('mouse-indexed', {
      specDb: {
        getIndexedUrlHistoryByProduct: (productId) => {
          strictEqual(productId, 'mouse-indexed');
          return [
            { url: 'https://indexed.example.com/a', run_id: 'run-2', last_crawled_at: '2026-03-29T00:00:00Z' },
            { url: 'https://indexed.example.com/b', run_id: 'run-1', last_crawled_at: '2026-03-28T00:00:00Z' },
          ];
        },
        getUrlCrawlEntriesByProduct: () => [
          { canonical_url: 'https://ledger.example.com/stale' },
        ],
      },
    });

    deepStrictEqual(result, {
      urls: ['https://indexed.example.com/a', 'https://indexed.example.com/b'],
    });
  });

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
