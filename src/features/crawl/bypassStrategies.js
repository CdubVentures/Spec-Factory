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

const CF_MARKERS = [
  'cf-browser-verification',
  'cf-challenge',
  'cloudflare',
];

const ACCESS_DENIED_MARKERS = [
  'access denied',
  'forbidden',
];

const FALLBACK_MIN_BODY_LENGTH = 200;
const FALLBACK_HTML_SNIPPET_CAP = 5000;

export function classifyBlockStatus({ status, html, minBodyLength, htmlSnippetCap } = {}) {
  const s = Number(status) || 0;

  // WHY: Resolve registry settings → explicit param → fallback constant.
  const effectiveMinBody = minBodyLength ?? FALLBACK_MIN_BODY_LENGTH;
  const effectiveSnippetCap = htmlSnippetCap ?? FALLBACK_HTML_SNIPPET_CAP;

  // Status-based classification (highest priority)
  if (s === 0) return { blocked: true, blockReason: 'no_response' };
  if (s === 451) return { blocked: true, blockReason: 'robots_blocked' };
  if (s === 403) return { blocked: true, blockReason: 'status_403' };
  if (s === 429) return { blocked: true, blockReason: 'status_429' };
  if (s >= 500) return { blocked: true, blockReason: 'server_error' };

  // Content-based classification (only for 2xx/3xx)
  const snippet = String(html ?? '').slice(0, effectiveSnippetCap).toLowerCase();

  if (CF_MARKERS.some((m) => snippet.includes(m))) {
    return { blocked: true, blockReason: 'cloudflare_challenge' };
  }

  if (CAPTCHA_MARKERS.some((m) => snippet.includes(m))) {
    return { blocked: true, blockReason: 'captcha_detected' };
  }

  if (ACCESS_DENIED_MARKERS.some((m) => snippet.includes(m))) {
    return { blocked: true, blockReason: 'access_denied' };
  }

  // Empty response check — very short HTML without a <body> tag
  const rawHtml = String(html ?? '');
  if (rawHtml.length < effectiveMinBody && !rawHtml.toLowerCase().includes('<body>')) {
    return { blocked: true, blockReason: 'empty_response' };
  }

  return { blocked: false, blockReason: null };
}
