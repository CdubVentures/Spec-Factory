type IndexingRunDiscoveryPayloadPrimitive = string | number | boolean;

export interface BuildIndexingRunDiscoveryPayloadInput {
  fetchCandidateSources: boolean;
  parsedSearchProfileQueryCap: number;
  parsedSerpSelectorUrlCap: number;
  parsedDomainClassifierUrlCap: number;
  parsedMaxUrlsPerProduct: number;
  parsedMaxCandidateUrls: number;
  parsedMaxPagesPerDomain: number;
  parsedMaxRunSeconds: number;
  parsedMaxJsonBytes: number;
  parsedMaxPdfBytes: number;
}

// WHY: No Math.max clamping here. The registry defines min/max,
// deriveIndexingRunStartParsedValues parses, and configPostMerge clamps.
// This function is a pass-through — the store already did its job.
export function buildIndexingRunDiscoveryPayload(
  input: BuildIndexingRunDiscoveryPayloadInput,
): Record<string, IndexingRunDiscoveryPayloadPrimitive> {
  return {
    discoveryEnabled: true,
    fetchCandidateSources: input.fetchCandidateSources,
    searchProfileQueryCap: input.parsedSearchProfileQueryCap,
    serpSelectorUrlCap: input.parsedSerpSelectorUrlCap,
    domainClassifierUrlCap: input.parsedDomainClassifierUrlCap,
    maxUrlsPerProduct: input.parsedMaxUrlsPerProduct,
    maxCandidateUrls: input.parsedMaxCandidateUrls,
    maxPagesPerDomain: input.parsedMaxPagesPerDomain,
    maxRunSeconds: input.parsedMaxRunSeconds,
    maxJsonBytes: input.parsedMaxJsonBytes,
    maxPdfBytes: input.parsedMaxPdfBytes,
  };
}
