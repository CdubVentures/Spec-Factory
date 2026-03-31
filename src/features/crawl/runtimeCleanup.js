// WHY: Deletes run directories older than maxAgeMs from .workspace/runs/.
// Called on server start to enforce bounded retention.

import fsSync from 'node:fs';
import path from 'node:path';

export function cleanupStaleRunDirs({ baseDir, maxAgeMs }) {
  let entries;
  try {
    entries = fsSync.readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return;
  }

  const cutoff = Date.now() - maxAgeMs;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // WHY: Skip non-run dirs (e.g., 'products/'). Run dirs start with 8+ digits.
    if (!/^\d{8}/.test(entry.name)) continue;
    const dirPath = path.join(baseDir, entry.name);
    try {
      const stat = fsSync.statSync(dirPath);
      if (stat.mtimeMs < cutoff) {
        fsSync.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch { /* swallow — dir may have been removed concurrently */ }
  }
}
