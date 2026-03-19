// Extraction — public API re-exports.
// Parsers, filters, PDF handling, evidence, LLM extraction, core classes.

export { extractCandidatesFromPage } from './parsers/fieldExtractor.js';
export { extractLdJsonBlocks } from './parsers/ldjsonExtractor.js';
export { extractEmbeddedState } from './parsers/embeddedStateExtractor.js';
export { extractDomFallback } from './parsers/domFallbackExtractor.js';
export { extractStaticDomCandidates } from './parsers/staticDomExtractor.js';

export {
  filterReadableHtml,
  extractReadableText,
  truncateForTokenBudget,
} from './readabilityFilter.js';

export { extractMainArticle } from './articleExtractor.js';

export {
  normalizeArticleHostToken,
  normalizeArticleExtractorMode,
  normalizeArticleExtractorPolicyMap,
  resolveArticleExtractionPolicy,
} from './articleExtractorPolicy.js';

export {
  choosePdfBackend,
  normalizePdfBackend,
  normalizePdfPair,
  splitPdfPairsBySurface,
  summarizePdfDoc,
} from './pdfBackendRouter.js';

export {
  extractPdfText,
  extractTablesFromPdfText,
  parsePdfSpecTable,
} from './pdfTableExtractor.js';

export {
  buildEvidencePack,
  buildEvidenceCandidateFingerprint,
} from './evidencePack.js';

export { verifyCandidateEvidence } from './evidenceVerifier.js';

export { extractCandidatesLLM } from './extractCandidatesLLM.js';
export { buildPromptFieldContracts } from './batchPromptContext.js';

export { DeterministicParser } from './deterministicParser.js';
export { ComponentResolver } from './componentResolver.js';

export { retrieveGoldenExamples } from './goldenExamples.js';

export { AggressiveDomExtractor } from './aggressiveDom.js';
export { AggressiveOrchestrator } from './aggressiveOrchestrator.js';
export { AggressiveReasoningResolver } from './aggressiveReasoning.js';

export { EvidenceAuditor } from './evidenceAudit.js';

export {
  buildPrimeSourcesFromEvidencePack,
  buildPrimeSourcesFromProvenance,
  buildExtractionContextMatrix,
} from './extractionContext.js';

export {
  estimateTokenCount,
  rankSnippets,
  buildDossier,
} from './dossierBuilder.js';

export { mergeStructuredMetadataCandidates } from './structuredMetadataMerger.js';

export {
  buildScreenshotConfig,
  parseScreenshotResult,
  captureScreenshot,
  ScreenshotQueue,
} from './screenshotCapture.js';

export {
  defaultSearchTrackerState,
  SearchTracker,
} from './searchTracker.js';

export { buildFieldBatches, resolveBatchModel } from './fieldBatching.js';

export {
  uniqueTokens,
  inferImageMimeFromUri,
  normalizeVisualAssetsFromEvidencePack,
  selectBatchEvidence,
} from './batchEvidenceSelection.js';

export { prepareBatchPromptContext } from './batchPromptContext.js';

export {
  shouldSendPrimeSourceVisuals,
  buildMultimodalUserInput,
  invokeExtractionModel,
} from './invokeExtractionModel.js';

export { executeExtractionBatch } from './executeExtractionBatch.js';

export {
  createEmptyPhase08,
  mergePhase08FieldContexts,
  mergePhase08PrimeRows,
  buildCompletedPhase08BatchRow,
  buildPhase08ExtractionPayload,
} from './phase08Extraction.js';

export { runExtractionVerification } from './runExtractionVerification.js';

export {
  hasKnownValue,
  sanitizeExtractionResult,
} from './sanitizeExtractionResult.js';

