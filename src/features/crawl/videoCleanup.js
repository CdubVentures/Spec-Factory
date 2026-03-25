// WHY: Deletes crawl video directories older than maxAgeMs from the temp storage.
// Called on server start and periodically to enforce the 24h TTL.

import fsSync from 'node:fs';
import path from 'node:path';

export function cleanupStaleVideoDirs({ baseDir, maxAgeMs }) {
  let entries;
  try {
    entries = fsSync.readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return;
  }

  const cutoff = Date.now() - maxAgeMs;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(baseDir, entry.name);
    try {
      const stat = fsSync.statSync(dirPath);
      if (stat.mtimeMs < cutoff) {
        fsSync.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch { /* swallow — dir may have been removed concurrently */ }
  }
}
