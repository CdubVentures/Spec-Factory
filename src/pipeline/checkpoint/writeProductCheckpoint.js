// WHY: Read-merge-write for product.json. Each run's sources are merged into
// the accumulated product state, deduped by content_hash. Each product gets
// its own file at {outRoot}/products/{productId}/product.json keyed by the
// unique productId (not by category/brand/model which can be renamed).

import fs from 'node:fs';
import path from 'node:path';
import { mergeProductSources } from './mergeProductSources.js';

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {{ productCheckpoint: object, outRoot: string, runId: string }} opts
 * @returns {{ productPath: string, sourcesAdded: number, sourcesUpdated: number }}
 */
export function writeProductCheckpoint({ productCheckpoint, outRoot, runId }) {
  const productId = String(productCheckpoint.product_id || '').trim();
  const productDir = path.join(outRoot, 'products', productId);
  const productPath = path.join(productDir, 'product.json');
  const existing = safeReadJson(productPath);

  let merged;
  let runsCompleted;
  let sourcesAdded = 0;
  let sourcesUpdated = 0;

  if (existing && existing.checkpoint_type === 'product') {
    const existingSources = Array.isArray(existing.sources) ? existing.sources : [];
    const incomingSources = Array.isArray(productCheckpoint.sources) ? productCheckpoint.sources : [];
    merged = mergeProductSources({ existing: existingSources, incoming: incomingSources, runId });
    runsCompleted = (Number(existing.runs_completed) || 0) + 1;

    const existingHashes = new Set(existingSources.filter((s) => s.content_hash).map((s) => s.content_hash));
    for (const src of incomingSources) {
      if (src.content_hash && existingHashes.has(src.content_hash)) {
        sourcesUpdated += 1;
      } else {
        sourcesAdded += 1;
      }
    }
  } else {
    merged = productCheckpoint.sources || [];
    runsCompleted = 1;
    sourcesAdded = merged.length;
  }

  const output = {
    ...productCheckpoint,
    sources: merged,
    runs_completed: runsCompleted,
    latest_run_id: String(runId || ''),
    updated_at: new Date().toISOString(),
  };

  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(productPath, JSON.stringify(output, null, 2), 'utf8');

  return { productPath, sourcesAdded, sourcesUpdated };
}
