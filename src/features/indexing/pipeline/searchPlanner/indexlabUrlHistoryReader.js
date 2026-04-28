// WHY: Adapter that reads prior-run URLs for IndexLab from SQL first, with
// product.json kept as the deleted-DB rebuild/audit fallback.
// Shape parallels queryExecutionHistory (from crawlLedgerStore) so
// runSearchPlanner can gate injection on discoveryUrlHistoryEnabled.
// Scope: product-scoped (IndexLab has no variant/key axis at this layer).

import fs from 'node:fs';
import path from 'node:path';
import { defaultProductRoot } from '../../../../core/config/runtimeArtifactRoots.js';

function uniqueUrls(values) {
  return [...new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
}

function readSqlUrlHistory(productId, opts = {}) {
  const source = opts.specDb || opts.crawlLedger || opts.frontierDb || null;
  if (typeof source?.getUrlCrawlEntriesByProduct !== 'function') return null;
  const rows = source.getUrlCrawlEntriesByProduct(productId) || [];
  const urls = uniqueUrls(rows.map((row) =>
    row?.canonical_url || row?.original_url || row?.final_url || row?.source_url || ''));
  return urls.length > 0 ? { urls } : null;
}

/**
 * @param {string} productId
 * @param {{ productRoot?: string, fsReadFile?: Function, specDb?: object, crawlLedger?: object, frontierDb?: object }} [opts]
 * @returns {{ urls: string[] }}
 */
export function readIndexlabUrlHistory(productId, opts = {}) {
  const pid = String(productId || '').trim();
  if (!pid) return { urls: [] };

  const sqlHistory = readSqlUrlHistory(pid, opts);
  if (sqlHistory) return sqlHistory;

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
  return { urls: uniqueUrls(sources.map((s) => s?.url || '')) };
}
