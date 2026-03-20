type IndexingRunDiscoveryPayloadPrimitive = string | number | boolean;

export interface BuildIndexingRunDiscoveryPayloadInput {
  fetchCandidateSources: boolean;
  parsedSearchProfileQueryCap: number;
  parsedSearchPlannerQueryCap: number;
  parsedMaxUrlsPerProduct: number;
  parsedMaxCandidateUrls: number;
  parsedMaxPagesPerDomain: number;
  parsedMaxRunSeconds: number;
  parsedMaxJsonBytes: number;
  parsedMaxPdfBytes: number;
}

export function buildIndexingRunDiscoveryPayload(
  input: BuildIndexingRunDiscoveryPayloadInput,
): Record<string, IndexingRunDiscoveryPayloadPrimitive> {
  return {
    // WHY: discoveryEnabled is a hardcoded invariant per the rollout plan — always on.
    discoveryEnabled: true,
    fetchCandidateSources: input.fetchCandidateSources,
    searchProfileQueryCap: Math.max(1, input.parsedSearchProfileQueryCap),
    searchPlannerQueryCap: Math.max(1, input.parsedSearchPlannerQueryCap),
    maxUrlsPerProduct: Math.max(1, input.parsedMaxUrlsPerProduct),
    maxCandidateUrls: Math.max(1, input.parsedMaxCandidateUrls),
    maxPagesPerDomain: Math.max(1, input.parsedMaxPagesPerDomain),
    maxRunSeconds: Math.max(30, input.parsedMaxRunSeconds),
    maxJsonBytes: Math.max(1024, input.parsedMaxJsonBytes),
    maxPdfBytes: Math.max(1024, input.parsedMaxPdfBytes),
  };
}
