function normalizeMode(mode, fallbackMode = '') {
  return String(mode || fallbackMode || '').trim().toLowerCase() || 'playwright';
}

export function createModeAwareFetcherRegistry({
  initialFetcher = null,
  initialMode = '',
  createFetcherForModeFn = () => null,
  startFetcherFn = async (fetcher) => fetcher?.start?.(),
  stopFetcherFn = async (fetcher) => fetcher?.stop?.(),
} = {}) {
  const baseMode = normalizeMode(initialMode);
  const fetchersByMode = new Map();
  const stoppedFetchers = new Set();

  if (initialFetcher) {
    fetchersByMode.set(baseMode, initialFetcher);
  }

  const resolveFetcher = async (mode = '') => {
    const resolvedMode = normalizeMode(mode, baseMode);
    if (fetchersByMode.has(resolvedMode)) {
      return fetchersByMode.get(resolvedMode);
    }

    const nextFetcher = createFetcherForModeFn(resolvedMode);
    if (!nextFetcher) {
      throw new Error(`Unsupported fetcher mode: ${resolvedMode}`);
    }

    await startFetcherFn(nextFetcher, resolvedMode);
    fetchersByMode.set(resolvedMode, nextFetcher);
    return nextFetcher;
  };

  return {
    async fetchWithMode(source = {}, mode = '') {
      const fetcher = await resolveFetcher(mode);
      return fetcher.fetch(source);
    },
    async stopAll() {
      for (const fetcher of fetchersByMode.values()) {
        if (!fetcher || stoppedFetchers.has(fetcher)) {
          continue;
        }
        stoppedFetchers.add(fetcher);
        await stopFetcherFn(fetcher);
      }
    },
  };
}
