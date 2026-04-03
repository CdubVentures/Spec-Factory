// WHY: Content-addressed hashing for artifact persistence.
// Rescued from src/exporter/artifactPathResolver.js (dead code, deleted).
// Used by HTML artifact persister; screenshot/video persisters keep their
// own inline wrappers (no change to working code).

import crypto from 'node:crypto';

/**
 * Compute SHA-256 hex hash of an arbitrary string.
 * WHY: Generic seed-hash utility for hash-gated reconciliation.
 * Unlike computePageContentHash, does NOT trim — whitespace is significant
 * for file-content hashing where trailing newlines change the hash.
 * @returns {string} 64-char hex string, or '' for empty/null input.
 */
export function sha256Hex(value) {
  const text = String(value ?? '');
  if (!text) return '';
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
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

/**
 * Deterministic snippet ID from content hash + parser version + chunk index.
 * WHY: Relocated from src/index/evidenceIndexDb.js (deleted) — tierAwareRetriever
 * depends on this for stable snippet identity.
 * @returns {string} `sn_` prefixed 16-char hex slug.
 */
export function generateStableSnippetId({ contentHash, parserVersion, chunkIndex }) {
  const seed = `${String(contentHash || '')}|${String(parserVersion || '')}|${Number(chunkIndex || 0)}`;
  return `sn_${sha256Hex(seed).slice(0, 16)}`;
}
