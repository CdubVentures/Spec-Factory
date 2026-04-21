// WHY: Adapter that reads prior-run URLs for IndexLab from the product.json
// SSOT at {productRoot}/{productId}/product.json::sources[].
// Shape parallels queryExecutionHistory (from crawlLedgerStore) so
// runSearchPlanner can gate injection on discoveryUrlHistoryEnabled.
// Scope: product-scoped (IndexLab has no variant/key axis at this layer).
// No network / DB access — pure file read.

import fs from 'node:fs';
import path from 'node:path';
import { defaultProductRoot } from '../../../../core/config/runtimeArtifactRoots.js';

/**
 * @param {string} productId
 * @param {{ productRoot?: string, fsReadFile?: Function }} [opts]
 * @returns {{ urls: string[] }}
 */
export function readIndexlabUrlHistory(productId, opts = {}) {
  const pid = String(productId || '').trim();
  if (!pid) return { urls: [] };
  const root = opts.productRoot || defaultProductRoot();
  const productPath = path.join(root, pid, 'product.json');
  const readFile = opts.fsReadFile || ((p) => fs.readFileSync(p, 'utf8'));
  let parsed;
  try {
    parsed = JSON.parse(readFile(productPath));
  } catch {
    return { urls: [] };
  }
  const sources = Array.isArray(parsed?.sources) ? parsed.sources : [];
  const urls = [...new Set(
    sources
      .map((s) => String(s?.url || '').trim())
      .filter(Boolean),
  )];
  return { urls };
}
