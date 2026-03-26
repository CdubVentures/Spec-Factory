/**
 * Stealth browser profile for Playwright headless fetching.
 * Provides realistic Chrome fingerprint to avoid anti-bot detection.
 */

export const STEALTH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

export const STEALTH_VIEWPORT = { width: 1920, height: 1080 };

// WHY: 7 patches in strict injection order. toString protection MUST be first
// so all subsequent overrides are shielded from Function.prototype.toString introspection.
// Removed vendor, plugins, languages, hardwareConcurrency, webglVendor —
// Crawlee's fingerprint-suite generates unique varied values per session for those.
// Static hardcoded values made all sessions look identical to anti-bot systems.
export const STEALTH_INIT_SCRIPT = `
// patch: toString — shields all subsequent overrides from introspection
const _toString = Function.prototype.toString;
const _stealthTag = Symbol('stealth');
function _tagStealth(fn) { fn[_stealthTag] = true; return fn; }
Function.prototype.toString = _tagStealth(new Proxy(_toString, {
  apply(target, thisArg, args) {
    if (thisArg && thisArg[_stealthTag]) {
      return 'function ' + (thisArg.name || '') + '() { [native code] }';
    }
    return Reflect.apply(target, thisArg, args);
  }
}));

// patch: webdriver
Object.defineProperty(navigator, 'webdriver', {
  get: _tagStealth(function webdriver() { return false; }),
});

// patch: chromeRuntime
if (!window.chrome) window.chrome = {};
window.chrome.runtime = {};

// patch: chromeApp
if (!window.chrome) window.chrome = {};
window.chrome.app = {
  InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
  RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
  getDetails: _tagStealth(function getDetails() { return null; }),
  getIsInstalled: _tagStealth(function getIsInstalled() { return false; }),
  installState: _tagStealth(function installState(cb) { if (cb) cb('disabled'); }),
  isInstalled: false,
};

// patch: chromeCsi
if (!window.chrome) window.chrome = {};
window.chrome.csi = _tagStealth(function csi() {
  return { onloadT: Date.now(), startE: Date.now(), pageT: performance.now(), tran: 15 };
});

// patch: chromeLoadTimes
if (!window.chrome) window.chrome = {};
window.chrome.loadTimes = _tagStealth(function loadTimes() {
  return {
    commitLoadTime: Date.now() / 1000,
    connectionInfo: 'h2',
    finishDocumentLoadTime: Date.now() / 1000,
    finishLoadTime: Date.now() / 1000,
    firstPaintAfterLoadTime: 0,
    firstPaintTime: Date.now() / 1000,
    navigationType: 'Other',
    npnNegotiatedProtocol: 'h2',
    requestTime: Date.now() / 1000 - 0.16,
    startLoadTime: Date.now() / 1000 - 0.32,
    wasAlternateProtocolAvailable: false,
    wasFetchedViaSpdy: true,
    wasNpnNegotiated: true,
  };
});

// patch: permissions
const _origQuery = navigator.permissions.query.bind(navigator.permissions);
navigator.permissions.query = _tagStealth(function query(params) {
  if (params && params.name === 'notifications') {
    return Promise.resolve({ state: Notification.permission, onchange: null });
  }
  return _origQuery(params);
});
`;

export function buildStealthContextOptions(overrides = {}) {
  return {
    userAgent: overrides.userAgent || STEALTH_USER_AGENT,
    viewport: STEALTH_VIEWPORT,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    ...overrides,
    // Ensure viewport is never overridden to a bad value
    ...(overrides.userAgent ? { userAgent: overrides.userAgent } : {}),
  };
}
