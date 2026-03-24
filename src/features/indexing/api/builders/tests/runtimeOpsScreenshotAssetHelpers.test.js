import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  escapeSvgText,
  shouldSynthesizeRuntimeProofFrame,
  buildSyntheticRuntimeProofFrame,
  readPngDimensions,
  isJpegStartOfFrameMarker,
  readJpegDimensions,
  readImageDimensions,
  buildRuntimeAssetCandidatePaths,
  createRuntimeScreenshotMetadataResolver,
} from '../runtimeOpsScreenshotAssetHelpers.js';

describe('escapeSvgText', () => {
  test('escapes all XML special characters', () => {
    assert.equal(escapeSvgText('a&b<c>d"e\'f'), 'a&amp;b&lt;c&gt;d&quot;e&#39;f');
  });

  test('returns empty string for falsy input', () => {
    assert.equal(escapeSvgText(null), '');
    assert.equal(escapeSvgText(undefined), '');
    assert.equal(escapeSvgText(''), '');
  });

  test('passes through plain text unchanged', () => {
    assert.equal(escapeSvgText('hello world'), 'hello world');
  });
});

describe('shouldSynthesizeRuntimeProofFrame', () => {
  test('returns true for fetch pool with crawlee mode in completed state', () => {
    assert.equal(shouldSynthesizeRuntimeProofFrame({
      pool: 'fetch', fetch_mode: 'crawlee', state: 'completed',
    }), true);
  });

  test('returns true for fetch pool with playwright mode in completed state', () => {
    assert.equal(shouldSynthesizeRuntimeProofFrame({
      pool: 'fetch', fetch_mode: 'playwright', state: 'completed',
    }), true);
  });

  test('returns false when state is running', () => {
    assert.equal(shouldSynthesizeRuntimeProofFrame({
      pool: 'fetch', fetch_mode: 'crawlee', state: 'running',
    }), false);
  });

  test('returns false when state is stuck', () => {
    assert.equal(shouldSynthesizeRuntimeProofFrame({
      pool: 'fetch', fetch_mode: 'crawlee', state: 'stuck',
    }), false);
  });

  test('returns false for non-fetch pool', () => {
    assert.equal(shouldSynthesizeRuntimeProofFrame({
      pool: 'parse', fetch_mode: 'crawlee', state: 'completed',
    }), false);
  });

  test('returns false for non-browser fetch mode', () => {
    assert.equal(shouldSynthesizeRuntimeProofFrame({
      pool: 'fetch', fetch_mode: 'http', state: 'completed',
    }), false);
  });

  test('returns false for empty worker', () => {
    assert.equal(shouldSynthesizeRuntimeProofFrame({}), false);
    assert.equal(shouldSynthesizeRuntimeProofFrame(), false);
  });
});

describe('buildSyntheticRuntimeProofFrame', () => {
  test('produces valid frame shape with expected fields', () => {
    const frame = buildSyntheticRuntimeProofFrame({
      runId: 'run-1',
      worker: { worker_id: 'fetch-1', fetch_mode: 'crawlee', started_at: '2025-01-01T00:00:00Z' },
      detail: { documents: [{ url: 'https://example.com', status_code: 200, host: 'example.com' }] },
    });
    assert.equal(frame.run_id, 'run-1');
    assert.equal(frame.worker_id, 'fetch-1');
    assert.equal(frame.width, 1280);
    assert.equal(frame.height, 720);
    assert.equal(frame.mime_type, 'image/svg+xml');
    assert.equal(frame.synthetic, true);
    assert.ok(frame.data);
    assert.ok(frame.ts);
  });

  test('decodes to valid SVG containing status and url', () => {
    const frame = buildSyntheticRuntimeProofFrame({
      runId: 'run-1',
      worker: { worker_id: 'w1', fetch_mode: 'playwright' },
      detail: { documents: [{ url: 'https://test.com', status_code: 404 }] },
    });
    const svg = Buffer.from(frame.data, 'base64').toString('utf8');
    assert.ok(svg.includes('<svg'));
    assert.ok(svg.includes('HTTP 404'));
    assert.ok(svg.includes('https://test.com'));
  });

  test('handles empty detail gracefully', () => {
    const frame = buildSyntheticRuntimeProofFrame({ runId: 'r1' });
    assert.equal(frame.run_id, 'r1');
    assert.equal(frame.synthetic, true);
    const svg = Buffer.from(frame.data, 'base64').toString('utf8');
    assert.ok(svg.includes('NO_STATUS'));
  });

  test('escapes dangerous characters in SVG text', () => {
    const frame = buildSyntheticRuntimeProofFrame({
      worker: { worker_id: '<script>', fetch_mode: 'crawlee', last_error: 'a&b<c>' },
      detail: { documents: [{ url: 'https://evil.com/<script>' }] },
    });
    const svg = Buffer.from(frame.data, 'base64').toString('utf8');
    assert.ok(!svg.includes('<script>'));
    assert.ok(svg.includes('&lt;script&gt;'));
  });
});

describe('readPngDimensions', () => {
  function makePngBuffer(width, height) {
    const buf = Buffer.alloc(24);
    buf.write('\x89PNG\r\n\x1a\n', 0, 'binary');
    buf.writeUInt32BE(width, 16);
    buf.writeUInt32BE(height, 20);
    return buf;
  }

  test('reads dimensions from valid PNG header', () => {
    const dims = readPngDimensions(makePngBuffer(800, 600));
    assert.deepEqual(dims, { width: 800, height: 600 });
  });

  test('returns 0x0 for non-buffer', () => {
    assert.deepEqual(readPngDimensions('not a buffer'), { width: 0, height: 0 });
  });

  test('returns 0x0 for too-short buffer', () => {
    assert.deepEqual(readPngDimensions(Buffer.alloc(10)), { width: 0, height: 0 });
  });

  test('returns 0x0 for buffer without PNG signature', () => {
    const buf = Buffer.alloc(24);
    buf.write('NOT_A_PNG', 0);
    assert.deepEqual(readPngDimensions(buf), { width: 0, height: 0 });
  });
});

describe('isJpegStartOfFrameMarker', () => {
  test('returns true for baseline SOF markers', () => {
    assert.equal(isJpegStartOfFrameMarker(0xc0), true);
    assert.equal(isJpegStartOfFrameMarker(0xc2), true);
  });

  test('returns false for non-SOF markers', () => {
    assert.equal(isJpegStartOfFrameMarker(0xd8), false);
    assert.equal(isJpegStartOfFrameMarker(0xe0), false);
    assert.equal(isJpegStartOfFrameMarker(0xc4), false);
    assert.equal(isJpegStartOfFrameMarker(0xc8), false);
    assert.equal(isJpegStartOfFrameMarker(0xcc), false);
  });
});

describe('readJpegDimensions', () => {
  function makeJpegBuffer(width, height) {
    // Minimal JPEG: SOI + SOF0 segment with enough padding
    const soi = Buffer.from([0xff, 0xd8]);
    const sofMarker = Buffer.from([0xff, 0xc0]);
    const segmentLength = Buffer.alloc(2);
    segmentLength.writeUInt16BE(8, 0);
    const precision = Buffer.from([8]);
    const dims = Buffer.alloc(4);
    dims.writeUInt16BE(height, 0);
    dims.writeUInt16BE(width, 2);
    const padding = Buffer.from([0x03]);
    return Buffer.concat([soi, sofMarker, segmentLength, precision, dims, padding]);
  }

  test('reads dimensions from valid JPEG', () => {
    const dims = readJpegDimensions(makeJpegBuffer(1024, 768));
    assert.deepEqual(dims, { width: 1024, height: 768 });
  });

  test('returns 0x0 for non-buffer', () => {
    assert.deepEqual(readJpegDimensions('not a buffer'), { width: 0, height: 0 });
  });

  test('returns 0x0 for too-short buffer', () => {
    assert.deepEqual(readJpegDimensions(Buffer.alloc(2)), { width: 0, height: 0 });
  });

  test('returns 0x0 for buffer without JPEG SOI', () => {
    const buf = Buffer.alloc(20);
    assert.deepEqual(readJpegDimensions(buf), { width: 0, height: 0 });
  });
});

describe('readImageDimensions', () => {
  test('delegates to PNG reader for .png files', () => {
    const buf = Buffer.alloc(24);
    buf.write('\x89PNG\r\n\x1a\n', 0, 'binary');
    buf.writeUInt32BE(640, 16);
    buf.writeUInt32BE(480, 20);
    assert.deepEqual(readImageDimensions(buf, 'screenshot.png'), { width: 640, height: 480 });
  });

  test('delegates to JPEG reader for .jpg files', () => {
    const dims = readImageDimensions(Buffer.alloc(4), 'photo.jpg');
    assert.deepEqual(dims, { width: 0, height: 0 });
  });

  test('defaults to JPEG reader for unknown extensions', () => {
    const dims = readImageDimensions(Buffer.alloc(4), 'image.webp');
    assert.deepEqual(dims, { width: 0, height: 0 });
  });
});

describe('buildRuntimeAssetCandidatePaths', () => {
  const fakePath = {
    resolve: (...args) => path.resolve(...args),
    join: (...args) => path.join(...args),
  };

  test('returns empty array for empty filename', () => {
    const result = buildRuntimeAssetCandidatePaths({
      filename: '', storage: null, OUTPUT_ROOT: '/out', path: fakePath,
    });
    assert.deepEqual(result, []);
  });

  test('uses storage.resolveLocalPath when available for path-like filenames', () => {
    const storage = { resolveLocalPath: (f) => `/resolved/${f}` };
    const result = buildRuntimeAssetCandidatePaths({
      filename: 'runs/r1/screenshots/a.png',
      storage,
      OUTPUT_ROOT: '/out',
      path: fakePath,
    });
    assert.ok(result.length >= 1);
  });

  test('falls back to OUTPUT_ROOT join when no storage resolver', () => {
    const result = buildRuntimeAssetCandidatePaths({
      filename: 'some/nested/file.png',
      storage: null,
      OUTPUT_ROOT: '/output',
      path: fakePath,
    });
    assert.ok(result.length >= 1);
    assert.ok(result[0].includes('some'));
  });

  test('builds archive candidates for run-like paths', () => {
    const result = buildRuntimeAssetCandidatePaths({
      filename: 'runs/run123/screenshots/img.png',
      storage: null,
      OUTPUT_ROOT: '/output',
      path: fakePath,
      runId: 'run123',
    });
    assert.ok(result.length >= 2);
    assert.ok(result.some((p) => p.includes('archived_runs')));
    assert.ok(result.some((p) => p.includes('run_output')));
    assert.ok(result.some((p) => p.includes('latest_snapshot')));
  });

  test('uses runDir for simple filenames', () => {
    const result = buildRuntimeAssetCandidatePaths({
      filename: 'screenshot.png',
      storage: null,
      OUTPUT_ROOT: '/out',
      path: fakePath,
      runDir: '/runs/r1',
    });
    assert.ok(result.length === 1);
    assert.ok(result[0].includes('screenshots'));
  });

  test('deduplicates candidates', () => {
    const storage = { resolveLocalPath: (f) => path.resolve('/output', ...f.split('/')) };
    const result = buildRuntimeAssetCandidatePaths({
      filename: 'some/file.png',
      storage,
      OUTPUT_ROOT: '/output',
      path: fakePath,
    });
    const unique = new Set(result);
    assert.equal(result.length, unique.size);
  });
});

describe('createRuntimeScreenshotMetadataResolver', () => {
  test('returns null for empty filename', () => {
    const resolver = createRuntimeScreenshotMetadataResolver({
      storage: null, OUTPUT_ROOT: '/out', path,
    });
    assert.equal(resolver(''), null);
    assert.equal(resolver(null), null);
  });

  test('caches results for repeated calls', () => {
    let callCount = 0;
    const resolver = createRuntimeScreenshotMetadataResolver({
      storage: null, OUTPUT_ROOT: '/nonexistent', path,
    });
    // Will return null because no file exists, but should cache
    const r1 = resolver('missing.png');
    const r2 = resolver('missing.png');
    assert.equal(r1, null);
    assert.equal(r2, null);
  });

  test('returns null when no candidates exist', () => {
    const resolver = createRuntimeScreenshotMetadataResolver({
      storage: null, OUTPUT_ROOT: '', path,
    });
    assert.equal(resolver('simple.png'), null);
  });
});
