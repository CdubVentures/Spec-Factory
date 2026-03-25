// WHY: Google search via Crawlee/Playwright headless browser.
// Google requires JS execution — raw HTTP fetch gets an empty shell.
// Always headless, blocks all non-essential resources to minimize proxy bandwidth.
// screenshotsEnabled controls whether a SERP screenshot is captured.

import { createHash } from 'node:crypto';
import { PRESETS } from 'fingerprint-generator';
import { parseGoogleResults, isCaptchaPage, isConsentPage } from './googleResultParser.js';
import { createPacer } from './createPacer.js';

// ---------------------------------------------------------------------------
// Module-level pacing — injectable via _pacer param
// ---------------------------------------------------------------------------

// WHY: Defaults live in settingsRegistry; these are fallbacks for standalone usage.
const FALLBACK_MIN_INTERVAL_MS = 4_000;
const FALLBACK_POST_RESULTS_DELAY_MS = 2_000;
const FALLBACK_SCREENSHOT_QUALITY = 35;
const FALLBACK_RESULT_CAP = 10;
const FALLBACK_SERP_SELECTOR_WAIT_MS = 15_000;
const FALLBACK_SCROLL_DELAY_MS = 300;
const FALLBACK_PACING_JITTER = 0.3;

const _defaultPacer = createPacer({ minIntervalMs: FALLBACK_MIN_INTERVAL_MS });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function queryHash(query) {
  return createHash('sha256').update(String(query)).digest('hex').slice(0, 12);
}

// WHY: udm=14 forces "Web" tab — strips AI Overviews, People Also Ask,
// shopping carousels. nfpr=1 prevents query "correction". pws=0 disables
// personalization. filter=0 shows near-duplicates for broader coverage.
function buildGoogleSearchUrl(query) {
  const q = encodeURIComponent(String(query));
  return `https://www.google.com/search?q=${q}&hl=en&udm=14&nfpr=1&pws=0&filter=0`;
}

export function resetGoogleSearchPacingForTests() {
  _defaultPacer.resetForTests();
}

// WHY: Minimal Chrome flags — too many flags create a detectable fingerprint.
// Only essentials: anti-automation detection, proxy leak prevention, and
// background networking (the one flag that saves real bandwidth).
const CHROME_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--no-default-browser-check',
  '--enforce-webrtc-ip-permission-check',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--disable-background-networking',
];

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Search Google via headless Crawlee/Playwright browser.
 *
 * @param {object} options
 * @param {string} options.query
 * @param {number} [options.limit=10]
 * @param {number} [options.timeoutMs=30000]
 * @param {string[]} [options.proxyUrls=[]]
 * @param {number} [options.minQueryIntervalMs=4000]
 * @param {number} [options.maxRetries=1]
 * @param {boolean} [options.screenshotsEnabled=false]
 * @param {object} [options.logger]
 * @param {object} [options.requestThrottler]
 * @param {Function} [options._crawlerFactory] - DI seam for testing
 * @returns {Promise<{ results: Array, screenshot?: object, proxyKB: number }>}
 */
export async function searchGoogle({
  query,
  limit,
  timeoutMs = 30_000,
  proxyUrls = [],
  minQueryIntervalMs,
  maxRetries = 1,
  postResultsDelayMs,
  screenshotsEnabled = false,
  screenshotQuality,
  serpSelectorWaitMs,
  scrollDelayMs,
  jitterFactor,
  logger,
  requestThrottler,
  _crawlerFactory,
  _pacer,
  // WHY: Registry settings flow in via the caller's settings bag.
  googleSearchMinIntervalMs,
  googleSearchPostResultsDelayMs,
  googleSearchScreenshotQuality,
  googleSearchResultCap,
  googleSearchSerpSelectorWaitMs,
  googleSearchScrollDelayMs,
  searchPacingJitterFactor,
} = {}) {
  const EMPTY = { results: [], proxyKB: 0 };

  if (!query || !String(query).trim()) return EMPTY;
  const q = String(query).trim();

  // WHY: Resolve registry settings → explicit param → fallback constant.
  const effectiveMinInterval = minQueryIntervalMs ?? googleSearchMinIntervalMs ?? FALLBACK_MIN_INTERVAL_MS;
  const effectivePostResultsDelay = postResultsDelayMs ?? googleSearchPostResultsDelayMs ?? FALLBACK_POST_RESULTS_DELAY_MS;
  const effectiveScreenshotQuality = screenshotQuality ?? googleSearchScreenshotQuality ?? FALLBACK_SCREENSHOT_QUALITY;
  const effectiveResultCap = limit ?? googleSearchResultCap ?? FALLBACK_RESULT_CAP;
  const effectiveSerpWait = serpSelectorWaitMs ?? googleSearchSerpSelectorWaitMs ?? FALLBACK_SERP_SELECTOR_WAIT_MS;
  const effectiveScrollDelay = scrollDelayMs ?? googleSearchScrollDelayMs ?? FALLBACK_SCROLL_DELAY_MS;
  const effectiveJitter = jitterFactor ?? searchPacingJitterFactor ?? FALLBACK_PACING_JITTER;

  try {
    // Pacing — injectable for tests
    const pacer = _pacer || _defaultPacer;
    await pacer.waitForSlot({ interval: effectiveMinInterval, jitterFactor: effectiveJitter });

    if (typeof requestThrottler?.acquire === 'function') {
      await requestThrottler.acquire({ key: 'www.google.com', provider: 'google', query: q });
    }

    const url = buildGoogleSearchUrl(q);
    const cap = Math.max(1, Number(effectiveResultCap) || 10);

    // Resolve crawler factory
    let crawlerFactory = _crawlerFactory;
    let ProxyConfigClass = _crawlerFactory?._ProxyConfiguration;

    if (!crawlerFactory) {
      const crawlee = await import('crawlee');
      ProxyConfigClass = crawlee.ProxyConfiguration;
      crawlerFactory = async (opts) => new crawlee.PlaywrightCrawler(opts);
    }

    const validProxies = (proxyUrls || []).filter(u => String(u || '').trim());
    const proxyConfiguration = validProxies.length > 0 && ProxyConfigClass
      ? new ProxyConfigClass({ proxyUrls: validProxies })
      : undefined;

    let pageHtml = '';
    let pageUrl = '';
    let screenshotBuffer = null;
    let proxyBytesTotal = 0;

    const crawlerOptions = {
      maxRequestsPerCrawl: 1,
      requestHandlerTimeoutSecs: Math.ceil(timeoutMs / 1000) + 10,
      retryOnBlocked: true,
      maxSessionRotations: 2,
      ...(proxyConfiguration ? { proxyConfiguration } : {}),
      useSessionPool: Boolean(proxyConfiguration),
      persistCookiesPerSession: true,
      maxRequestRetries: proxyConfiguration ? maxRetries : 0,
      ...(proxyConfiguration ? {
        sessionPoolOptions: {
          maxPoolSize: 10,
          sessionOptions: {
            maxUsageCount: 5,
            maxAgeSecs: 300,
            maxErrorScore: 1,
          },
        },
      } : {}),
      launchContext: {
        launchOptions: {
          headless: true,
          channel: 'chrome',
          args: CHROME_ARGS,
        },
      },
      browserPoolOptions: {
        useFingerprints: true,
        fingerprintOptions: {
          fingerprintGeneratorOptions: {
            ...PRESETS.MODERN_WINDOWS_CHROME,
          },
        },
        maxOpenPagesPerBrowser: 1,
        retireBrowserAfterPageCount: 5,
      },
      preNavigationHooks: [
        async ({ page, blockRequests }, gotoOptions) => {
          gotoOptions.waitUntil = 'domcontentloaded';
          gotoOptions.timeout = Math.max(5000, Number(timeoutMs) || 30_000);

          // WHY: CDP-level blocking — no Node.js round-trips per request.
          // Blocks images, fonts, media, analytics by URL pattern.
          if (typeof blockRequests === 'function') {
            await blockRequests({
              urlPatterns: [
                '.jpg', '.jpeg', '.png', '.svg', '.gif', '.webp', '.ico',
                '.woff', '.woff2', '.ttf', '.eot', '.otf',
                '.pdf', '.zip', '.mp4', '.webm', '.mp3',
                'adsbygoogle', 'analytics', 'doubleclick',
                'googlesyndication', 'googletagmanager',
                'accounts.google', 'play.google',
                'gstatic.com/og/', 'apis.google.com', 'ssl.gstatic.com/gb/',
                'lh3.googleusercontent.com', 'encrypted-tbn',
                'youtube.com', 'ytimg.com',
                'maps.google', 'maps.gstatic', 'translate.google',
              ],
            });
          }

          // WHY: Allow document + bootstrap Google scripts only.
          // Stub CSS (parser uses JSDOM, doesn't need styles — saves ~500KB).
          // Block lazy XJS chunks (/d=0/) — 17 feature modules we don't need (~100-165KB wire).
          // Keep bootstrap XJS (/d=1/) — needed for SearchGuard verification.
          await page.route('**', (route, request) => {
            const type = request.resourceType();
            if (type === 'document') return route.continue();
            if (type === 'stylesheet') {
              return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
            }
            if (type === 'script') {
              const u = request.url();
              if (u.includes('gstatic.com/og/')) return route.abort();
              if (u.includes('/xjs/_/js/') && u.includes('/d=0/')) return route.abort();
              if (u.includes('google.com') || u.includes('gstatic.com')) {
                return route.continue();
              }
              return route.abort();
            }
            return route.abort();
          });

          // WHY: CDP Network.loadingFinished.encodedDataLength gives actual
          // compressed wire bytes (what the proxy meters), not decompressed
          // body.length which overestimates by ~3-4x.
          try {
            const cdpMetrics = await page.context().newCDPSession(page);
            await cdpMetrics.send('Network.enable');
            cdpMetrics.on('Network.loadingFinished', (params) => {
              proxyBytesTotal += params.encodedDataLength || 0;
            });
          } catch { /* CDP not available in test mocks */ }
        },
      ],
      requestHandler: async ({ page, session, closeCookieModals }) => {
        // WHY: Crawlee's built-in consent handler covers many frameworks.
        if (typeof closeCookieModals === 'function') {
          try { await closeCookieModals(); } catch { /* best-effort */ }
        }

        // CAPTCHA detection
        const earlyUrl = page.url();
        const earlyHtml = await page.content();
        if (isCaptchaPage(earlyUrl, earlyHtml)) {
          session?.retire?.();
          logger?.warn?.('google_crawlee_captcha_in_handler', {
            query: q, url: earlyUrl, session_retired: Boolean(session?.retire),
          });
          throw new Error('CAPTCHA detected — retiring session, rotating proxy');
        }

        // WHY: Wait until 3+ real results exist in DOM, not just the container.
        try {
          await page.waitForFunction(() => {
            const c = document.querySelector('#rso') || document.querySelector('#search');
            return c && c.querySelectorAll('a[href] h3').length >= 3;
          }, { timeout: effectiveSerpWait, polling: 100 });
        } catch { /* may not appear on CAPTCHA pages */ }

        // Render delay only when screenshotting
        if (screenshotsEnabled) {
          const renderDelayMs = Math.max(0, Number(effectivePostResultsDelay) || 0);
          if (renderDelayMs > 0) {
            await new Promise(r => setTimeout(r, renderDelayMs));
          }
        }

        pageUrl = page.url();
        pageHtml = await page.content();

        // WHY: Page.stopLoading cancels in-flight requests immediately
        // (unlike setOffline which lets already-started requests complete).
        // Belt-and-suspenders: also go offline to catch setTimeout callbacks.
        try {
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('Page.stopLoading');
          await cdp.detach();
          await page.context().setOffline(true);
        } catch { /* best-effort — page may already be closing */ }

        // Screenshot capture
        if (screenshotsEnabled) {
          try {
            await page.evaluate(() => {
              for (const sel of ['#rhs', '#botstuff', '#footcnt', '#extrares']) {
                const el = document.querySelector(sel);
                if (el) el.style.display = 'none';
              }
              const main = document.querySelector('#rso') || document.querySelector('#search');
              if (main) main.scrollIntoView({ block: 'end', behavior: 'instant' });
            });
            await new Promise(r => setTimeout(r, effectiveScrollDelay));

            const clipRect = await page.evaluate(() => {
              const main = document.querySelector('#rso') || document.querySelector('#search') || document.querySelector('#center_col');
              if (!main) return null;
              const rect = main.getBoundingClientRect();
              const scrollY = window.scrollY || document.documentElement.scrollTop;
              return {
                x: Math.max(0, Math.floor(rect.x) - 10),
                y: Math.floor(rect.top + scrollY),
                width: Math.min(Math.ceil(rect.width) + 20, 500),
                height: Math.ceil(rect.height) + 10,
              };
            });
            screenshotBuffer = await page.screenshot({
              type: 'jpeg',
              quality: effectiveScreenshotQuality,
              fullPage: true,
              ...(clipRect ? { clip: clipRect } : {}),
            });
          } catch (err) {
            logger?.warn?.('google_crawlee_screenshot_failed', { query: q, message: err.message });
          }
        }
      },
    };

    let RequestListClass = _crawlerFactory?._RequestList;
    if (!RequestListClass) {
      const crawlee = await import('crawlee');
      RequestListClass = crawlee.RequestList;
    }
    const requestList = await RequestListClass.open({
      sources: [{ url, uniqueKey: `google-${queryHash(q)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }],
    });
    crawlerOptions.requestList = requestList;

    const crawler = await crawlerFactory(crawlerOptions);
    await crawler.run();

    const proxyKB = Math.round((proxyBytesTotal / 1024) * 100) / 100;

    if (isCaptchaPage(pageUrl, pageHtml)) {
      logger?.warn?.('google_crawlee_captcha_detected', { query: q, url: pageUrl, proxyKB });
      return { results: [], proxyKB };
    }

    if (isConsentPage(pageUrl)) {
      logger?.warn?.('google_crawlee_consent_page', { query: q, url: pageUrl, proxyKB });
      return { results: [], proxyKB };
    }

    const parsed = parseGoogleResults(pageHtml, cap);
    const results = parsed.map(row => ({
      url: row.url, title: row.title, snippet: row.snippet,
      provider: 'google', query: q,
    }));

    logger?.info?.('google_crawlee_search_complete', {
      query: q, result_count: results.length,
      screenshot_captured: Boolean(screenshotBuffer), proxyKB,
    });

    const output = { results, proxyKB };

    if (screenshotsEnabled && screenshotBuffer) {
      output.screenshot = {
        buffer: screenshotBuffer,
        bytes: screenshotBuffer.length,
        ts: new Date().toISOString(),
        queryHash: queryHash(q),
      };
    }

    return output;

  } catch (err) {
    logger?.warn?.('google_search_error', { query: q, message: err.message });
    return EMPTY;
  }
}
