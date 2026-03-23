// WHY: Single source of truth for the DJB2 string hash used by
// searchPlanBuilder, frontierDb, and frontierSqlite. Returns a
// base-36 string for compact storage/lookup keys.

export function stableHashString(value) {
  const text = String(value || '');
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}
