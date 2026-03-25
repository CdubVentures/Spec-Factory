/**
 * Persistent Crawlee-based crawl session.
 * ONE PlaywrightCrawler with maxConcurrency controlling parallel browser pages.
 * Each URL gets a named worker slot (fetch-a1, fetch-b2, ...) for GUI visibility.
 * Plugin lifecycle hooks run inside the requestHandler for each page.
 */

import path from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';
import { createPluginRunner } from './core/pluginRunner.js';

export function createCrawlSession({ settings = {}, plugins = [], logger, onScreencastFrame, _crawlerFactory } = {}) {
  const runner = createPluginRunner({ plugins, logger });
  const pending = new Map();
  const workerIds = new Map();
  const videoPathMap = new Map();
  let videoDir = '';
  let crawler = null;

  const slotCount = Number(settings.crawlMaxConcurrentSlots) || 4;
  let globalSeq = 0;

  function assignWorkerId(uniqueKey) {
    globalSeq++;
    const workerId = `fetch-${globalSeq}`;
    workerIds.set(uniqueKey, workerId);
    return workerId;
  }

  function resolveEntry(uniqueKey, result) {
    const entry = pending.get(uniqueKey);
    if (entry) {
      entry.resolve(result);
      pending.delete(uniqueKey);
    }
    workerIds.delete(uniqueKey);
  }

  function rejectEntry(uniqueKey, error) {
    const entry = pending.get(uniqueKey);
    if (entry) {
      entry.reject(error);
      pending.delete(uniqueKey);
    }
    workerIds.delete(uniqueKey);
  }

  function buildCrawlerConfig() {
    return {
      maxConcurrency: slotCount,

      // WHY: Disable Crawlee's built-in block detection. Crawlee throws
      // _throwOnBlockedRequest for 403/429 BEFORE requestHandler fires,
      // causing unhandled rejections. We detect blocks ourselves in
      // bypassStrategies.js after capturing the page content.
      retryOnBlocked: false,

      requestHandler: async ({ page, request, response }) => {
        const workerId = workerIds.get(request.uniqueKey) || 'fetch-x0';
        const ctx = { page, request, response, settings, workerId };

        // WHY: Event name must be 'source_fetch_started' — the runtime bridge
        // (runtimeBridgeEventHandlers.js) listens for this, not 'fetch_started'.
        // The bridge re-emits as 'fetch_started' to the GUI worker pool builder.
        logger?.info?.('source_fetch_started', {
          url: request.url,
          host: new URL(request.url).hostname,
          fetcher_kind: 'crawlee',
          worker_id: workerId,
        });

        await runner.runHook('beforeNavigate', ctx);
        await runner.runHook('afterNavigate', ctx);
        await runner.runHook('onInteract', ctx);

        const html = await page.content();
        const finalUrl = page.url?.() ?? request.url;
        const title = await page.title().catch(() => '');
        const status = typeof response?.status === 'function'
          ? response.status()
          : (response?.status ?? 200);

        const captureCtx = { ...ctx, html, finalUrl, title, status };
        await runner.runHook('onCapture', captureCtx);

        // WHY: Emit a screencast frame from the last screenshot so the GUI
        // live view shows what the browser is seeing during the active fetch.
        if (typeof onScreencastFrame === 'function') {
          const shots = captureCtx.screenshots ?? [];
          const shot = shots.findLast((s) => s.kind === 'page') || shots[shots.length - 1];
          if (shot?.bytes) {
            const data = Buffer.isBuffer(shot.bytes)
              ? shot.bytes.toString('base64')
              : String(shot.bytes);
            onScreencastFrame({
              worker_id: workerId,
              data,
              width: shot.width || 0,
              height: shot.height || 0,
              ts: shot.captured_at || new Date().toISOString(),
            });
          }
        }

        // WHY: Store the Video object (not the path) so we can call video.saveAs()
        // after c.run() completes and pages are closed. saveAs() waits for the
        // video to be finalized and copies it to the target path — more reliable
        // than renaming UUID-named files.
        const videoObj = page.video?.();
        if (videoObj) videoPathMap.set(workerId, videoObj);

        const result = {
          url: request.url,
          finalUrl,
          status,
          title,
          html,
          screenshots: captureCtx.screenshots ?? [],
          workerId,
          videoPath: '',
        };

        await runner.runHook('onComplete', { ...ctx, result });

        // WHY: 'source_processed' is the event the bridge uses to mark
        // fetch complete and populate the worker's docs_processed count.
        logger?.info?.('source_processed', {
          url: request.url,
          final_url: finalUrl,
          status,
          fetch_ms: 0,
          fetcher_kind: 'crawlee',
          worker_id: workerId,
          host: new URL(request.url).hostname,
        });

        resolveEntry(request.uniqueKey, result);
      },

      // WHY: Crawlee v3 passes error as second argument, not inside the context object.
      failedRequestHandler: async ({ request }, error) => {
        const workerId = workerIds.get(request.uniqueKey) || 'fetch-x0';
        const errMsg = error?.message || 'unknown_error';
        logger?.info?.('source_fetch_failed', {
          url: request.url,
          status: 0,
          message: errMsg,
          fetcher_kind: 'crawlee',
          worker_id: workerId,
        });
        // WHY: Resolve with error result instead of rejecting — prevents
        // unhandled rejection crashes. The lifecycle classifies the block.
        resolveEntry(request.uniqueKey, {
          url: request.url,
          finalUrl: request.url,
          status: 0,
          title: '',
          html: '',
          screenshots: [],
          workerId,
          videoPath: '',
          fetchError: errMsg,
        });
      },

      // WHY: Crawlee's errorHandler fires for non-fatal errors (retryable).
      // Suppress to prevent noise — failedRequestHandler handles final failures.
      errorHandler: async () => {},
    };
  }

  function ensureCrawler() {
    if (!crawler) {
      const config = buildCrawlerConfig();
      if (_crawlerFactory) {
        crawler = _crawlerFactory(config);
      } else {
        throw new Error('Real Crawlee integration requires _crawlerFactory or async start()');
      }
    }
    return crawler;
  }

  // WHY: Use Playwright's video.saveAs() to copy finalized videos to the
  // convention-based path ({videoDir}/{workerId}.webm). saveAs() waits for
  // the video to be fully written — more reliable than renaming UUID files.
  async function saveVideoFiles() {
    if (!videoDir) return;
    for (const [wid, videoObj] of videoPathMap) {
      try {
        const finalPath = path.join(videoDir, `${wid}.webm`);
        if (typeof videoObj?.saveAs === 'function') {
          await videoObj.saveAs(finalPath);
        }
      } catch { /* swallow — video might not exist if recording/page failed */ }
    }
    videoPathMap.clear();
  }

  async function start() {
    if (crawler) return;

    if (_crawlerFactory) {
      const config = buildCrawlerConfig();
      crawler = _crawlerFactory(config);
      return;
    }

    const { PlaywrightCrawler } = await import('crawlee');
    const config = buildCrawlerConfig();

    const headless = settings.crawleeHeadless !== false && settings.crawleeHeadless !== 'false';
    const handlerTimeoutSecs = Number(settings.crawleeRequestHandlerTimeoutSecs) || 75;
    // WHY: Resolve registry settings → settings bag → fallback constant.
    const navTimeoutMs = Number(settings.crawleeNavigationTimeoutMs) || 12000;
    // WHY: 0 is a valid value for maxRetries (no retries), so can't use `|| 1`.
    const maxRetries = settings.crawleeMaxRequestRetries != null ? Number(settings.crawleeMaxRequestRetries) : 1;
    const maxPages = Number(settings.crawleeMaxPagesPerBrowser) || 1;
    const retireAfter = Number(settings.crawleeBrowserRetirePageCount) || 5;

    // WHY: Playwright recordVideo requires useIncognitoPages=true because Crawlee's
    // BrowserPool only forwards pageOptions to browser.newPage() in incognito mode
    // (browser-pool.js line 382). Without it, recordVideo is silently discarded.
    const videoEnabled = settings.crawlVideoRecordingEnabled === true || settings.crawlVideoRecordingEnabled === 'true';
    const runId = String(settings.runId || '').trim();
    let videoSize = { width: 1280, height: 720 };
    if (videoEnabled && runId) {
      const sizeRaw = String(settings.crawlVideoRecordingSize || '1280x720');
      const [vw, vh] = sizeRaw.split('x').map(Number);
      videoSize = { width: vw || 1280, height: vh || 720 };
      videoDir = path.join(os.tmpdir(), 'spec-factory-crawl-videos', runId);
      fsSync.mkdirSync(videoDir, { recursive: true });
    }

    crawler = new PlaywrightCrawler({
      ...config,
      maxRequestRetries: maxRetries,
      requestHandlerTimeoutSecs: handlerTimeoutSecs,
      // WHY: Empty blockedStatusCodes prevents Crawlee from throwing
      // _throwOnBlockedRequest for 403/429 BEFORE requestHandler fires.
      // We detect and handle blocks ourselves in bypassStrategies.js.
      sessionPoolOptions: { blockedStatusCodes: [] },
      launchContext: {
        launchOptions: { headless },
        ...(videoDir ? { useIncognitoPages: true } : {}),
      },
      browserPoolOptions: {
        useFingerprints: true,
        maxOpenPagesPerBrowser: maxPages,
        retireBrowserAfterPageCount: retireAfter,
        ...(videoDir ? {
          prePageCreateHooks: [
            (_pageId, _browserController, pageOptions) => {
              pageOptions.recordVideo = { dir: videoDir, size: videoSize };
            },
          ],
        } : {}),
      },
      preNavigationHooks: [
        async ({ request, page }, gotoOptions) => {
          gotoOptions.waitUntil = 'domcontentloaded';
          gotoOptions.timeout = navTimeoutMs;
        },
      ],
    });
  }

  async function processUrl(url) {
    const c = ensureCrawler();
    const uniqueKey = `${url}::${Date.now()}::${Math.random().toString(36).slice(2, 10)}`;
    assignWorkerId(uniqueKey);

    const promise = new Promise((resolve, reject) => {
      pending.set(uniqueKey, { resolve, reject });
    });

    await c.run([{ url, uniqueKey }]);
    await saveVideoFiles();

    const stale = pending.get(uniqueKey);
    if (stale) {
      stale.reject(new Error('crawl_no_response'));
      pending.delete(uniqueKey);
    }

    return promise;
  }

  async function processBatch(urls, { workerIdMap } = {}) {
    const c = ensureCrawler();
    const requests = [];
    const promises = [];

    for (const url of urls) {
      const uniqueKey = `${url}::${Date.now()}::${Math.random().toString(36).slice(2, 10)}`;
      const preAssigned = workerIdMap?.get(url);
      if (preAssigned) {
        workerIds.set(uniqueKey, preAssigned);
      } else {
        assignWorkerId(uniqueKey);
      }
      requests.push({ url, uniqueKey });
      promises.push(new Promise((resolve, reject) => {
        pending.set(uniqueKey, { resolve, reject });
      }));
    }

    await c.run(requests);
    await saveVideoFiles();

    // Resolve any stale entries (Crawlee silently dropped them)
    for (const req of requests) {
      const stale = pending.get(req.uniqueKey);
      if (stale) {
        stale.resolve({
          url: req.url, finalUrl: req.url, status: 0, title: '', html: '',
          screenshots: [], workerId: workerIds.get(req.uniqueKey) || 'fetch-x0',
          videoPath: '', fetchError: 'crawl_no_response',
        });
        pending.delete(req.uniqueKey);
      }
      workerIds.delete(req.uniqueKey);
    }

    return Promise.allSettled(promises);
  }

  async function shutdown() {
    if (crawler) {
      await crawler.teardown?.();
      crawler = null;
    }
  }

  return { start, processUrl, processBatch, shutdown, slotCount, get videoDir() { return videoDir; } };
}
