// WHY: Persists crawled HTML to {runDir}/html/ as gzipped, content-addressed
// files. Mirrors screenshotArtifactPersister.js — DI-injected into crawlSession
// via onHtmlPersist callback to avoid cross-feature imports.
//
// Optional SQL indexing: when insertCrawlSource + runContext are provided,
// indexes each page into the crawl_sources table. Best-effort — SQL failure
// does not prevent disk write.

import fs from 'node:fs';
import path from 'node:path';
import { computePageContentHash } from '../../../../shared/contentHash.js';
import { gzipBuffer } from '../../../../shared/serialization.js';

/**
 * @param {{ html: string, htmlDir: string, workerId: string, url: string, finalUrl: string, status: number, title: string, insertCrawlSource?: function, runContext?: { category: string, productId: string, runId: string, host: string } }} opts
 * @returns {{ filename: string, content_hash: string, size_bytes: number, file_path: string } | null}
 */
export function persistHtmlArtifact({ html, htmlDir, workerId, url, finalUrl, status, title, insertCrawlSource, runContext }) {
  const contentHash = computePageContentHash(html);
  if (!contentHash) return null;

  const hash12 = contentHash.slice(0, 12);
  const filename = `${hash12}.html.gz`;
  const filePath = path.join(htmlDir, filename);
  const sizeBytes = Buffer.byteLength(String(html), 'utf8');

  try {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(htmlDir, { recursive: true });
      fs.writeFileSync(filePath, gzipBuffer(html));
    }

    const record = {
      filename,
      content_hash: contentHash,
      size_bytes: sizeBytes,
      file_path: filePath,
    };

    if (typeof insertCrawlSource === 'function' && runContext) {
      try {
        insertCrawlSource({
          content_hash: contentHash,
          category: runContext.category || '',
          product_id: runContext.productId || '',
          run_id: runContext.runId || '',
          source_url: String(url || ''),
          final_url: String(finalUrl || ''),
          host: runContext.host || '',
          http_status: Number(status || 0),
          doc_kind: 'html',
          source_tier: 5,
          content_type: 'text/html',
          size_bytes: sizeBytes,
          file_path: filePath,
          has_screenshot: 0,
          has_pdf: 0,
          has_ldjson: 0,
          has_dom_snippet: 0,
          crawled_at: new Date().toISOString(),
        });
      } catch {
        // WHY: SQL failure must not prevent HTML persistence.
      }
    }

    return record;
  } catch {
    return null;
  }
}
