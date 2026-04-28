// WHY: Adapter that reads prior-run URLs for IndexLab from SQL runtime state.
// product.json remains deleted-DB rebuild/audit memory and is projected into
// SQL before runtime seed planning.
// Shape parallels queryExecutionHistory (from crawlLedgerStore) so
// runSearchPlanner can gate injection on discoveryUrlHistoryEnabled.
// Scope: product-scoped (IndexLab has no variant/key axis at this layer).

function uniqueUrls(values) {
  return [...new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
}

function readSqlUrlHistory(productId, opts = {}) {
  const source = opts.specDb || opts.crawlLedger || opts.frontierDb || null;
  const rows = typeof source?.getIndexedUrlHistoryByProduct === 'function'
    ? source.getIndexedUrlHistoryByProduct(productId) || []
    : source?.getUrlCrawlEntriesByProduct?.(productId) || [];
  const urls = uniqueUrls(rows.map((row) =>
    row?.url || row?.canonical_url || row?.original_url || row?.final_url || row?.source_url || ''));
  return urls.length > 0 ? { urls } : null;
}

/**
 * @param {string} productId
 * @param {{ specDb?: object, crawlLedger?: object, frontierDb?: object }} [opts]
 * @returns {{ urls: string[] }}
 */
export function readIndexlabUrlHistory(productId, opts = {}) {
  const pid = String(productId || '').trim();
  if (!pid) return { urls: [] };

  const sqlHistory = readSqlUrlHistory(pid, opts);
  return sqlHistory || { urls: [] };
}
