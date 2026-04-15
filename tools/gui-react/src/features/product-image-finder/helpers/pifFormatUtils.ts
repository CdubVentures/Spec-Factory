/** Format byte count to human-readable string (B / KB / MB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format pixel dimensions as "W×H". Returns empty string if both are 0. */
export function formatDims(w: number, h: number): string {
  if (!w && !h) return '';
  return `${w}\u00D7${h}`;
}
