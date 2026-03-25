// WHY: Convention-based video file path resolution for the runtime ops video endpoint.
// Both the crawl session (writing) and API endpoint (reading) use the same convention:
//   os.tmpdir()/spec-factory-crawl-videos/{runId}/{workerId}.webm

import path from 'node:path';
import os from 'node:os';

export const CRAWL_VIDEO_BASE_DIR = path.join(os.tmpdir(), 'spec-factory-crawl-videos');

function isUnsafePath(value) {
  if (!value) return true;
  if (path.isAbsolute(value)) return true;
  const normalized = String(value).replace(/\\/g, '/');
  return normalized.split('/').includes('..');
}

export function resolveVideoFilePath(runId, workerId) {
  if (isUnsafePath(runId) || isUnsafePath(workerId)) return null;
  return path.join(CRAWL_VIDEO_BASE_DIR, runId, `${workerId}.webm`);
}
