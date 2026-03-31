// WHY: Caps settings snapshots to maxCount most recent files.
// Called on server start to prevent unbounded accumulation.

import fsSync from 'node:fs';
import path from 'node:path';

export function cleanupOldSnapshots({ dir, maxCount = 10 }) {
  let entries;
  try {
    entries = fsSync.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(dir, entry.name);
    try {
      const stat = fsSync.statSync(filePath);
      files.push({ path: filePath, mtimeMs: stat.mtimeMs });
    } catch { /* skip unreadable */ }
  }

  if (files.length <= maxCount) return;

  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const file of files.slice(maxCount)) {
    try {
      fsSync.unlinkSync(file.path);
    } catch { /* swallow */ }
  }
}
