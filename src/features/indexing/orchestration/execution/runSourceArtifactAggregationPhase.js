export function runSourceArtifactAggregationPhase({
  artifactsByHost = {},
  artifactHostKey = '',
  pageArtifactsPersisted = false,
  pageHtmlUri = '',
  ldjsonUri = '',
  embeddedStateUri = '',
  networkResponsesUri = '',
  pageData = {},
  domSnippetArtifact = null,
  adapterExtra = {},
  mergedFieldCandidatesWithEvidence = [],
  adapterArtifacts = [],
  config = {},
  source = {},
  evidencePack = {},
  llmFieldCandidates = [],
  llmExtraction = {},
} = {}) {
  const parsedAggressiveDomHtmlMaxChars = Number.parseInt(String(config?.aggressiveDomHtmlMaxChars ?? ''), 10);
  const aggressiveDomHtmlMaxChars = Number.isFinite(parsedAggressiveDomHtmlMaxChars)
    ? Math.max(2_000, Math.min(500_000, parsedAggressiveDomHtmlMaxChars))
    : 120_000;
  const retainedDomHtmlSource = String(domSnippetArtifact?.html || pageData.html || '');
  const retainedDomHtml = retainedDomHtmlSource.slice(0, aggressiveDomHtmlMaxChars);

  artifactsByHost[artifactHostKey] = {
    pageArtifactsPersisted,
    pageHtmlUri: String(pageHtmlUri || '').trim(),
    ldjsonUri: String(ldjsonUri || '').trim(),
    embeddedStateUri: String(embeddedStateUri || '').trim(),
    networkResponsesUri: String(networkResponsesUri || '').trim(),
    domHtml: retainedDomHtml,
    html: pageArtifactsPersisted ? '' : String(pageData.html || ''),
    ldjsonBlocks: pageArtifactsPersisted ? [] : (pageData.ldjsonBlocks || []),
    embeddedState: pageArtifactsPersisted ? {} : (pageData.embeddedState || {}),
    networkResponses: pageArtifactsPersisted ? [] : (pageData.networkResponses || []),
    screenshot: pageArtifactsPersisted ? null : (pageData.screenshot || null),
    domSnippet: pageArtifactsPersisted ? null : domSnippetArtifact,
    pdfDocs: adapterExtra.pdfDocs || [],
    extractedCandidates: mergedFieldCandidatesWithEvidence
  };

  adapterArtifacts.push(...(adapterExtra.adapterArtifacts || []));
  adapterArtifacts.push({
    name: `llm_${source.host}`,
    payload: {
      url: source.url,
      evidence_ref_count: evidencePack?.references?.length || 0,
      llm_candidate_count: llmFieldCandidates.length,
      llm_conflicts: llmExtraction.conflicts,
      llm_notes: llmExtraction.notes
    }
  });

  return {
    llmSourcesUsedDelta: llmFieldCandidates.length > 0 ? 1 : 0,
    llmCandidatesAcceptedDelta: llmFieldCandidates.length > 0 ? llmFieldCandidates.length : 0,
  };
}
