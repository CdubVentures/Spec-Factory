// WHY: Content-addressed artifact path resolution.
// Binaries (HTML, screenshots, PDFs) go to artifacts/{category}/{product}/sources/{hash12}/
// SQL rows point to these paths — this module computes the path from a content hash.

import crypto from 'node:crypto';

/**
 * Resolve the content-addressed source directory for a crawled document.
 * @returns {string} Posix-style relative path with trailing slash, or '' if inputs are invalid.
 */
export function resolveSourceDir({ category, productId, contentHash } = {}) {
  const cat = String(category || '').trim();
  const prod = String(productId || '').trim();
  const raw = String(contentHash || '').trim();
  if (!cat || !prod || !raw) return '';
  const stripped = raw.replace(/^sha256:/, '');
  const hash12 = stripped.slice(0, 12);
  if (!hash12) return '';
  return `artifacts/${cat}/${prod}/sources/${hash12}/`;
}

/**
 * Compute SHA-256 hex hash of page HTML content (string input).
 * @returns {string} 64-char hex string, or '' for empty/null input.
 */
export function computePageContentHash(html) {
  const text = String(html ?? '').trim();
  if (!text) return '';
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Compute SHA-256 hex hash of a binary buffer (screenshots, PDFs).
 * @returns {string} 64-char hex string, or '' for null/empty buffer.
 */
export function computeFileContentHash(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return '';
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
