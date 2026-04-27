/**
 * Compact HTML + Markdown renderers for category-level signoff summaries.
 */

import { renderHtmlFromStructure, escapeHtml } from './reportHtml.js';
import { renderMarkdownFromStructure } from './reportMarkdown.js';
import { buildSummaryReportStructure } from './reportSummaryStructure.js';

export function renderSummaryHtml(reportData) {
  const structure = buildSummaryReportStructure(reportData);
  return renderHtmlFromStructure(structure, {
    documentTitle: `Key Finder Audit - ${structure.meta.category}`,
    subtitleHtml: `Key Finder Summary - Consumer: <code>key_finder</code> - Generated ${escapeHtml(structure.meta.generatedAt)}`,
  });
}

export function renderSummaryMarkdown(reportData) {
  const structure = buildSummaryReportStructure(reportData);
  return renderMarkdownFromStructure(structure, {
    subtitleLine: `_Key Finder Summary - Consumer: \`key_finder\` - Generated ${structure.meta.generatedAt}_`,
  });
}
