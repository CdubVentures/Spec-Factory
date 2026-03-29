// WHY: Writes crawl checkpoint manifest to disk + optional SQL index.
// The checkpoint file is the durable artifact — if the DB is lost, this
// file can rebuild crawl_sources/screenshots/videos SQL tables from disk.

import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {{ checkpoint: object, outRoot: string, runId: string, upsertRunArtifact?: function, category?: string }} opts
 * @returns {{ checkpointPath: string }}
 */
export function writeCrawlCheckpoint({ checkpoint, outRoot, runId, upsertRunArtifact, category }) {
  const runDir = path.join(outRoot, runId);
  const checkpointPath = path.join(runDir, 'run.json');

  fs.mkdirSync(runDir, { recursive: true });
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
