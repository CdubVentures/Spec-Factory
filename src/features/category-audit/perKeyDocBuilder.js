/**
 * Per-key doc generator. Emits a folder tree of paired HTML + Markdown briefs,
 * one pair per non-reserved field in a category, organized by field group.
 *
 *   <outputRoot>/per-key/<category>/<group>/<field_key>.{html,md}
 *   <outputRoot>/per-key/<category>/_reserved-keys.md
 *
 * Each per-key doc shows:
 *   - Purpose
 *   - Category key map (all fields, groups, component relations, variance)
 *   - Contract schema (every possible parameter + current value)
 *   - Current enum + pattern
 *   - Component relation + inventory context
 *   - Cross-field constraints (current key + category map)
 *   - Sibling fields in the same group
 *   - Full compiled keyFinder preview prompt (with placeholder product identity)
 *   - Per-slot breakdown
 *
 * Synchronous file I/O, no LLM, no network. Reserved keys (colors, editions,
 * release_date, sku, and any other non-keyFinder module fieldKeys) are skipped
 * and collected into a single _reserved-keys.md summary at the category root.
 *
 * Single export:
 *   - generatePerKeyDocs(opts) → { basePath, written, skipped, reservedKeysPath, generatedAt }
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { extractReportData } from './reportData.js';
import { composePerKeyPromptPreview, detectReservedKey } from './perKeyPromptPreview.js';
import { buildPerKeyDocStructure } from './perKeyDocStructure.js';
import { FIELD_RULE_SCHEMA } from './contractSchemaCatalog.js';
import { renderHtmlFromStructure } from './reportHtml.js';
import { renderMarkdownFromStructure } from './reportMarkdown.js';
import { escapeHtml } from './reportHtml.js';

function groupRecordsByGroup(records) {
  const out = new Map();
  for (const rec of records) {
    const key = rec.group || 'ungrouped';
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(rec);
  }
  return out;
}

function buildReservedKeysSummary(reservedEntries, category, generatedAt) {
  if (reservedEntries.length === 0) {
    return `# Reserved keys \u2014 \`${category}\`\n\n_Generated ${generatedAt}_\n\nNo reserved keys in this category's compiled rules.\n`;
  }
  const rows = reservedEntries.map((r) => `| \`${r.fieldKey}\` | ${r.ownerLabel} | \`${r.owner}\` |`);
  return [
    `# Reserved keys \u2014 \`${category}\``,
    '',
    `_Generated ${generatedAt}_`,
    '',
    'These fields are NOT handled by keyFinder. They are owned by dedicated finder modules (CEF for colors/editions, RDF for release_date, SKF for sku) or compile-time defaults.',
    '',
    'Per-key docs are skipped for these because keyFinder never builds a prompt for them \u2014 there is nothing to show. To configure discovery for these fields, open the owning module\u2019s settings.',
    '',
    '| Field key | Owner | Module id |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

function resolvePerKeyCategoryPath(outputRoot, category) {
  const perKeyRoot = path.resolve(outputRoot, 'per-key');
  const basePath = path.resolve(perKeyRoot, category);
  const isInsidePerKeyRoot = basePath.startsWith(`${perKeyRoot}${path.sep}`);
  if (!isInsidePerKeyRoot) {
    throw new Error(`generatePerKeyDocs: unsafe category output path for ${category}`);
  }
  return basePath;
}

/**
 * @param {object} opts
 * @param {string} opts.category
 * @param {object} opts.loadedRules          — from loadFieldRules()
 * @param {object} opts.fieldGroups          — { group_index } from field_groups.json
 * @param {object} opts.globalFragments      — resolved global prompt strings
 * @param {object} opts.tierBundles          — parsed keyFinderTierSettingsJson
 * @param {object} [opts.compileSummary]
 * @param {string} opts.outputRoot           — absolute; the root of .workspace/reports (per-key is appended)
 * @param {Date}   [opts.now]
 * @param {string} [opts.templateOverride]   — optional per-category discoveryPromptTemplate
 */
export async function generatePerKeyDocs({
  category,
  loadedRules,
  fieldGroups,
  globalFragments,
  tierBundles,
  compileSummary = null,
  outputRoot,
  now = new Date(),
  templateOverride = '',
}) {
  if (!category || typeof category !== 'string') {
    throw new Error('generatePerKeyDocs: category is required');
  }
  if (!outputRoot || typeof outputRoot !== 'string') {
    throw new Error('generatePerKeyDocs: outputRoot is required');
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

  const generatedAt = reportData.generatedAt;
  const basePath = resolvePerKeyCategoryPath(outputRoot, category);
  await fs.rm(basePath, { recursive: true, force: true });
  await fs.mkdir(basePath, { recursive: true });

  const byGroup = groupRecordsByGroup(reportData.keys);
  const written = [];
  const skipped = [];

  for (const record of reportData.keys) {
    const reserved = detectReservedKey(record.fieldKey);
    if (reserved) {
      skipped.push({ fieldKey: record.fieldKey, owner: reserved.owner, ownerLabel: reserved.ownerLabel });
      continue;
    }

    const preview = composePerKeyPromptPreview(record.rawRule, record.fieldKey, {
      category,
      tierBundles,
      templateOverride,
      componentRelation: record.component || null,
      knownValues: loadedRules?.knownValues || null,
    });

    const structure = buildPerKeyDocStructure(record, {
      category,
      generatedAt,
      schemaCatalog: FIELD_RULE_SCHEMA,
      siblingsInGroup: byGroup.get(record.group) || [],
      allKeyRecords: reportData.keys || [],
      groups: reportData.groups || [],
      componentInventory: reportData.components || [],
      preview,
    });

    const documentTitle = `Per-Key Doc \u2014 ${category}/${record.fieldKey}`;
    const subtitleHtml = `Per-key brief \u00B7 category: <code>${escapeHtml(category)}</code> \u00B7 group: <code>${escapeHtml(record.group)}</code> \u00B7 generated ${escapeHtml(generatedAt)}`;
    const subtitleLine = `_Per-key brief \u00B7 category: \`${category}\` \u00B7 group: \`${record.group}\` \u00B7 generated ${generatedAt}_`;

    const htmlText = renderHtmlFromStructure(structure, { documentTitle, subtitleHtml });
    const mdText = renderMarkdownFromStructure(structure, { subtitleLine });

    const groupDir = path.join(basePath, record.group || 'ungrouped');
    await fs.mkdir(groupDir, { recursive: true });
    const htmlPath = path.join(groupDir, `${record.fieldKey}.html`);
    const mdPath = path.join(groupDir, `${record.fieldKey}.md`);
    await fs.writeFile(htmlPath, htmlText, 'utf8');
    await fs.writeFile(mdPath, mdText, 'utf8');
    written.push({ fieldKey: record.fieldKey, group: record.group, htmlPath, mdPath });
  }

  // Reserved-keys summary. Always emitted (even when empty) so the folder has
  // a single well-known index of non-keyFinder keys.
  const reservedKeysPath = path.join(basePath, '_reserved-keys.md');
  const reservedText = buildReservedKeysSummary(skipped, category, generatedAt);
  await fs.writeFile(reservedKeysPath, reservedText, 'utf8');

  return {
    basePath,
    written,
    skipped,
    reservedKeysPath,
    generatedAt,
    counts: { written: written.length, skipped: skipped.length },
  };
}
