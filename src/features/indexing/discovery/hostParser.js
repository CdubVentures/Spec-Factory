// WHY: Public-suffix-aware host parsing. Replaces naive dot-splitting with
// a curated multi-part TLD set. No new packages needed.

const MULTI_PART_TLDS = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk', 'net.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
  'co.kr', 'or.kr', 'ne.kr', 'go.kr',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz',
  'co.za', 'org.za', 'web.za', 'gov.za',
  'com.br', 'org.br', 'net.br', 'gov.br',
  'com.cn', 'org.cn', 'net.cn', 'gov.cn',
  'com.tw', 'org.tw', 'net.tw', 'gov.tw',
  'com.hk', 'org.hk', 'net.hk', 'gov.hk',
  'com.sg', 'org.sg', 'net.sg', 'gov.sg',
  'co.in', 'org.in', 'net.in', 'gov.in',
  'co.id', 'or.id', 'web.id', 'go.id',
  'co.th', 'or.th', 'in.th', 'go.th',
  'com.mx', 'org.mx', 'net.mx', 'gob.mx',
  'com.ar', 'org.ar', 'net.ar', 'gov.ar',
  'co.il', 'org.il', 'net.il', 'gov.il',
  'com.tr', 'org.tr', 'net.tr', 'gov.tr',
  'com.pl', 'org.pl', 'net.pl', 'gov.pl',
  'co.de',
]);

const EMPTY_RESULT = Object.freeze({
  host: '',
  registrableDomain: '',
  subdomain: '',
  publicSuffix: '',
  isIp: false,
});

const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const IPV6_BRACKET_RE = /^\[(.+)]$/;

/**
 * Extract hostname from input that may be a full URL, host:port, or bare hostname.
 * Returns lowercase, www-stripped hostname string.
 */
function extractHostname(input) {
  if (!input || typeof input !== 'string') return '';
  let s = input.trim().toLowerCase();
  if (!s) return '';

  // Strip protocol
  const protoIdx = s.indexOf('://');
  if (protoIdx !== -1) {
    s = s.slice(protoIdx + 3);
  }

  // Strip path/query/fragment
  const pathIdx = s.indexOf('/');
  if (pathIdx !== -1) s = s.slice(0, pathIdx);
  const queryIdx = s.indexOf('?');
  if (queryIdx !== -1) s = s.slice(0, queryIdx);
  const fragIdx = s.indexOf('#');
  if (fragIdx !== -1) s = s.slice(0, fragIdx);

  // Handle IPv6 brackets (before port stripping)
  const ipv6Match = s.match(/^\[([^\]]+)]/);
  if (ipv6Match) {
    return '[' + ipv6Match[1] + ']';
  }

  // Strip port
  const lastColon = s.lastIndexOf(':');
  if (lastColon !== -1) {
    const afterColon = s.slice(lastColon + 1);
    if (/^\d+$/.test(afterColon)) {
      s = s.slice(0, lastColon);
    }
  }

  // Strip www.
  if (s.startsWith('www.')) {
    s = s.slice(4);
  }

  return s;
}

/**
 * Decode punycode labels in a hostname.
 * Uses the built-in URL API for normalization.
 */
function decodePunycode(hostname) {
  // Skip if no punycode labels present
  if (!hostname.includes('xn--')) return hostname;
  try {
    const url = new URL('http://' + hostname);
    let decoded = url.hostname;
    if (decoded.startsWith('www.')) decoded = decoded.slice(4);
    return decoded;
  } catch {
    return hostname;
  }
}

/**
 * Check if input looks like an IP address (v4 or v6).
 */
function detectIp(hostname) {
  if (IPV4_RE.test(hostname)) return { isIp: true, addr: hostname };
  const v6 = hostname.match(IPV6_BRACKET_RE);
  if (v6) return { isIp: true, addr: v6[1] };
  if (hostname.includes(':') && !hostname.includes('.')) {
    return { isIp: true, addr: hostname };
  }
  return { isIp: false, addr: '' };
}

/**
 * Validate that a hostname looks like an actual domain (not a version string, bare word, etc.).
 */
function looksLikeDomain(hostname) {
  if (!hostname || !hostname.includes('.')) return false;
  const parts = hostname.split('.');
  // Every part must be non-empty
  if (parts.some(p => p === '')) return false;
  // Last part (TLD) must be all alpha and >= 2 chars
  const tld = parts[parts.length - 1];
  if (!/^[a-z]{2,}$/.test(tld)) return false;
  // Must have at least one label before the TLD that contains a letter
  const labelsBeforeTld = parts.slice(0, -1);
  if (labelsBeforeTld.length === 0) return false;
  const hasLetterLabel = labelsBeforeTld.some(p => /[a-z]/.test(p));
  if (!hasLetterLabel) return false;
  return true;
}

/**
 * Find the public suffix for a hostname.
 */
function findPublicSuffix(parts) {
  // Check 2-part suffixes first (co.uk, com.au, etc.)
  if (parts.length >= 2) {
    const twoPartSuffix = parts.slice(-2).join('.');
    if (MULTI_PART_TLDS.has(twoPartSuffix)) {
      return twoPartSuffix;
    }
  }
  // Default: single TLD
  return parts[parts.length - 1];
}

/**
 * Parse a host input into structured components.
 * Input can be a full URL, hostname, or host:port.
 * Returns empty result for invalid/bogus inputs — never throws.
 */
export function parseHost(input) {
  let hostname = extractHostname(input);
  if (!hostname) return { ...EMPTY_RESULT };

  // Check IPv6 bracket
  const v6bracket = hostname.match(IPV6_BRACKET_RE);
  if (v6bracket) {
    return {
      host: v6bracket[1],
      registrableDomain: '',
      subdomain: '',
      publicSuffix: '',
      isIp: true,
    };
  }

  // Decode punycode
  hostname = decodePunycode(hostname);

  // Check IP
  const ip = detectIp(hostname);
  if (ip.isIp) {
    return {
      host: ip.addr,
      registrableDomain: '',
      subdomain: '',
      publicSuffix: '',
      isIp: true,
    };
  }

  // Validate domain-like shape
  if (!looksLikeDomain(hostname)) return { ...EMPTY_RESULT };

  const parts = hostname.split('.');
  const publicSuffix = findPublicSuffix(parts);
  const suffixParts = publicSuffix.split('.').length;

  // Need at least one label before the public suffix
  if (parts.length <= suffixParts) return { ...EMPTY_RESULT };

  const registrableDomain = parts.slice(-(suffixParts + 1)).join('.');
  const subdomainParts = parts.slice(0, -(suffixParts + 1));
  const subdomain = subdomainParts.join('.');

  return {
    host: hostname,
    registrableDomain,
    subdomain,
    publicSuffix,
    isIp: false,
  };
}

/**
 * Normalize a host input: lowercase, www-stripped, port-stripped, protocol-stripped.
 */
export function normalizeHost(input) {
  return extractHostname(input);
}

/**
 * Check if candidate is a strict subdomain of parent.
 * "docs.razer.com" is subdomain of "razer.com" → true
 * "razer.com" of "razer.com" → false (exact match, not subdomain)
 * "evilrazer.com" of "razer.com" → false
 */
export function isSubdomainOf(candidate, parent) {
  const c = normalizeHost(candidate);
  const p = normalizeHost(parent);
  if (!c || !p || c === p) return false;
  return c.endsWith('.' + p);
}

/**
 * Check if host matches domain (exact or subdomain).
 */
export function hostMatchesDomain(host, domain) {
  const h = normalizeHost(host);
  const d = normalizeHost(domain);
  if (!h || !d) return false;
  return h === d || h.endsWith('.' + d);
}

/**
 * Check if input is a valid domain name.
 * Rejects version-like tokens, bare words, IPs.
 */
export function isValidDomain(input) {
  const hostname = extractHostname(input);
  if (!hostname) return false;
  const ip = detectIp(hostname);
  if (ip.isIp) return false;
  if (!looksLikeDomain(hostname)) return false;
  const parts = hostname.split('.');
  const publicSuffix = findPublicSuffix(parts);
  const suffixParts = publicSuffix.split('.').length;
  return parts.length > suffixParts;
}
