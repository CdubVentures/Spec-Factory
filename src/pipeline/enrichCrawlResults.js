// WHY: B6 — crawlResults from runFetchPlan carry URL + fetch outcome only,
// because the fetcher extracts `orderedSources[i].url` and drops everything
// else (triageMeta). Downstream checkpoints then record null hint_source /
// tier / provider for every source, which breaks evidence-tier scoring.
// This helper joins triageMeta back by URL so the mappers can forward it.

export function deriveTierFromHintSource(hintSource) {
  if (!hintSource || typeof hintSource !== 'string') return null;
  if (hintSource.startsWith('tier1')) return 'seed';
  if (hintSource.startsWith('tier2')) return 'group_search';
  if (hintSource.startsWith('tier3')) return 'key_search';
  return null;
}

export function enrichCrawlResults(crawlResults, orderedSources) {
  const results = Array.isArray(crawlResults) ? crawlResults : [];
  const sources = Array.isArray(orderedSources) ? orderedSources : [];
  const metaByUrl = new Map();
  for (const src of sources) {
    if (src && src.url) metaByUrl.set(src.url, src.triageMeta || null);
  }
  return results.map((r) => {
    const meta = metaByUrl.get(r?.url) || null;
    const hintSource = meta?.hint_source || null;
    return {
      ...r,
      hint_source: hintSource,
      tier: deriveTierFromHintSource(hintSource),
      providers: meta?.providers || null,
    };
  });
}
