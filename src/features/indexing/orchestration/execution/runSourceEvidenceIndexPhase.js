import { indexDocument } from '../../../../index/evidenceIndexDb.js';
import { buildDedupeOutcomeEvent } from '../../../../pipeline/dedupeOutcomeEvent.js';

export function runSourceEvidenceIndexPhase({
  config = {},
  evidencePack = null,
  pageData = {},
  source = {},
  category = '',
  productId = '',
  logger = null,
  indexDocumentFn = indexDocument,
  buildDedupeOutcomeEventFn = buildDedupeOutcomeEvent,
} = {}) {
  if (!config.evidenceIndexDb || !evidencePack?.chunk_data) {
    return { indexResult: null };
  }

  try {
    const chunkData = evidencePack.chunk_data;
    const pageContentHash = String(evidencePack?.meta?.page_content_hash || '');
    const indexResult = indexDocumentFn({
      db: config.evidenceIndexDb,
      document: {
        contentHash: pageContentHash,
        parserVersion: String(evidencePack?.evidence_pack_version || 'v1'),
        url: String(pageData.finalUrl || source.url || ''),
        host: String(source.host || ''),
        tier: Number(source.tier || 99),
        role: String(source.role || ''),
        category,
        productId
      },
      chunks: chunkData.map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        chunkType: chunk.type,
        text: chunk.text,
        normalizedText: chunk.normalizedText,
        snippetHash: chunk.contentHash,
        extractionMethod: chunk.extractionMethod,
        fieldHints: chunk.fieldHints
      })),
      facts: []
    });
    if (indexResult) {
      const dedupePayload = buildDedupeOutcomeEventFn({
        indexResult,
        url: String(pageData.finalUrl || source.url || ''),
        host: String(source.host || '')
      });
      if (dedupePayload) {
        logger?.info?.('evidence_index_result', dedupePayload);
      }
    }

    return { indexResult };
  } catch (err) {
    logger?.warn?.('evidence_index_write_failed', {
      url: source.url,
      error: String(err?.message || err || 'unknown')
    });
    return { indexResult: null };
  }
}
