export async function buildSummaryArtifactsContext({
  config = {},
  fieldOrder = [],
  normalized = { fields: {} },
  provenance = {},
  summary = {},
  logger,
  llmContext,
  writeSummaryMarkdownLLMFn,
  buildMarkdownSummaryFn,
  tsvRowFromFieldsFn,
} = {}) {
  const rowTsv = tsvRowFromFieldsFn(fieldOrder, normalized.fields);
  let markdownSummary = '';

  if (config.writeMarkdownSummary) {
    if (config.llmEnabled && config.llmWriteSummary) {
      markdownSummary = await writeSummaryMarkdownLLMFn({
        normalized,
        provenance,
        summary,
        config,
        logger,
        llmContext,
      }) || buildMarkdownSummaryFn({ normalized, summary });
    } else {
      markdownSummary = buildMarkdownSummaryFn({ normalized, summary });
    }
  }

  return { rowTsv, markdownSummary };
}
