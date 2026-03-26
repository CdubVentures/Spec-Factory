// WHY: Video file resolution for the runtime ops video endpoint.
// Videos are saved as {workerId}.webm by the postPageCloseHook in crawlSession.
// Falls back to manifest.json lookup for legacy runs, then auto-generates
// a manifest from directory contents as a last resort.

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

  // Primary: direct {workerId}.webm (written by postPageCloseHook)
  const directPath = path.join(runDir, `${workerId}.webm`);
  if (fsSync.existsSync(directPath)) return directPath;

  // Fallback: manifest.json from legacy runs
  try {
    const raw = fsSync.readFileSync(path.join(runDir, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(raw);
    const filename = manifest[workerId];
    if (filename && !isUnsafePath(filename)) {
      const resolved = path.join(runDir, filename);
      if (fsSync.existsSync(resolved)) return resolved;
    }
  } catch { /* no manifest */ }

  return null;
}
