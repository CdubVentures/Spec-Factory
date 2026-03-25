// WHY: Manifest-based video file resolution for the runtime ops video endpoint.
// The crawl session writes a manifest.json mapping workerId → UUID filename.
// The API reads the manifest to resolve the actual file path.

import path from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';

export const CRAWL_VIDEO_BASE_DIR = path.join(os.tmpdir(), 'spec-factory-crawl-videos');

function isUnsafePath(value) {
  if (!value) return true;
  if (path.isAbsolute(value)) return true;
  const normalized = String(value).replace(/\\/g, '/');
  return normalized.split('/').includes('..');
}

export function resolveVideoFilePath(runId, workerId) {
  if (isUnsafePath(runId) || isUnsafePath(workerId)) return null;

  const runDir = path.join(CRAWL_VIDEO_BASE_DIR, runId);

  // WHY: First check for a direct convention-named file (legacy/fallback).
  const directPath = path.join(runDir, `${workerId}.webm`);
  if (fsSync.existsSync(directPath)) return directPath;

  // WHY: Read manifest.json written by crawlSession after each batch.
  // The manifest maps workerId → Playwright's UUID filename.
  try {
    const manifestPath = path.join(runDir, 'manifest.json');
    const raw = fsSync.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);
    const filename = manifest[workerId];
    if (filename && !isUnsafePath(filename)) {
      const resolved = path.join(runDir, filename);
      if (fsSync.existsSync(resolved)) return resolved;
    }
  } catch { /* manifest missing or malformed — no video available */ }

  return null;
}
