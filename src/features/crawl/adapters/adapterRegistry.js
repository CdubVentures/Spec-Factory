// WHY: Registry-driven adapter resolution. Adding a new fetcher tool = import + one line here.

import { createCrawleeAdapter } from './crawleeAdapter.js';

export const ADAPTER_REGISTRY = Object.freeze({
  crawlee: { name: 'crawlee', create: createCrawleeAdapter },
});

export function resolveAdapter(adapterName) {
  const entry = ADAPTER_REGISTRY[adapterName];
  if (!entry) {
    throw new Error(
      `Unknown fetcher adapter: "${adapterName}". Available: ${Object.keys(ADAPTER_REGISTRY).join(', ')}`,
    );
  }
  return entry;
}
