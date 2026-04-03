// WHY: Rebuild source_screenshots and source_videos SQL index tables from files
// on disk after a spec.sqlite rebuild. The checkpoint run.json provides the
// source→worker mapping; filenames encode worker_id + urlHash8 for disambiguation.
// Best-effort: individual insert failures are logged, not thrown.

import { createHash } from 'node:crypto';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

function urlHash8(url) {
  return createHash('sha256').update(String(url || '')).digest('hex').slice(0, 8);
}

// WHY: Worker IDs like "fetch-1" contain hyphens. The regex uses a lazy match
// before the fixed 8-char hex hash anchor to handle variable-length IDs.
const SCREENSHOT_RE = /^screenshot-(.+?)-([a-f0-9]{8})-(\d+)-(.+)\.(jpg|png)$/;
const VIDEO_RE = /^(.+)\.webm$/;

function buildWorkerSourceMap(sources) {
  const map = new Map();
  for (const src of sources) {
    const wid = String(src.worker_id || '').trim();
    if (!wid) continue;
    const list = map.get(wid) || [];
    list.push(src);
    map.set(wid, list);
  }
  return map;
}

function resolveSourceForScreenshot(workerMap, workerId, fileHash8) {
  const candidates = workerMap.get(workerId);
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  for (const src of candidates) {
    if (urlHash8(src.url) === fileHash8) return src;
  }
  return candidates[0];
}

function extractHost(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

async function listFilesInDir(dirPath) {
  try {
    const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function fileSizeBytes(filePath) {
  try {
    const stat = await fsPromises.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

export async function rebuildMediaIndexesFromDisk({ specDb, runDir, checkpoint }) {
  const stats = { screenshots_seeded: 0, videos_seeded: 0 };
  if (!specDb || !runDir || !checkpoint) return stats;

  const sources = Array.isArray(checkpoint.sources) ? checkpoint.sources : [];
  const workerMap = buildWorkerSourceMap(sources);
  const run = checkpoint.run || {};
  const category = run.category || '';
  const productId = run.product_id || '';
  const runId = run.run_id || '';
  const capturedAt = checkpoint.created_at || new Date().toISOString();

  // ── Screenshots ──
  const ssDir = path.join(runDir, checkpoint.artifacts?.screenshot_dir || 'screenshots');
  const ssFiles = await listFilesInDir(ssDir);
  for (const filename of ssFiles) {
    const m = SCREENSHOT_RE.exec(filename);
    if (!m) continue;
    const [, workerId, fileHash8, , kind, ext] = m;
    const source = resolveSourceForScreenshot(workerMap, workerId, fileHash8);
    if (!source) continue;
    const filePath = path.join(ssDir, filename);
    const sizeBytes = await fileSizeBytes(filePath);
    try {
      specDb.insertScreenshot({
        screenshot_id: `${runId}-${filename}`,
        content_hash: source.content_hash || '',
        category,
        product_id: productId,
        run_id: runId,
        source_url: source.url || '',
        host: extractHost(source.url),
        selector: kind,
        format: ext,
        width: 0,
        height: 0,
        size_bytes: sizeBytes,
        file_path: filePath,
        captured_at: capturedAt,
        doc_kind: 'other',
        source_tier: 5,
      });
      stats.screenshots_seeded++;
    } catch { /* best-effort */ }
  }

  // ── Videos ──
  const vidDir = path.join(runDir, checkpoint.artifacts?.video_dir || 'video');
  const vidFiles = await listFilesInDir(vidDir);
  for (const filename of vidFiles) {
    const m = VIDEO_RE.exec(filename);
    if (!m) continue;
    const [, workerId] = m;
    const candidates = workerMap.get(workerId);
    const source = candidates?.[0] || null;
    if (!source) continue;
    const filePath = path.join(vidDir, filename);
    const sizeBytes = await fileSizeBytes(filePath);
    try {
      specDb.insertVideo({
        video_id: `${runId}-${filename}`,
        content_hash: source.content_hash || '',
        category,
        product_id: productId,
        run_id: runId,
        source_url: source.url || '',
        host: extractHost(source.url),
        worker_id: workerId,
        format: 'webm',
        width: 0,
        height: 0,
        size_bytes: sizeBytes,
        duration_ms: 0,
        file_path: filePath,
        captured_at: capturedAt,
      });
      stats.videos_seeded++;
    } catch { /* best-effort */ }
  }

  return stats;
}
