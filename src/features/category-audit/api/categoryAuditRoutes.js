/**
 * category-audit HTTP surface.
 *
 *   POST /category-audit/:category/generate-report
 *     body: { consumer?: 'key_finder' }
 *     → 200 { htmlPath, mdPath, generatedAt, stats }
 *   POST /category-audit/:category/generate-per-key-docs
 *     body: { templateOverride?: string }
 *     → 200 { basePath, counts, reservedKeysPath, generatedAt }
 *   POST /category-audit/:category/generate-all-reports
 *     body: { consumer?: 'key_finder', templateOverride?: string }
 *     → 200 { categoryReport, perKeyDocs }
 *     → 400 on unknown category / consumer / bad body
 *
 * Synchronous — pure file I/O + rendering, no LLM calls, no network.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { loadFieldRules } from '../../../field-rules/loader.js';
import { resolveGlobalPrompt } from '../../../core/llm/prompts/globalPromptRegistry.js';
import { generateCategoryAuditReport } from '../reportBuilder.js';
import { generatePerKeyDocs } from '../perKeyDocBuilder.js';
import { generatePromptAuditReports } from '../promptAuditReportBuilder.js';

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
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function asSettingsMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
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

export function registerCategoryAuditRoutes(ctx) {
  const { jsonRes, readJsonBody, config } = ctx;
  const outputRoot = path.resolve(config?.localInputRoot || '.workspace', 'reports');
  const helperRoot = path.resolve(config?.categoryAuthorityRoot || 'category_authority');

  return async function handleCategoryAuditRoutes(parts, _params, method, req, res) {
    if (parts[0] !== 'category-audit') return false;

    if (parts[1] && parts[2] === 'generate-report' && method === 'POST') {
      const category = parts[1];
      let body = {};
      try {
        body = (await readJsonBody(req)) || {};
      } catch {
        jsonRes(res, 400, { error: 'invalid_json_body' });
        return true;
      }
      const consumer = body.consumer || 'key_finder';

      let loadedRules;
      try {
        loadedRules = await loadFieldRules(category, { config });
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg.startsWith('missing_field_rules') || msg.includes('category')) {
          return jsonRes(res, 400, { error: 'unknown_category', category, details: msg });
        }
        throw err;
      }

      const fieldGroupsPath = path.join(helperRoot, category, '_generated', 'field_groups.json');
      const fieldGroups = (await readJsonIfExists(fieldGroupsPath)) || { group_index: {} };
      const compileReportPath = path.join(helperRoot, category, '_generated', '_compile_report.json');
      const compileSummary = await readJsonIfExists(compileReportPath);

      const globalFragments = resolveAllFragments();
      const tierBundles = parseTierBundles(config?.keyFinderTierSettingsJson);

      try {
        const result = await generateCategoryAuditReport({
          category,
          consumer,
          loadedRules,
          fieldGroups,
          globalFragments,
          tierBundles,
          compileSummary,
          outputRoot,
        });
        return jsonRes(res, 200, {
          category,
          consumer,
          htmlPath: result.htmlPath,
          mdPath: result.mdPath,
          generatedAt: result.generatedAt,
          stats: result.stats,
        });
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg.includes('unknown consumer')) {
          return jsonRes(res, 400, { error: 'unknown_consumer', consumer });
        }
        throw err;
      }
    }

    if (parts[1] && parts[2] === 'generate-per-key-docs' && method === 'POST') {
      const category = parts[1];
      let body = {};
      try {
        body = (await readJsonBody(req)) || {};
      } catch {
        jsonRes(res, 400, { error: 'invalid_json_body' });
        return true;
      }

      let loadedRules;
      try {
        loadedRules = await loadFieldRules(category, { config });
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg.startsWith('missing_field_rules') || msg.includes('category')) {
          return jsonRes(res, 400, { error: 'unknown_category', category, details: msg });
        }
        throw err;
      }

      const fieldGroupsPath = path.join(helperRoot, category, '_generated', 'field_groups.json');
      const fieldGroups = (await readJsonIfExists(fieldGroupsPath)) || { group_index: {} };
      const compileReportPath = path.join(helperRoot, category, '_generated', '_compile_report.json');
      const compileSummary = await readJsonIfExists(compileReportPath);
      const fieldKeyOrderPath = path.join(helperRoot, category, '_control_plane', 'field_key_order.json');
      const fieldKeyOrderDoc = await readJsonIfExists(fieldKeyOrderPath);
      const fieldKeyOrder = Array.isArray(fieldKeyOrderDoc?.order) ? fieldKeyOrderDoc.order : null;

      const globalFragments = resolveAllFragments();
      const tierBundles = parseTierBundles(config?.keyFinderTierSettingsJson);

      const result = await generatePerKeyDocs({
        category,
        loadedRules,
        fieldGroups,
        globalFragments,
        tierBundles,
        compileSummary,
        outputRoot,
        templateOverride: body?.templateOverride || '',
        fieldKeyOrder,
      });
      return jsonRes(res, 200, {
        category,
        basePath: result.basePath,
        counts: result.counts,
        reservedKeysPath: result.reservedKeysPath,
        generatedAt: result.generatedAt,
        sorted: result.sorted
          ? { basePath: result.sorted.basePath, count: result.sorted.count }
          : null,
      });
    }

    if (parts[1] && parts[2] === 'generate-prompt-audit' && method === 'POST') {
      const category = parts[1];
      try {
        await readJsonBody(req);
      } catch {
        jsonRes(res, 400, { error: 'invalid_json_body' });
        return true;
      }

      try {
        await loadFieldRules(category, { config });
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg.startsWith('missing_field_rules') || msg.includes('category')) {
          return jsonRes(res, 400, { error: 'unknown_category', category, details: msg });
        }
        throw err;
      }

      const globalFragments = resolveAllFragments();
      const moduleSettings = await readModuleSettings(helperRoot, category);
      const result = await generatePromptAuditReports({
        category,
        moduleSettings,
        globalFragments,
        outputRoot,
      });
      return jsonRes(res, 200, {
        category,
        ...promptAuditResponse(result),
      });
    }

    if (parts[1] && parts[2] === 'generate-all-reports' && method === 'POST') {
      const category = parts[1];
      let body = {};
      try {
        body = (await readJsonBody(req)) || {};
      } catch {
        jsonRes(res, 400, { error: 'invalid_json_body' });
        return true;
      }
      const consumer = body.consumer || 'key_finder';

      let loadedRules;
      try {
        loadedRules = await loadFieldRules(category, { config });
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg.startsWith('missing_field_rules') || msg.includes('category')) {
          return jsonRes(res, 400, { error: 'unknown_category', category, details: msg });
        }
        throw err;
      }

      const fieldGroupsPath = path.join(helperRoot, category, '_generated', 'field_groups.json');
      const fieldGroups = (await readJsonIfExists(fieldGroupsPath)) || { group_index: {} };
      const compileReportPath = path.join(helperRoot, category, '_generated', '_compile_report.json');
      const compileSummary = await readJsonIfExists(compileReportPath);
      const fieldKeyOrderPath = path.join(helperRoot, category, '_control_plane', 'field_key_order.json');
      const fieldKeyOrderDoc = await readJsonIfExists(fieldKeyOrderPath);
      const fieldKeyOrder = Array.isArray(fieldKeyOrderDoc?.order) ? fieldKeyOrderDoc.order : null;
      const globalFragments = resolveAllFragments();
      const tierBundles = parseTierBundles(config?.keyFinderTierSettingsJson);
      const moduleSettings = await readModuleSettings(helperRoot, category);

      try {
        const categoryReport = await generateCategoryAuditReport({
          category,
          consumer,
          loadedRules,
          fieldGroups,
          globalFragments,
          tierBundles,
          compileSummary,
          outputRoot,
        });
        const perKeyDocs = await generatePerKeyDocs({
          category,
          loadedRules,
          fieldGroups,
          globalFragments,
          tierBundles,
          compileSummary,
          outputRoot,
          templateOverride: body?.templateOverride || '',
          fieldKeyOrder,
        });
        const promptAudit = await generatePromptAuditReports({
          category,
          moduleSettings,
          globalFragments,
          outputRoot,
        });
        return jsonRes(res, 200, {
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
        });
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg.includes('unknown consumer')) {
          return jsonRes(res, 400, { error: 'unknown_consumer', consumer });
        }
        throw err;
      }
    }

    return false;
  };
}
