import {
  normalizeHost,
  getHost,
  hostInSet,
  stripLocalePrefix,
  normalizeComparablePath,
  extractCategoryProductSlug,
  decodeXmlEntities,
  extractFirstHttpUrlToken,
  isNonProductSitemapPointer,
  isSitemapLikePath,
  CATEGORY_PRODUCT_PATH_RE
} from './sourcePlannerUrlUtils.js';
import { isApprovedHost, resolveTierNameForHost } from '../categories/loader.js';

export function createSourceDiscovery({
  categoryConfig,
  allowlistHosts,
  allowedCategoryProductSlugs,
  enqueue,
  isRelevantDiscoveredUrl,
  hasQueuedOrVisitedComparableUrl,
  counters
}) {
  return {
    discoverFromHtml(baseUrl, html) {
      if (!html) {
        return;
      }

      const baseHost = getHost(baseUrl);
      const manufacturerContext =
        baseHost && resolveTierNameForHost(baseHost, categoryConfig) === 'manufacturer';
      let baseParsed = null;
      let baseNormalizedPath = '';
      let baseProductSlug = '';
      try {
        baseParsed = new URL(baseUrl);
        baseNormalizedPath = stripLocalePrefix(baseParsed.pathname || '').pathname;
        baseProductSlug = baseNormalizedPath.split('/').filter(Boolean).at(-1) || '';
      } catch {
        baseParsed = null;
        baseNormalizedPath = '';
        baseProductSlug = '';
      }
      const matches = html.matchAll(/href\s*=\s*["']([^"']+)["']/gi);
      for (const match of matches) {
        const href = match[1];
        try {
          const parsed = new URL(href, baseUrl);
          const host = normalizeHost(parsed.hostname);
          if (!host) {
            continue;
          }
          if (!isApprovedHost(host, categoryConfig) && !hostInSet(host, allowlistHosts)) {
            continue;
          }
          if (baseHost && host !== baseHost && !host.endsWith(`.${baseHost}`) && !baseHost.endsWith(`.${host}`)) {
            if (!isApprovedHost(host, categoryConfig)) {
              continue;
            }
          }
          if (manufacturerContext && host === baseHost && baseParsed) {
            const localized = stripLocalePrefix(parsed.pathname || '');
            const normalizedPath = localized.pathname;
            const sameSearch = String(parsed.search || '') === String(baseParsed.search || '');
            const sameNormalizedPath = Boolean(
              normalizedPath &&
              baseNormalizedPath &&
              normalizedPath === baseNormalizedPath
            );
            if (sameNormalizedPath && sameSearch) {
              continue;
            }
            if (isSitemapLikePath(normalizedPath)) {
              continue;
            }
            const baseLooksLikeProductPath = CATEGORY_PRODUCT_PATH_RE.test(baseNormalizedPath);
            const candidateLooksLikeProductPath = CATEGORY_PRODUCT_PATH_RE.test(normalizedPath);
            const candidateProductSlug = normalizedPath.split('/').filter(Boolean).at(-1) || '';
            const sameProductFamilyPath = Boolean(
              baseLooksLikeProductPath &&
              candidateLooksLikeProductPath &&
              baseProductSlug &&
              candidateProductSlug &&
              candidateProductSlug !== baseProductSlug &&
              (
                normalizedPath.startsWith(`${baseNormalizedPath}-`) ||
                candidateProductSlug.startsWith(`${baseProductSlug}-`) ||
                candidateProductSlug.endsWith(`-${baseProductSlug}`) ||
                candidateProductSlug.includes(`-${baseProductSlug}-`)
              )
            );
            if (sameProductFamilyPath) {
              continue;
            }
          }
          if (!isRelevantDiscoveredUrl(parsed, { manufacturerContext })) {
            continue;
          }
          enqueue(parsed.toString(), baseUrl);
        } catch {
          // ignore invalid href
        }
      }
    },

    discoverFromRobots(baseUrl, body) {
      if (!body) {
        return 0;
      }

      const baseHost = getHost(baseUrl);
      const manufacturerContext =
        baseHost && resolveTierNameForHost(baseHost, categoryConfig) === 'manufacturer';
      const matches = String(body).matchAll(/^\s*sitemap:\s*(\S+)\s*$/gim);
      let discovered = 0;
      for (const match of matches) {
        const raw = extractFirstHttpUrlToken(match[1] || '');
        if (!raw) {
          continue;
        }
        try {
          const parsedSitemap = new URL(raw, baseUrl);
          if (manufacturerContext && isNonProductSitemapPointer(parsedSitemap)) {
            continue;
          }
          const sitemapUrl = parsedSitemap.toString();
          const enqueued = enqueue(sitemapUrl, `robots:${baseUrl}`, { forceApproved: true });
          if (enqueued) {
            discovered += 1;
          }
        } catch {
          // ignore invalid sitemap URL
        }
      }

      counters.robotsSitemapsDiscovered += discovered;
      return discovered;
    },

    discoverFromSitemap(baseUrl, body) {
      if (!body) {
        return 0;
      }

      const baseHost = getHost(baseUrl);
      const manufacturerContext =
        baseHost && resolveTierNameForHost(baseHost, categoryConfig) === 'manufacturer';
      if (!manufacturerContext) {
        return 0;
      }

      const locRegex = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
      const seen = new Set();
      let discovered = 0;
      let scanned = 0;
      for (const match of String(body).matchAll(locRegex)) {
        if (scanned >= 3000) {
          break;
        }
        scanned += 1;

        const decoded = decodeXmlEntities(match[1] || '').trim();
        if (!decoded || seen.has(decoded)) {
          continue;
        }
        seen.add(decoded);

        let parsed;
        try {
          parsed = new URL(decoded, baseUrl);
        } catch {
          continue;
        }

        const host = normalizeHost(parsed.hostname);
        if (!host) {
          continue;
        }

        if (baseHost && host !== baseHost && !host.endsWith(`.${baseHost}`) && !baseHost.endsWith(`.${host}`)) {
          if (!isApprovedHost(host, categoryConfig)) {
            continue;
          }
        }

        const localizedPath = stripLocalePrefix(parsed.pathname || '');
        const localizedComparablePath = normalizeComparablePath(localizedPath.pathname || '/');
        const categoryProductSlug = extractCategoryProductSlug(localizedComparablePath);
        const isLockedProductPath =
          categoryProductSlug &&
          allowedCategoryProductSlugs.size > 0 &&
          allowedCategoryProductSlugs.has(categoryProductSlug);
        if (isLockedProductPath) {
          if (localizedPath.hadLocalePrefix) {
            continue;
          }
          if (hasQueuedOrVisitedComparableUrl(parsed, { stripLocale: true })) {
            continue;
          }
        }

        if (!isSitemapLikePath(parsed.pathname, parsed.search)) {
          if (!isRelevantDiscoveredUrl(parsed, { manufacturerContext, sitemapContext: true })) {
            continue;
          }
        }

        const enqueued = enqueue(parsed.toString(), `sitemap:${baseUrl}`, { forceApproved: true });
        if (enqueued) {
          discovered += 1;
        }
      }

      counters.sitemapUrlsDiscovered += discovered;
      return discovered;
    }
  };
}
