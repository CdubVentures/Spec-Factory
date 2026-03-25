// WHY: Thin adapter wrapping the existing Crawlee/Playwright engine.
// The adapter layer is the abstraction boundary; crawlSession.js stays untouched.

import { createCrawlSession } from '../crawlSession.js';

export function createCrawleeAdapter({ settings, plugins, logger, onScreencastFrame, _crawlerFactory }) {
  return createCrawlSession({ settings, plugins, logger, onScreencastFrame, _crawlerFactory });
}
