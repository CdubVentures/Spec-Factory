import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOOGLE_SERP_FIXTURE_HTML = readFileSync(
  join(__dirname, '..', 'fixtures', 'google-serp-sample.html'),
  'utf8',
);

function resolveResponseStep(sequence, fallback, index) {
  if (!Array.isArray(sequence) || sequence.length === 0) {
    return fallback;
  }

  return sequence[Math.min(index, sequence.length - 1)];
}

export function loadGoogleSerpFixtureHtml() {
  return GOOGLE_SERP_FIXTURE_HTML;
}

export function buildBraveResponse(count = 10) {
  return {
    query: { original: 'test', more_results_available: true },
    web: {
      results: Array.from({ length: count }, (_, index) => ({
        title: `Brave Result ${index + 1}`,
        url: `https://example.com/brave-${index + 1}`,
        description: `Description for brave result ${index + 1}`,
        meta_url: { hostname: 'example.com' },
        extra_snippets: [`Extra snippet ${index + 1}`],
        age: '2 days ago',
        page_age: '2025-12-15',
        language: 'en',
      })),
    },
  };
}

export function buildSerperResponse(resultCount = 10) {
  return {
    searchParameters: { q: 'test', gl: 'us', hl: 'en', num: resultCount },
    organic: Array.from({ length: resultCount }, (_, index) => ({
      title: `Result ${index + 1}`,
      link: `https://example.com/page-${index + 1}`,
      snippet: `Snippet for result ${index + 1}`,
      position: index + 1,
    })),
  };
}

export function createFetchDouble({
  status = 200,
  body = {},
  shouldThrow = false,
  sequence = [],
} = {}) {
  const calls = [];
  let stepIndex = 0;

  const fallback = { status, body, shouldThrow };

  const fn = async (url, options) => {
    calls.push({
      url: typeof url === 'string' ? url : url.toString(),
      opts: options,
    });

    const step = resolveResponseStep(sequence, fallback, stepIndex);
    stepIndex++;

    if (step.shouldThrow) {
      throw step.error ?? new Error('Network error');
    }

    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      json: async () => step.body ?? {},
    };
  };

  return { fn, calls };
}

export function createPacerDouble() {
  const waitCalls = [];

  return {
    waitCalls,
    pacer: {
      async waitForSlot(options) {
        waitCalls.push(options);
      },
      resetForTests() {},
    },
  };
}

export function createRequestThrottlerDouble() {
  const acquireCalls = [];

  return {
    acquireCalls,
    requestThrottler: {
      async acquire(options) {
        acquireCalls.push(options);
      },
    },
  };
}

export function createLoggerSpy() {
  const infoCalls = [];
  const warnCalls = [];
  const errorCalls = [];

  return {
    infoCalls,
    warnCalls,
    errorCalls,
    logger: {
      info(event, payload = {}) {
        infoCalls.push({ event, ...payload });
      },
      warn(event, payload = {}) {
        warnCalls.push({ event, ...payload });
      },
      error(event, payload = {}) {
        errorCalls.push({ event, ...payload });
      },
    },
  };
}

export function createGoogleCrawlerFactoryDouble({
  html = GOOGLE_SERP_FIXTURE_HTML,
  url = 'https://www.google.com/search?q=test',
  shouldThrow = false,
  screenshotBuffer = null,
  status = 200,
  evaluateResults = [undefined, null],
} = {}) {
  const calls = {
    crawlerOptions: null,
    proxyConfig: null,
    requestListSources: null,
    runUrls: null,
    sessionRetired: false,
    sessionBurned: false,
    closeCookieModalsCalled: false,
    screenshotOptions: null,
  };
  let evaluateIndex = 0;

  const factory = async (options) => {
    calls.crawlerOptions = options;

    return {
      async run(urls) {
        calls.runUrls = urls;
        if (shouldThrow) {
          throw new Error('Navigation timeout');
        }

        const context = {
          async newCDPSession() {
            return {
              async send() {},
              on() {},
              async detach() {},
            };
          },
          async setOffline() {},
        };

        const fakePage = {
          url: () => url,
          async content() {
            return html;
          },
          async screenshot(options) {
            calls.screenshotOptions = options;
            return screenshotBuffer ?? Buffer.from('fake-jpeg', 'utf8');
          },
          async evaluate() {
            const next = Array.isArray(evaluateResults)
              ? evaluateResults[Math.min(evaluateIndex, evaluateResults.length - 1)]
              : evaluateResults;
            evaluateIndex++;
            return next;
          },
          async waitForSelector() {},
          async waitForFunction() {},
          async setExtraHTTPHeaders() {},
          async addInitScript() {},
          async route() {},
          context() {
            return context;
          },
          viewportSize() {
            return { width: 1920, height: 1080 };
          },
        };

        const fakeSession = {
          markBad() {
            calls.sessionBurned = true;
          },
          retire() {
            calls.sessionRetired = true;
          },
        };

        if (typeof options.requestHandler === 'function') {
          await options.requestHandler({
            page: fakePage,
            response: { status: () => status },
            request: { url },
            session: fakeSession,
            closeCookieModals: async () => {
              calls.closeCookieModalsCalled = true;
            },
          });
        }
      },
    };
  };

  factory._ProxyConfiguration = class MockProxyConfiguration {
    constructor(options) {
      calls.proxyConfig = options;
    }
  };

  factory._RequestList = class MockRequestList {
    static async open({ sources }) {
      calls.requestListSources = sources;
      return new MockRequestList();
    }
  };

  return { factory, calls };
}
