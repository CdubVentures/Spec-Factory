/**
 * imageProcessor contract tests.
 *
 * Tests use a mock ONNX session (no real model needed) and real sharp
 * (already installed) to verify the full processing pipeline.
 */

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {
  processImage,
  loadModel,
  isModelLoaded,
  releaseModel,
  setInferenceConcurrency,
} from '../imageProcessor.js';

const TMP = path.join(os.tmpdir(), `img-proc-test-${Date.now()}`);
const INPUT_DIR = path.join(TMP, 'input');
const OUTPUT_DIR = path.join(TMP, 'output');
const MODELS_DIR = path.join(TMP, 'models');

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

// WHY: random noise → >50KB file sizes, realistic for integration
function noisyPixels(w, h, ch = 3) {
  const buf = Buffer.alloc(w * h * ch);
  for (let i = 0; i < buf.length; i++) buf[i] = (Math.random() * 255) | 0;
  return buf;
}

/**
 * Mock ONNX session that returns a predictable alpha matte.
 * @param {'opaque'|'transparent'|'half'} mode
 *   opaque = all white (keep everything)
 *   transparent = all black (mask out everything → trim_failed)
 *   half = left half opaque, right half transparent
 */
function createMockSession(mode = 'opaque') {
  const MODEL_SIZE = 1024;
  const pixels = MODEL_SIZE * MODEL_SIZE;
  return {
    inputNames: ['input'],
    outputNames: ['output'],
    run: async () => {
      const data = new Float32Array(pixels);
      if (mode === 'opaque') {
        data.fill(1.0);
      } else if (mode === 'transparent') {
        data.fill(0.0);
      } else if (mode === 'half') {
        // Left half opaque, right half transparent
        for (let y = 0; y < MODEL_SIZE; y++) {
          for (let x = 0; x < MODEL_SIZE; x++) {
            data[y * MODEL_SIZE + x] = x < MODEL_SIZE / 2 ? 1.0 : 0.0;
          }
        }
      }
      return { output: { data, dims: [1, 1, MODEL_SIZE, MODEL_SIZE] } };
    },
  };
}

let inputPng;
let inputJpg;

before(async () => {
  fs.mkdirSync(INPUT_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Create test input images
  inputPng = path.join(INPUT_DIR, 'test.png');
  inputJpg = path.join(INPUT_DIR, 'test.jpg');

  await sharp(noisyPixels(800, 600), { raw: { width: 800, height: 600, channels: 3 } })
    .png().toFile(inputPng);
  await sharp(noisyPixels(1200, 900), { raw: { width: 1200, height: 900, channels: 3 } })
    .jpeg().toFile(inputJpg);
});

afterEach(() => {
  releaseModel();
});

after(() => cleanup(TMP));

/* ── processImage ────────────────────────────────────────────────── */

describe('processImage', () => {
  it('happy path: produces transparent PNG with correct metadata', async () => {
    const outputPath = path.join(OUTPUT_DIR, 'happy.png');
    const session = createMockSession('opaque');

    const result = await processImage({ inputPath: inputPng, outputPath, session });

    assert.equal(result.ok, true);
    assert.equal(result.bg_removed, true);
    assert.equal(result.trim_failed, false);
    assert.ok(result.width > 0, 'width should be positive');
    assert.ok(result.height > 0, 'height should be positive');
    assert.ok(result.bytes > 0, 'bytes should be positive');

    // Output file exists and is a valid PNG
    assert.ok(fs.existsSync(outputPath));
    const meta = await sharp(outputPath).metadata();
    assert.equal(meta.format, 'png');
    assert.equal(meta.channels, 4, 'output PNG should have alpha channel');
  });

  it('works with JPEG input (not just PNG)', async () => {
    const outputPath = path.join(OUTPUT_DIR, 'from-jpg.png');
    const session = createMockSession('opaque');

    const result = await processImage({ inputPath: inputJpg, outputPath, session });

    assert.equal(result.ok, true);
    assert.equal(result.bg_removed, true);
    assert.ok(fs.existsSync(outputPath));
    const meta = await sharp(outputPath).metadata();
    assert.equal(meta.format, 'png');
    assert.equal(meta.channels, 4);
  });

  it('no session (null): graceful degradation, converts raw to PNG', async () => {
    const outputPath = path.join(OUTPUT_DIR, 'no-session.png');

    const result = await processImage({ inputPath: inputPng, outputPath, session: null });

    assert.equal(result.ok, true);
    assert.equal(result.bg_removed, false);
    assert.ok(result.width > 0);
    assert.ok(result.height > 0);
    assert.ok(result.bytes > 0);

    // File exists, is PNG, but no alpha (straight conversion)
    assert.ok(fs.existsSync(outputPath));
    const meta = await sharp(outputPath).metadata();
    assert.equal(meta.format, 'png');
  });

  it('session.run throws: graceful degradation', async () => {
    const outputPath = path.join(OUTPUT_DIR, 'onnx-throws.png');
    const badSession = {
      inputNames: ['input'],
      outputNames: ['output'],
      run: async () => { throw new Error('ONNX runtime crash'); },
    };

    const result = await processImage({ inputPath: inputPng, outputPath, session: badSession });

    assert.equal(result.ok, true);
    assert.equal(result.bg_removed, false);
    assert.ok(fs.existsSync(outputPath), 'output should still exist (fallback)');
  });

  it('trim produces empty canvas: trim_failed flag set', async () => {
    const outputPath = path.join(OUTPUT_DIR, 'trim-fail.png');
    const session = createMockSession('transparent'); // all-zero matte → fully transparent

    const result = await processImage({ inputPath: inputPng, outputPath, session });

    assert.equal(result.ok, true);
    assert.equal(result.bg_removed, true);
    assert.equal(result.trim_failed, true);
    assert.ok(fs.existsSync(outputPath), 'pre-trim image should be kept');
  });

  it('input file does not exist: returns error result', async () => {
    const outputPath = path.join(OUTPUT_DIR, 'no-input.png');

    const result = await processImage({ inputPath: '/tmp/nonexistent.png', outputPath, session: createMockSession() });

    assert.equal(result.ok, false);
    assert.ok(result.error);
  });

  it('auto-creates output directory if missing', async () => {
    const nestedOutput = path.join(OUTPUT_DIR, 'nested', 'deep', 'out.png');
    const session = createMockSession('opaque');

    const result = await processImage({ inputPath: inputPng, outputPath: nestedOutput, session });

    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(nestedOutput));
  });

  it('half matte: trims to non-transparent region', async () => {
    const outputPath = path.join(OUTPUT_DIR, 'half.png');
    const session = createMockSession('half'); // left half opaque

    const result = await processImage({ inputPath: inputPng, outputPath, session });

    assert.equal(result.ok, true);
    assert.equal(result.bg_removed, true);
    assert.equal(result.trim_failed, false);
    // Trimmed width should be roughly half the original (left side kept)
    assert.ok(result.width > 0);
    assert.ok(result.width < 800, `trimmed width ${result.width} should be less than original 800`);
  });
});

/* ── loadModel / isModelLoaded / releaseModel ────────────────────── */

describe('model lifecycle', () => {
  it('isModelLoaded returns false initially', () => {
    assert.equal(isModelLoaded(), false);
  });

  it('loadModel returns null when model file missing', async () => {
    const result = await loadModel({ modelDir: path.join(TMP, 'no-models') });
    assert.equal(result, null);
    assert.equal(isModelLoaded(), false);
  });

  it('releaseModel resets loaded state', async () => {
    // Can call releaseModel even when nothing loaded
    releaseModel();
    assert.equal(isModelLoaded(), false);
  });
});

/* ── Inference concurrency limiter ─────────────────────────────── */

describe('inference concurrency limiter', () => {
  afterEach(() => {
    releaseModel();
    setInferenceConcurrency(0); // reset to auto-detect
  });

  it('concurrent ONNX calls serialize when concurrency=1', async () => {
    setInferenceConcurrency(1);
    const timeline = [];
    const session = {
      inputNames: ['input'],
      outputNames: ['output'],
      run: async () => {
        timeline.push('run-start');
        await new Promise((r) => setTimeout(r, 50));
        timeline.push('run-end');
        const data = new Float32Array(1024 * 1024);
        data.fill(1.0);
        return { output: { data, dims: [1, 1, 1024, 1024] } };
      },
    };

    const calls = Array.from({ length: 3 }, (_, i) =>
      processImage({ inputPath: inputPng, outputPath: path.join(OUTPUT_DIR, `sem-serial-${i}.png`), session }),
    );
    await Promise.all(calls);

    // Serialized: [start, end, start, end, start, end]
    // Concurrent (fail): [start, start, start, end, end, end]
    for (let i = 0; i < timeline.length - 1; i += 2) {
      assert.equal(timeline[i], 'run-start', `index ${i} should be run-start`);
      assert.equal(timeline[i + 1], 'run-end', `index ${i + 1} should be run-end`);
    }
    assert.equal(timeline.length, 6, 'should have 3 start/end pairs');
  });

  it('queue drains completely: all concurrent calls resolve', async () => {
    setInferenceConcurrency(1);
    const session = createMockSession('opaque');
    const N = 5;
    const calls = Array.from({ length: N }, (_, i) =>
      processImage({ inputPath: inputPng, outputPath: path.join(OUTPUT_DIR, `sem-drain-${i}.png`), session }),
    );
    const results = await Promise.all(calls);

    assert.equal(results.length, N);
    for (const r of results) {
      assert.equal(r.ok, true);
      assert.equal(r.bg_removed, true);
    }
  });

  it('no-session calls bypass queue (do not wait for ONNX)', async () => {
    setInferenceConcurrency(1);
    let onnxResolve;
    const onnxGate = new Promise((r) => { onnxResolve = r; });

    const slowSession = {
      inputNames: ['input'],
      outputNames: ['output'],
      run: async () => {
        await onnxGate;
        const data = new Float32Array(1024 * 1024);
        data.fill(1.0);
        return { output: { data, dims: [1, 1, 1024, 1024] } };
      },
    };

    // Start an ONNX call that blocks on the gate
    const onnxCall = processImage({
      inputPath: inputPng,
      outputPath: path.join(OUTPUT_DIR, 'sem-bypass-onnx.png'),
      session: slowSession,
    });

    // No-session call should resolve immediately while ONNX is blocked
    const noSessionResult = await processImage({
      inputPath: inputPng,
      outputPath: path.join(OUTPUT_DIR, 'sem-bypass-nosession.png'),
      session: null,
    });

    assert.equal(noSessionResult.ok, true);
    assert.equal(noSessionResult.bg_removed, false);

    // Release the gate and clean up
    onnxResolve();
    await onnxCall;
  });

  it('error in queued call does not block subsequent calls', async () => {
    setInferenceConcurrency(1);
    let callCount = 0;
    const makeSession = (shouldThrow) => ({
      inputNames: ['input'],
      outputNames: ['output'],
      run: async () => {
        callCount++;
        if (shouldThrow) throw new Error('ONNX crash');
        const data = new Float32Array(1024 * 1024);
        data.fill(1.0);
        return { output: { data, dims: [1, 1, 1024, 1024] } };
      },
    });

    const calls = [
      processImage({ inputPath: inputPng, outputPath: path.join(OUTPUT_DIR, 'sem-err-1.png'), session: makeSession(true) }),
      processImage({ inputPath: inputPng, outputPath: path.join(OUTPUT_DIR, 'sem-err-2.png'), session: makeSession(false) }),
      processImage({ inputPath: inputPng, outputPath: path.join(OUTPUT_DIR, 'sem-err-3.png'), session: makeSession(false) }),
    ];
    const results = await Promise.all(calls);

    // First: ONNX threw → graceful degradation (bg_removed: false)
    assert.equal(results[0].ok, true);
    assert.equal(results[0].bg_removed, false);

    // Second and third: should succeed normally
    assert.equal(results[1].ok, true);
    assert.equal(results[1].bg_removed, true);
    assert.equal(results[2].ok, true);
    assert.equal(results[2].bg_removed, true);

    // All 3 ran (no deadlock)
    assert.equal(callCount, 3);
  });
});
