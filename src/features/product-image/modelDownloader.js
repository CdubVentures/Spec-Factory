/**
 * RMBG 2.0 model downloader.
 *
 * Downloads the ONNX model weights from HuggingFace to .workspace/models/rmbg-2.0/.
 * Requires HF_TOKEN env var for authenticated download (model is gated).
 * Atomic: writes to .tmp first, renames on completion.
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const MODEL_FILENAME = 'model_int8.onnx';
const HF_DOWNLOAD_URL = 'https://huggingface.co/briaai/RMBG-2.0/resolve/main/onnx/model_int8.onnx';

/**
 * Ensure the RMBG 2.0 model is ready to use.
 *
 * @param {object} opts
 * @param {string} opts.modelDir — directory for model files
 * @param {Function} [opts._fetchOverride] — DI seam for testing: (url, destPath) => Promise<void>
 * @param {string} [opts._tokenOverride] — DI seam for testing: override HF_TOKEN
 * @returns {Promise<{ready: boolean, path?: string, error?: string}>}
 */
export async function ensureModelReady({ modelDir, _fetchOverride = null, _tokenOverride = undefined }) {
  try {
    const modelPath = path.join(modelDir, MODEL_FILENAME);

    // Already downloaded
    if (fs.existsSync(modelPath)) {
      return { ready: true, path: modelPath };
    }

    fs.mkdirSync(modelDir, { recursive: true });

    // Use override for testing
    if (_fetchOverride) {
      try {
        await _fetchOverride(HF_DOWNLOAD_URL, modelPath);
        return { ready: true, path: modelPath };
      } catch (err) {
        // Clean up any partial files
        try { fs.unlinkSync(modelPath); } catch { /* */ }
        try { fs.unlinkSync(modelPath + '.tmp'); } catch { /* */ }
        return { ready: false, error: `Download failed: ${err.message}` };
      }
    }

    // Check for HF token
    const token = _tokenOverride !== undefined ? _tokenOverride : (process.env.HF_TOKEN || '');
    if (!token) {
      return {
        ready: false,
        error: `RMBG 2.0 model not found at ${modelPath}. To download:\n` +
          `  1. Create a HuggingFace account and accept the RMBG 2.0 license at https://huggingface.co/briaai/RMBG-2.0\n` +
          `  2. Set HF_TOKEN env var with your access token for auto-download\n` +
          `  3. Or manually download model_int8.onnx from the onnx/ folder to ${modelDir}`,
      };
    }

    // Download with authentication
    const tmpPath = modelPath + '.tmp';
    try {
      await downloadWithToken(HF_DOWNLOAD_URL, tmpPath, token);
      fs.renameSync(tmpPath, modelPath);
      return { ready: true, path: modelPath };
    } catch (err) {
      // Clean up partial download
      try { fs.unlinkSync(tmpPath); } catch { /* */ }
      return { ready: false, error: `Download failed: ${err.message}` };
    }
  } catch (err) {
    return { ready: false, error: err.message };
  }
}

function downloadWithToken(url, destPath, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'SpecFactory/1.0',
      },
    };

    const req = https.get(options, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return downloadWithToken(res.headers.location, destPath, token).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const stream = fs.createWriteStream(destPath);
      res.pipe(stream);
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(300000, () => { req.destroy(); reject(new Error('download timeout')); });
  });
}
