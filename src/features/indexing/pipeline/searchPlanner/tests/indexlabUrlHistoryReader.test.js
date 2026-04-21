// WHY: Test the product.json → urlExecutionHistory adapter. Reads
// sources[].url from {productRoot}/{productId}/product.json and returns
// a deduped URL list. Missing files return { urls: [] } gracefully.

import { describe, it } from 'node:test';
import { strictEqual, ok, deepStrictEqual } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readIndexlabUrlHistory } from '../indexlabUrlHistoryReader.js';

function makeTempProductRoot(productId, productJson) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'indexlab-url-history-test-'));
  const dir = path.join(root, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify(productJson), 'utf8');
  return root;
}

describe('readIndexlabUrlHistory', () => {
  it('reads sources[].url from product.json and returns deduped list', () => {
    const root = makeTempProductRoot('mouse-abc', {
      sources: [
        { url: 'https://a.com/1' },
        { url: 'https://b.com/2' },
        { url: 'https://a.com/1' }, // duplicate
      ],
    });
    const result = readIndexlabUrlHistory('mouse-abc', { productRoot: root });
    strictEqual(result.urls.length, 2, 'duplicates deduped');
    ok(result.urls.includes('https://a.com/1'));
    ok(result.urls.includes('https://b.com/2'));
  });

  it('missing product.json → { urls: [] }', () => {
    const result = readIndexlabUrlHistory('does-not-exist', { productRoot: '/tmp/no-such-root' });
    deepStrictEqual(result, { urls: [] });
  });

  it('empty productId → { urls: [] }', () => {
    deepStrictEqual(readIndexlabUrlHistory('', {}), { urls: [] });
    deepStrictEqual(readIndexlabUrlHistory(null, {}), { urls: [] });
    deepStrictEqual(readIndexlabUrlHistory(undefined, {}), { urls: [] });
  });

  it('product.json with no sources array → { urls: [] }', () => {
    const root = makeTempProductRoot('mouse-empty', { /* no sources */ });
    deepStrictEqual(readIndexlabUrlHistory('mouse-empty', { productRoot: root }), { urls: [] });
  });

  it('malformed JSON → { urls: [] } (graceful)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'indexlab-url-history-malformed-'));
    const dir = path.join(root, 'mouse-bad');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'product.json'), '{not valid json', 'utf8');
    deepStrictEqual(readIndexlabUrlHistory('mouse-bad', { productRoot: root }), { urls: [] });
  });

  it('filters empty/whitespace URLs', () => {
    const root = makeTempProductRoot('mouse-mixed', {
      sources: [
        { url: 'https://a.com' },
        { url: '' },
        { url: '   ' },
        { /* missing url */ },
        { url: 'https://b.com' },
      ],
    });
    const result = readIndexlabUrlHistory('mouse-mixed', { productRoot: root });
    strictEqual(result.urls.length, 2);
  });

  it('accepts fsReadFile injection for pure testing', () => {
    const fake = (p) => JSON.stringify({ sources: [{ url: 'https://injected.com' }] });
    const result = readIndexlabUrlHistory('anything', { productRoot: '/fake', fsReadFile: fake });
    deepStrictEqual(result, { urls: ['https://injected.com'] });
  });
});
