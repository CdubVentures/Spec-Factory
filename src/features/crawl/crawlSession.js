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
import { classifyBlockStatus } from './bypassStrategies.js';

// WHY: Eager import — Crawlee takes ~1.2s to import (heavy deps: playwright,
// fingerprint-suite, proxy-chain). Starting the import at module load time
// means it's ready by the time session.start() is called, saving ~1s.
const _crawleeImport = import('crawlee').catch(() => null);

// WHY: Parses JSON array of proxy URLs from settings. Same pattern as
// searchProviders.js:parseProxyUrlList. Trust boundary — user JSON input.
export function parseProxyUrls(jsonStr) {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed.filter((u) => typeof u === 'string' && u.trim()) : [];
  } catch { return []; }
}

export function createCrawlSession({ settings = {}, plugins = [], extractionRunner, logger, onScreencastFrame, _crawlerFactory } = {}) {
  const runner = createPluginRunner({ plugins, logger });
  const pending = new Map();
  const workerIds = new Map();
  // WHY: WeakMap so page references don't leak after GC. Maps page → workerId
  // so prePageCloseHook can save the video with the correct filename.
  const pageWorkerMap = new WeakMap();
  const cdpSessionMap = new WeakMap();
  const pendingVideoSaves = [];
  let crawler = null;
  // WHY: Lazy proxy crawler — created once on first retryWithProxy call, reused
  // across batches. Avoids 2-5s cold browser launch per proxy retry batch.
  let _proxyCrawler = null;

  // WHY: Compute video dir at session creation (not in start()) so it's
  // available regardless of whether real Playwright or _crawlerFactory is used.
  const videoEnabled = settings.crawlVideoRecordingEnabled === true || settings.crawlVideoRecordingEnabled === 'true';
  const videoRunId = String(settings.runId || '').trim();
  const videoDir = (videoEnabled && videoRunId)
    ? path.join(os.tmpdir(), 'spec-factory-crawl-videos', videoRunId)
    : '';
  if (videoDir) {
    fsSync.mkdirSync(videoDir, { recursive: true });
  }

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

      requestHandler: async ({ page, request, response, session, proxyInfo }) => {
        // WHY: Warmup requests force browser pool pre-launch at run start.
        // Resolve immediately — no plugins, no extraction, no logging.
        if (request.userData?.__warmup) {
          resolveEntry(request.uniqueKey, { __warmup: true });
          return;
        }

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
          retry_count: request.retryCount ?? 0,
          proxy_url: proxyInfo?.url || '',
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

        // WHY: Detect blocks BEFORE extraction so Crawlee can retry with a new
        // session (fresh fingerprint/cookies). Do NOT resolveEntry here — let
        // Crawlee retry with session rotation first. If retry succeeds, the normal
        // success path resolves. If all retries fail, failedRequestHandler resolves
        // with the block info stored on request.userData.
        const { blocked, blockReason } = classifyBlockStatus({ status, html });
        if (blocked) {
          if (blockReason === 'robots_blocked') request.noRetry = true;
          session?.retire();
          request.userData.__blockInfo = { blocked: true, blockReason, status, html, title, finalUrl };
          throw new Error(`blocked:${blockReason}`);
        }

        const captureCtx = { ...ctx, html, finalUrl, title, status };
        try { await runner.runHook('onCapture', captureCtx); }
        catch (err) { logger?.warn?.('hook_error', { hook: 'onCapture', url: request.url, error: err?.message }); }

        // WHY: Extraction plugins fire concurrently after all fetch hooks complete.
        // Each plugin receives a frozen context — no shared mutation.
        let extractions = {};
        try {
          extractions = extractionRunner
            ? await extractionRunner.runExtractions(captureCtx)
            : {};
        } catch (err) {
          logger?.warn?.('extraction_error', { url: request.url, error: err?.message });
        }

        // WHY: Emit a screencast frame from the last screenshot so the GUI
        // live view shows what the browser is seeing during the active fetch.
        try {
          if (typeof onScreencastFrame === 'function') {
            const shots = extractions.screenshot?.screenshots ?? captureCtx.screenshots ?? [];
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
        } catch (err) {
          logger?.warn?.('screencast_error', { url: request.url, error: err?.message });
        }

        // WHY: Map this page to its workerId so the postPageCloseHook can
        // save the video with the correct filename after the page closes.
        if (videoDir) pageWorkerMap.set(page, workerId);

        // WHY: Stop CDP screencast — page processing is done. The retained
        // frame from the screenshot emission above serves as the final image.
        const cdp = cdpSessionMap.get(page);
        if (cdp) {
          try { await cdp.send('Page.stopScreencast'); } catch {}
          try { await cdp.detach(); } catch {}
        }

        const result = {
          url: request.url,
          finalUrl,
          status,
          title,
          html,
          screenshots: extractions.screenshot?.screenshots ?? captureCtx.screenshots ?? [],
          extractions,
          workerId,
          videoPath: '',
        };

        try { await runner.runHook('onComplete', { ...ctx, result }); }
        catch (err) { logger?.warn?.('hook_error', { hook: 'onComplete', url: request.url, error: err?.message }); }

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
          retry_count: request.retryCount ?? 0,
        });
        // WHY: Resolve with error result instead of rejecting — prevents
        // unhandled rejection crashes. Include block info from the handler if
        // available so the lifecycle can classify and trigger proxy retry.
        const blockInfo = request.userData?.__blockInfo;
        resolveEntry(request.uniqueKey, blockInfo ? {
          url: request.url,
          finalUrl: blockInfo.finalUrl || request.url,
          status: blockInfo.status || 0,
          title: blockInfo.title || '',
          html: blockInfo.html || '',
          screenshots: [], workerId, videoPath: '',
          blocked: true,
          blockReason: blockInfo.blockReason || '',
          fetchError: errMsg,
        } : {
          url: request.url, finalUrl: request.url, status: 0,
          title: '', html: '', screenshots: [],
          workerId, videoPath: '', fetchError: errMsg,
        });
      },

      // WHY: Crawlee's errorHandler fires before each retry. Emit a signal
      // so the GUI worker tab shows RETRY badge during retry attempts.
      // Non-retryable errors skip retry entirely — fail fast, don't waste time.
      errorHandler: async ({ request }, error) => {
        const msg = error?.message || '';
        // WHY: These errors cannot be resolved by retrying with a new session.
        // Timeouts = server is slow/down, retrying burns another full handler timeout.
        // Downloads = site serves a file. DNS = domain doesn't exist.
        if (
          msg.includes('Download is starting')
          || msg.includes('ERR_NAME_NOT_RESOLVED')
          || msg.includes('ERR_CONNECTION_REFUSED')
          || msg.includes('ERR_CONNECTION_RESET')
          || msg.includes('ERR_TUNNEL_CONNECTION_FAILED')
          || msg.includes('requestHandler timed out')
          || msg.includes('Navigation timed out')
        ) {
          request.noRetry = true;
        }
        // WHY: Only emit retrying signal if an actual retry will happen.
        // noRetry errors go straight to failedRequestHandler — no misleading flash.
        if (!request.noRetry) {
          const workerId = workerIds.get(request.uniqueKey) || 'fetch-x0';
          logger?.info?.('source_fetch_retrying', {
            url: request.url,
            worker_id: workerId,
            retry_count: (request.retryCount ?? 0) + 1,
            error: msg,
          });
        }
      },
    };
  }

  function ensureCrawler() {
    if (!crawler) {
      if (_crawlerFactory) {
        const options = buildFullCrawlerOptions();
        crawler = _crawlerFactory(options);
      } else {
        throw new Error('Real Crawlee integration requires _crawlerFactory or async start()');
      }
    }
    return crawler;
  }


  // WHY: Extracted so _crawlerFactory tests can verify the full config
  // including proxy, session pool, fingerprints — not just handlers.
  function buildFullCrawlerOptions() {
    const config = buildCrawlerConfig();
    const headless = settings.crawleeHeadless !== false && settings.crawleeHeadless !== 'false';
    const handlerTimeoutSecs = Number(settings.crawleeRequestHandlerTimeoutSecs) || 30;
    const navTimeoutMs = Number(settings.crawleeNavigationTimeoutMs) || 12000;
    // WHY: 0 is a valid value for maxRetries (no retries), so can't use `|| 1`.
    // Default 1 — one native retry with session rotation (new fingerprint/cookies).
    // After native retry exhausted, lifecycle calls retryWithProxy as final proxy pass.
    // Total worst case: 30s direct + 30s retry + 30s proxy = 90s per URL.
    const maxRetries = settings.crawleeMaxRequestRetries != null ? Number(settings.crawleeMaxRequestRetries) : 1;
    // WHY: Derived from slotCount — not a user knob. With maxOpenPagesPerBrowser=1,
    // each slot needs its own browser launch (~600ms each), causing 5+ second ramp-up
    // for 16 slots. With 4 pages/browser, only ceil(16/4)=4 browsers launch. Beyond 4
    // pages/browser there are diminishing returns and higher crash blast radius.
    // Incognito pages ensure each page gets its own browser context (cookies, fingerprints).
    const maxPages = Math.min(slotCount, 4);
    const retireAfter = Number(settings.crawleeBrowserRetirePageCount) || 10;
    const sameDomainDelay = Number(settings.crawleeSameDomainDelaySecs) || 0;
    const maxReqPerMin = Number(settings.crawleeMaxRequestsPerMinute) || 0;
    const useSessionPool = settings.crawleeUseSessionPool !== false && settings.crawleeUseSessionPool !== 'false';
    const persistCookies = settings.crawleePersistCookiesPerSession !== false && settings.crawleePersistCookiesPerSession !== 'false';
    const sessionPoolSize = Number(settings.crawleeSessionPoolSize) || 100;
    const sessionMaxUsage = Number(settings.crawleeSessionMaxUsageCount) || 50;
    const sessionMaxAge = Number(settings.crawleeSessionMaxAgeSecs) || 3000;
    const useFingerprints = settings.crawleeUseFingerprints !== false && settings.crawleeUseFingerprints !== 'false';

    // WHY: No ProxyConfiguration on the main crawler. Crawlee's tieredProxyUrls
    // always routes ALL traffic through a local proxy-chain HTTP relay — even for
    // [null] "direct" tier. This breaks HTTPS (ERR_TUNNEL_CONNECTION_FAILED,
    // ERR_CERT_AUTHORITY_INVALID). Instead, main crawler is truly direct (no relay).
    // Blocked URLs are retried via retryWithProxy() with a dedicated proxy crawler.
    const proxyUrls = parseProxyUrls(settings.crawleeProxyUrlsJson);

    let videoSize = { width: 1280, height: 720 };
    if (videoDir) {
      const sizeRaw = String(settings.crawlVideoRecordingSize || '1280x720');
      const [vw, vh] = sizeRaw.split('x').map(Number);
      videoSize = { width: vw || 1280, height: vh || 720 };
    }

    return {
      ...config,
      // WHY: minConcurrency = maxConcurrency skips AutoscaledPool ramp-up.
      // User chose the slot count — start at full capacity immediately.
      minConcurrency: slotCount,
      maxRequestRetries: maxRetries,
      requestHandlerTimeoutSecs: handlerTimeoutSecs,
      ...(maxReqPerMin > 0 ? { maxRequestsPerMinute: maxReqPerMin } : {}),
      useSessionPool,
      persistCookiesPerSession: persistCookies,
      sessionPoolOptions: {
        blockedStatusCodes: [],
        maxPoolSize: sessionPoolSize,
        sessionOptions: {
          maxUsageCount: sessionMaxUsage,
          maxAgeSecs: sessionMaxAge,
        },
      },
      launchContext: {
        launchOptions: { headless },
        // WHY: Always incognito — each page gets its own browser context (cookies,
        // fingerprints, storage). Required for maxOpenPagesPerBrowser > 1 so pages
        // sharing a browser are still isolated. Also needed for video recording.
        useIncognitoPages: true,
      },
      browserPoolOptions: {
        useFingerprints,
        ...(useFingerprints ? {
          fingerprintOptions: {
            fingerprintGeneratorOptions: {
              browsers: ['chrome'],
              operatingSystems: ['windows'],
              devices: ['desktop'],
              locales: ['en-US'],
            },
          },
        } : {}),
        maxOpenPagesPerBrowser: maxPages,
        retireBrowserAfterPageCount: retireAfter,
        ...(videoDir ? {
          prePageCreateHooks: [
            (_pageId, _browserController, pageOptions) => {
              pageOptions.recordVideo = { dir: videoDir, size: videoSize };
            },
          ],
          // WHY: prePageCloseHooks receives the actual page object (postPageCloseHooks
          // only gets a pageId string). We fire-and-forget video.saveAs() — it resolves
          // AFTER the page closes (which happens right after this hook returns).
          // Pending saves are tracked and awaited after c.run() to ensure completion.
          prePageCloseHooks: [
            (page) => {
              const wid = pageWorkerMap.get(page);
              if (!wid) return;
              const video = page.video?.();
              if (!video) return;
              const savePromise = video.saveAs(path.join(videoDir, `${wid}.webm`))
                .catch((err) => {
                  logger?.warn?.('video_save_failed', {
                    worker_id: wid,
                    error: err?.message ?? String(err),
                  });
                });
              pendingVideoSaves.push(savePromise);
            },
          ],
        } : {}),
      },
      preNavigationHooks: [
        async ({ request, page }, gotoOptions) => {
          if (sameDomainDelay > 0) {
            const base = sameDomainDelay * 1000;
            const jitter = Math.floor(Math.random() * base * 0.5);
            await new Promise((r) => setTimeout(r, base + jitter));
          }
          gotoOptions.waitUntil = 'domcontentloaded';
          gotoOptions.timeout = navTimeoutMs;

          // WHY: Start CDP screencast BEFORE page.goto() so the GUI shows the
          // page loading in real-time. Gated on onScreencastFrame which is
          // undefined when runtimeScreencastEnabled=false.
          if (typeof onScreencastFrame === 'function' && !cdpSessionMap.has(page)) {
            try {
              const wid = workerIds.get(request.uniqueKey) || 'fetch-x0';
              const cdp = await page.context().newCDPSession(page);
              cdp.on('Page.screencastFrame', (frame) => {
                onScreencastFrame({
                  worker_id: wid,
                  data: frame.data,
                  width: frame.metadata?.deviceWidth || 0,
                  height: frame.metadata?.deviceHeight || 0,
                  ts: new Date().toISOString(),
                });
                cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
              });
              await cdp.send('Page.startScreencast', {
                format: 'jpeg',
                quality: 30,
                maxWidth: 1280,
                maxHeight: 720,
                everyNthFrame: 3,
              });
              cdpSessionMap.set(page, cdp);
            } catch (err) {
              logger?.warn?.('cdp_screencast_start_failed', {
                worker_id: workerIds.get(request.uniqueKey) || 'fetch-x0',
                error: err?.message ?? String(err),
              });
            }
          }
        },
      ],
      // WHY: Expose proxy URLs for test assertions (not used by Crawlee).
      _proxyUrls: proxyUrls,
    };
  }

  async function start() {
    if (crawler) return;

    if (_crawlerFactory) {
      const options = buildFullCrawlerOptions();
      crawler = _crawlerFactory(options);
      return;
    }

    const crawlee = await _crawleeImport;
    const { _proxyUrls, ...crawleeOptions } = buildFullCrawlerOptions();
    crawler = new crawlee.PlaywrightCrawler(crawleeOptions);
  }

  async function processUrl(url) {
    const c = ensureCrawler();
    const uniqueKey = `${url}::${Date.now()}::${Math.random().toString(36).slice(2, 10)}`;
    assignWorkerId(uniqueKey);

    const promise = new Promise((resolve, reject) => {
      pending.set(uniqueKey, { resolve, reject });
    });

    await c.run([{ url, uniqueKey }]);
    // WHY: Await fire-and-forget video saves from prePageCloseHooks.
    if (pendingVideoSaves.length) {
      await Promise.allSettled(pendingVideoSaves);
      pendingVideoSaves.length = 0;
    }

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
    if (pendingVideoSaves.length) {
      await Promise.allSettled(pendingVideoSaves);
      pendingVideoSaves.length = 0;
    }

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

  // WHY: Two-pass proxy retry. The main crawler runs with NO proxy (truly direct
  // HTTPS, no proxy-chain relay). Blocked URLs are retried through a proxy-enabled
  // crawler. The proxy crawler is created lazily on first call and reused across
  // batches to avoid 2-5s cold browser launch per retry batch.
  async function retryWithProxy(urls, { workerIdMap } = {}) {
    const proxyUrls = parseProxyUrls(settings.crawleeProxyUrlsJson);
    if (!proxyUrls.length || !urls.length) return [];

    if (_crawlerFactory) {
      if (!_proxyCrawler) {
        const { _proxyUrls, ...baseConfig } = buildFullCrawlerOptions();
        _proxyCrawler = _crawlerFactory({ ...baseConfig, _proxyRetry: true, _proxyUrls: proxyUrls });
      }
      return _runProxyBatch(_proxyCrawler, urls, { workerIdMap });
    }

    if (!_proxyCrawler) {
      const crawlee = await _crawleeImport;
      const proxyConfig = new crawlee.ProxyConfiguration({ proxyUrls });
      const { _proxyUrls, ...baseConfig } = buildFullCrawlerOptions();
      _proxyCrawler = new crawlee.PlaywrightCrawler({
        ...baseConfig,
        proxyConfiguration: proxyConfig,
        maxRequestRetries: 2,
      });
    }

    return _runProxyBatch(_proxyCrawler, urls, { workerIdMap });
  }

  async function _runProxyBatch(proxyCrawler, urls, { workerIdMap } = {}) {
    const requests = [];
    const promises = [];

    for (const url of urls) {
      const uniqueKey = `${url}::proxy::${Date.now()}::${Math.random().toString(36).slice(2, 8)}`;
      const preAssigned = workerIdMap?.get(url);
      if (preAssigned) workerIds.set(uniqueKey, preAssigned);
      else assignWorkerId(uniqueKey);
      requests.push({ url, uniqueKey });
      promises.push(new Promise((resolve, reject) => {
        pending.set(uniqueKey, { resolve, reject });
      }));
    }

    await proxyCrawler.run(requests);

    for (const req of requests) {
      const stale = pending.get(req.uniqueKey);
      if (stale) {
        stale.resolve({
          url: req.url, finalUrl: req.url, status: 0, title: '', html: '',
          screenshots: [], workerId: workerIds.get(req.uniqueKey) || 'fetch-x0',
          videoPath: '', fetchError: 'proxy_crawl_no_response',
        });
        pending.delete(req.uniqueKey);
      }
      workerIds.delete(req.uniqueKey);
    }

    return Promise.allSettled(promises);
  }

  // WHY: Pre-launch all browsers at run start so they're warm when crawling begins.
  // Call right after start() — overlaps with discovery/search phase (10-30s).
  // Uses https://example.com — fast, reliable IANA-owned domain, <200ms response.
  // requestHandler fast-paths warmup requests (no plugins/extraction/logging).
  async function warmUp() {
    const c = ensureCrawler();
    const maxPages = Math.min(slotCount, 4);
    const browsersNeeded = Math.ceil(slotCount / maxPages);
    if (browsersNeeded === 0) return;

    logger?.info?.('browser_pool_warming', { browsers: browsersNeeded, slots: slotCount, pages_per_browser: maxPages });

    const requests = [];
    const promises = [];
    for (let i = 0; i < browsersNeeded; i++) {
      const uniqueKey = `__warmup-${i}-${Date.now()}`;
      requests.push({ url: 'https://example.com', uniqueKey, userData: { __warmup: true } });
      promises.push(new Promise((resolve) => {
        pending.set(uniqueKey, { resolve, reject: resolve });
      }));
    }

    await c.run(requests);

    for (const req of requests) {
      const stale = pending.get(req.uniqueKey);
      if (stale) { stale.resolve({ __warmup: true }); pending.delete(req.uniqueKey); }
    }

    await Promise.allSettled(promises);
    logger?.info?.('browser_pool_warmed', { browsers: browsersNeeded, slots: slotCount });
  }

  async function shutdown() {
    if (_proxyCrawler) {
      await _proxyCrawler.teardown?.();
      _proxyCrawler = null;
    }
    if (crawler) {
      await crawler.teardown?.();
      crawler = null;
    }
  }

  return { start, processUrl, processBatch, retryWithProxy, warmUp, shutdown, slotCount, get videoDir() { return videoDir; } };
}
