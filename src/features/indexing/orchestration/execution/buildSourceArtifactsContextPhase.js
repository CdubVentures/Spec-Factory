export function buildSourceArtifactsContextPhase({
  artifactHostKey = '',
  screenshotUri = '',
  screenshotFileUri = '',
  screenshotArtifact = {},
  domSnippetUri = '',
  domSnippetArtifact = {},
  extraction = {},
  evidencePack = null,
} = {}) {
  const artifactRefs = {
    host_key: artifactHostKey,
    screenshot_uri: screenshotUri || '',
    screenshot_file_uri: screenshotFileUri || '',
    screenshot_mime_type: String(screenshotArtifact?.mime_type || '').trim() || null,
    screenshot_content_hash: String(screenshotArtifact?.content_hash || '').trim() || null,
    screenshot_width: Number(screenshotArtifact?.width || 0) || null,
    screenshot_height: Number(screenshotArtifact?.height || 0) || null,
    screenshot_size_bytes: Buffer.isBuffer(screenshotArtifact?.bytes)
      ? screenshotArtifact.bytes.length
      : (Number.isFinite(Number(screenshotArtifact?.bytes)) ? Number(screenshotArtifact.bytes) : null),
    dom_snippet_uri: domSnippetUri || '',
    dom_snippet_content_hash: String(domSnippetArtifact?.content_hash || '').trim() || null
  };

  const staticDomStats = extraction?.staticDom?.parserStats && typeof extraction.staticDom.parserStats === 'object'
    ? extraction.staticDom.parserStats
    : {};
  const staticDomAuditRejectedCount = Array.isArray(extraction?.staticDom?.auditRejectedFieldCandidates)
    ? extraction.staticDom.auditRejectedFieldCandidates.length
    : 0;
  const structuredStats = extraction?.structuredMetadata?.stats && typeof extraction.structuredMetadata.stats === 'object'
    ? extraction.structuredMetadata.stats
    : {};
  const structuredSnippetRows = Array.isArray(extraction?.structuredMetadata?.snippetRows)
    ? extraction.structuredMetadata.snippetRows
    : [];
  const structuredErrors = Array.isArray(extraction?.structuredMetadata?.errors)
    ? extraction.structuredMetadata.errors
    : [];
  const pdfExtractionMeta = (
    evidencePack?.meta?.pdf_extraction
    && typeof evidencePack.meta.pdf_extraction === 'object'
  )
    ? evidencePack.meta.pdf_extraction
    : {};

  return {
    artifactRefs,
    staticDomStats,
    staticDomAuditRejectedCount,
    structuredStats,
    structuredSnippetRows,
    structuredErrors,
    pdfExtractionMeta,
  };
}
