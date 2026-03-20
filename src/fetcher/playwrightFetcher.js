import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { extractLdJsonBlocks, extractEmbeddedState } from '../features/indexing/extraction/index.js';
import { NetworkRecorder } from './networkRecorder.js';
import { replayGraphqlRequests } from './graphqlReplay.js';
import { wait } from '../utils/common.js';
import { RobotsPolicyCache } from './robotsPolicy.js';
import { resolveDynamicFetchPolicy } from './dynamicFetchPolicy.js';
import { attachRuntimeScreencast } from './runtimeScreencast.js';
import { buildStealthContextOptions, STEALTH_INIT_SCRIPT } from './stealthProfile.js';
import { configInt, configBool, configValue } from '../shared/settingsAccessor.js';

function fixtureFilenameFromHost(host) {
  return `${host.toLowerCase()}.json`;
}

function isRetryableStatus(statusCode) {
  const status = Number(statusCode || 0);
  return status === 429 || (status >= 500 && status <= 599);
}

function isRetryableFetchError(error) {
  if (!error) {
    return false;
  }
  if (error.retryable === true) {
    return true;
  }
  const message = String(error.message || '').toLowerCase();
  if (!message) {
    return false;
  }
  return /(timeout|timed out|etimedout|econnreset|econnrefused|socket hang up|network error|dns|navigation)/.test(message);
}

function buildTransientStatusError(status) {
  const err = new Error(`transient_status_${status}`);
  err.retryable = true;
  err.status = status;
  return err;
}

function screenshotSelectorsFromConfig(config = {}) {
  const fromEnv = String(configValue(config, 'capturePageScreenshotSelectors'))
    .split(',')
    .map((row) => String(row || '').trim())
    .filter(Boolean);
  if (fromEnv.length > 0) {
    return fromEnv.slice(0, 12);
  }
  return [
    'table',
    '[data-spec-table]',
    '.specs-table',
    '.spec-table',
    '.specifications'
  ];
}

async function captureScreenshotArtifact(page, config = {}, policy = {}) {
  if (!configBool(config, 'capturePageScreenshotEnabled')) {
    return null;
  }
  const format = String(configValue(config, 'capturePageScreenshotFormat')).trim().toLowerCase() === 'png'
    ? 'png'
    : 'jpeg';
  const quality = configInt(config, 'capturePageScreenshotQuality');
  const selectors = screenshotSelectorsFromConfig(config);
  const maxBytes = configInt(config, 'capturePageScreenshotMaxBytes');

  const capture = async (selector) => {
    const element = selector ? await page.$(selector) : null;
    if (selector && !element) return null;
    const bytes = element
      ? await element.screenshot({
        type: format,
        ...(format === 'jpeg' ? { quality } : {})
      })
      : await page.screenshot({
        type: format,
        fullPage: Boolean(policy.captureFullPageScreenshot),
        ...(format === 'jpeg' ? { quality } : {})
      });
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      return null;
    }
    if (bytes.length > maxBytes) {
      return { rejected: true, rejected_reason: 'exceeds_max_bytes', rejected_bytes: bytes.length, max_bytes: maxBytes, kind: selector ? 'crop' : 'page', selector: selector || null };
    }
    const viewport = page.viewportSize() || {};
    return {
      kind: selector ? 'crop' : 'page',
      format,
      selector: selector || null,
      bytes,
      width: Number(viewport.width || 0) || null,
      height: Number(viewport.height || 0) || null,
      captured_at: new Date().toISOString()
    };
  };

  let lastRejection = null;
  for (const selector of selectors) {
    try {
      const artifact = await capture(selector);
      if (artifact && !artifact.rejected) return artifact;
      if (artifact?.rejected) lastRejection = artifact;
    } catch {
      // try next selector
    }
  }
  try {
    const viewport = await capture(null);
    if (viewport && !viewport.rejected) return viewport;
    if (viewport?.rejected) lastRejection = viewport;
  } catch {
    // ignore
  }
  return lastRejection || null;
}

function policySnapshotForTelemetry(fetchPolicy = {}) {
  return {
    per_host_min_delay_ms: Number(fetchPolicy?.perHostMinDelayMs || 0),
    page_goto_timeout_ms: Number(fetchPolicy?.pageGotoTimeoutMs || 0),
    page_network_idle_timeout_ms: Number(fetchPolicy?.pageNetworkIdleTimeoutMs || 0),
    post_load_wait_ms: Number(fetchPolicy?.postLoadWaitMs || 0),
    auto_scroll_enabled: Boolean(fetchPolicy?.autoScrollEnabled),
    auto_scroll_passes: Number(fetchPolicy?.autoScrollPasses || 0),
    auto_scroll_delay_ms: Number(fetchPolicy?.autoScrollDelayMs || 0),
    graphql_replay_enabled: fetchPolicy?.graphqlReplayEnabled !== false,
    max_graphql_replays: Number(fetchPolicy?.maxGraphqlReplays || 0),
    retry_budget: Number(fetchPolicy?.retryBudget || 0),
    retry_backoff_ms: Number(fetchPolicy?.retryBackoffMs || 0),
    matched_host: String(fetchPolicy?.matchedHost || '').trim() || null,
    override_applied: Boolean(fetchPolicy?.overrideApplied)
  };
}

function requestThrottleKeyForSource(source = {}) {
  const host = String(source?.host || '').trim().toLowerCase();
  if (host) {
    return host;
  }
  try {
    return new URL(String(source?.url || '')).hostname.toLowerCase();
  } catch {
    return '';
  }
}

async function waitForRequestThrottlerSlot(config = {}, source = {}) {
  const requestThrottler = config?.requestThrottler;
  if (!requestThrottler || typeof requestThrottler.acquire !== 'function') {
    return 0;
  }
  const key = requestThrottleKeyForSource(source);
  if (!key) {
    return 0;
  }
  return Number(await requestThrottler.acquire({
    key,
    url: String(source?.url || '').trim() || null,
    scope: 'fetch'
  })) || 0;
}

export class PlaywrightFetcher {
  constructor(config, logger, options = {}) {
    this.config = config;
    this.logger = logger;
    this.browser = null;
    this.context = null;
    this.hostLastAccess = new Map();
    this.policyLogSeen = new Set();
    this.robotsPolicy = new RobotsPolicyCache({
      timeoutMs: configInt(this.config, 'robotsTxtTimeoutMs'),
      logger
    });
    this.onScreencastFrame = typeof options?.onScreencastFrame === 'function'
      ? options.onScreencastFrame
      : undefined;
  }

  async start() {
    if (this.browser) {
      return;
    }
    this.browser = await chromium.launch({ headless: true });
    const stealthOpts = buildStealthContextOptions({
      userAgent: configValue(this.config, 'userAgent') || undefined
    });
    this.context = await this.browser.newContext(stealthOpts);
    await this.context.addInitScript(STEALTH_INIT_SCRIPT);
  }

  async stop() {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async waitForHostSlot(host, minDelayMs = configInt(this.config, 'perHostMinDelayMs')) {
    const now = Date.now();
    const last = this.hostLastAccess.get(host) || 0;
    const delta = now - last;
    const delayMs = Math.max(0, Number(minDelayMs || configInt(this.config, 'perHostMinDelayMs')));
    let waitedMs = 0;
    if (delta < delayMs) {
      waitedMs = delayMs - delta;
      await wait(waitedMs);
    }
    this.hostLastAccess.set(host, Date.now());
    return waitedMs;
  }

  async enforceRobots(source) {
    if (!configBool(this.config, 'robotsTxtCompliant') || source?.robotsTxtCompliant === false) {
      return null;
    }

    let decision;
    try {
      decision = await this.robotsPolicy.canFetch({
        url: source.url,
        userAgent: configValue(this.config, 'userAgent') || '*'
      });
    } catch (error) {
      this.logger?.warn?.('robots_policy_check_failed', {
        url: source.url,
        message: error.message
      });
      return null;
    }

    if (decision?.allowed !== false) {
      return null;
    }

    return {
      url: source.url,
      finalUrl: source.url,
      status: 451,
      title: '',
      html: '',
      ldjsonBlocks: [],
      embeddedState: {},
      networkResponses: [],
      blockedByRobots: true,
      robotsDecision: decision
    };
  }

  async fetch(source) {
    const fetchPolicy = resolveDynamicFetchPolicy(this.config, source);
    if (fetchPolicy.overrideApplied && fetchPolicy.host && !this.policyLogSeen.has(fetchPolicy.host)) {
      this.policyLogSeen.add(fetchPolicy.host);
      this.logger?.info?.('dynamic_fetch_policy_applied', {
        host: fetchPolicy.host,
        matched_host: fetchPolicy.matchedHost,
        page_goto_timeout_ms: fetchPolicy.pageGotoTimeoutMs,
        page_network_idle_timeout_ms: fetchPolicy.pageNetworkIdleTimeoutMs,
        per_host_delay_ms: fetchPolicy.perHostMinDelayMs,
        post_load_wait_ms: fetchPolicy.postLoadWaitMs,
        auto_scroll_enabled: fetchPolicy.autoScrollEnabled,
        auto_scroll_passes: fetchPolicy.autoScrollPasses,
        graphql_replay_enabled: fetchPolicy.graphqlReplayEnabled,
        max_graphql_replays: fetchPolicy.maxGraphqlReplays,
        retry_budget: fetchPolicy.retryBudget,
        retry_backoff_ms: fetchPolicy.retryBackoffMs
      });
    }

    const robotsBlocked = await this.enforceRobots(source);
    if (robotsBlocked) {
      this.logger?.warn?.('source_blocked_by_robots', {
        url: source.url,
        host: source.host,
        robots_url: robotsBlocked.robotsDecision?.robots_url,
        matched_rule: robotsBlocked.robotsDecision?.matched_rule || null
      });
      return robotsBlocked;
    }

    const maxAttempts = Math.max(1, Number(fetchPolicy.retryBudget || 0) + 1);
    const fetchBudgetMs = Math.max(0, Number(fetchPolicy.fetchBudgetMs || configInt(this.config, 'fetchBudgetMs')));
    const startedAtMs = Date.now();

    let html = '';
    let title = '';
    let status = 0;
    let finalUrl = source.url;
    let networkResponses = [];
    let screenshot = null;
    let replayRowsAdded = 0;
    let attemptsUsed = 0;
    const retryReasons = [];
    let hostWaitMs = 0;
    let navigationMs = 0;
    let networkIdleWaitMs = 0;
    let interactiveWaitMs = 0;
    let graphqlReplayMs = 0;
    let contentCaptureMs = 0;
    let screenshotMs = 0;
    let requestThrottleWaitMs = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attemptsUsed = attempt;
      hostWaitMs += await this.waitForHostSlot(
        source.host,
        source?.crawlConfig?.rate_limit_ms ?? fetchPolicy.perHostMinDelayMs
      );
      requestThrottleWaitMs += await waitForRequestThrottlerSlot(this.config, source);

      const page = await this.context.newPage();
      const recorder = new NetworkRecorder({
        maxJsonBytes: Math.min(configInt(this.config, 'maxJsonBytes'), 512_000),
        maxRows: configInt(this.config, 'maxNetworkResponsesPerPage')
      });

      const stopRuntimeScreencast = await attachRuntimeScreencast({
        page,
        config: this.config,
        workerId: source?.worker_id || '',
        onFrame: this.onScreencastFrame
      });

      page.on('response', async (response) => {
        await recorder.handleResponse(response);
      });

      try {
        const navigationStartedAt = Date.now();
        const response = await page.goto(source.url, {
          waitUntil: 'domcontentloaded',
          timeout: fetchPolicy.pageGotoTimeoutMs || configInt(this.config, 'pageGotoTimeoutMs')
        });
        navigationMs += Math.max(0, Date.now() - navigationStartedAt);
        status = response?.status() || 0;
        finalUrl = page.url();

        if (isRetryableStatus(status) && attempt < maxAttempts) {
          throw buildTransientStatusError(status);
        }

        try {
          const networkIdleStartedAt = Date.now();
          await page.waitForLoadState('networkidle', {
            timeout: fetchPolicy.pageNetworkIdleTimeoutMs || configInt(this.config, 'pageNetworkIdleTimeoutMs')
          });
          networkIdleWaitMs += Math.max(0, Date.now() - networkIdleStartedAt);
        } catch {
          // Best effort only.
        }

        const interactiveStartedAt = Date.now();
        await this.captureInteractiveSignals(page, fetchPolicy);
        interactiveWaitMs += Math.max(0, Date.now() - interactiveStartedAt);

        if (fetchBudgetMs > 0 && (Date.now() - startedAtMs) > fetchBudgetMs) {
          const budgetErr = new Error(`fetch_budget_exceeded_${fetchBudgetMs}ms`);
          budgetErr.retryable = false;
          throw budgetErr;
        }

        if (fetchPolicy.graphqlReplayEnabled) {
          const replayStartedAt = Date.now();
          const replayRows = await replayGraphqlRequests({
            page,
            capturedResponses: recorder.rows,
            maxReplays: fetchPolicy.maxGraphqlReplays,
            maxJsonBytes: configInt(this.config, 'maxJsonBytes'),
            logger: this.logger
          });
          graphqlReplayMs += Math.max(0, Date.now() - replayStartedAt);
          if (replayRows.length) {
            recorder.rows.push(...replayRows);
            replayRowsAdded += replayRows.length;
          }
        }

        title = await page.title();
        const screenshotStartedAt = Date.now();
        screenshot = await captureScreenshotArtifact(page, this.config, fetchPolicy);
        screenshotMs += Math.max(0, Date.now() - screenshotStartedAt);
        const captureStartedAt = Date.now();
        html = await page.content();
        contentCaptureMs += Math.max(0, Date.now() - captureStartedAt);
        networkResponses = recorder.rows;
        await stopRuntimeScreencast();
        await page.close();
        break;
      } catch (error) {
        await stopRuntimeScreencast();
        await page.close();
        retryReasons.push(String(error?.message || 'retryable_error'));
        const shouldRetry = attempt < maxAttempts && isRetryableFetchError(error);
        if (!shouldRetry) {
          throw error;
        }
        this.logger?.warn?.('dynamic_fetch_retry', {
          host: source.host,
          url: source.url,
          attempt,
          max_attempts: maxAttempts,
          reason: String(error?.message || 'retryable_error')
        });
        const retryBackoffMs = Math.max(0, Number(fetchPolicy.retryBackoffMs || 0));
        if (retryBackoffMs > 0) {
          await wait(retryBackoffMs);
        }
      }
    }

    const ldjsonBlocks = extractLdJsonBlocks(html);
    const embeddedState = extractEmbeddedState(html);
    const fetchTelemetry = {
      fetcher_kind: 'playwright',
      attempts: attemptsUsed || 1,
      retry_count: Math.max(0, (attemptsUsed || 1) - 1),
      retry_reasons: retryReasons.slice(0, 8),
      policy: policySnapshotForTelemetry(fetchPolicy),
      timings_ms: {
        total: Math.max(0, Date.now() - startedAtMs),
        host_wait: hostWaitMs,
        request_throttle_wait: requestThrottleWaitMs,
        navigation: navigationMs,
        network_idle_wait: networkIdleWaitMs,
        interactive_wait: interactiveWaitMs,
        graphql_replay: graphqlReplayMs,
        content_capture: contentCaptureMs,
        screenshot_capture: screenshotMs
      },
      payload_counts: {
        network_rows: Array.isArray(networkResponses) ? networkResponses.length : 0,
        graphql_replay_rows: replayRowsAdded,
        ldjson_blocks: Array.isArray(ldjsonBlocks) ? ldjsonBlocks.length : 0
      },
      capture: {
        screenshot_available: Boolean(screenshot) && !screenshot?.rejected,
        screenshot_kind: String(screenshot?.kind || '').trim() || null,
        screenshot_selector: String(screenshot?.selector || '').trim() || null,
        screenshot_rejected_reason: String(screenshot?.rejected_reason || '').trim() || null,
        screenshot_rejected_bytes: screenshot?.rejected ? Number(screenshot.rejected_bytes || 0) : null
      }
    };

    const resolvedScreenshot = screenshot?.rejected ? null : screenshot;

    return {
      url: source.url,
      finalUrl,
      status,
      title,
      html,
      ldjsonBlocks,
      embeddedState,
      networkResponses,
      screenshot: resolvedScreenshot,
      fetchTelemetry
    };
  }

  async captureInteractiveSignals(page, policy = null) {
    const activePolicy = policy || this.config;
    const autoScrollPasses = configInt(activePolicy, 'autoScrollPasses');
    const autoScrollDelayMs = configInt(activePolicy, 'autoScrollDelayMs');
    const shouldScroll = configBool(activePolicy, 'autoScrollEnabled') && autoScrollPasses > 0;

    if (shouldScroll) {
      for (let i = 0; i < autoScrollPasses; i += 1) {
        try {
          await page.evaluate(() => {
            const maxY = Math.max(
              document.body?.scrollHeight || 0,
              document.documentElement?.scrollHeight || 0
            );
            window.scrollTo(0, maxY);
          });
        } catch {
          break;
        }
        await page.waitForTimeout(autoScrollDelayMs);
      }

      try {
        await page.evaluate(() => window.scrollTo(0, 0));
      } catch {
        // ignore
      }
    }

    const postLoadWaitMs = configInt(activePolicy, 'postLoadWaitMs');
    if (postLoadWaitMs > 0) {
      await page.waitForTimeout(postLoadWaitMs);
    }
  }
}

function extractHtmlTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? String(match[1] || '').trim() : '';
}

async function fetchTextWithTimeout(url, timeoutMs, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1_000, Number(timeoutMs || 30_000)));
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers,
      signal: controller.signal
    });
    const bodyText = await response.text();
    return {
      response,
      bodyText
    };
  } finally {
    clearTimeout(timeout);
  }
}

export class HttpFetcher {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.hostLastAccess = new Map();
    this.policyLogSeen = new Set();
    this.robotsPolicy = new RobotsPolicyCache({
      timeoutMs: configInt(this.config, 'robotsTxtTimeoutMs'),
      logger
    });
  }

  async start() {}

  async stop() {}

  async waitForHostSlot(host, minDelayMs = configInt(this.config, 'perHostMinDelayMs')) {
    const now = Date.now();
    const last = this.hostLastAccess.get(host) || 0;
    const delta = now - last;
    const delayMs = Math.max(0, Number(minDelayMs || configInt(this.config, 'perHostMinDelayMs')));
    let waitedMs = 0;
    if (delta < delayMs) {
      waitedMs = delayMs - delta;
      await wait(waitedMs);
    }
    this.hostLastAccess.set(host, Date.now());
    return waitedMs;
  }

  async enforceRobots(source) {
    if (!configBool(this.config, 'robotsTxtCompliant') || source?.robotsTxtCompliant === false) {
      return null;
    }
    let decision;
    try {
      decision = await this.robotsPolicy.canFetch({
        url: source.url,
        userAgent: configValue(this.config, 'userAgent') || '*'
      });
    } catch (error) {
      this.logger?.warn?.('robots_policy_check_failed', {
        url: source.url,
        message: error.message
      });
      return null;
    }

    if (decision?.allowed !== false) {
      return null;
    }

    return {
      url: source.url,
      finalUrl: source.url,
      status: 451,
      title: '',
      html: '',
      ldjsonBlocks: [],
      embeddedState: {},
      networkResponses: [],
      blockedByRobots: true,
      robotsDecision: decision
    };
  }

  async fetch(source) {
    const fetchPolicy = resolveDynamicFetchPolicy(this.config, source);
    if (fetchPolicy.overrideApplied && fetchPolicy.host && !this.policyLogSeen.has(fetchPolicy.host)) {
      this.policyLogSeen.add(fetchPolicy.host);
      this.logger?.info?.('dynamic_fetch_policy_applied', {
        host: fetchPolicy.host,
        matched_host: fetchPolicy.matchedHost,
        page_goto_timeout_ms: fetchPolicy.pageGotoTimeoutMs,
        per_host_delay_ms: fetchPolicy.perHostMinDelayMs,
        retry_budget: fetchPolicy.retryBudget,
        retry_backoff_ms: fetchPolicy.retryBackoffMs
      });
    }

    const robotsBlocked = await this.enforceRobots(source);
    if (robotsBlocked) {
      this.logger?.warn?.('source_blocked_by_robots', {
        url: source.url,
        host: source.host,
        robots_url: robotsBlocked.robotsDecision?.robots_url,
        matched_rule: robotsBlocked.robotsDecision?.matched_rule || null
      });
      return robotsBlocked;
    }

    const maxAttempts = Math.max(1, Number(fetchPolicy.retryBudget || 0) + 1);
    const startedAtMs = Date.now();
    let result;
    let attemptsUsed = 0;
    let hostWaitMs = 0;
    let requestThrottleWaitMs = 0;
    let requestMs = 0;
    const retryReasons = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attemptsUsed = attempt;
      hostWaitMs += await this.waitForHostSlot(
        source.host,
        source?.crawlConfig?.rate_limit_ms ?? fetchPolicy.perHostMinDelayMs
      );
      requestThrottleWaitMs += await waitForRequestThrottlerSlot(this.config, source);

      try {
        const requestStartedAt = Date.now();
        result = await fetchTextWithTimeout(
          source.url,
          fetchPolicy.pageGotoTimeoutMs || configInt(this.config, 'pageGotoTimeoutMs'),
          {
            'user-agent': configValue(this.config, 'userAgent') || 'SpecHarvester/1.0',
            accept: '*/*'
          }
        );
        requestMs += Math.max(0, Date.now() - requestStartedAt);

        const status = Number(result?.response?.status || 0);
        if (isRetryableStatus(status) && attempt < maxAttempts) {
          this.logger?.warn?.('dynamic_fetch_retry', {
            host: source.host,
            url: source.url,
            attempt,
            max_attempts: maxAttempts,
            reason: `status_${status}`
          });
          retryReasons.push(`status_${status}`);
          const retryBackoffMs = Math.max(0, Number(fetchPolicy.retryBackoffMs || 0));
          if (retryBackoffMs > 0) {
            await wait(retryBackoffMs);
          }
          continue;
        }
        break;
      } catch (error) {
        const shouldRetry = attempt < maxAttempts && isRetryableFetchError(error);
        if (!shouldRetry) {
          throw new Error(`HTTP fetch failed: ${error.message}`);
        }
        this.logger?.warn?.('dynamic_fetch_retry', {
          host: source.host,
          url: source.url,
          attempt,
          max_attempts: maxAttempts,
          reason: String(error?.message || 'retryable_error')
        });
        retryReasons.push(String(error?.message || 'retryable_error'));
        const retryBackoffMs = Math.max(0, Number(fetchPolicy.retryBackoffMs || 0));
        if (retryBackoffMs > 0) {
          await wait(retryBackoffMs);
        }
      }
    }

    const { response, bodyText } = result;
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const finalUrl = response.url || source.url;
    const status = response.status || 0;
    const html = bodyText || '';
    const title = contentType.includes('text/html') ? extractHtmlTitle(html) : '';
    const ldjsonBlocks = extractLdJsonBlocks(html);
    const embeddedState = extractEmbeddedState(html);

    const isJsonPayload =
      contentType.includes('application/json') ||
      contentType.includes('+json') ||
      finalUrl.toLowerCase().endsWith('.json');

    const networkResponses = [];
    if (isJsonPayload || finalUrl.toLowerCase().includes('/graphql')) {
      let jsonFull;
      let jsonPreview = '';
      try {
        jsonFull = JSON.parse(bodyText);
      } catch {
        jsonPreview = String(bodyText || '').slice(0, 8_000);
      }
      networkResponses.push({
        ts: new Date().toISOString(),
        url: finalUrl,
        status,
        contentType: contentType || 'application/json',
        isGraphQl: finalUrl.toLowerCase().includes('/graphql'),
        classification: 'fetch_json',
        boundedByteLen: Buffer.byteLength(String(bodyText || ''), 'utf8'),
        truncated: false,
        request_url: source.url,
        request_method: 'GET',
        resource_type: 'fetch',
        jsonFull,
        jsonPreview
      });
    }
    const fetchTelemetry = {
      fetcher_kind: 'http',
      attempts: attemptsUsed || 1,
      retry_count: Math.max(0, (attemptsUsed || 1) - 1),
      retry_reasons: retryReasons.slice(0, 8),
      policy: policySnapshotForTelemetry(fetchPolicy),
      timings_ms: {
        total: Math.max(0, Date.now() - startedAtMs),
        host_wait: hostWaitMs,
        request_throttle_wait: requestThrottleWaitMs,
        navigation: requestMs,
        network_idle_wait: 0,
        interactive_wait: 0,
        graphql_replay: 0,
        content_capture: 0,
        screenshot_capture: 0
      },
      payload_counts: {
        network_rows: networkResponses.length,
        graphql_replay_rows: 0,
        ldjson_blocks: Array.isArray(ldjsonBlocks) ? ldjsonBlocks.length : 0
      },
      capture: {
        screenshot_available: false,
        screenshot_kind: null,
        screenshot_selector: null
      }
    };

    return {
      url: source.url,
      finalUrl,
      status,
      title,
      html,
      ldjsonBlocks,
      embeddedState,
      networkResponses,
      fetchTelemetry
    };
  }
}

export class CrawleeFetcher {
  constructor(config, logger, options = {}) {
    this.config = config;
    this.logger = logger;
    this.hostLastAccess = new Map();
    this.policyLogSeen = new Set();
    this.robotsPolicy = new RobotsPolicyCache({
      timeoutMs: configInt(this.config, 'robotsTxtTimeoutMs'),
      logger
    });
    this.crawleeImportPromise = null;
    this.onScreencastFrame = typeof options?.onScreencastFrame === 'function'
      ? options.onScreencastFrame
      : undefined;
  }

  async ensureCrawlee() {
    if (!this.crawleeImportPromise) {
      this.crawleeImportPromise = import('crawlee');
    }
    return this.crawleeImportPromise;
  }

  async start() {
    await this.ensureCrawlee();
  }

  async stop() {}

  async waitForHostSlot(host, minDelayMs = configInt(this.config, 'perHostMinDelayMs')) {
    const now = Date.now();
    const last = this.hostLastAccess.get(host) || 0;
    const delta = now - last;
    const delayMs = Math.max(0, Number(minDelayMs || configInt(this.config, 'perHostMinDelayMs')));
    let waitedMs = 0;
    if (delta < delayMs) {
      waitedMs = delayMs - delta;
      await wait(waitedMs);
    }
    this.hostLastAccess.set(host, Date.now());
    return waitedMs;
  }

  async enforceRobots(source) {
    if (!configBool(this.config, 'robotsTxtCompliant') || source?.robotsTxtCompliant === false) {
      return null;
    }

    let decision;
    try {
      decision = await this.robotsPolicy.canFetch({
        url: source.url,
        userAgent: configValue(this.config, 'userAgent') || '*'
      });
    } catch (error) {
      this.logger?.warn?.('robots_policy_check_failed', {
        url: source.url,
        message: error.message
      });
      return null;
    }

    if (decision?.allowed !== false) {
      return null;
    }

    return {
      url: source.url,
      finalUrl: source.url,
      status: 451,
      title: '',
      html: '',
      ldjsonBlocks: [],
      embeddedState: {},
      networkResponses: [],
      blockedByRobots: true,
      robotsDecision: decision
    };
  }

  async captureInteractiveSignals(page, policy = null) {
    const activePolicy = policy || this.config;
    const autoScrollPasses = configInt(activePolicy, 'autoScrollPasses');
    const autoScrollDelayMs = configInt(activePolicy, 'autoScrollDelayMs');
    const shouldScroll = configBool(activePolicy, 'autoScrollEnabled') && autoScrollPasses > 0;

    if (shouldScroll) {
      for (let i = 0; i < autoScrollPasses; i += 1) {
        try {
          await page.evaluate(() => {
            const maxY = Math.max(
              document.body?.scrollHeight || 0,
              document.documentElement?.scrollHeight || 0
            );
            window.scrollTo(0, maxY);
          });
        } catch {
          break;
        }
        await page.waitForTimeout(autoScrollDelayMs);
      }

      try {
        await page.evaluate(() => window.scrollTo(0, 0));
      } catch {
        // ignore
      }
    }

    const postLoadWaitMs = configInt(activePolicy, 'postLoadWaitMs');
    if (postLoadWaitMs > 0) {
      await page.waitForTimeout(postLoadWaitMs);
    }
  }

  async fetch(source) {
    const fetchPolicy = resolveDynamicFetchPolicy(this.config, source);
    if (fetchPolicy.overrideApplied && fetchPolicy.host && !this.policyLogSeen.has(fetchPolicy.host)) {
      this.policyLogSeen.add(fetchPolicy.host);
      this.logger?.info?.('dynamic_fetch_policy_applied', {
        host: fetchPolicy.host,
        matched_host: fetchPolicy.matchedHost,
        fetcher_kind: 'crawlee',
        page_goto_timeout_ms: fetchPolicy.pageGotoTimeoutMs,
        page_network_idle_timeout_ms: fetchPolicy.pageNetworkIdleTimeoutMs,
        per_host_delay_ms: fetchPolicy.perHostMinDelayMs,
        post_load_wait_ms: fetchPolicy.postLoadWaitMs,
        auto_scroll_enabled: fetchPolicy.autoScrollEnabled,
        auto_scroll_passes: fetchPolicy.autoScrollPasses,
        graphql_replay_enabled: fetchPolicy.graphqlReplayEnabled,
        max_graphql_replays: fetchPolicy.maxGraphqlReplays,
        retry_budget: fetchPolicy.retryBudget,
        retry_backoff_ms: fetchPolicy.retryBackoffMs
      });
    }

    const robotsBlocked = await this.enforceRobots(source);
    if (robotsBlocked) {
      this.logger?.warn?.('source_blocked_by_robots', {
        url: source.url,
        host: source.host,
        robots_url: robotsBlocked.robotsDecision?.robots_url,
        matched_rule: robotsBlocked.robotsDecision?.matched_rule || null
      });
      return robotsBlocked;
    }

    const startedAtMs = Date.now();
    let hostWaitMs = await this.waitForHostSlot(
      source.host,
      source?.crawlConfig?.rate_limit_ms ?? fetchPolicy.perHostMinDelayMs
    );
    let requestThrottleWaitMs = 0;

    const { PlaywrightCrawler, log: crawleeLog } = await this.ensureCrawlee();
    if (crawleeLog?.setLevel && crawleeLog?.LEVELS?.WARNING !== undefined) {
      crawleeLog.setLevel(crawleeLog.LEVELS.WARNING);
    }

    const maxAttempts = Math.max(1, Number(fetchPolicy.retryBudget || 0) + 1);
    const retryBackoffMs = Math.max(0, Number(fetchPolicy.retryBackoffMs || 0));
    const navigationTimeout = fetchPolicy.pageGotoTimeoutMs || configInt(this.config, 'pageGotoTimeoutMs');
    const networkIdleTimeout = fetchPolicy.pageNetworkIdleTimeoutMs || configInt(this.config, 'pageNetworkIdleTimeoutMs');
    const configuredRequestHandlerTimeout = configInt(this.config, 'crawleeRequestHandlerTimeoutSecs');
    const derivedRequestHandlerTimeout = Math.ceil(
      (navigationTimeout + networkIdleTimeout + Math.max(0, Number(fetchPolicy.postLoadWaitMs || 0)) + 5_000) / 1000
    );
    const requestHandlerTimeoutSecs = Math.max(
      15,
      configuredRequestHandlerTimeout,
      derivedRequestHandlerTimeout
    );

    let result = null;
    let lastError = null;
    let attemptsUsed = 1;
    const retryReasons = [];
    let navigationMs = 0;
    let networkIdleWaitMs = 0;
    let interactiveWaitMs = 0;
    let graphqlReplayMs = 0;
    let contentCaptureMs = 0;
    let screenshotMs = 0;
    let replayRowsAdded = 0;
    const activeRuntimeScreencasts = new Map();
    const runtimeScreencastKeyForRequest = (request = {}) => {
      const uniqueKey = String(request?.uniqueKey || '').trim();
      if (uniqueKey) {
        return uniqueKey;
      }
      return String(request?.url || source.url || '').trim();
    };
    const attachRequestRuntimeScreencast = async (request = {}, page = null) => {
      const key = runtimeScreencastKeyForRequest(request);
      if (!key || !page || activeRuntimeScreencasts.has(key)) {
        return activeRuntimeScreencasts.get(key) || null;
      }
      const stopRuntimeScreencast = await attachRuntimeScreencast({
        page,
        config: this.config,
        workerId: source?.worker_id || '',
        onFrame: this.onScreencastFrame
      });
      activeRuntimeScreencasts.set(key, stopRuntimeScreencast);
      return stopRuntimeScreencast;
    };
    const stopRequestRuntimeScreencast = async (request = {}) => {
      const key = runtimeScreencastKeyForRequest(request);
      if (!key || !activeRuntimeScreencasts.has(key)) {
        return;
      }
      const stopRuntimeScreencast = activeRuntimeScreencasts.get(key);
      activeRuntimeScreencasts.delete(key);
      try {
        await stopRuntimeScreencast?.();
      } catch {
        // ignore screencast cleanup failures
      }
    };

    const crawler = new PlaywrightCrawler({
      maxRequestsPerCrawl: 1,
      maxRequestRetries: Math.max(0, maxAttempts - 1),
      requestHandlerTimeoutSecs,
      launchContext: {
        launchOptions: {
          headless: configBool(this.config, 'crawleeHeadless')
        }
      },
      preNavigationHooks: [
        async ({ request, page }, gotoOptions) => {
          gotoOptions.waitUntil = 'domcontentloaded';
          gotoOptions.timeout = navigationTimeout;
          attemptsUsed = Math.max(attemptsUsed, Number(request?.retryCount || 0) + 1);
          requestThrottleWaitMs += await waitForRequestThrottlerSlot(this.config, source);
          await attachRequestRuntimeScreencast(request, page);
          if (request.retryCount > 0 && retryBackoffMs > 0) {
            retryReasons.push('crawlee_retry_backoff');
            this.logger?.warn?.('dynamic_fetch_retry', {
              host: source.host,
              url: source.url,
              attempt: request.retryCount + 1,
              max_attempts: maxAttempts,
              fetcher_kind: 'crawlee',
              reason: 'crawlee_retry_backoff'
            });
            await wait(retryBackoffMs);
            hostWaitMs += retryBackoffMs;
          }
        }
      ],
      requestHandler: async ({ page, request, response }) => {
        const status = response?.status() || 0;
        if (isRetryableStatus(status) && request.retryCount < maxAttempts - 1) {
          throw buildTransientStatusError(status);
        }

        const recorder = new NetworkRecorder({
          maxJsonBytes: configInt(this.config, 'maxJsonBytes'),
          maxRows: configInt(this.config, 'maxNetworkResponsesPerPage')
        });
        page.on('response', async (resp) => {
          await recorder.handleResponse(resp);
        });

        await attachRequestRuntimeScreencast(request, page);

        try {
          try {
            const networkIdleStartedAt = Date.now();
            await page.waitForLoadState('networkidle', {
              timeout: networkIdleTimeout
            });
            networkIdleWaitMs += Math.max(0, Date.now() - networkIdleStartedAt);
          } catch {
            // Best effort only.
          }

          const interactiveStartedAt = Date.now();
          await this.captureInteractiveSignals(page, fetchPolicy);
          interactiveWaitMs += Math.max(0, Date.now() - interactiveStartedAt);

          if (fetchPolicy.graphqlReplayEnabled) {
            const replayStartedAt = Date.now();
            const replayRows = await replayGraphqlRequests({
              page,
              capturedResponses: recorder.rows,
              maxReplays: fetchPolicy.maxGraphqlReplays,
              maxJsonBytes: configInt(this.config, 'maxJsonBytes'),
              logger: this.logger
            });
            graphqlReplayMs += Math.max(0, Date.now() - replayStartedAt);
            if (replayRows.length) {
              recorder.rows.push(...replayRows);
              replayRowsAdded += replayRows.length;
            }
          }

          const title = await page.title();
          const finalUrl = page.url();
          const screenshotStartedAt = Date.now();
          const screenshot = await captureScreenshotArtifact(page, this.config, fetchPolicy);
          screenshotMs += Math.max(0, Date.now() - screenshotStartedAt);
          const captureStartedAt = Date.now();
          const html = await page.content();
          contentCaptureMs += Math.max(0, Date.now() - captureStartedAt);
          navigationMs += Math.max(0, Number(request?.loadedTimeMillis || 0));
          const ldjsonBlocks = extractLdJsonBlocks(html);
          const embeddedState = extractEmbeddedState(html);
          const fetchTelemetry = {
            fetcher_kind: 'crawlee',
            attempts: attemptsUsed,
            retry_count: Math.max(0, attemptsUsed - 1),
            retry_reasons: retryReasons.slice(0, 8),
            policy: policySnapshotForTelemetry(fetchPolicy),
            timings_ms: {
              total: Math.max(0, Date.now() - startedAtMs),
              host_wait: hostWaitMs,
              request_throttle_wait: requestThrottleWaitMs,
              navigation: navigationMs,
              network_idle_wait: networkIdleWaitMs,
              interactive_wait: interactiveWaitMs,
              graphql_replay: graphqlReplayMs,
              content_capture: contentCaptureMs,
              screenshot_capture: screenshotMs
            },
            payload_counts: {
              network_rows: recorder.rows.length,
              graphql_replay_rows: replayRowsAdded,
              ldjson_blocks: Array.isArray(ldjsonBlocks) ? ldjsonBlocks.length : 0
            },
            capture: {
              screenshot_available: Boolean(screenshot) && !screenshot?.rejected,
              screenshot_kind: String(screenshot?.kind || '').trim() || null,
              screenshot_selector: String(screenshot?.selector || '').trim() || null,
              screenshot_rejected_reason: String(screenshot?.rejected_reason || '').trim() || null,
              screenshot_rejected_bytes: screenshot?.rejected ? Number(screenshot.rejected_bytes || 0) : null
            }
          };

          const resolvedScreenshot = screenshot?.rejected ? null : screenshot;

          result = {
            url: source.url,
            finalUrl,
            status,
            title,
            html,
            ldjsonBlocks,
            embeddedState,
            networkResponses: recorder.rows,
            screenshot: resolvedScreenshot,
            fetchTelemetry
          };
        } finally {
          await stopRequestRuntimeScreencast(request);
        }
      },
      failedRequestHandler: async ({ request, error }) => {
        await stopRequestRuntimeScreencast(request);
        retryReasons.push(String(error?.message || 'crawlee_failed'));
        lastError = error || new Error(`crawlee_failed_${request.url}`);
      },
      errorHandler: async ({ error }) => {
        retryReasons.push(String(error?.message || 'crawlee_failed'));
        if (!lastError) {
          lastError = error;
        }
      }
    });

    const uniqueKey = `${String(source.url || '')}::${Date.now()}::${Math.random().toString(36).slice(2, 10)}`;
    await crawler.run([{
      url: source.url,
      uniqueKey
    }]);

    if (result) {
      return result;
    }

    if (lastError) {
      throw new Error(`Crawlee fetch failed: ${String(lastError.message || lastError)}`);
    }
    throw new Error('Crawlee fetch failed: no_result');
  }
}

export class DryRunFetcher {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.fixtureRoot = path.resolve('fixtures/dryrun');
  }

  async start() {}

  async stop() {}

  async fetch(source) {
    const file = path.join(this.fixtureRoot, fixtureFilenameFromHost(source.host));
    const raw = await fs.readFile(file, 'utf8');
    const fixture = JSON.parse(raw);

    const html = fixture.html || '';
    const ldjsonBlocks = fixture.ldjsonBlocks || extractLdJsonBlocks(html);
    const embeddedState = fixture.embeddedState || extractEmbeddedState(html);

    return {
      url: source.url,
      finalUrl: source.url,
      status: fixture.status || 200,
      title: fixture.title || '',
      html,
      ldjsonBlocks,
      embeddedState,
      networkResponses: (fixture.networkResponses || []).map((row) => {
        const jsonFull =
          row.jsonFull !== undefined
            ? row.jsonFull
            : (typeof row.body === 'object' && row.body !== null ? row.body : undefined);
        const jsonPreview =
          row.jsonPreview !== undefined
            ? row.jsonPreview
            : (typeof row.body === 'string' ? row.body : undefined);

        const boundedByteLen =
          row.boundedByteLen ||
          row.bounded_byte_len ||
          Buffer.byteLength(
            typeof row.body === 'string' ? row.body : JSON.stringify(row.body || jsonFull || jsonPreview || {}),
            'utf8'
          );

        const normalized = {
          ts: row.ts || '2026-02-09T00:00:00.000Z',
          url: row.url || source.url,
          status: row.status || 200,
          contentType: row.contentType || row.content_type || 'application/json',
          isGraphQl: row.isGraphQl ?? row.is_graphql ?? false,
          classification: row.classification || 'unknown',
          boundedByteLen,
          truncated: Boolean(row.truncated),
          request_url: row.request_url || row.url || source.url,
          request_method: row.request_method || row.method || 'GET',
          resource_type: row.resource_type || 'fetch'
        };

        if (row.request_post_json !== undefined) {
          normalized.request_post_json = row.request_post_json;
        }
        if (jsonFull !== undefined) {
          normalized.jsonFull = jsonFull;
        }
        if (jsonPreview !== undefined) {
          normalized.jsonPreview = jsonPreview;
        }

        return normalized;
      })
    };
  }
}
