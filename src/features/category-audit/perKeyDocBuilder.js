/**
 * Per-key doc generator. Emits one flat, sorted Markdown brief per field key.
 *
 *   <outputRoot>/<category>/per-key/<NN>-<field_key>--<group>.md
 *   <outputRoot>/<category>/per-key/<NN>-<field_key>--<group>.reserved.md
 *   <outputRoot>/<category>/per-key/_reserved-keys.md
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
 * release_date, sku, and any other non-keyFinder module fieldKeys) become
 * same-folder reserved stubs and are collected into _reserved-keys.md.
 *
 * Single export:
 *   - generatePerKeyDocs(opts) -> { basePath, written, skipped, reservedKeysPath, generatedAt }
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { extractReportData } from './reportData.js';
import { composePerKeyPromptPreview, detectReservedKey } from './perKeyPromptPreview.js';
import { buildPerKeyDocStructure } from './perKeyDocStructure.js';
import { FIELD_RULE_SCHEMA } from './contractSchemaCatalog.js';
import { renderMarkdownFromStructure } from './reportMarkdown.js';
import { archiveExistingReportTree, ensureAuditorResponsesDir } from './reportArchive.js';

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
    return `# Reserved keys - \`${category}\`\n\n_Generated ${generatedAt}_\n\nNo reserved keys in this category's per-key order.\n`;
  }
  const rows = reservedEntries.map((r) => `| \`${r.fieldKey}\` | \`${r.group || 'ungrouped'}\` | ${r.ownerLabel} | \`${r.owner}\` |`);
  return [
    `# Reserved keys - \`${category}\``,
    '',
    `_Generated ${generatedAt}_`,
    '',
    'These fields are NOT handled by keyFinder. They are owned by dedicated finder modules (CEF for colors/editions, RDF for release_date, SKF for sku) or compile-time defaults.',
    '',
    'Per-key docs are reserved stubs for these because keyFinder never builds a prompt for them. To configure discovery for these fields, open the owning module settings.',
    '',
    '| Field key | Group | Owner | Module id |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

function safeFileSegment(value) {
  const normalized = String(value || 'ungrouped')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'ungrouped';
}

function buildReservedStub({ category, fieldKey, group, fileTitle, ordinal, total, info }) {
  return [
    `# ${fileTitle} - reserved`,
    '',
    `Position ${ordinal} of ${total} in the \`${category}\` Key Navigator order.`,
    '',
    `Field key: \`${fieldKey}\` | Group: \`${group}\``,
    '',
    `This field is owned by **${info.ownerLabel || 'OTHER'}** (\`${info.owner || 'other_finder'}\`). keyFinder does not build a prompt for it; see [\`_reserved-keys.md\`](_reserved-keys.md).`,
    '',
  ].join('\n');
}

function resolveGroupForField(fieldKey, record, fieldGroups) {
  if (record?.group) return record.group;
  const groupIndex = fieldGroups?.group_index || {};
  const match = Object.entries(groupIndex).find(([, fieldKeys]) => (
    Array.isArray(fieldKeys) && fieldKeys.includes(fieldKey)
  ));
  return match?.[0] || 'ungrouped';
}

function buildOrderedFields(fieldKeyOrder, reportData) {
  const seen = new Set();
  const add = (fieldKey) => {
    if (typeof fieldKey !== 'string') return false;
    if (fieldKey.startsWith('__grp::')) return false;
    if (seen.has(fieldKey)) return false;
    seen.add(fieldKey);
    return true;
  };

  const ordered = [];
  if (Array.isArray(fieldKeyOrder)) {
    for (const fieldKey of fieldKeyOrder) {
      if (add(fieldKey)) ordered.push(fieldKey);
    }
  }

  for (const record of reportData.keys || []) {
    if (add(record.fieldKey)) ordered.push(record.fieldKey);
  }

  return ordered;
}

function buildNavigatorOrdinalMap(fieldKeyOrder) {
  if (!Array.isArray(fieldKeyOrder)) return new Map();
  const fields = fieldKeyOrder.filter(
    (entry) => typeof entry === 'string' && !entry.startsWith('__grp::'),
  );
  const width = Math.max(2, String(fields.length).length);
  return new Map(fields.map((fieldKey, index) => [
    fieldKey,
    String(index + 1).padStart(width, '0'),
  ]));
}

function resolvePerKeyCategoryPath(outputRoot, category) {
  const root = path.resolve(outputRoot);
  const basePath = path.resolve(root, category, 'per-key');
  const isInsideRoot = basePath.startsWith(`${root}${path.sep}`);
  if (!isInsideRoot) {
    throw new Error(`generatePerKeyDocs: unsafe category output path for ${category}`);
  }
  return basePath;
}

function withFlatTitle(structure, fileTitle, displayName) {
  return {
    ...structure,
    sections: structure.sections.map((section, index) => (
      index === 0
        ? { ...section, title: `\`${fileTitle}\` - ${displayName}` }
        : section
    )),
  };
}

/**
 * @param {object} opts
 * @param {string} opts.category
 * @param {object} opts.loadedRules          - from loadFieldRules()
 * @param {object} opts.fieldGroups          - { group_index } from field_groups.json
 * @param {object} opts.globalFragments      - resolved global prompt strings
 * @param {object} opts.tierBundles          - parsed keyFinderTierSettingsJson
 * @param {object} [opts.compileSummary]
 * @param {string} opts.outputRoot           - absolute; the root of .workspace/reports
 * @param {Date}   [opts.now]
 * @param {string} [opts.templateOverride]   - optional per-category discoveryPromptTemplate
 * @param {string[]} [opts.fieldKeyOrder]    - Key Navigator order (mixed __grp:: separators + field keys). Direct per-key Markdown files use this order and reserve marker stubs are emitted for keys owned by other finder modules.
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
  fieldKeyOrder = null,
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
  await archiveExistingReportTree({ outputRoot, category, treeName: 'per-key', now });
  await ensureAuditorResponsesDir({ outputRoot, category });
  await fs.mkdir(basePath, { recursive: true });

  const byGroup = groupRecordsByGroup(reportData.keys);
  const navigatorOrdinals = buildNavigatorOrdinalMap(fieldKeyOrder);
  const orderedFields = buildOrderedFields(fieldKeyOrder, reportData);
  const total = orderedFields.length;
  const width = Math.max(2, String(total).length);
  const recordByFieldKey = new Map((reportData.keys || []).map((record) => [record.fieldKey, record]));
  const written = [];
  const skipped = [];
  const entries = [];

  for (let index = 0; index < orderedFields.length; index += 1) {
    const fieldKey = orderedFields[index];
    const record = recordByFieldKey.get(fieldKey);
    const reserved = detectReservedKey(fieldKey);
    if (!record && !reserved) continue;

    const ordinalNum = index + 1;
    const ordinal = String(ordinalNum).padStart(width, '0');
    const group = resolveGroupForField(fieldKey, record, fieldGroups);
    const fileTitle = `${ordinal}-${fieldKey}--${safeFileSegment(group)}`;

    if (reserved) {
      const skippedEntry = {
        fieldKey,
        group,
        owner: reserved.owner,
        ownerLabel: reserved.ownerLabel,
      };
      skipped.push(skippedEntry);
      const mdPath = path.join(basePath, `${fileTitle}.reserved.md`);
      const stubText = buildReservedStub({
        category,
        fieldKey,
        group,
        fileTitle,
        ordinal: ordinalNum,
        total,
        info: skippedEntry,
      });
      await fs.writeFile(mdPath, stubText, 'utf8');
      entries.push({ fieldKey, group, ordinal, sortedPath: mdPath, reserved: true });
      continue;
    }

    const preview = composePerKeyPromptPreview(record.rawRule, fieldKey, {
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
      navigatorOrdinal: navigatorOrdinals.get(fieldKey) || ordinal,
    });

    const subtitleLine = `_Per-key brief | category: \`${category}\` | group: \`${group}\` | generated ${generatedAt}_`;
    const mdText = renderMarkdownFromStructure(
      withFlatTitle(structure, fileTitle, record.displayName),
      { subtitleLine },
    );

    const mdPath = path.join(basePath, `${fileTitle}.md`);
    await fs.writeFile(mdPath, mdText, 'utf8');
    written.push({ fieldKey, group, htmlPath: null, mdPath });
    entries.push({ fieldKey, group, ordinal, sortedPath: mdPath, reserved: false });
  }

  const reservedKeysPath = path.join(basePath, '_reserved-keys.md');
  const reservedText = buildReservedKeysSummary(skipped, category, generatedAt);
  await fs.writeFile(reservedKeysPath, reservedText, 'utf8');

  const sorted = { basePath, count: entries.length, entries };

  return {
    basePath,
    written,
    skipped,
    reservedKeysPath,
    generatedAt,
    counts: { written: written.length, skipped: skipped.length },
    sorted,
  };
}
