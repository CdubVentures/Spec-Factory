/**
 * Stealth browser profile for Playwright headless fetching.
 * Provides realistic Chrome fingerprint to avoid anti-bot detection.
 */

export const STEALTH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

export const STEALTH_VIEWPORT = { width: 1920, height: 1080 };

// WHY: 12 patches in strict injection order. toString protection MUST be first
// so all subsequent overrides are shielded from Function.prototype.toString introspection.
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

// patch: vendor
Object.defineProperty(navigator, 'vendor', {
  get: _tagStealth(function vendor() { return 'Google Inc.'; }),
});

// patch: plugins — realistic Chrome PluginArray
Object.defineProperty(navigator, 'plugins', {
  get: _tagStealth(function plugins() {
    const _makePlugin = (name, description, filename, mimeType) => {
      const mime = { type: mimeType, suffixes: '', description, enabledPlugin: null };
      const plugin = {
        name, description, filename, length: 1,
        0: mime,
        item: _tagStealth(function item(i) { return i === 0 ? mime : null; }),
        namedItem: _tagStealth(function namedItem(n) { return n === mimeType ? mime : null; }),
      };
      mime.enabledPlugin = plugin;
      return plugin;
    };
    const arr = [
      _makePlugin('Chrome PDF Plugin', 'Portable Document Format', 'internal-pdf-viewer', 'application/x-google-chrome-pdf'),
      _makePlugin('Chrome PDF Viewer', '', 'mhjfbmdgcfjbbpaeojofohoefgiehjai', 'application/pdf'),
      _makePlugin('Native Client', '', 'internal-nacl-plugin', 'application/x-nacl'),
    ];
    arr.item = _tagStealth(function item(i) { return arr[i] || null; });
    arr.namedItem = _tagStealth(function namedItem(n) { return arr.find(function(p) { return p.name === n; }) || null; });
    arr.refresh = _tagStealth(function refresh() {});
    return arr;
  }),
});

// patch: languages
Object.defineProperty(navigator, 'languages', {
  get: _tagStealth(function languages() { return ['en-US', 'en']; }),
});

// patch: hardwareConcurrency
Object.defineProperty(navigator, 'hardwareConcurrency', {
  get: _tagStealth(function hardwareConcurrency() { return 8; }),
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

// patch: webglVendor
const _getParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = _tagStealth(function getParameter(param) {
  if (param === 37445) return 'Google Inc. (NVIDIA)';
  if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)';
  return _getParameter.call(this, param);
});
if (typeof WebGL2RenderingContext !== 'undefined') {
  const _getParameter2 = WebGL2RenderingContext.prototype.getParameter;
  WebGL2RenderingContext.prototype.getParameter = _tagStealth(function getParameter(param) {
    if (param === 37445) return 'Google Inc. (NVIDIA)';
    if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)';
    return _getParameter2.call(this, param);
  });
}
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
