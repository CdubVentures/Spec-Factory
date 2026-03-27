/**
 * Block detection for crawled pages.
 * Pure function — classifies HTTP status + HTML content into block reasons.
 *
 * WHY content-quality gate: Real block/captcha pages are short (<2-3KB) with
 * the challenge as PRIMARY content. A 50KB product page with a dormant
 * g-recaptcha script tag is NOT blocked. If the page has substantial content
 * (>5KB with <body>), status codes and dormant markers are overridden.
 */

// WHY: Tightened markers — require ACTIVE challenge indicators, not dormant scripts.
// Removed: bare 'captcha' (matches articles/reviews), 'g-recaptcha' (matches dormant
// script tags loaded defensively). Kept/added markers that indicate a challenge the
// user must solve before seeing content.
const CAPTCHA_MARKERS = [
  'captcha-form',
  'challenge-form',
  'g-recaptcha-response',  // hidden input in an ACTIVE reCAPTCHA challenge
  'h-captcha',
  '_cf_chl_opt',           // Cloudflare challenge opt-in script variable
  'cf-challenge-running',  // active Cloudflare challenge state class
];

// WHY: cf-challenge removed — matches Cloudflare passive monitoring JS on non-blocked
// pages. Added challenges.cloudflare.com (Crawlee's pattern — the turnstile iframe src).
const CF_MARKERS = [
  'cf-browser-verification',
  'challenges.cloudflare.com',
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
const SHORT_PAGE_LIMIT = 2000;
// WHY: Pages above this threshold with a <body> tag are almost certainly real content,
// not block/captcha pages. Dormant captcha scripts and passive CF monitoring on real
// pages should not trigger block detection. Audit data: 24 false captcha detections
// across 278 workers, all on pages with substantial content and video proof of loading.
const CONTENT_QUALITY_THRESHOLD = 5000;

export function classifyBlockStatus({ status, html } = {}) {
  const s = Number(status) || 0;
  const rawHtml = String(html ?? '');
  const htmlLen = rawHtml.length;
  const hasBody = rawHtml.toLowerCase().includes('<body>');
  const isSubstantial = hasBody && htmlLen > CONTENT_QUALITY_THRESHOLD;

  // Always-blocked status codes (no content gate — these mean what they say)
  if (s === 0) return { blocked: true, blockReason: 'no_response' };
  if (s === 451) return { blocked: true, blockReason: 'robots_blocked' };
  if (s === 429) return { blocked: true, blockReason: 'status_429' };
  if (s >= 500) return { blocked: true, blockReason: 'server_error' };

  // WHY: 403 with substantial content = site returned 403 to bot UA but still
  // served the full page. Common on Amazon, Best Buy, manufacturer sites.
  // Only block if the page is short/empty (a real deny page).
  if (s === 403 && !isSubstantial) return { blocked: true, blockReason: 'status_403' };

  // Content-based checks (first 5KB, lowercased)
  const snippet = rawHtml.slice(0, HTML_SNIPPET_CAP).toLowerCase();

  // Cloudflare active challenge — high confidence markers
  if (CF_MARKERS.some((m) => snippet.includes(m))) {
    if (isSubstantial) return { blocked: false, blockReason: null };
    return { blocked: true, blockReason: 'cloudflare_challenge' };
  }

  // CAPTCHA — require active challenge markers, not dormant scripts
  if (CAPTCHA_MARKERS.some((m) => snippet.includes(m))) {
    if (isSubstantial) return { blocked: false, blockReason: null };
    return { blocked: true, blockReason: 'captcha_detected' };
  }

  // Access denied — structural markers in title/heading
  if (ACCESS_DENIED_STRUCTURAL.some((m) => snippet.includes(m))) {
    return { blocked: true, blockReason: 'access_denied' };
  }
  if (htmlLen < SHORT_PAGE_LIMIT && (snippet.includes('access denied') || snippet.includes('forbidden'))) {
    return { blocked: true, blockReason: 'access_denied' };
  }

  // Empty response — very short HTML without a <body> tag
  if (htmlLen < MIN_BODY_LENGTH && !hasBody) {
    return { blocked: true, blockReason: 'empty_response' };
  }

  return { blocked: false, blockReason: null };
}
