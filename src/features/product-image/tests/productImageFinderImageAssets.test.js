import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import sharp from 'sharp';
import { registerProductImageFinderRoutes } from '../api/productImageFinderRoutes.js';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';

const PRODUCT_ID = `pif-image-assets-${process.pid}-${Date.now()}`;
const CATEGORY = 'mouse';

function createStreamingMockRes() {
  class MockWritable extends Writable {
    constructor() {
      super();
      this.statusCode = 200;
      this.headers = {};
      this.chunks = [];
      this.body = null;
    }

    writeHead(code, headers) {
      this.statusCode = code;
      if (headers) {
        Object.entries(headers).forEach(([key, value]) => {
          this.headers[String(key).toLowerCase()] = value;
        });
      }
    }

    _write(chunk, _encoding, callback) {
      this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    }

    end(chunk, encoding, callback) {
      if (chunk) {
        this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined));
      }
      this.body = Buffer.concat(this.chunks);
      return super.end(null, undefined, callback);
    }
  }

  return new MockWritable();
}

async function waitForStream(res) {
  if (res.writableFinished) return;
  await new Promise((resolve, reject) => {
    res.once('finish', resolve);
    res.once('error', reject);
  });
}

function createCtx() {
  return {
    jsonRes: (res, status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
      return true;
    },
    readJsonBody: async () => ({}),
    getSpecDb: () => null,
    broadcastWs: () => {},
    config: {},
    appDb: {},
    logger: null,
  };
}

async function writeTransparentPng(filename) {
  const productDir = path.join(defaultProductRoot(), PRODUCT_ID, 'images');
  fs.mkdirSync(productDir, { recursive: true });
  const outputPath = path.join(productDir, filename);
  await sharp({
    create: {
      width: 2000,
      height: 1200,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: Buffer.from(
        '<svg width="1600" height="800"><rect x="0" y="0" width="1600" height="800" rx="80" fill="#d71920"/></svg>',
      ),
      left: 200,
      top: 200,
    }])
    .png()
    .toFile(outputPath);
  return outputPath;
}

after(() => {
  fs.rmSync(path.join(defaultProductRoot(), PRODUCT_ID), { recursive: true, force: true });
});

describe('product image asset serving contract', () => {
  it('serves the full image bytes unchanged with cache validators', async () => {
    const filename = 'quality-source.png';
    const filePath = await writeTransparentPng(filename);
    const expected = fs.readFileSync(filePath);
    const handler = registerProductImageFinderRoutes(createCtx());
    const res = createStreamingMockRes();

    const handled = await handler(
      ['product-image-finder', CATEGORY, PRODUCT_ID, 'images', filename],
      new URLSearchParams(),
      'GET',
      { headers: {} },
      res,
    );
    await waitForStream(res);

    assert.equal(handled, true);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.equal(Number(res.headers['content-length']), expected.length);
    assert.match(String(res.headers.etag), /^".+"$/);
    assert.match(String(res.headers['cache-control']), /max-age/);
    assert.deepEqual(res.body, expected);
  });

  it('returns 304 when the browser already has the current full image', async () => {
    const filename = 'etag-source.png';
    await writeTransparentPng(filename);
    const handler = registerProductImageFinderRoutes(createCtx());
    const first = createStreamingMockRes();

    await handler(
      ['product-image-finder', CATEGORY, PRODUCT_ID, 'images', filename],
      new URLSearchParams(),
      'GET',
      { headers: {} },
      first,
    );
    await waitForStream(first);

    const second = createStreamingMockRes();
    const handled = await handler(
      ['product-image-finder', CATEGORY, PRODUCT_ID, 'images', filename],
      new URLSearchParams(),
      'GET',
      { headers: { 'if-none-match': first.headers.etag } },
      second,
    );
    await waitForStream(second);

    assert.equal(handled, true);
    assert.equal(second.statusCode, 304);
    assert.equal(second.body.length, 0);
  });

  it('serves alpha-preserving thumb and preview derivatives without replacing the original', async () => {
    const filename = 'variant-source.png';
    const filePath = await writeTransparentPng(filename);
    const original = fs.readFileSync(filePath);
    const handler = registerProductImageFinderRoutes(createCtx());

    const thumb = createStreamingMockRes();
    await handler(
      ['product-image-finder', CATEGORY, PRODUCT_ID, 'images', filename],
      new URLSearchParams('variant=thumb'),
      'GET',
      { headers: {} },
      thumb,
    );
    await waitForStream(thumb);

    const preview = createStreamingMockRes();
    await handler(
      ['product-image-finder', CATEGORY, PRODUCT_ID, 'images', filename],
      new URLSearchParams('variant=preview'),
      'GET',
      { headers: {} },
      preview,
    );
    await waitForStream(preview);

    const thumbMeta = await sharp(thumb.body).metadata();
    const previewMeta = await sharp(preview.body).metadata();

    assert.equal(thumb.statusCode, 200);
    assert.equal(thumb.headers['content-type'], 'image/webp');
    assert.ok(Math.max(thumbMeta.width, thumbMeta.height) <= 320);
    assert.equal(thumbMeta.hasAlpha, true);
    assert.equal(preview.headers['content-type'], 'image/webp');
    assert.ok(Math.max(previewMeta.width, previewMeta.height) <= 1600);
    assert.equal(previewMeta.hasAlpha, true);
    assert.deepEqual(fs.readFileSync(filePath), original);
  });
});
