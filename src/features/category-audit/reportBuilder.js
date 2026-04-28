/**
 * Orchestrator: load rules → extract report data → render HTML + Markdown →
 * write both artifacts to disk. Pure I/O layer; extraction + rendering are
 * injected as dependencies so tests can drive the full pipeline without
 * touching the filesystem.
 *
 * Single export:
 *   - generateCategoryAuditReport(opts) → { htmlPath, mdPath, generatedAt, stats }
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { extractReportData } from './reportData.js';
import { renderSummaryHtml, renderSummaryMarkdown } from './reportSummary.js';
import { ensureAuditorResponsesDir } from './reportArchive.js';

const SUPPORTED_CONSUMERS = new Set(['key_finder']);

function resolveCategoryOutputRoot(outputRoot, category) {
  const root = path.resolve(outputRoot);
  const summaryRoot = path.resolve(root, category, 'summary');
  if (summaryRoot !== root && summaryRoot.startsWith(`${root}${path.sep}`)) {
    return summaryRoot;
  }
  throw new Error(`generateCategoryAuditReport: unsafe category output path for ${category}`);
}

/**
 * @param {object} opts
 * @param {string} opts.category
 * @param {string} [opts.consumer='key_finder']
 * @param {object} opts.loadedRules                  // from loadFieldRules()
 * @param {object} opts.fieldGroups                  // { group_index } from field_groups.json
 * @param {object} opts.globalFragments              // resolved global prompt strings
 * @param {object} opts.tierBundles                  // parsed keyFinderTierSettingsJson
 * @param {object} [opts.compileSummary]             // _compile_report.json subset
 * @param {string} opts.outputRoot                   // .workspace/reports (absolute)
 * @param {Date}   [opts.now]                        // injectable clock
 * @returns {Promise<{htmlPath, mdPath, generatedAt, stats}>}
 */
export async function generateCategoryAuditReport({
  category,
  consumer = 'key_finder',
  loadedRules,
  fieldGroups,
  globalFragments,
  tierBundles,
  compileSummary = null,
  outputRoot,
  now = new Date(),
}) {
  if (!category || typeof category !== 'string') {
    throw new Error('generateCategoryAuditReport: category is required');
  }
  if (!SUPPORTED_CONSUMERS.has(consumer)) {
    throw new Error(`generateCategoryAuditReport: unknown consumer "${consumer}" (supported: ${[...SUPPORTED_CONSUMERS].join(', ')})`);
  }
  if (!outputRoot || typeof outputRoot !== 'string') {
    throw new Error('generateCategoryAuditReport: outputRoot is required');
  }

  const reportData = extractReportData({
    category,
    loadedRules,
    fieldGroups,
    globalFragments,
    tierBundles,
    compileSummary,
    now,
  });

  const htmlText = renderSummaryHtml(reportData);
  const mdText = renderSummaryMarkdown(reportData);

  const categoryOutputRoot = resolveCategoryOutputRoot(outputRoot, category);
  await fs.mkdir(categoryOutputRoot, { recursive: true });
  await ensureAuditorResponsesDir({ outputRoot, category });
  const baseName = `${category}-${consumer.replace(/_/g, '-')}-summary`;
  const htmlPath = path.join(categoryOutputRoot, `${baseName}.html`);
  const mdPath = path.join(categoryOutputRoot, `${baseName}.md`);
  await fs.writeFile(htmlPath, htmlText, 'utf8');
  await fs.writeFile(mdPath, mdText, 'utf8');

  return {
    htmlPath,
    mdPath,
    generatedAt: reportData.generatedAt,
    stats: reportData.stats,
  };
}
