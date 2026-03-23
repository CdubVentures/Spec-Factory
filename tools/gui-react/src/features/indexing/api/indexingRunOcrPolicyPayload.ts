type IndexingRunOcrPolicyPayloadPrimitive = string | number | boolean;

export interface BuildIndexingRunOcrPolicyPayloadInput {
  scannedPdfOcrEnabled: boolean;
  scannedPdfOcrBackend: boolean | string;
  parsedScannedPdfOcrMaxPages: number;
  parsedScannedPdfOcrMaxPairs: number;
  parsedScannedPdfOcrMinChars: number;
  parsedScannedPdfOcrMinLines: number;
  parsedScannedPdfOcrMinConfidence: number;
  dynamicFetchPolicyMapJson: string;
  searchProfileCapMapJson: string;
  fetchSchedulerInternalsMapJson: string;
  parsingConfidenceBaseMapJson: string;
  repairDedupeRule: string;
}

export function buildIndexingRunOcrPolicyPayload(
  input: BuildIndexingRunOcrPolicyPayloadInput,
): Record<string, IndexingRunOcrPolicyPayloadPrimitive> {
  return {
    scannedPdfOcrEnabled: input.scannedPdfOcrEnabled,
    scannedPdfOcrBackend: input.scannedPdfOcrBackend,
    scannedPdfOcrMaxPages: Math.max(1, input.parsedScannedPdfOcrMaxPages),
    scannedPdfOcrMaxPairs: Math.max(50, input.parsedScannedPdfOcrMaxPairs),
    scannedPdfOcrMinCharsPerPage: Math.max(1, input.parsedScannedPdfOcrMinChars),
    scannedPdfOcrMinLinesPerPage: Math.max(1, input.parsedScannedPdfOcrMinLines),
    scannedPdfOcrMinConfidence: Math.max(0, Math.min(1, input.parsedScannedPdfOcrMinConfidence)),
    dynamicFetchPolicyMapJson: String(input.dynamicFetchPolicyMapJson || '').trim(),
    searchProfileCapMapJson: String(input.searchProfileCapMapJson || '').trim(),
    fetchSchedulerInternalsMapJson: String(input.fetchSchedulerInternalsMapJson || '').trim(),
    parsingConfidenceBaseMapJson: String(input.parsingConfidenceBaseMapJson || '').trim(),
    repairDedupeRule: String(input.repairDedupeRule || '').trim(),
  };
}
