/**
 * Search Execution phase SERP Triage — Hard-Drop Filter
 *
 * Minimal, deterministic gate. Only drops URLs that can never produce
 * useful extraction. Everything else becomes a soft label downstream.
 *
 * Hard-drop criteria (exhaustive):
 * 1. Invalid URL (malformed)
 * 2. Non-HTTP(S) protocol
 * 3. HTTP → normalize to HTTPS; drop only if normalization fails or host blocked
 * 4. Denied/blocked host
 * 5. Obvious utility shell pages (login, cart, account, checkout, search results)
 * Note: Video filtering handled upstream by executeSearchQueries.
 */
import { isDeniedHost } from '../../../../categories/loader.js';
import { normalizeHost } from '../shared/hostParser.js';

// WHY: Only these path patterns are deterministically non-content utility shells.
// Other weak paths (/, /index.html) become soft labels — not drops.
const UTILITY_SHELL_RE = /(?:^|\/)(?:login|signin|sign-in|cart|checkout|account|my-account|register|signup|sign-up)(?:\/|$)/i;
const SEARCH_RESULTS_RE = /(?:^|\/)search(?:\/|$|\?)|[?&](?:q|query|s|keyword|search|term|searchterm)=/i;

/**
 * @param {object} options
 * @param {Array} options.dedupedResults — raw search results after dedup
 * @param {object} options.categoryConfig — category config with denylist
 * @returns {{ survivors: object[], hardDrops: object[] }}
 */
export function applyHardDropFilter({
  dedupedResults,
  categoryConfig,
} = {}) {
  const survivors = [];
  const hardDrops = [];

  for (const raw of dedupedResults || []) {
    const rawUrl = String(raw?.url || '').trim();
    if (!rawUrl) {
      hardDrops.push({ ...raw, url: rawUrl, host: '', hard_drop_reason: 'invalid_url' });
      continue;
    }

    // Step 1: Parse URL
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      hardDrops.push({ ...raw, url: rawUrl, host: '', hard_drop_reason: 'invalid_url' });
      continue;
    }

    // Step 2: Protocol check — normalize HTTP to HTTPS, drop non-HTTP(S)
    const protocol = String(parsed.protocol || '').toLowerCase();
    if (protocol !== 'https:' && protocol !== 'http:') {
      hardDrops.push({ ...raw, url: rawUrl, host: normalizeHost(parsed.hostname), hard_drop_reason: 'invalid_protocol' });
      continue;
    }

    if (protocol === 'http:') {
      // Attempt deterministic normalization to HTTPS
      try {
        parsed = new URL(rawUrl.replace(/^http:/i, 'https:'));
      } catch {
        hardDrops.push({ ...raw, url: rawUrl, host: normalizeHost(parsed.hostname), hard_drop_reason: 'invalid_protocol' });
        continue;
      }
    }

    const host = normalizeHost(parsed.hostname);
    const canonicalUrl = parsed.toString();

    // Step 3: Denied host
    if (!host || isDeniedHost(host, categoryConfig)) {
      hardDrops.push({ ...raw, url: canonicalUrl, host, hard_drop_reason: 'denied_host' });
      continue;
    }

    // Step 4: Utility shell pages (login, cart, account, checkout, search results)
    const pathname = String(parsed.pathname || '').toLowerCase();
    const search = String(parsed.search || '').toLowerCase();
    const pathAndQuery = `${pathname}${search}`;

    if (UTILITY_SHELL_RE.test(pathname) || SEARCH_RESULTS_RE.test(pathAndQuery)) {
      hardDrops.push({ ...raw, url: canonicalUrl, host, hard_drop_reason: 'utility_shell' });
      continue;
    }

    // Survivor — carry through all original metadata
    survivors.push({
      ...raw,
      url: canonicalUrl,
      original_url: rawUrl,
      host,
      hard_drop: false,
      hard_drop_reason: null,
    });
  }

  return { survivors, hardDrops };
}
