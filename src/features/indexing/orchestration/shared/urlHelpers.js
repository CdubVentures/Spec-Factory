export function isDiscoveryOnlySourceUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    const query = parsed.search.toLowerCase();
    if (path.endsWith('/robots.txt')) {
      return true;
    }
    if (path.includes('sitemap') || path.endsWith('.xml')) {
      return true;
    }
    if (path.includes('/search')) {
      return true;
    }
    if (path.includes('/catalogsearch') || path.includes('/find')) {
      return true;
    }
    if ((query.includes('q=') || query.includes('query=')) && path.length <= 16) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function isRobotsTxtUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().endsWith('/robots.txt');
  } catch {
    return false;
  }
}

export function isSitemapUrl(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    return pathname.includes('sitemap') || pathname.endsWith('.xml');
  } catch {
    return false;
  }
}

export function isHttpPreferredStaticSourceUrl(source = {}) {
  if (Boolean(source?.requires_js) || source?.crawlConfig?.method === 'playwright') {
    return false;
  }

  try {
    const parsed = new URL(String(source?.url || '').trim());
    const path = parsed.pathname.toLowerCase();
    const query = parsed.search.toLowerCase();
    const title = String(source?.title || '').toLowerCase();
    const text = `${path} ${query} ${title}`;
    return (
      path.endsWith('.pdf')
      || /manual|datasheet|user[-_ ]guide|owner[-_ ]manual|download/.test(text)
    );
  } catch {
    return false;
  }
}

export function hasSitemapXmlSignals(body) {
  const text = String(body || '').toLowerCase();
  return text.includes('<urlset') || text.includes('<sitemapindex') || text.includes('<loc>');
}

export function isLikelyIndexableEndpointUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (
      host.startsWith('api.')
      || host.startsWith('api-')
      || host.includes('.api.')
    ) {
      return false;
    }
    if (path.endsWith('.json') || path.endsWith('.js')) {
      return false;
    }
    if (
      path.includes('/api/')
      || path.includes('/graphql')
      || path.includes('/rest/')
      || path.includes('/users/anonymous/')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isSafeManufacturerFollowupUrl(source, url) {
  try {
    const parsed = new URL(url);
    const sourceRootDomain = String(source?.rootDomain || source?.host || '').toLowerCase();
    if (!sourceRootDomain) {
      return false;
    }
    const host = String(parsed.hostname || '').toLowerCase().replace(/^www\./, '');
    if (!host || (!host.endsWith(sourceRootDomain) && sourceRootDomain !== host)) {
      return false;
    }

    const path = parsed.pathname.toLowerCase();
    if (path.endsWith('/robots.txt') || path.includes('sitemap') || path.endsWith('.xml')) {
      return false;
    }
    const signal = [
      '/support',
      '/manual',
      '/spec',
      '/product',
      '/products',
      '/download',
    ];
    return signal.some((token) => path.includes(token));
  } catch {
    return false;
  }
}

export function isHelperSyntheticUrl(url) {
  const token = String(url || '').trim().toLowerCase();
  return token.startsWith('category_authority://');
}

export function isHelperSyntheticSource(source) {
  if (!source) {
    return false;
  }
  if (source.helperSource) {
    return true;
  }
  if (String(source.host || '').trim().toLowerCase() === 'category-authority.local') {
    return true;
  }
  return isHelperSyntheticUrl(source.url) || isHelperSyntheticUrl(source.finalUrl);
}
