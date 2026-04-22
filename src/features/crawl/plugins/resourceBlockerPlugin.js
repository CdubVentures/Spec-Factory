// WHY: Blocks image/font/media/tracker resources at the network layer so
// fetches use less bandwidth and render faster. Apify / Crawlee docs call
// this the #1 scraper-perf win (5–10× speedup on image-heavy product pages).
// We keep document / stylesheet / script / xhr / fetch — those carry data
// and extraction logic. Registers LAST in the plugin chain so it intercepts
// before cssOverride's domain blocker; non-blocked requests fall back to the
// next handler.

const BLOCKED_RESOURCE_TYPES = new Set([
  'image',
  'font',
  'media',
  'texttrack',
]);

// Exact-host match (strict boundary check — substring matches would false-positive).
const TRACKER_HOSTS = new Set([
  'www.google-analytics.com',
  'ssl.google-analytics.com',
  'www.googletagmanager.com',
  'www.googlesyndication.com',
  'googleads.g.doubleclick.net',
  'stats.g.doubleclick.net',
  'connect.facebook.net',
  'www.facebook.com',
  'static.hotjar.com',
  'script.hotjar.com',
  'cdn.segment.com',
  'cdn.mxpnl.com',
  'cdn.optimizely.com',
  'cdn.amplitude.com',
  'snap.licdn.com',
  'px.ads.linkedin.com',
  'analytics.tiktok.com',
  'bat.bing.com',
]);

function isTrackerHost(urlStr) {
  try {
    const { hostname } = new URL(urlStr);
    return TRACKER_HOSTS.has(hostname.toLowerCase());
  } catch {
    return false;
  }
}

export const resourceBlockerPlugin = {
  name: 'resourceBlocker',
  suites: ['init'],
  hooks: {
    async onInit({ page, settings }) {
      const enabled = settings?.resourceBlockingEnabled === true || settings?.resourceBlockingEnabled === 'true';
      if (!enabled) return undefined;

      await page.route('**', (route, request) => {
        const resourceType = request.resourceType();
        const url = request.url();
        if (BLOCKED_RESOURCE_TYPES.has(resourceType)) return route.abort();
        if (isTrackerHost(url)) return route.abort();
        return route.fallback();
      });

      return undefined;
    },
  },
};
