// WHY: Google search via Crawlee/Playwright headless browser.
// Google requires JS execution — raw HTTP fetch gets an empty shell.
// Always headless, always blocks non-essential resources to minimize proxy bandwidth.
// screenshotsEnabled controls whether a SERP screenshot is captured.

import { createHash } from 'node:crypto';
import { PRESETS } from 'fingerprint-generator';
import { parseGoogleResults, isCaptchaPage, isConsentPage } from './googleResultParser.js';

// ---------------------------------------------------------------------------
// Module-level pacing
// ---------------------------------------------------------------------------

let _lastGoogleQueryMs = 0;
const DEFAULT_MIN_INTERVAL_MS = 4_000;
const DEFAULT_POST_RESULTS_DELAY_MS = 2_000;
const SCREENSHOT_QUALITY = 35;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function queryHash(query) {
  return createHash('sha256').update(String(query)).digest('hex').slice(0, 12);
}

function buildGoogleSearchUrl(query, limit = 10) {
  const q = encodeURIComponent(String(query));
  return `https://www.google.com/search?q=${q}&hl=en&num=${Math.min(Math.max(1, limit), 20)}`;
}

export function resetGoogleSearchPacingForTests() {
  _lastGoogleQueryMs = 0;
}

// WHY: Data-saving headers tell Google to serve lighter JS bundles.
// The fingerprint suite handles UA, Sec-Ch-Ua, and other stealth headers.
const DATA_SAVING_HEADERS = {
  'Save-Data': 'on',
  'ECT': 'slow-2g',
  'Downlink': '0.4',
  'RTT': '1800',
};

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
  limit = 10,
  timeoutMs = 30_000,
  proxyUrls = [],
  minQueryIntervalMs = DEFAULT_MIN_INTERVAL_MS,
  maxRetries = 1,
  postResultsDelayMs = DEFAULT_POST_RESULTS_DELAY_MS,
  screenshotsEnabled = false,
  logger,
  requestThrottler,
  _crawlerFactory,
} = {}) {
  const EMPTY = { results: [], proxyKB: 0 };

  if (!query || !String(query).trim()) return EMPTY;
  const q = String(query).trim();

  try {
    // Pacing
    const interval = Math.max(0, minQueryIntervalMs);
    const jitter = Math.floor(Math.random() * interval * 0.3);
    const target = interval + jitter;
    const now = Date.now();
    const elapsed = now - _lastGoogleQueryMs;
    if (elapsed < target) {
      await new Promise(r => setTimeout(r, target - elapsed));
    }
    _lastGoogleQueryMs = Date.now();

    if (typeof requestThrottler?.acquire === 'function') {
      await requestThrottler.acquire({ key: 'www.google.com', provider: 'google', query: q });
    }

    const url = buildGoogleSearchUrl(q, limit);
    const cap = Math.max(1, Number(limit) || 10);

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
      ...(proxyConfiguration ? { proxyConfiguration } : {}),
      useSessionPool: Boolean(proxyConfiguration),
      persistCookiesPerSession: true,
      maxRequestRetries: proxyConfiguration ? maxRetries : 0,
      launchContext: {
        launchOptions: {
          headless: true,
          channel: 'chrome',
          args: [
            '--disable-blink-features=AutomationControlled',
            '--no-first-run',
            '--no-default-browser-check',
            '--enforce-webrtc-ip-permission-check',
            '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
          ],
        },
      },
      browserPoolOptions: {
        // WHY: Crawlee's built-in fingerprint generator creates realistic
        // browser fingerprints (UA, viewport, canvas, WebGL, navigator)
        // using Bayesian networks. Replaces our manual stealth script.
        useFingerprints: true,
        fingerprintOptions: {
          fingerprintGeneratorOptions: {
            ...PRESETS.MODERN_ANDROID,
          },
        },
        maxOpenPagesPerBrowser: 1,
        retireBrowserAfterPageCount: 1,
      },
      preNavigationHooks: [
        async ({ page }, gotoOptions) => {
          gotoOptions.waitUntil = 'domcontentloaded';
          gotoOptions.timeout = Math.max(5000, Number(timeoutMs) || 30_000);

          // WHY: Allow document + stylesheet + essential scripts only.
          // Block images, fonts, XHR, fetch, and non-essential scripts.
          // XHR/fetch are post-load analytics/suggestions — not needed for results.
          await page.route('**', (route, request) => {
            const type = request.resourceType();
            if (type === 'document' || type === 'stylesheet') {
              return route.continue();
            }
            if (type === 'script') {
              const u = request.url();
              if (u.includes('analytics') || u.includes('adservice') ||
                  u.includes('doubleclick') || u.includes('googlesyndication') ||
                  u.includes('googletagmanager') || u.includes('recaptcha') ||
                  u.includes('accounts.google') || u.includes('play.google')) {
                return route.abort();
              }
              if (u.includes('google.com') || u.includes('gstatic.com')) {
                return route.continue();
              }
              return route.abort();
            }
            return route.abort();
          });

          // Track bytes through proxy
          page.on('response', async (response) => {
            try {
              const body = await response.body();
              proxyBytesTotal += body.length;
            } catch { /* aborted responses */ }
          });

          // WHY: Only add data-saving hints — fingerprint suite handles
          // UA, Sec-Ch-Ua, and all other stealth headers automatically.
          await page.setExtraHTTPHeaders(DATA_SAVING_HEADERS);
        },
      ],
      requestHandler: async ({ page, session }) => {
        // Consent popup handling
        try {
          const consentBtn = await page.waitForSelector(
            'button[aria-label="Accept all"], #L2AGLb, button:has-text("Accept all"), button:has-text("Reject all")',
            { timeout: 2_000 },
          ).catch(() => null);
          if (consentBtn) {
            await consentBtn.click();
            await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
          }
        } catch { /* best-effort */ }

        // CAPTCHA detection
        const earlyUrl = page.url();
        const earlyHtml = await page.content();
        if (isCaptchaPage(earlyUrl, earlyHtml)) {
          session?.markBad?.();
          logger?.warn?.('google_crawlee_captcha_in_handler', {
            query: q, url: earlyUrl, session_burned: Boolean(session?.markBad),
          });
          throw new Error('CAPTCHA detected — burning session, rotating proxy');
        }

        // Wait for results
        try {
          await page.waitForSelector('#search, #rso, .g', { timeout: 15_000 });
        } catch { /* may not appear on CAPTCHA pages */ }

        // Render delay only when screenshotting
        if (screenshotsEnabled) {
          const renderDelayMs = Math.max(0, Number(postResultsDelayMs) || 0);
          if (renderDelayMs > 0) {
            await new Promise(r => setTimeout(r, renderDelayMs));
          }
        }

        pageUrl = page.url();
        pageHtml = await page.content();

        // Debug: save HTML for parser development
        try {
          const { writeFile: _wf, mkdir: _md } = await import('node:fs/promises');
          const { join: _join } = await import('node:path');
          const debugDir = _join(process.cwd(), '.specfactory_tmp', 'crawlee_debug');
          await _md(debugDir, { recursive: true });
          await _wf(_join(debugDir, `serp-${Date.now()}.html`), pageHtml);
        } catch { /* debug only */ }

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
            await new Promise(r => setTimeout(r, 300));

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
              quality: SCREENSHOT_QUALITY,
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
