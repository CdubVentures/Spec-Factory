// WHY: Writes crawl checkpoint manifest to disk + optional SQL index.
// The checkpoint file is the durable artifact — if the DB is lost, this
// file can rebuild crawl_sources/screenshots/videos SQL tables from disk.

import fs from 'node:fs';
import path from 'node:path';

function extractHost(url) {
  try { return new URL(String(url || '')).hostname; } catch { return ''; }
}

function projectRunSources({ checkpoint, insertRunSource }) {
  if (typeof insertRunSource !== 'function') return;
  const sources = Array.isArray(checkpoint?.sources) ? checkpoint.sources : [];
  const run = checkpoint?.run || {};
  const runId = String(run.run_id || '').trim();
  const category = String(run.category || '').trim();
  const productId = String(run.product_id || '').trim();
  const crawledAt = String(checkpoint?.created_at || '').trim();
  for (const src of sources) {
    if (!src?.content_hash) continue;
    try {
      insertRunSource({
        run_id: runId,
        content_hash: src.content_hash,
        category,
        product_id: productId,
        source_url: src.url || '',
        final_url: src.final_url || '',
        host: src.host || extractHost(src.url),
        http_status: src.status || 0,
        doc_kind: src.doc_kind || 'html',
        source_tier: src.source_tier || src.tier || 5,
        content_type: src.content_type || 'text/html',
        size_bytes: src.size_bytes || 0,
        file_path: src.html_file || '',
        has_screenshot: (src.screenshot_count || 0) > 0 ? 1 : 0,
        has_pdf: src.has_pdf ? 1 : 0,
        has_ldjson: src.has_ldjson ? 1 : 0,
        has_dom_snippet: src.has_dom_snippet ? 1 : 0,
        crawled_at: crawledAt,
      });
    } catch {
      // WHY: SQL projection failure must not prevent durable checkpoint writes.
    }
  }
}

/**
 * @param {{ checkpoint: object, outRoot: string, runId: string, upsertRunArtifact?: function, insertRunSource?: function, category?: string }} opts
 * @returns {{ checkpointPath: string }}
 */
export function writeCrawlCheckpoint({ checkpoint, outRoot, runId, upsertRunArtifact, insertRunSource, category }) {
  const runDir = path.join(outRoot, runId);
  const checkpointPath = path.join(runDir, 'run.json');

  fs.mkdirSync(runDir, { recursive: true });
  projectRunSources({ checkpoint, insertRunSource });
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');

  if (typeof upsertRunArtifact === 'function') {
    try {
      upsertRunArtifact({
        run_id: String(runId || ''),
        artifact_type: 'run_checkpoint',
        category: String(category || ''),
        payload: {
          urls_crawled: checkpoint?.counters?.urls_crawled ?? 0,
          urls_successful: checkpoint?.counters?.urls_successful ?? 0,
          checkpoint_path: checkpointPath,
        },
      });
    } catch {
      // WHY: SQL failure must not prevent checkpoint persistence.
    }
  }

  return { checkpointPath };
}
