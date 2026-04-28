import fs from 'node:fs/promises';
import path from 'node:path';

import { loadFieldRules } from '../../field-rules/loader.js';
import { resolveGlobalPrompt } from '../../core/llm/prompts/globalPromptRegistry.js';
import { generateCategoryAuditReport } from './reportBuilder.js';
import { generatePerKeyDocs } from './perKeyDocBuilder.js';
import { generatePromptAuditReports } from './promptAuditReportBuilder.js';
import { generateKeysOrderAuditReport } from './keysOrderReportBuilder.js';

const RESOLVED_GLOBAL_FRAGMENT_KEYS = [
  'identityIntro',
  'identityWarningEasy',
  'identityWarningMedium',
  'identityWarningHard',
  'siblingsExclusion',
  'evidenceContract',
  'evidenceVerification',
  'evidenceKindGuidance',
  'valueConfidenceRubric',
  'scalarSourceTierStrategy',
  'scalarSourceGuidanceCloser',
  'unkPolicy',
  'discoveryHistoryBlock',
  'discoveryLogShape',
];

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function mergeJson(base, patch) {
  if (patch === null) return null;
  if (Array.isArray(patch)) return cloneJson(patch);
  if (!isObject(patch)) return patch;
  const out = isObject(base) ? cloneJson(base) : {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = mergeJson(out[key], value);
  }
  return out;
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function resolveAllFragments() {
  const out = {};
  for (const key of RESOLVED_GLOBAL_FRAGMENT_KEYS) {
    try {
      out[key] = resolveGlobalPrompt(key);
    } catch {
      out[key] = '';
    }
  }
  return out;
}

function parseTierBundles(json) {
  if (typeof json !== 'string' || !json.trim()) return {};
  try {
    const parsed = JSON.parse(json);
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function asSettingsMap(value) {
  return isObject(value) ? value : {};
}

async function readModuleSettings(helperRoot, category) {
  const globalRoot = path.join(helperRoot, '_global');
  return {
    colorEditionFinder: asSettingsMap(await readJsonIfExists(path.join(globalRoot, 'color_edition_settings.json'))),
    releaseDateFinder: asSettingsMap(await readJsonIfExists(path.join(globalRoot, 'release_date_settings.json'))),
    skuFinder: asSettingsMap(await readJsonIfExists(path.join(globalRoot, 'sku_settings.json'))),
    keyFinder: asSettingsMap(await readJsonIfExists(path.join(globalRoot, 'key_finder_settings.json'))),
    productImageFinder: asSettingsMap(await readJsonIfExists(path.join(helperRoot, category, 'product_images_settings.json'))),
  };
}

function promptAuditResponse(result) {
  return {
    summary: result.summary,
    perPromptReports: {
      basePath: result.perPromptReports.basePath,
      count: result.perPromptReports.count,
    },
    generatedAt: result.generatedAt,
    stats: result.stats,
  };
}

function keysOrderAuditResponse(result) {
  return {
    basePath: result.basePath,
    htmlPath: result.htmlPath,
    mdPath: result.mdPath,
    promptPath: result.promptPath,
    generatedAt: result.generatedAt,
    stats: result.stats,
  };
}

function overlayFieldOverrides(fields, overrides) {
  if (!isObject(overrides)) return fields;
  const merged = isObject(fields) ? cloneJson(fields) : {};
  for (const [fieldKey, override] of Object.entries(overrides)) {
    merged[fieldKey] = mergeJson(merged[fieldKey], override);
  }
  return merged;
}

function overlayDataLists(knownValues, dataLists) {
  const next = isObject(knownValues) ? cloneJson(knownValues) : {};
  const enumRoot = isObject(next.enums) ? next.enums : next;
  for (const row of Array.isArray(dataLists) ? dataLists : []) {
    const field = String(row?.field || '').trim();
    if (!field || !Array.isArray(row.manual_values)) continue;
    enumRoot[field] = {
      ...(isObject(enumRoot[field]) ? enumRoot[field] : {}),
      values: row.manual_values,
    };
  }
  if (isObject(next.enums)) next.enums = enumRoot;
  return next;
}

function overlayFieldStudioMapForReports(loadedRules, fieldStudioMap) {
  if (!isObject(fieldStudioMap)) return loadedRules;
  const next = cloneJson(loadedRules);
  const fields = isObject(next.rules?.fields) ? next.rules.fields : next.fields;
  const mergedFields = overlayFieldOverrides(fields, fieldStudioMap.field_overrides);
  if (isObject(next.rules)) {
    next.rules.fields = mergedFields;
  } else {
    next.fields = mergedFields;
  }
  next.knownValues = overlayDataLists(next.knownValues, fieldStudioMap.data_lists);
  next.componentSources = Array.isArray(fieldStudioMap.component_sources)
    ? cloneJson(fieldStudioMap.component_sources)
    : next.componentSources;
  next.fieldStudioMap = cloneJson(fieldStudioMap);
  return next;
}

export async function buildCategoryAuditReportInputs({ category, config = {} }) {
  const helperRoot = path.resolve(config?.categoryAuthorityRoot || 'category_authority');
  const loadedRulesRaw = await loadFieldRules(category, { config, reload: true });
  const fieldStudioMapPath = path.join(helperRoot, category, '_control_plane', 'field_studio_map.json');
  const fieldStudioMap = await readJsonIfExists(fieldStudioMapPath);
  const loadedRules = overlayFieldStudioMapForReports(loadedRulesRaw, fieldStudioMap);
  const fieldGroups = (await readJsonIfExists(path.join(helperRoot, category, '_generated', 'field_groups.json'))) || { group_index: {} };
  const compileSummary = await readJsonIfExists(path.join(helperRoot, category, '_generated', '_compile_report.json'));
  const fieldKeyOrderDoc = await readJsonIfExists(path.join(helperRoot, category, '_control_plane', 'field_key_order.json'));
  const fieldKeyOrder = Array.isArray(fieldKeyOrderDoc?.order) ? fieldKeyOrderDoc.order : null;
  const globalFragments = resolveAllFragments();
  const tierBundles = parseTierBundles(config?.keyFinderTierSettingsJson);
  const moduleSettings = await readModuleSettings(helperRoot, category);
  return {
    helperRoot,
    loadedRules,
    fieldGroups,
    compileSummary,
    fieldKeyOrder,
    globalFragments,
    tierBundles,
    moduleSettings,
  };
}

export async function generateCategoryAuditReportPack({
  category,
  consumer = 'key_finder',
  config = {},
  outputRoot = null,
  templateOverride = '',
} = {}) {
  const resolvedOutputRoot = outputRoot || path.resolve(config?.localInputRoot || '.workspace', 'reports');
  const {
    loadedRules,
    fieldGroups,
    compileSummary,
    fieldKeyOrder,
    globalFragments,
    tierBundles,
    moduleSettings,
  } = await buildCategoryAuditReportInputs({ category, config });

  const categoryReport = await generateCategoryAuditReport({
    category,
    consumer,
    loadedRules,
    fieldGroups,
    globalFragments,
    tierBundles,
    compileSummary,
    outputRoot: resolvedOutputRoot,
  });
  const perKeyDocs = await generatePerKeyDocs({
    category,
    loadedRules,
    fieldGroups,
    globalFragments,
    tierBundles,
    compileSummary,
    outputRoot: resolvedOutputRoot,
    templateOverride,
    fieldKeyOrder,
  });
  const promptAudit = await generatePromptAuditReports({
    category,
    moduleSettings,
    globalFragments,
    outputRoot: resolvedOutputRoot,
  });
  const keysOrderAudit = await generateKeysOrderAuditReport({
    category,
    loadedRules,
    fieldGroups,
    fieldKeyOrder,
    globalFragments,
    tierBundles,
    compileSummary,
    outputRoot: resolvedOutputRoot,
  });

  return {
    category,
    consumer,
    generatedAt: categoryReport.generatedAt,
    categoryReport: {
      htmlPath: categoryReport.htmlPath,
      mdPath: categoryReport.mdPath,
      generatedAt: categoryReport.generatedAt,
      stats: categoryReport.stats,
    },
    perKeyDocs: {
      basePath: perKeyDocs.basePath,
      counts: perKeyDocs.counts,
      reservedKeysPath: perKeyDocs.reservedKeysPath,
      generatedAt: perKeyDocs.generatedAt,
      sorted: perKeyDocs.sorted
        ? { basePath: perKeyDocs.sorted.basePath, count: perKeyDocs.sorted.count }
        : null,
    },
    promptAudit: promptAuditResponse(promptAudit),
    keysOrderAudit: keysOrderAuditResponse(keysOrderAudit),
  };
}
