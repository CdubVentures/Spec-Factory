type IndexingRunDiscoveryPayloadPrimitive = string | number | boolean;

export interface BuildIndexingRunDiscoveryPayloadInput {
  fetchCandidateSources: boolean;
  parsedDiscoveryMaxQueries: number;
  parsedDiscoveryMaxDiscovered: number;
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
    discoveryMaxQueries: Math.max(1, input.parsedDiscoveryMaxQueries),
    discoveryMaxDiscovered: Math.max(1, input.parsedDiscoveryMaxDiscovered),
    maxUrlsPerProduct: Math.max(1, input.parsedMaxUrlsPerProduct),
    maxCandidateUrls: Math.max(1, input.parsedMaxCandidateUrls),
    maxPagesPerDomain: Math.max(1, input.parsedMaxPagesPerDomain),
    maxRunSeconds: Math.max(30, input.parsedMaxRunSeconds),
    maxJsonBytes: Math.max(1024, input.parsedMaxJsonBytes),
    maxPdfBytes: Math.max(1024, input.parsedMaxPdfBytes),
  };
}
