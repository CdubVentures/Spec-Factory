/**
 * Block detection for crawled pages.
 * Pure function — classifies HTTP status + HTML content into block reasons.
 */

const CAPTCHA_MARKERS = [
  'captcha',
  '_cf_chl_opt',
  'cf-challenge-running',
  'challenge-form',
  'g-recaptcha',
  'h-captcha',
];

// WHY: Removed bare 'cloudflare' — too many false positives on tech content
// (blog posts about Cloudflare, CDN reviews). cf-challenge and cf-browser-verification
// are Cloudflare-specific class/element names that don't appear in regular content.
const CF_MARKERS = [
  'cf-browser-verification',
  'cf-challenge',
];

// WHY: Structural markers avoid matching "forbidden fruit" in a 50KB article.
// Block pages are short and put these words in <title>/<h1> or near the start.
const ACCESS_DENIED_STRUCTURAL = [
  '<title>access denied',
  '<title>403',
  '<title>forbidden',
  '<h1>access denied',
  '<h1>forbidden',
];

const MIN_BODY_LENGTH = 200;
const HTML_SNIPPET_CAP = 5000;

export function classifyBlockStatus({ status, html } = {}) {
  const s = Number(status) || 0;

  // Status-based classification (highest priority)
  if (s === 0) return { blocked: true, blockReason: 'no_response' };
  if (s === 451) return { blocked: true, blockReason: 'robots_blocked' };
  if (s === 403) return { blocked: true, blockReason: 'status_403' };
  if (s === 429) return { blocked: true, blockReason: 'status_429' };
  if (s >= 500) return { blocked: true, blockReason: 'server_error' };

  // Content-based classification (only for 2xx/3xx)
  const snippet = String(html ?? '').slice(0, HTML_SNIPPET_CAP).toLowerCase();

  if (CF_MARKERS.some((m) => snippet.includes(m))) {
    return { blocked: true, blockReason: 'cloudflare_challenge' };
  }

  if (CAPTCHA_MARKERS.some((m) => snippet.includes(m))) {
    return { blocked: true, blockReason: 'captcha_detected' };
  }

  // WHY: Structural check first (high confidence), then short-page fallback.
  // A real block page is typically <2KB. A 50KB article mentioning "forbidden" is not a block.
  if (ACCESS_DENIED_STRUCTURAL.some((m) => snippet.includes(m))) {
    return { blocked: true, blockReason: 'access_denied' };
  }
  const SHORT_PAGE_LIMIT = 2000;
  if (snippet.length < SHORT_PAGE_LIMIT && (snippet.includes('access denied') || snippet.includes('forbidden'))) {
    return { blocked: true, blockReason: 'access_denied' };
  }

  // Empty response check — very short HTML without a <body> tag
  const rawHtml = String(html ?? '');
  if (rawHtml.length < MIN_BODY_LENGTH && !rawHtml.toLowerCase().includes('<body>')) {
    return { blocked: true, blockReason: 'empty_response' };
  }

  return { blocked: false, blockReason: null };
}
