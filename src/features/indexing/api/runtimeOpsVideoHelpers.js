// WHY: Video file resolution for the runtime ops video endpoint.
// Videos are saved as {workerId}.webm by the postPageCloseHook in crawlSession.
// Primary: temp dir (fast, during run). Durable fallback: {runDir}/video/ (post-TTL).
// Legacy fallback: manifest.json lookup for old runs with UUID filenames.

import path from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';
import { defaultIndexLabRoot } from '../../../core/config/runtimeArtifactRoots.js';

export const CRAWL_VIDEO_BASE_DIR = path.join(os.tmpdir(), 'spec-factory-crawl-videos');

function isUnsafePath(value) {
  if (!value) return true;
  if (path.isAbsolute(value)) return true;
  const normalized = String(value).replace(/\\/g, '/');
  return normalized.split('/').includes('..');
}

export function resolveVideoFilePath(runId, workerId) {
  if (isUnsafePath(runId) || isUnsafePath(workerId)) return null;

  // Primary: temp dir (fast cache during run, 24h TTL)
  const tempDir = path.join(CRAWL_VIDEO_BASE_DIR, runId);
  const directPath = path.join(tempDir, `${workerId}.webm`);
  if (fsSync.existsSync(directPath)) return directPath;

  // Durable: {indexLabRoot}/{runId}/video/ (persisted by onVideoPersist)
  try {
    const durablePath = path.join(defaultIndexLabRoot(), runId, 'video', `${workerId}.webm`);
    if (fsSync.existsSync(durablePath)) return durablePath;
  } catch { /* indexlab root may not exist */ }

  // Legacy: manifest.json from old runs with UUID filenames
  try {
    const raw = fsSync.readFileSync(path.join(tempDir, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(raw);
    const filename = manifest[workerId];
    if (filename && !isUnsafePath(filename)) {
      const resolved = path.join(tempDir, filename);
      if (fsSync.existsSync(resolved)) return resolved;
    }
  } catch { /* no manifest */ }

  return null;
}
