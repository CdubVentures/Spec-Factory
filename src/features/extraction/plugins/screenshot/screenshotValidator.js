// WHY: Layer 2 of the screenshot quality gate — validates the captured
// image AFTER the browser emitted it. Catches blank captures that slipped
// past the pre-capture readiness gate (Layer 1) by inspecting the actual
// pixels, not the DOM predicate.
//
// Two checks:
//   1. File size — PNG of a real product page is typically > 30KB. A solid-
//      color PNG is ~2-8KB regardless of dimensions (compressor-friendly).
//   2. Stddev of channel values — sharp's .stats() returns per-channel
//      stddev. A uniform color has stddev ≈ 0. A rich page has stddev > 25
//      per channel typically. We threshold at stddevMean > 6 as the minimum
//      signal that the image has visible variation.
//
// Never throws. Corrupted images resolve to { valid: false, reason: 'decode_failed' }.

import sharp from 'sharp';

// WHY: minBytes guards against corruption/truncation, not blank-page detection.
// A compressed solid-color 1280×900 PNG is ~3–6KB (PNG compressors are very
// good with uniform data), so the size check must sit BELOW that band. The
// blank-page signal is the stddev check — we always decode first and let the
// entropy proxy reject uniform frames regardless of file size.
const DEFAULT_MIN_BYTES = 1500;
const DEFAULT_MIN_STDDEV = 6; // per-channel stddev mean across RGB

export async function validateScreenshot(buffer, {
  minBytes = DEFAULT_MIN_BYTES,
  minStddev = DEFAULT_MIN_STDDEV,
} = {}) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { valid: false, reason: 'missing_buffer', metrics: { bytes: 0 } };
  }

  const bytes = buffer.length;

  // Decode-first: metrics should reflect the image whenever possible. Only
  // reject on size AFTER failed decode so corrupt/truncated buffers surface.
  let metadata;
  let stats;
  try {
    const img = sharp(buffer);
    metadata = await img.metadata();
    stats = await img.stats();
  } catch {
    // If we can't decode AND the buffer is small, the most useful reason is
    // 'too_small' (caller likely passed a stub). Otherwise it's a real corrupt.
    if (bytes < minBytes) {
      return { valid: false, reason: 'too_small', metrics: { bytes } };
    }
    return { valid: false, reason: 'decode_failed', metrics: { bytes } };
  }

  const channelStddevs = (stats?.channels || []).map((c) => Number(c?.stdev) || 0);
  // Alpha channel on opaque PNGs has stddev=0 and would drag the mean down;
  // only consider the first three (RGB) channels as the entropy proxy.
  const rgbStddevs = channelStddevs.slice(0, 3);
  const stddevMean = rgbStddevs.length > 0
    ? rgbStddevs.reduce((a, b) => a + b, 0) / rgbStddevs.length
    : 0;

  const metrics = {
    bytes,
    width: metadata?.width || 0,
    height: metadata?.height || 0,
    channels: metadata?.channels || 0,
    stddevMean,
    channelStddevs: rgbStddevs,
  };

  if (bytes < minBytes) {
    return { valid: false, reason: 'too_small', metrics };
  }
  if (stddevMean < minStddev) {
    return { valid: false, reason: 'uniform_color', metrics };
  }

  return { valid: true, reason: 'ok', metrics };
}
