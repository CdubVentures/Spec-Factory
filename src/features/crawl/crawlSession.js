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
import { runFetchSuiteLoop } from './core/suiteOrchestrator.js';
import { trimVideo } from './videoTrim.js';
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

export function createCrawlSession({ settings = {}, plugins = [], extractionRunner, logger, onScreencastFrame, onScreenshotsPersist, onVideoPersist, _crawlerFactory } = {}) {
  const runner = createPluginRunner({ plugins, logger });
  const pending = new Map();
  const workerIds = new Map();
  // WHY: WeakMap so page references don't leak after GC. Maps page → workerId
  // so prePageCloseHook can save the video with the correct filename.
  const pageWorkerMap = new WeakMap();
  const pageWorkerUrlMap = new WeakMap();
  const cdpSessionMap = new WeakMap();
  // WHY: Stores fetch window timestamps per page so prePageCloseHook can
  // trim the video to just the dismiss→scroll window.
  const pageTimestampMap = new WeakMap();
  // WHY: Gate video persistence — only pages that pass block detection and
  // complete extraction should persist their video. Without this, every
  // retry attempt (blocked → session rotate → new page) saves a video,
  // inflating the count far beyond the number of URLs actually fetched.
  const pageVideoGateMap = new WeakMap();
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
        const pageStartMs = Date.now();
        // WHY: Map page → workerId IMMEDIATELY so prePageCloseHook can save
        // the video regardless of whether the page is blocked, retried, or succeeds.
        if (videoDir) {
          pageWorkerMap.set(page, workerId);
          pageWorkerUrlMap.set(page, request.url);
        }
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

        // WHY: Suite orchestrator replaces the old sequential 3-hook sequence.
        // onInit runs in preNavigationHooks (before page.goto).
        // The loop runs: [loading delay] → dismiss → (scroll → dismiss) × N rounds.
        const suiteResult = await runFetchSuiteLoop({ runner, settings, ctx, logger });

        // WHY: Store timestamps so prePageCloseHook can trim the video to
        // just the fetch window (dismiss→scroll). Without this, the video
        // includes blank tab, navigation, extraction, and teardown.
        if (videoDir && suiteResult.fetchWindowStartMs) {
          pageTimestampMap.set(page, {
            pageStartMs,
            fetchWindowStartMs: suiteResult.fetchWindowStartMs,
            fetchWindowEndMs: suiteResult.fetchWindowEndMs,
          });
        }

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
          // WHY: Stop CDP screencast before throwing — no more frames needed.
          const cdpBlocked = cdpSessionMap.get(page);
          if (cdpBlocked) {
            try { await cdpBlocked.send('Page.stopScreencast'); } catch {}
            try { await cdpBlocked.detach(); } catch {}
          }
          request.userData.__blockInfo = { blocked: true, blockReason, status, html, title, finalUrl };
          throw new Error(`blocked:${blockReason}`);
        }

        // WHY: Stash captured page data BEFORE expensive hooks (onCapture,
        // extraction, screenshot). If Crawlee's handler timeout fires during
        // those operations, failedRequestHandler can rescue this data instead
        // of returning an empty result. Same pattern as __blockInfo above.
        // Audit proof: 13 of 29 misclassified workers had real page content
        // (28-69KB screencast frames, 2-4MB videos) but HTML was lost because
        // the timeout killed the handler before extraction ran.
        request.userData.__capturedPage = { html, finalUrl, title, status };

        // WHY: Page passed block detection — mark it as video-worthy so
        // prePageCloseHook will persist the recording. Blocked/retried pages
        // are not marked, so their throwaway videos are silently discarded.
        if (videoDir) pageVideoGateMap.set(page, true);

        const captureCtx = { ...ctx, url: request.url, html, finalUrl, title, status };
        try { await runner.runHook('onCapture', captureCtx); }
        catch (err) { logger?.warn?.('hook_error', { hook: 'onCapture', url: request.url, error: err?.message }); }

        // WHY: Capture-phase extraction plugins run inside the handler with live
        // page access. Sequential plugins first (may mutate page state), then
        // concurrent plugins via Promise.all (read-only CDP commands like screenshot).
        // Transform-phase plugins run later in runFetchPlan after the page closes.
        let extractions = {};
        try {
          extractions = extractionRunner
            ? await extractionRunner.runCaptures(captureCtx)
            : {};
          // WHY: Stash extraction results (screenshots) on request.userData so
          // failedRequestHandler can rescue them if timeout fires AFTER extraction
          // completes but BEFORE resolveEntry runs. Same rescue pattern as __capturedPage.
          request.userData.__capturedExtractions = extractions;
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

        // WHY: Persist screenshot artifacts to {runDir}/screenshots/ and emit
        // visual_asset_captured events so the worker detail builder picks them up.
        // DI-injected callback — no cross-feature import.
        if (typeof onScreenshotsPersist === 'function') {
          try {
            const shots = extractions.screenshot?.screenshots ?? [];
            if (shots.length > 0) {
              const persisted = onScreenshotsPersist({ screenshots: shots, workerId, url: request.url });
              const filenames = [];
              for (const record of persisted) {
                filenames.push(record.filename);
                logger?.info?.('visual_asset_captured', {
                  url: request.url,
                  screenshot_uri: record.filename,
                  width: record.width,
                  height: record.height,
                  bytes: record.bytes,
                  format: record.format,
                });
              }
              // WHY: Emit filenames so the extraction plugin builder can include
              // them in the extraction panel's per-URL data. The original
              // extraction_plugin_completed event ran before persistence — this
              // supplements it with the artifact references.
              if (filenames.length > 0) {
                const fileSizes = persisted.map((r) => r.bytes || 0);
                logger?.info?.('extraction_artifacts_persisted', {
                  plugin: 'screenshot',
                  url: request.url,
                  worker_id: workerId,
                  filenames,
                  file_sizes: fileSizes,
                });
              }
            }
          } catch (err) {
            logger?.warn?.('screenshot_persist_error', { url: request.url, error: err?.message });
          }
        }

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
          screenshots: extractions.screenshot?.screenshots ?? [],
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
        // WHY: Resolve with error result instead of rejecting — prevents
        // unhandled rejection crashes. Include block info from the handler if
        // available so the lifecycle can classify and trigger proxy retry.
        const blockInfo = request.userData?.__blockInfo;
        // WHY: Rescue stashed page data when handler timed out AFTER
        // page.content() captured HTML. The page loaded (video/screencast
        // prove it) but the plugin chain ate the remaining timeout budget.
        // Returning the HTML lets the pipeline still extract data from it.
        const capturedPage = !blockInfo ? request.userData?.__capturedPage : null;
        // WHY: Rescue screenshots from __capturedExtractions when extraction
        // completed but timeout fired before resolveEntry. Without this,
        // screenshots are silently lost even though the plugin captured them.
        const capturedExtractions = capturedPage ? request.userData?.__capturedExtractions : null;
        const rescuedScreenshots = capturedExtractions?.screenshot?.screenshots ?? [];

        logger?.info?.('source_fetch_failed', {
          url: request.url,
          status: 0,
          message: errMsg,
          fetcher_kind: 'crawlee',
          worker_id: workerId,
          retry_count: request.retryCount ?? 0,
          // WHY: Propagate timeout_rescued flag so the bridge → worker pool
          // builder → GUI badge chain can distinguish "failed with data"
          // from "failed with nothing". Without this, rescued workers show
          // red "Failed" badges even though they have HTML, screenshots, video.
          ...(capturedPage ? { timeout_rescued: true } : {}),
        });

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
        } : capturedPage ? {
          url: request.url,
          finalUrl: capturedPage.finalUrl || request.url,
          status: capturedPage.status || 0,
          title: capturedPage.title || '',
          html: capturedPage.html || '',
          screenshots: rescuedScreenshots, workerId, videoPath: '',
          fetchError: errMsg,
          timeoutRescued: true,
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
        // Downloads = site serves a file. DNS = domain doesn't exist.
        // Navigation timed out = page genuinely didn't respond.
        if (
          msg.includes('Download is starting')
          || msg.includes('ERR_NAME_NOT_RESOLVED')
          || msg.includes('ERR_CONNECTION_REFUSED')
          || msg.includes('ERR_CONNECTION_RESET')
          || msg.includes('ERR_TUNNEL_CONNECTION_FAILED')
          || msg.includes('Navigation timed out')
        ) {
          request.noRetry = true;
        }
        // WHY: If the handler timed out but __capturedPage exists, the page
        // loaded and HTML was captured — retrying burns another full 45s
        // loading the same page. Audit proof: 13 timeout workers loaded pages
        // (video/screencast prove it) then timed out during the plugin chain.
        // Each retry wasted another 45s re-loading the same content.
        if (
          !request.noRetry
          && msg.includes('requestHandler timed out')
          && request.userData?.__capturedPage
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
    const handlerTimeoutSecs = Number(settings.crawleeRequestHandlerTimeoutSecs) || 45;
    const navTimeoutSecs = Number(settings.crawleeNavigationTimeoutSecs) || 20;
    // WHY: 0 is a valid value for maxRetries (no retries), so can't use `|| 1`.
    // Default 1 — one native retry with session rotation (new fingerprint/cookies).
    // After native retry exhausted, lifecycle calls retryWithProxy as final proxy pass.
    // Total worst case: nav(20) + handler(45) + buffer(10) = 75s per attempt.
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
      navigationTimeoutSecs: navTimeoutSecs,
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
              // WHY: Only persist videos for pages that passed block detection.
              // Blocked/retried pages are not gated, so their videos are discarded.
              if (!pageVideoGateMap.get(page)) return;
              const video = page.video?.();
              if (!video) return;
              const videoPath = path.join(videoDir, `${wid}.webm`);
              // WHY: Resolve the URL for this page so onVideoPersist and events
              // can associate the video with the source URL.
              const pageUrl = pageWorkerUrlMap.get(page) || '';
              const savePromise = video.saveAs(videoPath)
                .then(async () => {
                  // WHY: Trim video to just the fetch window (dismiss→scroll).
                  // Falls back gracefully if ffmpeg is not installed.
                  const ts = pageTimestampMap.get(page);
                  if (ts && ts.fetchWindowStartMs && ts.fetchWindowEndMs) {
                    const startSec = Math.max(0, (ts.fetchWindowStartMs - ts.pageStartMs) / 1000);
                    const endSec = (ts.fetchWindowEndMs - ts.pageStartMs) / 1000;
                    await trimVideo(videoPath, startSec, endSec);
                  }
                  // WHY: DI callback persists video to run directory and indexes in SQL.
                  // Same pattern as onScreenshotsPersist — no cross-feature imports.
                  if (typeof onVideoPersist === 'function') {
                    try {
                      const persisted = onVideoPersist({ videoPath, workerId: wid, url: pageUrl });
                      if (persisted) {
                        // WHY: Include filenames + file_sizes directly in result so the
                        // builder spreads them into the entry. The separate artifacts_persisted
                        // event is also emitted for consistency with the screenshot pattern,
                        // but having them in result guarantees they arrive even if event
                        // ordering shifts.
                        logger?.info?.('extraction_plugin_completed', {
                          plugin: 'video',
                          worker_id: wid,
                          url: pageUrl,
                          result: {
                            video_count: 1,
                            total_bytes: persisted.size_bytes,
                            format: 'webm',
                            filenames: [persisted.filename],
                            file_sizes: [persisted.size_bytes],
                          },
                        });
                        logger?.info?.('extraction_artifacts_persisted', {
                          plugin: 'video',
                          url: pageUrl,
                          worker_id: wid,
                          filenames: [persisted.filename],
                          file_sizes: [persisted.size_bytes],
                        });
                      }
                    } catch (err) {
                      logger?.warn?.('video_persist_error', { worker_id: wid, error: err?.message });
                    }
                  }
                })
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
          // WHY: Warmup requests only need browser pool pre-launch — skip
          // screencast, plugins, and delays. Without this guard, onInit hooks
          // fire with worker_id='fetch-x0' (the fallback) and create a ghost
          // worker row in the GUI.
          if (request.userData?.__warmup) return;

          if (sameDomainDelay > 0) {
            const base = sameDomainDelay * 1000;
            const jitter = Math.floor(Math.random() * base * 0.5);
            await new Promise((r) => setTimeout(r, base + jitter));
          }
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

          // WHY: onInit runs BEFORE page.goto() so addInitScript and page.route
          // take effect on the initial page load. This fixes the bug where stealth,
          // overlayDismissal CSS, and cssOverride routes were injected AFTER goto
          // and didn't apply to the first page load.
          const wid = workerIds.get(request.uniqueKey) || 'fetch-x0';
          await runner.runHook('onInit', { page, request, settings, workerId: wid });
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
        maxRequestRetries: Number(settings.crawleeProxyMaxRetries) || 2,
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

  // WHY: Expose Crawlee's native Statistics as a snapshot. Returns null for
  // test doubles (_crawlerFactory) that don't have real Crawlee internals.
  // Data here is NOT derivable from our event stream: per-status-code counts,
  // retry distribution, classified error groups, precise per-request timing.
  function getStats() {
    if (!crawler?.stats) return null;
    const s = crawler.stats;
    const calc = s.calculate();
    return {
      status_codes: s.state.requestsWithStatusCode,
      retry_histogram: [...s.requestRetryHistogram],
      top_errors: s.errorTracker.getMostPopularErrors(10),
      avg_ok_ms: Number.isFinite(calc.requestAvgFinishedDurationMillis) ? Math.round(calc.requestAvgFinishedDurationMillis) : 0,
      avg_fail_ms: Number.isFinite(calc.requestAvgFailedDurationMillis) ? Math.round(calc.requestAvgFailedDurationMillis) : 0,
    };
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

  // WHY: Complete fetch lifecycle — replaces runCrawlProcessingLifecycle.
  // Takes a pre-sorted, pre-ID'd URL list and handles batching, block
  // classification, frontier recording, and two-pass proxy retry.
  async function runFetchPlan({ orderedSources = [], workerIdMap = new Map(), frontierDb = null, logger: planLogger = null, startMs = 0, maxRunMs = 0 } = {}) {
    const crawlResults = [];
    const batchSize = (slotCount || 4) * 2;
    const urls = orderedSources.map((s) => s.url);

    let offset = 0;
    while (offset < urls.length) {
      if (maxRunMs > 0 && (Date.now() - startMs) >= maxRunMs) break;

      const batch = [];
      while (batch.length < batchSize && offset < urls.length) {
        batch.push(urls[offset++]);
      }
      if (batch.length === 0) continue;

      const settled = await processBatch(batch, { workerIdMap });
      const batchResults = [];

      for (let i = 0; i < settled.length; i++) {
        const entry = settled[i];
        const url = batch[i] || '';

        if (entry.status === 'fulfilled') {
          const result = entry.value;
          const { blocked, blockReason } = classifyBlockStatus({
            status: result.status, html: result.html,
          });
          result.blocked = blocked;
          result.blockReason = blockReason;
          result.success = !blocked && result.status > 0 && result.status < 400;

          try {
            frontierDb?.recordFetch?.({
              url: result.url,
              status: result.status,
              finalUrl: result.finalUrl,
              elapsedMs: result.fetchDurationMs || 0,
            });
          } catch { /* swallow frontier errors */ }

          batchResults.push(result);
        } else {
          try {
            frontierDb?.recordFetch?.({
              url,
              status: 0,
              error: entry.reason?.message || '',
            });
          } catch { /* swallow */ }

          batchResults.push({
            success: false, url, finalUrl: url, status: 0,
            blocked: false, blockReason: null, screenshots: [],
            html: '', fetchDurationMs: 0, attempts: 1, bypassUsed: null,
            workerId: workerIdMap.get(url) || null,
          });
        }
      }

      // WHY: Two-pass proxy retry. Blocked URLs (except robots_blocked — respect
      // robots.txt) are retried through a dedicated proxy-enabled crawler.
      // Gated on crawleeProxyRetryEnabled — when disabled, blocked URLs fail
      // after native Crawlee session-rotation retries only.
      const proxyRetryEnabled = settings.crawleeProxyRetryEnabled === true || settings.crawleeProxyRetryEnabled === 'true';
      const blockedUrls = proxyRetryEnabled
        ? batchResults.filter((r) => r.blocked && r.blockReason !== 'robots_blocked').map((r) => r.url)
        : [];

      if (blockedUrls.length > 0 && typeof retryWithProxy === 'function') {
        const retrySettled = await retryWithProxy(blockedUrls, { workerIdMap });

        for (let i = 0; i < retrySettled.length; i++) {
          if (retrySettled[i].status !== 'fulfilled') continue;
          const retryResult = retrySettled[i].value;
          const { blocked, blockReason } = classifyBlockStatus({
            status: retryResult.status, html: retryResult.html,
          });
          retryResult.blocked = blocked;
          retryResult.blockReason = blockReason;
          retryResult.success = !blocked && retryResult.status > 0 && retryResult.status < 400;
          retryResult.proxyRetry = true;

          const idx = batchResults.findIndex((r) => r.url === retryResult.url && r.blocked);
          if (idx >= 0) batchResults[idx] = retryResult;
          else batchResults.push(retryResult);
        }
      }

      // WHY: Transform-phase extraction plugins run AFTER the handler closes
      // (no page, no timeout pressure). They process captured data (HTML,
      // screenshot bytes) that was already collected during the capture phase.
      // Always concurrent via Promise.all — no shared mutable state.
      if (extractionRunner?.runTransforms) {
        for (const result of batchResults) {
          if (!result.success || !result.html) continue;
          try {
            const transforms = await extractionRunner.runTransforms({
              html: result.html,
              finalUrl: result.finalUrl,
              title: result.title,
              status: result.status,
              settings,
              captures: result.extractions || {},
            });
            if (Object.keys(transforms).length > 0) {
              result.extractions = { ...(result.extractions || {}), ...transforms };
            }
          } catch { /* transform errors don't fail the result */ }
        }
      }

      crawlResults.push(...batchResults);

      // WHY: Emit Crawlee's native stats snapshot after each batch so the
      // GUI MetricsRail can show status code distribution, retry histogram,
      // and classified error groups — data not derivable from our event stream.
      const stats = getStats();
      if (stats) {
        logger?.info?.('crawler_stats', { ...stats });
      }
    }

    return { crawlResults };
  }

  return { start, processUrl, processBatch, retryWithProxy, runFetchPlan, warmUp, shutdown, getStats, slotCount, get videoDir() { return videoDir; } };
}
