// WHY: Content-addressed hashing for artifact persistence.
// Rescued from src/exporter/artifactPathResolver.js (dead code, deleted).
// Used by HTML artifact persister; screenshot/video persisters keep their
// own inline wrappers (no change to working code).

import crypto from 'node:crypto';

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
