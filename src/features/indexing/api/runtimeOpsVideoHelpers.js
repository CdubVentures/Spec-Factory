// WHY: Self-healing video file resolution for the runtime ops video endpoint.
// Tries manifest.json first. If missing or incomplete, auto-generates the
// manifest from .webm files sorted by mtime (matching worker processing order).
// This makes the feature resilient — even if the crawl pipeline fails to write
// the manifest, videos are still served correctly.

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

function autoGenerateManifest(runDir) {
  try {
    const files = fsSync.readdirSync(runDir)
      .filter((f) => f.endsWith('.webm'))
      .map((f) => {
        try {
          return { name: f, mtimeMs: fsSync.statSync(path.join(runDir, f)).mtimeMs };
        } catch { return { name: f, mtimeMs: 0 }; }
      })
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

    if (files.length === 0) return null;

    const manifest = {};
    files.forEach((f, i) => { manifest[`fetch-${i + 1}`] = f.name; });

    // WHY: Persist so subsequent requests don't regenerate.
    try {
      fsSync.writeFileSync(
        path.join(runDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
      );
    } catch { /* non-critical */ }

    return manifest;
  } catch { return null; }
}

function loadOrGenerateManifest(runDir) {
  // Try reading existing manifest
  try {
    const raw = fsSync.readFileSync(path.join(runDir, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(raw);
    if (manifest && typeof manifest === 'object' && Object.keys(manifest).length > 0) {
      return manifest;
    }
  } catch { /* missing or corrupt */ }

  // Self-heal: generate from directory contents
  return autoGenerateManifest(runDir);
}

export function resolveVideoFilePath(runId, workerId) {
  if (isUnsafePath(runId) || isUnsafePath(workerId)) return null;

  const runDir = path.join(CRAWL_VIDEO_BASE_DIR, runId);

  // Direct convention name (legacy)
  const directPath = path.join(runDir, `${workerId}.webm`);
  if (fsSync.existsSync(directPath)) return directPath;

  // Manifest lookup (with auto-generation fallback)
  const manifest = loadOrGenerateManifest(runDir);
  if (!manifest) return null;

  const filename = manifest[workerId];
  if (filename && !isUnsafePath(filename)) {
    const resolved = path.join(runDir, filename);
    if (fsSync.existsSync(resolved)) return resolved;
  }

  return null;
}
