// WHY: Pure-function Google SERP HTML parser. No browser dependency —
// receives the rendered HTML string (after JS execution) and extracts
// search result rows. Tiered selector strategy for resilience.

import { JSDOM } from 'jsdom';

// ---------------------------------------------------------------------------
// URL cleaning
// ---------------------------------------------------------------------------

export function cleanGoogleUrl(rawUrl) {
  if (!rawUrl) return '';
  const url = String(rawUrl).trim();
  if (!url) return '';

  // Google redirect wrapper: /url?q=https://example.com&sa=U&ved=...
  if (url.includes('/url?q=')) {
    try {
      const parsed = new URL(url, 'https://www.google.com');
      const target = parsed.searchParams.get('q');
      if (target) return target;
    } catch { /* fall through */ }
  }

  // Filter internal Google surfaces
  if (url.includes('webcache.googleusercontent.com')) return '';
  if (url.includes('translate.google.com')) return '';

  return url;
}

// ---------------------------------------------------------------------------
// Page type detection
// ---------------------------------------------------------------------------

export function isConsentPage(url) {
  if (!url) return false;
  return String(url).includes('consent.google.com');
}

export function isCaptchaPage(url, html) {
  const u = String(url || '');
  if (u.includes('/sorry/') || u.includes('/sorry?')) return true;
  const h = String(html || '').toLowerCase();
  if (h.includes('unusual traffic')) return true;
  if (h.includes('captcha') && h.includes('recaptcha')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Result extraction — Tier 1 (standard .g containers)
// ---------------------------------------------------------------------------

function extractTier1(doc, limit) {
  // WHY: Google's DOM structure changes frequently. Try multiple selector
  // strategies in order of specificity. As of 2026-03, Google no longer uses
  // .g class containers — results are h3 elements inside anchor tags within #rso.

  // Strategy A: classic .g containers (legacy, still works in some regions)
  const containers = doc.querySelectorAll('#search .g, #rso .g');
  const results = [];
  for (const container of containers) {
    if (results.length >= limit) break;
    const anchor = container.querySelector('a[href]');
    const h3 = container.querySelector('h3');
    if (!anchor || !h3) continue;

    const rawUrl = cleanGoogleUrl(anchor.getAttribute('href'));
    if (!rawUrl || !rawUrl.startsWith('http')) continue;

    const title = (h3.textContent || '').trim();
    if (!title) continue;

    const snippetEl = container.querySelector('.VwiC3b, [data-sncf="1"], .s3v9rd, .lEBKkf');
    const snippet = snippetEl ? (snippetEl.textContent || '').trim() : '';

    results.push({ url: rawUrl, title, snippet });
  }
  if (results.length > 0) return results;

  // Strategy B: h3 elements inside anchor tags within #rso (2026+ Google)
  const h3Links = doc.querySelectorAll('#rso a[href] h3, #search a[href] h3');
  const seen = new Set();
  for (const h3 of h3Links) {
    if (results.length >= limit) break;
    const anchor = h3.closest('a');
    if (!anchor) continue;

    const rawUrl = cleanGoogleUrl(anchor.getAttribute('href'));
    if (!rawUrl || !rawUrl.startsWith('http')) continue;
    if (rawUrl.includes('google.com') && !rawUrl.includes('/amp/')) continue;
    if (seen.has(rawUrl)) continue;
    seen.add(rawUrl);

    const title = (h3.textContent || '').trim();
    if (!title) continue;

    // Walk up to find snippet in a sibling/parent container
    let snippet = '';
    const parentBlock = anchor.closest('[data-sokoban]') || anchor.parentElement?.parentElement?.parentElement;
    if (parentBlock) {
      for (const el of parentBlock.querySelectorAll('span, div')) {
        const text = (el.textContent || '').trim();
        if (text.length > 40 && !text.includes(title) && el.querySelector('h3') === null) {
          snippet = text;
          break;
        }
      }
    }

    results.push({ url: rawUrl, title, snippet });
  }
  if (results.length > 0) return results;

  // Strategy C: Android mobile SERP — h3 is NOT inside an anchor tag.
  // Results are in [data-hveid] containers where the h3 and link are siblings.
  const hveidContainers = doc.querySelectorAll('#rso [data-hveid]');
  for (const container of hveidContainers) {
    if (results.length >= limit) break;
    const h3 = container.querySelector('h3');
    if (!h3) continue;

    // Find external link in the same container (sibling, not wrapping h3)
    const anchors = container.querySelectorAll('a[href]');
    let bestAnchor = null;
    for (const a of anchors) {
      const href = cleanGoogleUrl(a.getAttribute('href'));
      if (href && href.startsWith('http') && !href.includes('google.com')) {
        bestAnchor = a;
        break;
      }
    }
    if (!bestAnchor) continue;

    const rawUrl = cleanGoogleUrl(bestAnchor.getAttribute('href'));
    if (!rawUrl || seen.has(rawUrl)) continue;
    seen.add(rawUrl);

    const title = (h3.textContent || '').trim();
    if (!title) continue;

    let snippet = '';
    for (const el of container.querySelectorAll('span, div')) {
      const text = (el.textContent || '').trim();
      if (text.length > 40 && !text.includes(title) && el.querySelector('h3') === null) {
        snippet = text;
        break;
      }
    }

    results.push({ url: rawUrl, title, snippet });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Result extraction — Tier 2 (broader anchor mining)
// ---------------------------------------------------------------------------

function extractTier2(doc, limit) {
  const anchors = doc.querySelectorAll('#search a[href], #rso a[href]');
  const results = [];
  const seen = new Set();

  for (const anchor of anchors) {
    if (results.length >= limit) break;

    const h3 = anchor.querySelector('h3');
    const title = h3 ? (h3.textContent || '').trim() : '';
    if (!title) continue;

    const rawUrl = cleanGoogleUrl(anchor.getAttribute('href'));
    if (!rawUrl || !rawUrl.startsWith('http')) continue;
    if (rawUrl.includes('google.com') && !rawUrl.includes('google.com/amp/')) continue;
    if (seen.has(rawUrl)) continue;
    seen.add(rawUrl);

    // Walk up to find a sibling snippet
    let snippet = '';
    const parent = anchor.closest('.g') || anchor.parentElement?.parentElement;
    if (parent) {
      for (const span of parent.querySelectorAll('span')) {
        const text = (span.textContent || '').trim();
        if (text.length > 30 && !text.includes(title)) {
          snippet = text;
          break;
        }
      }
    }

    results.push({ url: rawUrl, title, snippet });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseGoogleResults(htmlString, limit = 20) {
  if (!htmlString) return [];
  const html = String(htmlString);
  if (!html.trim()) return [];

  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const cap = Math.max(1, Number(limit) || 20);

  // Tier 1: standard .g containers with h3 + link + snippet
  const tier1 = extractTier1(doc, cap);
  if (tier1.length > 0) return tier1.slice(0, cap);

  // Tier 2: broader anchor mining
  const tier2 = extractTier2(doc, cap);
  return tier2.slice(0, cap);
}
