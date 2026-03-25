const DEFAULT_HTML = '<html><body><h1>Hello</h1></body></html>';
const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };

function resolveValue(value, options) {
  return typeof value === 'function' ? value(options) : value;
}

export function createElementDouble({
  screenshotBytes = Buffer.from('element-crop-data'),
  screenshotError = null,
} = {}) {
  const screenshotCalls = [];

  return {
    screenshotCalls,
    async screenshot(options) {
      screenshotCalls.push(options);
      if (screenshotError) throw screenshotError;
      return resolveValue(screenshotBytes, options);
    },
  };
}

export function createPageDouble({
  elements = {},
  screenshotBytes = Buffer.from('fake-screenshot-data'),
  screenshotError = null,
  viewport = DEFAULT_VIEWPORT,
  html = DEFAULT_HTML,
  title = 'Test Page',
  url = 'http://example.com',
  finalUrl = url,
  evaluateResult = 0,
} = {}) {
  const initScripts = [];
  const screenshotCalls = [];
  const evaluateCalls = [];
  const waitedMs = [];

  return {
    initScripts,
    screenshotCalls,
    evaluateCalls,
    waitedMs,
    async $(selector) {
      return elements[selector] ?? null;
    },
    viewportSize() {
      return viewport;
    },
    async screenshot(options) {
      screenshotCalls.push(options);
      if (screenshotError) throw screenshotError;
      return resolveValue(screenshotBytes, options);
    },
    async addInitScript(script) {
      initScripts.push(script);
    },
    async evaluate(fn) {
      evaluateCalls.push(fn);
      return resolveValue(evaluateResult, fn);
    },
    async waitForTimeout(ms) {
      waitedMs.push(ms);
    },
    async content() {
      return html;
    },
    async title() {
      return title;
    },
    url() {
      return finalUrl;
    },
    video() {
      return { path: () => '', saveAs: async () => {} };
    },
  };
}

export function createSessionDouble({
  result = {},
  processUrl,
} = {}) {
  return {
    async processUrl(url) {
      if (typeof processUrl === 'function') {
        return processUrl(url);
      }

      return {
        url: result.url ?? url,
        finalUrl: result.finalUrl ?? url,
        status: result.status ?? 200,
        title: result.title ?? 'Test Page',
        html: result.html ?? DEFAULT_HTML,
        screenshots: result.screenshots ?? [],
        workerId: result.workerId ?? 'fetch-a1',
        fetchError: result.fetchError ?? null,
      };
    },
  };
}

export function createThrowingSessionDouble(error = new Error('boom')) {
  return {
    async processUrl() {
      throw error;
    },
  };
}

export function createFrontierDbDouble() {
  const recorded = [];

  return {
    recordFetch(payload) {
      recorded.push(payload);
    },
    getRecorded() {
      return recorded.slice();
    },
  };
}

export function createPluginDouble({ name = 'plugin', hooks = {} } = {}) {
  return { name, hooks };
}

export function createLoggerSpy() {
  const infoCalls = [];
  const warnCalls = [];

  return {
    logger: {
      info(event, payload = {}) {
        infoCalls.push({ event, ...payload });
      },
      warn(event, payload = {}) {
        warnCalls.push({ event, ...payload });
      },
    },
    infoCalls,
    warnCalls,
  };
}

export function createCrawlerFactoryDouble({ resultByUrl = {} } = {}) {
  let crawlerCount = 0;
  let teardownCount = 0;
  let lastConfig = null;
  const processedRequests = [];

  return {
    factory(config) {
      crawlerCount++;
      lastConfig = config;

      return {
        async run(requests = []) {
          for (const request of requests) {
            processedRequests.push(request);
            const result = resultByUrl[request.url] ?? {};

            if (result.error && typeof config.failedRequestHandler === 'function') {
              await config.failedRequestHandler(
                { request: { url: request.url, uniqueKey: request.uniqueKey } },
                result.error,
              );
              continue;
            }

            if (result.skipHandler) {
              continue;
            }

            const page = createPageDouble({
              url: request.url,
              finalUrl: result.finalUrl ?? request.url,
              title: result.title ?? 'Test Page',
              html: result.html ?? DEFAULT_HTML,
              elements: result.elements ?? {},
              screenshotBytes: result.screenshotBytes ?? Buffer.from('fake'),
            });

            await config.requestHandler({
              page,
              request: { url: request.url, uniqueKey: request.uniqueKey },
              response: {
                status: () => result.status ?? 200,
                headers: () => result.headers ?? {},
              },
            });
          }
        },
        async teardown() {
          teardownCount++;
        },
      };
    },
    getCrawlerCount() {
      return crawlerCount;
    },
    getProcessedUrls() {
      return processedRequests.map((request) => request.url);
    },
    getLastConfig() {
      return lastConfig;
    },
    getTeardownCount() {
      return teardownCount;
    },
  };
}
