// WHY: Pure-function Google SERP HTML parser. No browser dependency -
// receives the rendered HTML string (after JS execution) and extracts
// search result rows. Tiered selector strategy for resilience.

import { load as loadHtml } from 'cheerio';

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
    } catch {
      // fall through
    }
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
// Shared helpers
// ---------------------------------------------------------------------------

function isExternalUrl(rawUrl) {
  return rawUrl && rawUrl.startsWith('http') &&
    (!rawUrl.includes('google.com') || rawUrl.includes('/amp/'));
}

function findSnippet($, container, title) {
  if (!container || container.length === 0) return '';
  for (const el of container.find('span, div').toArray()) {
    const candidate = $(el);
    const text = candidate.text().trim();
    if (text.length > 40 && !text.includes(title) && candidate.find('h3').length === 0) {
      return text;
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Result extraction - Tier 1 (multi-strategy)
// ---------------------------------------------------------------------------

function extractTier1($, limit) {
  // WHY: Google's DOM structure changes frequently. Try multiple selector
  // strategies. Desktop strategies (A, B) return early if they find results.
  // Mobile strategies (C, D) accumulate since they capture different result
  // types on the same Android SERP.

  const results = [];
  const seen = new Set();

  // Strategy A: classic .g containers (legacy, still works in some regions)
  const containers = $('#search .g, #rso .g').toArray();
  for (const container of containers) {
    if (results.length >= limit) break;
    const scoped = $(container);
    const anchor = scoped.find('a[href]').first();
    const h3 = scoped.find('h3').first();
    if (anchor.length === 0 || h3.length === 0) continue;

    const rawUrl = cleanGoogleUrl(anchor.attr('href'));
    if (!rawUrl || !rawUrl.startsWith('http')) continue;

    const title = h3.text().trim();
    if (!title) continue;

    const snippet = scoped.find('.VwiC3b, [data-sncf="1"], .s3v9rd, .lEBKkf').first().text().trim();
    results.push({ url: rawUrl, title, snippet });
  }
  if (results.length > 0) return results;

  // Strategy B: h3 inside anchor tags within #rso (desktop 2026+)
  const h3Links = $('#rso a[href] h3, #search a[href] h3').toArray();
  for (const h3 of h3Links) {
    if (results.length >= limit) break;
    const titleNode = $(h3);
    const anchor = titleNode.closest('a');
    if (anchor.length === 0) continue;

    const rawUrl = cleanGoogleUrl(anchor.attr('href'));
    if (!isExternalUrl(rawUrl)) continue;
    if (seen.has(rawUrl)) continue;
    seen.add(rawUrl);

    const title = titleNode.text().trim();
    if (!title) continue;

    let parentBlock = anchor.closest('[data-sokoban]');
    if (parentBlock.length === 0) {
      parentBlock = anchor.parent().parent().parent();
    }
    results.push({ url: rawUrl, title, snippet: findSnippet($, parentBlock, title) });
  }
  if (results.length > 0) return results;

  // Strategy C: Android mobile - h3 with anchor inside (h3 > ... > a)
  const mobileH3s = $('#rso h3').toArray();
  for (const h3 of mobileH3s) {
    if (results.length >= limit) break;
    const titleNode = $(h3);
    const anchor = titleNode.find('a[href]').first();
    if (anchor.length === 0) continue;

    const rawUrl = cleanGoogleUrl(anchor.attr('href'));
    if (!isExternalUrl(rawUrl)) continue;
    if (seen.has(rawUrl)) continue;
    seen.add(rawUrl);

    const title = titleNode.text().trim();
    if (!title) continue;

    let container = titleNode.closest('[data-hveid]');
    if (container.length === 0) {
      container = titleNode.closest('.tF2Cxc');
    }
    if (container.length === 0) {
      container = titleNode.parent().parent();
    }
    results.push({ url: rawUrl, title, snippet: findSnippet($, container, title) });
  }

  // Strategy D: Android mobile - h3 + sibling anchor in [data-hveid] container
  const hveidContainers = $('#rso [data-hveid]').toArray();
  for (const container of hveidContainers) {
    if (results.length >= limit) break;
    const scoped = $(container);
    const h3 = scoped.find('h3').first();
    if (h3.length === 0) continue;

    const anchors = scoped.find('a[href]').toArray();
    let rawUrl = '';
    for (const anchor of anchors) {
      const href = cleanGoogleUrl($(anchor).attr('href'));
      if (isExternalUrl(href)) {
        rawUrl = href;
        break;
      }
    }
    if (!rawUrl || seen.has(rawUrl)) continue;
    seen.add(rawUrl);

    const title = h3.text().trim();
    if (!title) continue;

    results.push({ url: rawUrl, title, snippet: findSnippet($, scoped, title) });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Result extraction - Tier 2 (broader anchor mining)
// ---------------------------------------------------------------------------

function extractTier2($, limit) {
  const anchors = $('#search a[href], #rso a[href]').toArray();
  const results = [];
  const seen = new Set();

  for (const anchor of anchors) {
    if (results.length >= limit) break;

    const scoped = $(anchor);
    const h3 = scoped.find('h3').first();
    const title = h3.text().trim();
    if (!title) continue;

    const rawUrl = cleanGoogleUrl(scoped.attr('href'));
    if (!rawUrl || !rawUrl.startsWith('http')) continue;
    if (rawUrl.includes('google.com') && !rawUrl.includes('google.com/amp/')) continue;
    if (seen.has(rawUrl)) continue;
    seen.add(rawUrl);

    let snippet = '';
    let parent = scoped.closest('.g');
    if (parent.length === 0) {
      parent = scoped.parent().parent();
    }
    if (parent.length > 0) {
      for (const span of parent.find('span').toArray()) {
        const text = $(span).text().trim();
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

  const $ = loadHtml(html);
  const cap = Math.max(1, Number(limit) || 20);

  const tier1 = extractTier1($, cap);
  if (tier1.length > 0) return tier1.slice(0, cap);

  const tier2 = extractTier2($, cap);
  return tier2.slice(0, cap);
}
