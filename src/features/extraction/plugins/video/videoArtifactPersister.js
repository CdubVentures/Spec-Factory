// WHY: Persists video recordings to {runDir}/video/ so they survive the 24h
// temp cleanup and can be served by the video API endpoint after archival.
// Mirrors screenshotArtifactPersister.js — DI-injected into crawlSession via
// onVideoPersist callback to avoid cross-feature imports.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

function contentHash(filePath) {
  const bytes = fs.readFileSync(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * @param {{ videoPath: string, videoDir: string, workerId: string, url: string, insertVideo?: function, runContext?: { category: string, productId: string, runId: string, host: string } }} opts
 * @returns {{ filename: string, worker_id: string, size_bytes: number, format: string, captured_at: string, content_hash: string } | null}
 */
export function persistVideoArtifact({ videoPath, videoDir, workerId, url, insertVideo, runContext }) {
  const wid = String(workerId || '').trim();
  if (!wid || !videoPath) return null;

  try {
    if (!fs.existsSync(videoPath)) return null;
  } catch {
    return null;
  }

  const filename = `${wid}.webm`;

  try {
    fs.mkdirSync(videoDir, { recursive: true });
    const destPath = path.join(videoDir, filename);
    fs.copyFileSync(videoPath, destPath);

    const stat = fs.statSync(destPath);
    const hash = contentHash(destPath);

    const record = {
      filename,
      file_path: destPath,
      worker_id: wid,
      size_bytes: stat.size,
      format: 'webm',
      captured_at: new Date().toISOString(),
      content_hash: hash,
    };

    if (typeof insertVideo === 'function' && runContext) {
      try {
        insertVideo({
          video_id: hash,
          content_hash: hash,
          category: runContext.category || '',
          product_id: runContext.productId || '',
          run_id: runContext.runId || '',
          source_url: String(url || ''),
          host: runContext.host || '',
          worker_id: wid,
          format: 'webm',
          width: 0,
          height: 0,
          size_bytes: stat.size,
          duration_ms: 0,
          file_path: destPath,
          captured_at: record.captured_at,
        });
      } catch {
        // WHY: SQL failure must not prevent video persistence.
      }
    }

    return record;
  } catch {
    return null;
  }
}
