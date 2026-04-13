/**
 * Image Processor — RMBG 2.0 background removal + trim pipeline.
 *
 * Pipeline: load image → resize to model input → ONNX inference → alpha matte
 *           → composite onto original → trim transparent edges → save PNG
 *
 * Graceful degradation:
 *   - session is null → convert raw to PNG (skip bg removal)
 *   - ONNX throws → same fallback
 *   - trim produces empty canvas → keep pre-trim image, flag trim_failed
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const MODEL_INPUT_SIZE = 1024;
const MODEL_FILENAME = 'model_int8.onnx';

/* ── Singleton model session ─────────────────────────────────────── */

let _session = null;

/**
 * Load the RMBG 2.0 ONNX model as a lazy singleton.
 * Returns the session object, or null if model file is missing.
 */
export async function loadModel({ modelDir }) {
  if (_session) return _session;

  const modelPath = path.join(modelDir, MODEL_FILENAME);
  if (!fs.existsSync(modelPath)) return null;

  try {
    const ort = await import('onnxruntime-node');
    _session = await ort.InferenceSession.create(modelPath);
    return _session;
  } catch {
    return null;
  }
}

export function isModelLoaded() {
  return _session !== null;
}

export function releaseModel() {
  _session = null;
}

/* ── Inference concurrency limiter ──────────────────────────────── */

// WHY: ONNX inference + sharp resize/composite use ~500MB RAM per image.
// Without limiting, N concurrent variants each hitting runPipeline()
// cause intermittent session.run() failures under contention. Concurrency
// defaults to auto-detect (10% of system RAM / 500MB per slot, capped
// by CPU cores). Override via setInferenceConcurrency().

const INFERENCE_MEM_MB = 500;
const _queue = [];
let _active = 0;
let _maxConcurrency = 0; // 0 = auto-detect

function resolveMaxConcurrency() {
  if (_maxConcurrency > 0) return _maxConcurrency;
  const totalMb = os.totalmem() / (1024 * 1024);
  const budgetMb = totalMb * 0.10;
  return Math.max(1, Math.min(Math.floor(budgetMb / INFERENCE_MEM_MB), os.cpus().length));
}

export function setInferenceConcurrency(n) {
  _maxConcurrency = n <= 0 ? 0 : Math.max(1, n);
}

function acquirePipelineSlot() {
  return new Promise((resolve) => {
    _queue.push(resolve);
    _tryDrain();
  });
}

function releasePipelineSlot() {
  _active--;
  _tryDrain();
}

function _tryDrain() {
  const max = resolveMaxConcurrency();
  while (_queue.length > 0 && _active < max) {
    _active++;
    _queue.shift()();
  }
}

/* ── Alpha-skip: detect images that are already cutouts ──────────── */

// WHY: some source images (WebP, PNG, AVIF) already have transparent
// backgrounds. Running RMBG on these produces a worse alpha mask than
// the original. We detect existing transparency cheaply (64x64 downsample)
// and skip inference entirely — just trim + save as PNG.
const ALPHA_SKIP_SAMPLE_SIZE = 64;
const ALPHA_SKIP_THRESHOLD = 0.05; // >5% transparent pixels = already a cutout

async function hasExistingTransparency(inputPath) {
  const meta = await sharp(inputPath).metadata();
  if (!meta.hasAlpha) return false;

  // Downsample to tiny size for fast pixel scan
  const { data } = await sharp(inputPath)
    .resize(ALPHA_SKIP_SAMPLE_SIZE, ALPHA_SKIP_SAMPLE_SIZE, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = ALPHA_SKIP_SAMPLE_SIZE * ALPHA_SKIP_SAMPLE_SIZE;
  let transparentCount = 0;
  for (let i = 0; i < pixels; i++) {
    if (data[i * 4 + 3] < 10) transparentCount++;
  }

  return transparentCount / pixels > ALPHA_SKIP_THRESHOLD;
}

/* ── Trim existing cutout (no RMBG) ──────────────────────────────── */

async function trimExistingCutout(inputPath, outputPath) {
  const meta = await sharp(inputPath).metadata();
  const w = meta.width;
  const h = meta.height;

  const rgba = await sharp(inputPath).ensureAlpha().raw().toBuffer();
  const bbox = findAlphaBoundingBox(rgba, w, h);

  if (!bbox) {
    const info = await sharp(inputPath).png().toFile(outputPath);
    return { ok: true, bg_removed: true, trim_failed: true, width: info.width, height: info.height, bytes: info.size };
  }

  const info = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract(bbox)
    .png()
    .toFile(outputPath);

  return { ok: true, bg_removed: true, trim_failed: false, width: info.width, height: info.height, bytes: info.size };
}

/* ── Image processing pipeline ───────────────────────────────────── */

/**
 * Process an image through the RMBG 2.0 pipeline.
 *
 * @param {object} opts
 * @param {string} opts.inputPath — source image (any format sharp supports)
 * @param {string} opts.outputPath — destination PNG path
 * @param {object|null} opts.session — ONNX InferenceSession (null = skip bg removal)
 * @returns {Promise<{ok, bg_removed, trim_failed, width, height, bytes, error?}>}
 */
export async function processImage({ inputPath, outputPath, session = null }) {
  try {
    if (!fs.existsSync(inputPath)) {
      return { ok: false, bg_removed: false, trim_failed: false, width: 0, height: 0, bytes: 0, error: 'input not found' };
    }

    // Ensure output directory exists
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // No session → fallback: just convert to PNG (bypasses queue — no ONNX)
    if (!session) {
      return await convertToPng(inputPath, outputPath);
    }

    // Already a cutout → skip RMBG, just trim + save PNG
    if (await hasExistingTransparency(inputPath)) {
      return await trimExistingCutout(inputPath, outputPath);
    }

    // Full pipeline: infer → composite → trim → save (queued)
    await acquirePipelineSlot();
    try {
      return await runPipeline(inputPath, outputPath, session);
    } finally {
      releasePipelineSlot();
    }
  } catch (err) {
    // Hard failure — shouldn't happen but catch everything
    return { ok: false, bg_removed: false, trim_failed: false, width: 0, height: 0, bytes: 0, error: err.message };
  }
}

/* ── Fallback: simple PNG conversion ─────────────────────────────── */

async function convertToPng(inputPath, outputPath) {
  const info = await sharp(inputPath).png().toFile(outputPath);
  return {
    ok: true,
    bg_removed: false,
    trim_failed: false,
    width: info.width,
    height: info.height,
    bytes: info.size,
  };
}

/* ── Full RMBG pipeline ──────────────────────────────────────────── */

async function runPipeline(inputPath, outputPath, session) {
  // 1. Load original at full resolution
  const original = sharp(inputPath);
  const meta = await original.metadata();
  const origWidth = meta.width;
  const origHeight = meta.height;

  // 2. Prepare model input: resize to MODEL_INPUT_SIZE, get raw RGB pixels
  const resized = await sharp(inputPath)
    .resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();

  // 3. Normalize to Float32 NCHW tensor [1, 3, H, W]
  const inputTensor = rgbToNCHW(resized, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

  // 4. Run ONNX inference
  let maskData;
  try {
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];

    // Build the feed using onnxruntime Tensor if available, otherwise plain object
    let feeds;
    try {
      const ort = await import('onnxruntime-node');
      feeds = { [inputName]: new ort.Tensor('float32', inputTensor, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]) };
    } catch {
      // Fallback for mock sessions in tests — plain object works
      feeds = { [inputName]: { data: inputTensor, dims: [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE] } };
    }

    const results = await session.run(feeds);
    maskData = results[outputName].data;
  } catch {
    // ONNX failure → fallback to simple conversion
    return await convertToPng(inputPath, outputPath);
  }

  // 5. Resize mask back to original dimensions
  // WHY: nearest-neighbor preserves hard mask edges without interpolation
  // artifacts. The model's 1024x1024 output already has the intended softness.
  const maskUint8 = floatMaskToUint8(maskData, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  // WHY: .toColourspace('b-w') prevents sharp from expanding 1-channel → 3-channel
  // during resize, which would misalign the mask with the RGBA pixel buffer.
  const resizedMask = await sharp(maskUint8, { raw: { width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE, channels: 1 } })
    .resize(origWidth, origHeight, { fit: 'fill', kernel: 'nearest' })
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  // 6. Composite: apply mask as alpha channel on original
  const origRGBA = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer();

  const composited = applyAlphaMask(origRGBA, resizedMask, origWidth, origHeight);

  // 7. Trim transparent edges via alpha bounding box
  // WHY: sharp.trim() uses border-pixel similarity, not alpha. We need alpha-aware trimming.
  const bbox = findAlphaBoundingBox(composited, origWidth, origHeight);

  if (!bbox) {
    // Fully transparent — save pre-trim version
    const preInfo = await sharp(composited, { raw: { width: origWidth, height: origHeight, channels: 4 } })
      .png()
      .toFile(outputPath);
    return {
      ok: true,
      bg_removed: true,
      trim_failed: true,
      width: preInfo.width,
      height: preInfo.height,
      bytes: preInfo.size,
    };
  }

  // 8. Extract bounding box and save as PNG
  const trimmedInfo = await sharp(composited, { raw: { width: origWidth, height: origHeight, channels: 4 } })
    .extract(bbox)
    .png()
    .toFile(outputPath);

  return {
    ok: true,
    bg_removed: true,
    trim_failed: false,
    width: trimmedInfo.width,
    height: trimmedInfo.height,
    bytes: trimmedInfo.size,
  };
}

/* ── Hero image processing: center-crop to 16:9 ─────────────────── */

const HERO_ASPECT = 16 / 9;

/**
 * Process a hero image: center-crop to 16:9 aspect ratio, save as PNG.
 *
 * @param {object} opts
 * @param {string} opts.inputPath — source image
 * @param {string} opts.outputPath — destination PNG path
 * @returns {Promise<{ok, width, height, bytes, error?}>}
 */
export async function processHeroImage({ inputPath, outputPath }) {
  try {
    if (!fs.existsSync(inputPath)) {
      return { ok: false, width: 0, height: 0, bytes: 0, error: 'input not found' };
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const meta = await sharp(inputPath).metadata();
    const srcW = meta.width;
    const srcH = meta.height;
    const srcAspect = srcW / srcH;

    let cropW, cropH, left, top;

    if (Math.abs(srcAspect - HERO_ASPECT) < 0.01) {
      // Already 16:9 — no crop needed
      cropW = srcW;
      cropH = srcH;
      left = 0;
      top = 0;
    } else if (srcAspect > HERO_ASPECT) {
      // Wider than 16:9 — crop width
      cropH = srcH;
      cropW = Math.round(srcH * HERO_ASPECT);
      left = Math.round((srcW - cropW) / 2);
      top = 0;
    } else {
      // Taller than 16:9 — crop height
      cropW = srcW;
      cropH = Math.round(srcW / HERO_ASPECT);
      left = 0;
      top = Math.round((srcH - cropH) / 2);
    }

    const info = await sharp(inputPath)
      .extract({ left, top, width: cropW, height: cropH })
      .png()
      .toFile(outputPath);

    return { ok: true, width: info.width, height: info.height, bytes: info.size };
  } catch (err) {
    return { ok: false, width: 0, height: 0, bytes: 0, error: err.message };
  }
}

/* ── Tensor helpers ──────────────────────────────────────────────── */

/**
 * Convert raw RGB buffer (HWC) to Float32 NCHW tensor with ImageNet normalization.
 */
function rgbToNCHW(buffer, width, height) {
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const pixels = width * height;
  const tensor = new Float32Array(3 * pixels);

  for (let i = 0; i < pixels; i++) {
    tensor[i] = (buffer[i * 3] / 255 - mean[0]) / std[0];             // R
    tensor[pixels + i] = (buffer[i * 3 + 1] / 255 - mean[1]) / std[1]; // G
    tensor[2 * pixels + i] = (buffer[i * 3 + 2] / 255 - mean[2]) / std[2]; // B
  }

  return tensor;
}

/**
 * Convert float32 mask (0-1) to uint8 (0-255).
 */
function floatMaskToUint8(maskFloat, width, height) {
  const pixels = width * height;
  const out = Buffer.alloc(pixels);
  for (let i = 0; i < pixels; i++) {
    out[i] = Math.round(Math.max(0, Math.min(1, maskFloat[i])) * 255);
  }
  return out;
}

/**
 * Find the bounding box of non-transparent pixels in an RGBA buffer.
 * Returns { left, top, width, height } or null if fully transparent.
 */
function findAlphaBoundingBox(rgba, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Apply a single-channel alpha mask to an RGBA buffer.
 */
function applyAlphaMask(rgba, mask, width, height) {
  const out = Buffer.from(rgba);
  const pixels = width * height;
  for (let i = 0; i < pixels; i++) {
    out[i * 4 + 3] = mask[i]; // replace alpha channel with mask
  }
  return out;
}
