// WHY: Persists screenshot bytes to {runDir}/screenshots/ so the GUI asset
// endpoint can serve them. Matches the existing SERP screenshot pattern in
// executeSearchQueries.js. Pure function — DI-injected into crawlSession
// via onScreenshotsPersist callback to avoid cross-feature imports.
//
// Optional SQL indexing: when insertScreenshot + runContext are provided,
// indexes each screenshot into the source_screenshots table. Best-effort —
// SQL failure does not prevent disk write or other screenshots.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

function urlHash8(url) {
  return createHash('sha256').update(String(url || '')).digest('hex').slice(0, 8);
}

function contentHash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function formatExt(format) {
  const f = String(format || 'jpeg').trim().toLowerCase();
  return f === 'png' ? 'png' : 'jpg';
}

/**
 * @param {{ screenshots: Array, screenshotDir: string, workerId: string, url: string, insertScreenshot?: function, runContext?: { category: string, productId: string, runId: string, host: string } }} opts
 * @returns {Array<{ filename: string, width: number, height: number, bytes: number, format: string, kind: string, captured_at: string, content_hash: string }>}
 */
export function persistScreenshotArtifacts({ screenshots, screenshotDir, workerId, url, insertScreenshot, runContext }) {
  if (!screenshots || screenshots.length === 0) return [];

  const hash = urlHash8(url);
  const persisted = [];
  let dirCreated = false;

  for (let i = 0; i < screenshots.length; i++) {
    const shot = screenshots[i];
    if (!shot?.bytes || !Buffer.isBuffer(shot.bytes) || shot.bytes.length === 0) continue;

    const format = String(shot.format || 'jpeg').trim().toLowerCase() || 'jpeg';
    const kind = String(shot.kind || 'page').trim();
    const ext = formatExt(format);
    const idx = String(i).padStart(2, '0');
    const filename = `screenshot-${workerId}-${hash}-${idx}-${kind}.${ext}`;
    const shotHash = contentHash(shot.bytes);

    try {
      if (!dirCreated) {
        fs.mkdirSync(screenshotDir, { recursive: true });
        dirCreated = true;
      }
      fs.writeFileSync(path.join(screenshotDir, filename), shot.bytes);

      const record = {
        filename,
        width: shot.width || 0,
        height: shot.height || 0,
        bytes: shot.bytes.length,
        format,
        kind,
        captured_at: shot.captured_at || '',
        content_hash: shotHash,
      };

      persisted.push(record);

      // WHY: SQL indexing is best-effort. insertScreenshot + runContext are
      // DI'd from the pipeline layer — extraction never imports specDb.
      if (typeof insertScreenshot === 'function' && runContext) {
        try {
          insertScreenshot({
            screenshot_id: shotHash,
            content_hash: shotHash,
            category: runContext.category || '',
            product_id: runContext.productId || '',
            run_id: runContext.runId || '',
            source_url: String(url || ''),
            host: runContext.host || '',
            selector: String(shot.selector || '').trim() || 'fullpage',
            format: ext,
            width: shot.width || 0,
            height: shot.height || 0,
            size_bytes: shot.bytes.length,
            file_path: path.join(screenshotDir, filename),
            captured_at: shot.captured_at || new Date().toISOString(),
          });
        } catch {
          // WHY: SQL failure must not prevent other screenshots from persisting.
        }
      }
    } catch {
      // WHY: Per-file error swallowed — one failure doesn't stop the rest.
    }
  }

  return persisted;
}
