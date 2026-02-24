export interface WorkersTabAutoStopOptions {
  isRunning?: boolean;
  isPrefetchActive?: boolean;
  hasStopBeenRequested?: boolean;
  searchResults?: unknown[];
}

export function shouldAutoStopOnSearchResults(options?: WorkersTabAutoStopOptions): boolean;
