import {
  normalizeHost,
  hostInSet,
  countTokenHits,
  normalizeComparablePath,
  extractCategoryProductSlug,
  extractManufacturerProductishSlug,
  slugIdentityTokens,
  stripLocalePrefix,
  isSitemapLikePath,
  CATEGORY_PRODUCT_PATH_RE,
  BENIGN_LOCKED_PRODUCT_SUFFIX_TOKENS
} from './sourcePlannerUrlUtils.js';
import { isApprovedHost, inferRoleForHost } from '../categories/loader.js';

export function checkShouldUseApprovedQueue(host, forceApproved, forceCandidate, validationCtx) {
  if (forceCandidate) {
    return false;
  }
  if (forceApproved) {
    return true;
  }
  if (isApprovedHost(host, validationCtx.categoryConfig)) {
    return true;
  }
  return hostInSet(host, validationCtx.allowlistHosts);
}

export function checkIsResumeSeed(discoveredFrom) {
  return String(discoveredFrom || '').startsWith('resume_');
}

export function checkMatchesAllowedLockedProductSlug(productSlug, validationCtx) {
  const normalizedSlug = String(productSlug || '').toLowerCase().trim();
  if (!normalizedSlug || validationCtx.allowedCategoryProductSlugs.size === 0) {
    return false;
  }
  if (validationCtx.allowedCategoryProductSlugs.has(normalizedSlug)) {
    return true;
  }

  for (const allowedSlug of validationCtx.allowedCategoryProductSlugs) {
    if (!allowedSlug || !normalizedSlug.startsWith(`${allowedSlug}-`)) {
      continue;
    }
    const suffixTokens = slugIdentityTokens(normalizedSlug.slice(allowedSlug.length + 1));
    if (suffixTokens.length > 0 && suffixTokens.every((token) => BENIGN_LOCKED_PRODUCT_SUFFIX_TOKENS.has(token))) {
      return true;
    }
  }

  return false;
}

export function checkShouldRejectLockedManufacturerUrl(parsed, validationCtx) {
  if (validationCtx.allowedCategoryProductSlugs.size === 0) {
    return false;
  }

  const localizedPath = stripLocalePrefix(parsed.pathname || '');
  const productSlug = extractManufacturerProductishSlug(localizedPath.pathname);
  if (!productSlug) {
    return false;
  }

  if (checkMatchesAllowedLockedProductSlug(productSlug, validationCtx)) {
    return false;
  }

  const slugTokens = slugIdentityTokens(productSlug);
  if (slugTokens.length === 0) {
    return true;
  }

  const matchingLockedTokens = validationCtx.modelSlugIdentityTokens.filter(
    (token) => slugTokens.includes(token)
  );
  if (matchingLockedTokens.length === 0) {
    return true;
  }

  const minLockedHits = validationCtx.modelSlugIdentityTokens.length >= 2 ? 2 : 1;
  return matchingLockedTokens.length >= minLockedHits;
}

export function checkShouldRejectLockedManufacturerLocaleDuplicateUrl(parsed, { allowResume = false } = {}, validationCtx) {
  if (allowResume || validationCtx.allowedCategoryProductSlugs.size === 0) {
    return false;
  }

  const localizedPath = stripLocalePrefix(parsed.pathname || '');
  if (!localizedPath.hadLocalePrefix) {
    return false;
  }

  const categoryProductSlug = extractCategoryProductSlug(localizedPath.pathname || '');
  if (!categoryProductSlug) {
    return false;
  }

  return checkMatchesAllowedLockedProductSlug(categoryProductSlug, validationCtx);
}

export function checkHasQueuedOrVisitedComparableUrl(parsed, options, queueState) {
  const candidateHost = normalizeHost(parsed?.hostname || '');
  if (!candidateHost) {
    return false;
  }
  const candidatePath = options.stripLocale
    ? normalizeComparablePath(stripLocalePrefix(parsed.pathname || '').pathname || '/')
    : normalizeComparablePath(parsed.pathname || '/');
  const candidateSearch = String(parsed.search || '');
  const comparableUrls = [
    ...queueState.visitedUrls,
    ...queueState.priorityQueue.map((row) => row.url),
    ...queueState.manufacturerQueue.map((row) => row.url),
    ...queueState.queue.map((row) => row.url),
    ...queueState.candidateQueue.map((row) => row.url)
  ];
  for (const existingUrl of comparableUrls) {
    let existingParsed;
    try {
      existingParsed = new URL(existingUrl);
    } catch {
      continue;
    }
    if (normalizeHost(existingParsed.hostname) !== candidateHost) {
      continue;
    }
    const existingPath = options.stripLocale
      ? normalizeComparablePath(stripLocalePrefix(existingParsed.pathname || '').pathname || '/')
      : normalizeComparablePath(existingParsed.pathname || '/');
    if (existingPath !== candidatePath) {
      continue;
    }
    if (String(existingParsed.search || '') !== candidateSearch) {
      continue;
    }
    return true;
  }
  return false;
}

export function checkIsRelevantDiscoveredUrl(parsed, context, validationCtx) {
  const host = normalizeHost(parsed.hostname);
  const localizedPath = stripLocalePrefix(parsed.pathname || '');
  const hasLocalePrefix = localizedPath.hadLocalePrefix;
  const effectivePath = localizedPath.pathname;
  const pathAndQuery = `${effectivePath || ''} ${parsed.search || ''}`.toLowerCase();
  const pathname = effectivePath.toLowerCase();
  const modelTokenHits = countTokenHits(pathAndQuery, validationCtx.modelTokens);
  const minModelHits = validationCtx.modelTokens.length >= 3 ? 2 : 1;
  const hasModelToken = validationCtx.modelTokens.length > 0 && modelTokenHits >= minModelHits;
  const hasBrandToken = validationCtx.brandTokens.some((token) => pathAndQuery.includes(token));
  const role = String(
    validationCtx.sourceHostMap.get(host)?.role || inferRoleForHost(host, validationCtx.categoryConfig)
  ).toLowerCase();

  if (/\.(css|js|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|map|json)$/i.test(pathname)) {
    return false;
  }

  if (hasLocalePrefix && !context.manufacturerContext && !context.sitemapContext) {
    return false;
  }

  if (!pathAndQuery || pathAndQuery === '/') {
    return false;
  }

  const negativeKeywords = [
    '/cart',
    '/checkout',
    '/account',
    '/community',
    '/blog',
    '/newsroom',
    '/store-locator',
    '/gift-card',
    '/forum',
    '/forums',
    '/shop/c/',
    '/category/',
    '/collections/'
  ];
  if (negativeKeywords.some((keyword) => pathAndQuery.includes(keyword)) && !hasModelToken) {
    return false;
  }

  if (
    role !== 'manufacturer' &&
    ['/blog', '/newsroom', '/forum', '/forums', '/community'].some((keyword) => pathAndQuery.includes(keyword))
  ) {
    return false;
  }

  if (isSitemapLikePath(pathname, parsed.search)) {
    return true;
  }

  const categoryProductSlug = extractCategoryProductSlug(pathname);
  if (
    context.manufacturerContext &&
    categoryProductSlug &&
    validationCtx.allowedCategoryProductSlugs.size > 0
  ) {
    if (!categoryProductSlug || !validationCtx.allowedCategoryProductSlugs.has(categoryProductSlug)) {
      return false;
    }
  }

  if (hasModelToken) {
    return true;
  }

  const highSignalKeywords = [
    'manual',
    'support',
    'spec',
    'product',
    'products',
    'datasheet',
    'technical',
    'download',
    'pdf'
  ];
  if (highSignalKeywords.some((keyword) => pathAndQuery.includes(keyword))) {
    if (hasModelToken) {
      return true;
    }
    if (context.manufacturerContext) {
      if (/\/products?\//.test(pathname) && !/\/shop\/c\//.test(pathname)) {
        return true;
      }
    }
    if (validationCtx.modelTokens.length === 0) {
      return hasBrandToken;
    }
  }

  if (context.manufacturerContext) {
    const manufacturerSignals = [
      'support',
      'manual',
      'spec',
      'product',
      'products',
      'datasheet',
      'technical',
      'download'
    ];
    const hasManufacturerSignal = manufacturerSignals.some((token) => pathAndQuery.includes(token));
    if (!hasManufacturerSignal) {
      return false;
    }

    if (hasModelToken) {
      return true;
    }

    if (validationCtx.modelTokens.length === 0) {
      if (hasBrandToken) {
        return true;
      }
      return (
        pathAndQuery.includes('support') ||
        pathAndQuery.includes('manual') ||
        pathAndQuery.includes('spec') ||
        pathAndQuery.includes('download')
      );
    }

    return (
      /\/products?\//.test(pathname) &&
      !/\/shop\/c\//.test(pathname)
    );
  }

  return false;
}
