export type BrowserPoolStatus = 'idle' | 'warming' | 'ready';

export interface BrowserPoolState {
  readonly status: BrowserPoolStatus;
  readonly browsersNeeded: number;
  readonly pagesPerBrowser: number;
  readonly totalSlots: number;
  readonly activeFetchSlots: number;
}

/** Backend browser_pool metadata shape (from summary API). */
export interface BrowserPoolMeta {
  readonly status?: string;
  readonly browsers?: number;
  readonly slots?: number;
  readonly pages_per_browser?: number;
}

/**
 * Derive browser pool warm-up status.
 * Uses backend `browserPoolMeta` as primary signal (set by bridge events),
 * falls back to worker-derived status when meta is unavailable.
 */
export function deriveBrowserPoolState(
  workers: ReadonlyArray<{ pool: string; state: string }>,
  slotCount: number,
  browserPoolMeta?: BrowserPoolMeta | null,
): BrowserPoolState {
  const pagesPerBrowser = browserPoolMeta?.pages_per_browser || Math.min(slotCount, 4);
  const browsersNeeded = browserPoolMeta?.browsers || Math.ceil(slotCount / pagesPerBrowser);
  const totalSlots = browsersNeeded * pagesPerBrowser;

  const activeFetchSlots = workers.filter(
    (w) => w.pool === 'fetch' && w.state !== 'queued',
  ).length;

  // Backend event is the source of truth when available
  const metaStatus = browserPoolMeta?.status;
  let status: BrowserPoolStatus;
  if (metaStatus === 'warming') {
    status = 'warming';
  } else if (metaStatus === 'ready') {
    // Backend says ready — trust it even if workers haven't all shown up yet
    status = activeFetchSlots >= slotCount ? 'ready' : 'warming';
  } else {
    // No backend signal — derive from workers
    status = activeFetchSlots === 0 ? 'idle'
      : activeFetchSlots >= slotCount ? 'ready'
        : 'warming';
  }

  return { status, browsersNeeded, pagesPerBrowser, totalSlots, activeFetchSlots };
}
