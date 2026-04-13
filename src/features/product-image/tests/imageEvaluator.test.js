/**
 * imageEvaluator contract tests — thumbnail pipeline.
 *
 * Uses real sharp to create synthetic test images, then verifies
 * createThumbnailBase64 produces correct base64 PNG output.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { createThumbnailBase64 } from '../imageEvaluator.js';

const TMP = path.join(os.tmpdir(), `img-eval-test-${Date.now()}`);

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

// WHY: random noise → realistic file sizes, avoids sharp compression shortcuts
function noisyPixels(w, h, ch = 3) {
  const buf = Buffer.alloc(w * h * ch);
  for (let i = 0; i < buf.length; i++) buf[i] = (Math.random() * 255) | 0;
  return buf;
}

describe('createThumbnailBase64', () => {
  const images = {};

  before(async () => {
    fs.mkdirSync(TMP, { recursive: true });

    // 800x600 PNG (landscape)
    images.landscape = path.join(TMP, 'landscape.png');
    await sharp(noisyPixels(800, 600), { raw: { width: 800, height: 600, channels: 3 } })
      .png().toFile(images.landscape);

    // 800x400 PNG (wide 2:1)
    images.wide = path.join(TMP, 'wide.png');
    await sharp(noisyPixels(800, 400), { raw: { width: 800, height: 400, channels: 3 } })
      .png().toFile(images.wide);

    // 400x800 PNG (tall 1:2)
    images.tall = path.join(TMP, 'tall.png');
    await sharp(noisyPixels(400, 800), { raw: { width: 400, height: 800, channels: 3 } })
      .png().toFile(images.tall);

    // 100x100 PNG (small — should not be upscaled)
    images.small = path.join(TMP, 'small.png');
    await sharp(noisyPixels(100, 100), { raw: { width: 100, height: 100, channels: 3 } })
      .png().toFile(images.small);

    // JPEG input
    images.jpeg = path.join(TMP, 'photo.jpg');
    await sharp(noisyPixels(800, 600), { raw: { width: 800, height: 600, channels: 3 } })
      .jpeg().toFile(images.jpeg);
  });

  after(() => cleanup(TMP));

  it('returns a base64 string for a landscape PNG', async () => {
    const b64 = await createThumbnailBase64({ imagePath: images.landscape });
    assert.equal(typeof b64, 'string');
    assert.ok(b64.length > 0);
  });

  it('output dimensions fit inside 512x512 (default size)', async () => {
    const b64 = await createThumbnailBase64({ imagePath: images.landscape });
    const meta = await sharp(Buffer.from(b64, 'base64')).metadata();
    assert.ok(meta.width <= 512);
    assert.ok(meta.height <= 512);
  });

  it('preserves aspect ratio for wide image (2:1)', async () => {
    const b64 = await createThumbnailBase64({ imagePath: images.wide });
    const meta = await sharp(Buffer.from(b64, 'base64')).metadata();
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 256);
  });

  it('preserves aspect ratio for tall image (1:2)', async () => {
    const b64 = await createThumbnailBase64({ imagePath: images.tall });
    const meta = await sharp(Buffer.from(b64, 'base64')).metadata();
    assert.equal(meta.width, 256);
    assert.equal(meta.height, 512);
  });

  it('does NOT upscale small images (withoutEnlargement)', async () => {
    const b64 = await createThumbnailBase64({ imagePath: images.small });
    const meta = await sharp(Buffer.from(b64, 'base64')).metadata();
    assert.equal(meta.width, 100);
    assert.equal(meta.height, 100);
  });

  it('respects custom size parameter', async () => {
    const b64 = await createThumbnailBase64({ imagePath: images.landscape, size: 256 });
    const meta = await sharp(Buffer.from(b64, 'base64')).metadata();
    assert.ok(meta.width <= 256);
    assert.ok(meta.height <= 256);
  });

  it('output is valid PNG format', async () => {
    const b64 = await createThumbnailBase64({ imagePath: images.landscape });
    const meta = await sharp(Buffer.from(b64, 'base64')).metadata();
    assert.equal(meta.format, 'png');
  });

  it('converts JPEG input to PNG output', async () => {
    const b64 = await createThumbnailBase64({ imagePath: images.jpeg });
    const meta = await sharp(Buffer.from(b64, 'base64')).metadata();
    assert.equal(meta.format, 'png');
    assert.ok(meta.width <= 512);
  });

  it('throws on non-existent file', async () => {
    await assert.rejects(
      () => createThumbnailBase64({ imagePath: path.join(TMP, 'nope.png') }),
      (err) => {
        assert.ok(err.message.includes('not found') || err.message.includes('nope.png'));
        return true;
      },
    );
  });

  it('throws on size <= 0', async () => {
    await assert.rejects(
      () => createThumbnailBase64({ imagePath: images.landscape, size: 0 }),
      (err) => {
        assert.ok(err.message.includes('size'));
        return true;
      },
    );
  });

  it('throws on negative size', async () => {
    await assert.rejects(
      () => createThumbnailBase64({ imagePath: images.landscape, size: -10 }),
      (err) => {
        assert.ok(err.message.includes('size'));
        return true;
      },
    );
  });
});
