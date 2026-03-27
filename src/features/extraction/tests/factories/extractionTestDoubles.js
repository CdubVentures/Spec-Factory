// WHY: Test doubles for extraction plugin tests. Copied from crawl's
// crawlTestDoubles.js to eliminate the cross-feature test import.
// Only the screenshot-relevant subset is included.

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
  evaluateResult = 0,
  evaluateResults = null,
} = {}) {
  const screenshotCalls = [];
  const evaluateCalls = [];
  let evaluateCallIndex = 0;

  return {
    screenshotCalls,
    evaluateCalls,
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
    async evaluate(fn) {
      evaluateCalls.push(fn);
      if (evaluateResults && evaluateCallIndex < evaluateResults.length) {
        return resolveValue(evaluateResults[evaluateCallIndex++], fn);
      }
      return resolveValue(evaluateResult, fn);
    },
  };
}

export function createLoggerSpy() {
  const infoCalls = [];
  const warnCalls = [];
  const errorCalls = [];

  return {
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
    infoCalls,
    warnCalls,
    errorCalls,
  };
}
