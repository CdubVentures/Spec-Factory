export function shouldAutoStopOnSearchResults({
  isRunning,
  isPrefetchActive,
  hasStopBeenRequested,
  searchResults,
} = {}) {
  if (!isRunning) return false;
  if (!isPrefetchActive) return false;
  if (hasStopBeenRequested) return false;
  return Array.isArray(searchResults) && searchResults.length > 0;
}
