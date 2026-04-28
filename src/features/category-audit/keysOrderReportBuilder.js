import fs from 'node:fs/promises';
import path from 'node:path';

import { extractReportData } from './reportData.js';
import { escapeHtml, renderHtmlFromStructure } from './reportHtml.js';
import { renderMarkdownFromStructure } from './reportMarkdown.js';
import { archiveExistingReportTree, ensureAuditorResponsesDir } from './reportArchive.js';
import {
  KEY_ORDER_PATCH_SCHEMA_VERSION,
  expectedKeyOrderPatchFileName,
} from './keyOrderPatch.js';

const GROUP_SEPARATOR_PREFIX = '__grp::';

function resolveKeysOrderCategoryPath(outputRoot, category) {
  const root = path.resolve(outputRoot);
  const basePath = path.resolve(root, category, 'keys-order');
  if (basePath.startsWith(`${root}${path.sep}`)) {
    return basePath;
  }
  throw new Error(`generateKeysOrderAuditReport: unsafe keys-order output path for ${category}`);
}

function groupDisplayName(groupKey) {
  return String(groupKey || 'ungrouped')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function safeText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function joinList(values, fallback = '-') {
  const list = Array.isArray(values) ? values.filter(Boolean) : [];
  return list.length > 0 ? list.join(', ') : fallback;
}

function fieldContractLabel(record) {
  const parts = [
    record?.contract?.type || 'string',
    record?.contract?.shape || 'scalar',
    record?.contract?.unit ? `unit: ${record.contract.unit}` : '',
  ].filter(Boolean);
  return parts.join(' / ');
}

function buildRecordMap(reportData) {
  return new Map((reportData.keys || []).map((record) => [record.fieldKey, record]));
}

function groupKeyForField(fieldKey, recordMap, fieldGroups) {
  const record = recordMap.get(fieldKey);
  if (record?.group) return record.group;
  const groupIndex = fieldGroups?.group_index || fieldGroups?.groupIndex || {};
  const match = Object.entries(groupIndex).find(([, keys]) => (
    Array.isArray(keys) && keys.includes(fieldKey)
  ));
  return match?.[0] || 'ungrouped';
}

function buildOrderedGroups({ reportData, fieldGroups, fieldKeyOrder }) {
  const recordMap = buildRecordMap(reportData);
  const seen = new Set();
  const groups = [];
  let currentGroup = null;

  const ensureGroup = ({ groupKey, displayName }) => {
    const key = groupKey || 'ungrouped';
    const existing = groups.find((group) => group.groupKey === key);
    if (existing) return existing;
    const group = {
      groupKey: key,
      displayName: displayName || groupDisplayName(key),
      fieldKeys: [],
    };
    groups.push(group);
    return group;
  };

  if (Array.isArray(fieldKeyOrder) && fieldKeyOrder.length > 0) {
    for (const entry of fieldKeyOrder) {
      if (typeof entry !== 'string') continue;
      if (entry.startsWith(GROUP_SEPARATOR_PREFIX)) {
        const displayName = entry.slice(GROUP_SEPARATOR_PREFIX.length).trim() || 'Ungrouped';
        currentGroup = ensureGroup({
          groupKey: displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'ungrouped',
          displayName,
        });
        continue;
      }
      if (seen.has(entry)) continue;
      const groupKey = groupKeyForField(entry, recordMap, fieldGroups);
      const target = currentGroup?.fieldKeys.length === 0 ? currentGroup : ensureGroup({ groupKey });
      if (target && target.groupKey !== groupKey && target.fieldKeys.length === 0) {
        target.groupKey = groupKey;
      }
      target.fieldKeys.push(entry);
      seen.add(entry);
    }
  }

  for (const group of reportData.groups || []) {
    const target = ensureGroup({
      groupKey: group.groupKey,
      displayName: group.displayName,
    });
    for (const fieldKey of group.fieldKeys || []) {
      if (seen.has(fieldKey)) continue;
      target.fieldKeys.push(fieldKey);
      seen.add(fieldKey);
    }
  }

  for (const record of reportData.keys || []) {
    if (seen.has(record.fieldKey)) continue;
    const target = ensureGroup({ groupKey: record.group || 'ungrouped' });
    target.fieldKeys.push(record.fieldKey);
    seen.add(record.fieldKey);
  }

  return groups.filter((group) => group.fieldKeys.length > 0);
}

function buildGroupTableRows({ orderedGroups, recordMap }) {
  return orderedGroups.map((group) => [
    group.groupKey,
    group.displayName,
    String(group.fieldKeys.length),
    group.fieldKeys.map((key) => `\`${key}\``).join(', '),
    group.fieldKeys
      .map((key) => recordMap.get(key)?.displayName || key)
      .join(', '),
  ]);
}

function buildKeyTableRows({ orderedGroups, recordMap }) {
  const rows = [];
  for (const group of orderedGroups) {
    for (const fieldKey of group.fieldKeys) {
      const record = recordMap.get(fieldKey);
      rows.push([
        fieldKey,
        record?.displayName || fieldKey,
        group.groupKey,
        fieldContractLabel(record),
        record?.priority?.required_level || 'unknown',
        record?.priority?.difficulty || 'unknown',
        record?.component ? `${record.component.relation}:${record.component.type}` : '-',
        joinList(record?.aliases),
        joinList(record?.search_hints?.query_terms),
        safeText(record?.ai_assist?.reasoning_note, '-').slice(0, 240),
      ]);
    }
  }
  return rows;
}

function buildCurrentOrderJson(orderedGroups) {
  return JSON.stringify({
    order: orderedGroups.flatMap((group) => [
      `${GROUP_SEPARATOR_PREFIX}${group.displayName}`,
      ...group.fieldKeys,
    ]),
  }, null, 2);
}

function buildPromptText({ category, generatedAt, orderedGroups, reportData }) {
  const currentKeys = orderedGroups.flatMap((group) => group.fieldKeys);
  const expectedFileName = expectedKeyOrderPatchFileName({ category });
  const groupSummary = orderedGroups
    .map((group) => `- ${group.groupKey} (${group.displayName}): ${group.fieldKeys.join(', ')}`)
    .join('\n');
  const keySummary = (reportData.keys || [])
    .map((record) => `- ${record.fieldKey}: ${record.displayName}; ${fieldContractLabel(record)}; priority ${record.priority.required_level}; difficulty ${record.priority.difficulty}; group ${record.group}`)
    .join('\n');

  return [
    `# Keys Order Auditor Prompt - ${category}`,
    '',
    `Generated: ${generatedAt}`,
    '',
    'You are auditing category key coverage and navigation order. Review the current keys with the same depth as the current mouse category: compare against real products, vendor spec pages, review databases, component terminology, software/firmware concepts, and cross-category expectations before proposing any new key.',
    '',
    'Your job:',
    '',
    '- Reorder current keys into the clearest group/key navigation structure.',
    '- Add missing keys only when they are category-relevant, repeatedly observable, and extractable from evidence.',
    '- Propose key renames only when the current key name is materially unclear.',
    '- Never delete existing keys. Every current key must appear exactly once in `groups[].keys`.',
    '- Do not return prose outside the strict JSON file.',
    '',
    `Return exactly one JSON file named \`${expectedFileName}\` using schema \`${KEY_ORDER_PATCH_SCHEMA_VERSION}\`.`,
    '',
    'Current groups:',
    '',
    groupSummary,
    '',
    'Current compiled keys:',
    '',
    keySummary,
    '',
    'Strict JSON shape:',
    '',
    '```json',
    JSON.stringify({
      schema_version: KEY_ORDER_PATCH_SCHEMA_VERSION,
      category,
      verdict: 'reorganize',
      groups: [
        {
          group_key: 'sensor_performance',
          display_name: 'Sensor Performance',
          rationale: 'Why these keys belong together and why this order helps review.',
          keys: ['existing_key', 'new_key_declared_below'],
        },
      ],
      add_keys: [
        {
          field_key: 'new_key_declared_below',
          display_name: 'New Key Display Name',
          group_key: 'sensor_performance',
          rationale: 'Evidence-backed reason this key is missing and useful.',
          contract: { type: 'string', shape: 'scalar', unit: '' },
          priority: { required_level: 'non_mandatory', availability: 'conditional', difficulty: 'medium' },
          ui: { label: 'New Key Display Name', group: 'Sensor Performance' },
          aliases: [],
          search_hints: { query_terms: [], domain_hints: [], content_types: [] },
          notes: 'Implementation notes for the human if this key needs a richer field rule later.',
        },
      ],
      rename_keys: [
        {
          from: 'unclear_existing_key',
          to: 'clearer_existing_key_name',
          rationale: 'Rename proposal only; do not delete the old key.',
        },
      ],
      audit: {
        categories_compared: [category],
        products_checked: [],
        sources_checked: [],
        missing_key_rationale: 'Summarize how you decided what is missing.',
        organization_rationale: 'Summarize why the final group order is better.',
        open_questions: [],
      },
    }, null, 2),
    '```',
    '',
    'Validation rules:',
    '',
    '- `schema_version` must be exactly `key-order-patch.v1`.',
    '- `category` must match the audited category.',
    '- Every existing key listed above must appear exactly once in `groups[].keys`.',
    '- Any key in `groups[].keys` that is not current must also appear in `add_keys`.',
    '- `rename_keys` is a proposal list only. It does not delete or replace current keys.',
    '- Use stable snake_case for `group_key` and `field_key`.',
    '',
  ].join('\n');
}

function buildStructure({ category, generatedAt, orderedGroups, reportData, promptText }) {
  const recordMap = buildRecordMap(reportData);
  return {
    meta: { category, generatedAt },
    sections: [
      {
        id: 'header',
        level: 1,
        title: `Keys Order Audit - \`${category}\``,
        blocks: [
          {
            kind: 'paragraph',
            text: 'Use this pack to audit `field_key_order.json`: reorganize current keys, identify missing keys, and return one strict JSON patch that can be imported without deleting existing keys.',
          },
          {
            kind: 'note',
            tone: 'warn',
            text: 'Never delete existing keys. Rename requests are review proposals only until a separate field-rule migration exists.',
          },
        ],
      },
      {
        id: 'current-order',
        level: 2,
        title: 'Current `field_key_order.json` Groups',
        blocks: [
          {
            kind: 'paragraph',
            text: `Generated ${generatedAt}. Current groups are derived from \`field_key_order.json\` first, then compiled group metadata for any missing fields.`,
          },
          {
            kind: 'table',
            headers: ['Group key', 'Display name', 'Key count', 'Field keys', 'Display labels'],
            rows: buildGroupTableRows({ orderedGroups, recordMap }),
          },
          {
            kind: 'codeBlock',
            lang: 'json',
            text: buildCurrentOrderJson(orderedGroups),
          },
        ],
      },
      {
        id: 'current-key-depth',
        level: 2,
        title: 'Current Key Depth Matrix',
        blocks: [
          {
            kind: 'paragraph',
            text: 'This is the minimum detail level the auditor should preserve when deciding whether the category is missing keys or whether groups should move.',
          },
          {
            kind: 'table',
            headers: ['Key', 'Label', 'Group', 'Contract', 'Required', 'Difficulty', 'Component', 'Aliases', 'Query terms', 'Guidance'],
            rows: buildKeyTableRows({ orderedGroups, recordMap }),
          },
        ],
      },
      {
        id: 'missing-key-checklist',
        level: 2,
        title: 'Missing-Key Discovery Checklist',
        blocks: [
          {
            kind: 'bulletList',
            items: [
              'Compare multiple current products, not only one flagship product.',
              'Look for repeated spec concepts that are not represented by any current field key.',
              'Check component identity, component properties, firmware/software settings, physical dimensions, connectivity, power, compatibility, variant-specific details, and performance metrics.',
              'Only add a key when the value can be extracted from evidence and has a stable contract.',
              'Keep every existing key exactly once, even if the group or display order changes.',
            ],
          },
        ],
      },
      {
        id: 'return-contract',
        level: 2,
        title: `Strict JSON Return Contract - \`${KEY_ORDER_PATCH_SCHEMA_VERSION}\``,
        blocks: [
          {
            kind: 'paragraph',
            text: `The auditor returns exactly one file: \`${expectedKeyOrderPatchFileName({ category })}\`. That file can be uploaded to preview and apply a new \`field_key_order.json\`.`,
          },
          {
            kind: 'codeBlock',
            lang: 'md',
            text: promptText,
          },
        ],
      },
    ],
  };
}

async function writeStructurePair({ structure, htmlPath, mdPath, documentTitle, subtitleHtml, subtitleLine }) {
  const htmlText = renderHtmlFromStructure(structure, { documentTitle, subtitleHtml });
  const mdText = renderMarkdownFromStructure(structure, { subtitleLine });
  await fs.writeFile(htmlPath, htmlText, 'utf8');
  await fs.writeFile(mdPath, mdText, 'utf8');
}

export async function generateKeysOrderAuditReport({
  category,
  loadedRules,
  fieldGroups,
  fieldKeyOrder = null,
  globalFragments = {},
  tierBundles = {},
  compileSummary = null,
  outputRoot,
  now = new Date(),
}) {
  if (!category || typeof category !== 'string') {
    throw new Error('generateKeysOrderAuditReport: category is required');
  }
  if (!outputRoot || typeof outputRoot !== 'string') {
    throw new Error('generateKeysOrderAuditReport: outputRoot is required');
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
  const orderedGroups = buildOrderedGroups({ reportData, fieldGroups, fieldKeyOrder });
  const promptText = buildPromptText({ category, generatedAt, orderedGroups, reportData });
  const structure = buildStructure({ category, generatedAt, orderedGroups, reportData, promptText });

  const basePath = resolveKeysOrderCategoryPath(outputRoot, category);
  await archiveExistingReportTree({ outputRoot, category, treeName: 'keys-order', now });
  await ensureAuditorResponsesDir({ outputRoot, category });
  await fs.mkdir(basePath, { recursive: true });

  const baseName = `${category}-keys-order`;
  const htmlPath = path.join(basePath, `${baseName}-audit.html`);
  const mdPath = path.join(basePath, `${baseName}-audit.md`);
  const promptPath = path.join(basePath, `${baseName}-prompt.md`);

  await writeStructurePair({
    structure,
    htmlPath,
    mdPath,
    documentTitle: `Keys Order Audit - ${category}`,
    subtitleHtml: `Keys order audit &middot; category: <code>${escapeHtml(category)}</code> &middot; generated ${escapeHtml(generatedAt)}`,
    subtitleLine: `_Keys order audit - category: \`${category}\` - generated ${generatedAt}_`,
  });
  await fs.writeFile(promptPath, `${promptText}\n`, 'utf8');

  return {
    basePath,
    htmlPath,
    mdPath,
    promptPath,
    generatedAt,
    stats: {
      groupCount: orderedGroups.length,
      keyCount: orderedGroups.reduce((sum, group) => sum + group.fieldKeys.length, 0),
      compiledKeyCount: reportData.keys.length,
    },
  };
}
