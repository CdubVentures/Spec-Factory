import fs from 'node:fs/promises';
import path from 'node:path';
import { extractRootDomain } from '../utils/common.js';
import { toPosixKey } from '../s3/storage.js';
import { INPUT_KEY_PREFIX } from '../shared/storageKeyPrefixes.js';
import {
  ruleRequiredLevel,
  ruleAvailability,
  ruleDifficulty
} from '../engine/ruleAccessors.js';
import {
  loadSourceRegistry,
  checkCategoryPopulationHardGate,
} from '../features/indexing/pipeline/shared/index.js';
import { isObject, toArray } from '../shared/primitives.js';

const cache = new Map();

function normalizeHost(host) {
  return String(host || '').trim().toLowerCase().replace(/^www\./, '');
}

function hostMatches(host, candidate) {
  return host === candidate || host.endsWith(`.${candidate}`);
}

function titleCaseHostLabel(host) {
  const base = String(host || '').split('.')[0] || 'Unknown';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function flattenApprovedHosts(sources) {
  const byTier = sources?.approved || {};
  const hostMap = new Map();

  function upsertHost(host, patch = {}) {
    const normalized = normalizeHost(host);
    if (!normalized) {
      return;
    }
    const existing = hostMap.get(normalized) || {
      host: normalized,
      tierName: 'candidate'
    };

    const next = {
      ...existing,
      ...patch,
      host: normalized
    };

    const existingTier = tierToNumeric(existing.tierName || 'candidate');
    const nextTier = tierToNumeric(next.tierName || 'candidate');
    if (existing.tierName && patch.tierName && nextTier > existingTier) {
      next.tierName = existing.tierName;
    }

    hostMap.set(normalized, next);
  }

  for (const [tierName, tierHosts] of Object.entries(byTier)) {
    for (const host of tierHosts || []) {
      upsertHost(host, { tierName });
    }
  }

  const sourceRegistry = isObject(sources?.sources) ? sources.sources : {};
  for (const [sourceId, sourceRow] of Object.entries(sourceRegistry)) {
    if (!isObject(sourceRow)) {
      continue;
    }
    const host = resolveRegistryHost(sourceRow);
    if (!host) {
      continue;
    }
    const tierName = tierNameFromSourceToken(sourceRow.tier);
    const crawlConfig = isObject(sourceRow.crawl_config)
      ? sourceRow.crawl_config
      : (isObject(sourceRow.crawlConfig) ? sourceRow.crawlConfig : null);

    upsertHost(host, {
      sourceId,
      displayName: String(sourceRow.display_name || sourceRow.displayName || '').trim(),
      tierName,
      crawlConfig,
      fieldCoverage: isObject(sourceRow.field_coverage) ? sourceRow.field_coverage : null,
      health: isObject(sourceRow.health) ? sourceRow.health : null,
      robotsTxtCompliant: crawlConfig?.robots_txt_compliant !== undefined
        ? Boolean(crawlConfig.robots_txt_compliant)
        : null,
      requires_js: Boolean(sourceRow.requires_js) || crawlConfig?.method === 'playwright',
      baseUrl: String(sourceRow.base_url || sourceRow.baseUrl || '').trim()
    });
  }

  return [...hostMap.values()];
}

function tierToNumeric(tierName) {
  if (tierName === 'manufacturer' || tierName === 'lab') {
    return 1;
  }
  if (tierName === 'database') {
    return 2;
  }
  if (tierName === 'retailer') {
    return 3;
  }
  return 4;
}

function tierNameFromSourceToken(value) {
  const token = String(value || '').trim().toLowerCase();
  if (!token) {
    return 'database';
  }
  if (token === 'manufacturer' || token.includes('manufacturer') || token === 'tier1') {
    return 'manufacturer';
  }
  if (token === 'lab' || token.includes('lab') || token === 'tier2') {
    return 'lab';
  }
  if (token === 'retailer' || token.includes('retailer') || token === 'tier3') {
    return 'retailer';
  }
  if (
    token === 'database' ||
    token.includes('database') ||
    token.includes('community') ||
    token.includes('aggregator') ||
    token === 'tier4' ||
    token === 'tier5'
  ) {
    return 'database';
  }
  return 'database';
}

function resolveRegistryHost(sourceRow = {}) {
  const directHost = normalizeHost(sourceRow.host);
  if (directHost) {
    return directHost;
  }

  const baseUrl = String(sourceRow.base_url || sourceRow.baseUrl || '').trim();
  if (baseUrl) {
    try {
      return normalizeHost(new URL(baseUrl).hostname);
    } catch {
      // ignore invalid URL
    }
  }

  const templates = Array.isArray(sourceRow.url_templates)
    ? sourceRow.url_templates
    : (Array.isArray(sourceRow.urlTemplates) ? sourceRow.urlTemplates : []);
  for (const template of templates) {
    const raw = String(template || '').trim();
    if (!raw) {
      continue;
    }
    try {
      return normalizeHost(new URL(raw).hostname);
    } catch {
      // ignore invalid URL template
    }
  }
  return '';
}

export function resolveTierNameForHost(host, categoryConfig) {
  const norm = normalizeHost(host);
  for (const item of categoryConfig.sourceHosts) {
    if (hostMatches(norm, item.host)) {
      return item.tierName;
    }
  }
  return 'candidate';
}

export function resolveTierForHost(host, categoryConfig) {
  return tierToNumeric(resolveTierNameForHost(host, categoryConfig));
}

export function isApprovedHost(host, categoryConfig) {
  const norm = normalizeHost(host);
  return categoryConfig.sourceHosts.some((item) => hostMatches(norm, item.host));
}

export function isDeniedHost(host, categoryConfig) {
  const norm = normalizeHost(host);
  return (categoryConfig.denylist || []).some((entry) => hostMatches(norm, entry));
}

export function inferRoleForHost(host, categoryConfig) {
  const tierName = resolveTierNameForHost(host, categoryConfig);
  if (tierName === 'manufacturer') return 'manufacturer';
  if (tierName === 'lab') return 'review';
  if (tierName === 'database') return 'review';
  if (tierName === 'retailer') return 'retailer';
  return 'other';
}

export function isInstrumentedHost(host, categoryConfig) {
  const tierName = resolveTierNameForHost(host, categoryConfig);
  return tierName === 'lab';
}

function mergeUnique(arr = []) {
  return [...new Set((arr || []).map((item) => normalizeHost(item)).filter(Boolean))];
}

function normalizeField(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ruleRequiredLevel, ruleAvailability, ruleDifficulty imported from ruleAccessors.js

function defaultSources() {
  return {
    approved: {
      manufacturer: [],
      lab: [],
      database: [],
      retailer: []
    },
    denylist: [],
    sources: {}
  };
}

function defaultSchema(category) {
  return {
    category,
    field_order: [],
    critical_fields: [],
    expected_easy_fields: [],
    expected_sometimes_fields: [],
    deep_fields: [],
    editorial_fields: [],
    targets: {
      targetCompleteness: 0.9,
      targetConfidence: 0.8
    }
  };
}

function deriveRequiredFieldsFromFieldRules(fieldRulesPayload) {
  if (!isObject(fieldRulesPayload?.fields)) {
    return [];
  }
  const out = [];
  for (const [rawField, rawRule] of Object.entries(fieldRulesPayload.fields)) {
    const field = normalizeField(rawField);
    if (!field || !isObject(rawRule)) {
      continue;
    }
    const requiredLevel = ruleRequiredLevel(rawRule);
    if (requiredLevel === 'required' || requiredLevel === 'critical') {
      out.push(`fields.${field}`);
    }
  }
  return [...new Set(out)];
}

function deriveSchemaFromFieldRules(category, fieldRulesPayload, uiFieldCatalog) {
  if (!isObject(fieldRulesPayload?.fields)) {
    return null;
  }

  const uiRows = Array.isArray(uiFieldCatalog?.fields)
    ? uiFieldCatalog.fields
      .filter((row) => isObject(row) && String(row.key || '').trim())
      .map((row) => ({
        key: normalizeField(row.key),
        order: Number.isFinite(Number(row.order)) ? Number(row.order) : Number.MAX_SAFE_INTEGER
      }))
    : [];
  const uiOrderMap = new Map(uiRows.map((row) => [row.key, row.order]));

  const fieldEntries = Object.entries(fieldRulesPayload.fields)
    .map(([rawField, rawRule]) => ({
      field: normalizeField(rawField),
      rule: isObject(rawRule) ? rawRule : {}
    }))
    .filter((row) => Boolean(row.field))
    .sort((a, b) => {
      const ao = uiOrderMap.has(a.field) ? uiOrderMap.get(a.field) : Number.MAX_SAFE_INTEGER;
      const bo = uiOrderMap.has(b.field) ? uiOrderMap.get(b.field) : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) {
        return ao - bo;
      }
      return a.field.localeCompare(b.field);
    });

  const fieldOrder = fieldEntries.map((row) => row.field);
  const critical = [];
  const expectedEasy = [];
  const expectedSometimes = [];
  const deep = [];

  for (const { field, rule } of fieldEntries) {
    const requiredLevel = ruleRequiredLevel(rule);
    const difficulty = ruleDifficulty(rule);
    const availability = ruleAvailability(rule);
    if (requiredLevel === 'critical') {
      critical.push(field);
    }
    if (requiredLevel === 'required' || requiredLevel === 'critical' || requiredLevel === 'expected') {
      if (difficulty === 'easy' || availability === 'expected') {
        expectedEasy.push(field);
      } else {
        expectedSometimes.push(field);
      }
    } else {
      deep.push(field);
    }
  }

  return {
    ...defaultSchema(category),
    category,
    field_order: fieldOrder,
    critical_fields: [...new Set(critical)],
    expected_easy_fields: [...new Set(expectedEasy)],
    expected_sometimes_fields: [...new Set(expectedSometimes)],
    deep_fields: [...new Set(deep)]
  };
}

function mergeSources(baseSources, overrideSources) {
  if (!overrideSources || typeof overrideSources !== 'object') {
    return baseSources;
  }

  const mergedApproved = {};
  const baseApproved = baseSources?.approved || {};
  const overrideApproved = overrideSources?.approved || {};
  const tierNames = new Set([...Object.keys(baseApproved), ...Object.keys(overrideApproved)]);

  for (const tierName of tierNames) {
    mergedApproved[tierName] = mergeUnique([
      ...(baseApproved[tierName] || []),
      ...(overrideApproved[tierName] || [])
    ]);
  }

  return {
    approved: mergedApproved,
    denylist: mergeUnique([...(baseSources?.denylist || []), ...(overrideSources?.denylist || [])]),
    sources: {
      ...(isObject(baseSources?.sources) ? baseSources.sources : {}),
      ...(isObject(overrideSources?.sources) ? overrideSources.sources : {})
    }
  };
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return isObject(parsed) || Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function resolveHelperRoot(runtimeConfig = {}) {
  return path.resolve(
    runtimeConfig.categoryAuthorityRoot || 'category_authority'
  );
}

function resolveLegacyCategoriesRoot(runtimeConfig = {}) {
  return path.resolve(runtimeConfig.categoriesRoot || 'categories');
}

function buildBaseConfigCacheKey(category, runtimeConfig = {}) {
  return [
    resolveHelperRoot(runtimeConfig),
    resolveLegacyCategoriesRoot(runtimeConfig),
    category
  ].join('::');
}

async function loadGeneratedCategoryArtifacts(category, runtimeConfig = {}) {
  const helperRoot = resolveHelperRoot(runtimeConfig);
  const helperCategoryRoot = path.join(helperRoot, category);
  const generatedRoot = path.join(helperRoot, category, '_generated');

  const [schemaRaw, requiredRaw, fieldRulesRaw, fieldRulesRuntimeRaw, uiFieldCatalogRaw, generatedSourcesRaw, generatedAnchorsRaw, generatedSearchTemplatesRaw, fieldGroupsRaw, helperSchemaRaw, helperRequiredRaw, helperSourcesRaw, helperAnchorsRaw, helperSearchTemplatesRaw] = await Promise.all([
    readJsonIfExists(path.join(generatedRoot, 'schema.json')),
    readJsonIfExists(path.join(generatedRoot, 'required_fields.json')),
    readJsonIfExists(path.join(generatedRoot, 'field_rules.json')),
    readJsonIfExists(path.join(generatedRoot, 'field_rules.runtime.json')),
    readJsonIfExists(path.join(generatedRoot, 'ui_field_catalog.json')),
    readJsonIfExists(path.join(generatedRoot, 'sources.json')),
    readJsonIfExists(path.join(generatedRoot, 'anchors.json')),
    readJsonIfExists(path.join(generatedRoot, 'search_templates.json')),
    readJsonIfExists(path.join(generatedRoot, 'field_groups.json')),
    readJsonIfExists(path.join(helperCategoryRoot, 'schema.json')),
    readJsonIfExists(path.join(helperCategoryRoot, 'required_fields.json')),
    readJsonIfExists(path.join(helperCategoryRoot, 'sources.json')),
    readJsonIfExists(path.join(helperCategoryRoot, 'anchors.json')),
    readJsonIfExists(path.join(helperCategoryRoot, 'search_templates.json'))
  ]);

  const fieldRulesPayload = isObject(fieldRulesRaw)
    ? fieldRulesRaw
    : (isObject(fieldRulesRuntimeRaw) ? fieldRulesRuntimeRaw : null);
  const fieldRulesPath = isObject(fieldRulesRaw)
    ? path.join(generatedRoot, 'field_rules.json')
    : (isObject(fieldRulesRuntimeRaw) ? path.join(generatedRoot, 'field_rules.runtime.json') : null);
  const uiFieldCatalog = isObject(uiFieldCatalogRaw) ? uiFieldCatalogRaw : null;
  const schema = isObject(schemaRaw)
    ? schemaRaw
    : (isObject(helperSchemaRaw) ? helperSchemaRaw : deriveSchemaFromFieldRules(category, fieldRulesPayload, uiFieldCatalog));
  const requiredFields = Array.isArray(requiredRaw)
    ? requiredRaw
      .map((field) => String(field || '').trim())
      .filter(Boolean)
    : (Array.isArray(helperRequiredRaw)
      ? helperRequiredRaw
        .map((field) => String(field || '').trim())
        .filter(Boolean)
      : deriveRequiredFieldsFromFieldRules(fieldRulesPayload));

  const fieldRules = fieldRulesPayload
    ? {
      ...fieldRulesPayload,
      __meta: {
        ...(isObject(fieldRulesPayload.__meta) ? fieldRulesPayload.__meta : {}),
        file_path: fieldRulesPath
      }
    }
    : null;

  if (!fieldRules) {
    return null;
  }

  const sources = isObject(generatedSourcesRaw)
    ? generatedSourcesRaw
    : (isObject(helperSourcesRaw) ? helperSourcesRaw : null);
  const anchors = isObject(generatedAnchorsRaw)
    ? generatedAnchorsRaw
    : (isObject(helperAnchorsRaw) ? helperAnchorsRaw : null);
  const searchTemplates = Array.isArray(generatedSearchTemplatesRaw)
    ? generatedSearchTemplatesRaw
    : (Array.isArray(helperSearchTemplatesRaw) ? helperSearchTemplatesRaw : null);

  const schemaPath = isObject(schemaRaw)
    ? path.join(generatedRoot, 'schema.json')
    : (isObject(helperSchemaRaw) ? path.join(helperCategoryRoot, 'schema.json') : null);
  const requiredPath = Array.isArray(requiredRaw)
    ? path.join(generatedRoot, 'required_fields.json')
    : (Array.isArray(helperRequiredRaw) ? path.join(helperCategoryRoot, 'required_fields.json') : null);

  return {
    helperCategoryRoot,
    generatedRoot,
    schema,
    requiredFields,
    fieldRules,
    uiFieldCatalog,
    fieldGroups: isObject(fieldGroupsRaw) ? fieldGroupsRaw : null,
    sources,
    anchors,
    searchTemplates,
    schemaPath,
    requiredPath
  };
}

function buildCategoryConfig({
  category,
  schema,
  sources,
  requiredFields,
  anchors,
  searchTemplates
}) {
  const sourceHosts = flattenApprovedHosts(sources);
  const denylist = (sources.denylist || []).map(normalizeHost);
  const sourceHostMap = new Map(
    sourceHosts
      .filter((row) => row?.host)
      .map((row) => [row.host, row])
  );

  return {
    category,
    schema,
    sources,
    requiredFields,
    anchorFields: anchors,
    searchTemplates,
    sourceHosts,
    sourceHostMap,
    sourceRegistry: isObject(sources?.sources) ? sources.sources : {},
    denylist,
    requiredFieldSet: new Set(requiredFields),
    criticalFieldSet: new Set(schema.critical_fields || []),
    editorialFieldSet: new Set(schema.editorial_fields || []),
    fieldOrder: schema.field_order || [],
    approvedRootDomains: new Set(sourceHosts.map((item) => extractRootDomain(item.host)))
  };
}

async function loadCategoryBaseConfig(category, runtimeConfig = {}) {
  const cacheKey = buildBaseConfigCacheKey(category, runtimeConfig);
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const helperCategoryDir = path.join(resolveHelperRoot(runtimeConfig), category);
  const legacyCategoryDir = path.join(resolveLegacyCategoriesRoot(runtimeConfig), category);
  const [
    helperSchemaRaw,
    helperSourcesRaw,
    helperRequiredRaw,
    helperAnchorsRaw,
    helperSearchTemplatesRaw,
    legacySchemaRaw,
    legacySourcesRaw,
    legacyRequiredRaw,
    legacyAnchorsRaw,
    legacySearchTemplatesRaw
  ] = await Promise.all([
    readJsonIfExists(path.join(helperCategoryDir, 'schema.json')),
    readJsonIfExists(path.join(helperCategoryDir, 'sources.json')),
    readJsonIfExists(path.join(helperCategoryDir, 'required_fields.json')),
    readJsonIfExists(path.join(helperCategoryDir, 'anchors.json')),
    readJsonIfExists(path.join(helperCategoryDir, 'search_templates.json')),
    readJsonIfExists(path.join(legacyCategoryDir, 'schema.json')),
    readJsonIfExists(path.join(legacyCategoryDir, 'sources.json')),
    readJsonIfExists(path.join(legacyCategoryDir, 'required_fields.json')),
    readJsonIfExists(path.join(legacyCategoryDir, 'anchors.json')),
    readJsonIfExists(path.join(legacyCategoryDir, 'search_templates.json'))
  ]);

  const schemaRaw = isObject(helperSchemaRaw) ? helperSchemaRaw : legacySchemaRaw;
  const sourcesRaw = isObject(helperSourcesRaw) ? helperSourcesRaw : legacySourcesRaw;
  const requiredRaw = Array.isArray(helperRequiredRaw) ? helperRequiredRaw : legacyRequiredRaw;
  const anchorsRaw = isObject(helperAnchorsRaw) ? helperAnchorsRaw : legacyAnchorsRaw;
  const searchTemplatesRaw = Array.isArray(helperSearchTemplatesRaw) ? helperSearchTemplatesRaw : legacySearchTemplatesRaw;

  const schema = isObject(schemaRaw) ? schemaRaw : defaultSchema(category);
  const sources = isObject(sourcesRaw) ? sourcesRaw : defaultSources();
  const requiredFields = Array.isArray(requiredRaw) ? requiredRaw : [];
  const anchors = isObject(anchorsRaw) ? anchorsRaw : {};
  const searchTemplates = Array.isArray(searchTemplatesRaw) ? searchTemplatesRaw : [];

  const config = buildCategoryConfig({
    category,
    schema,
    sources,
    requiredFields,
    anchors,
    searchTemplates
  });

  cache.set(cacheKey, config);
  return config;
}

export async function loadCategoryConfig(category, options = {}) {
  const storage = options.storage || null;
  const runtimeConfig = options.config || {};
  const baseConfig = await loadCategoryBaseConfig(category, runtimeConfig);

  const generated = await loadGeneratedCategoryArtifacts(category, runtimeConfig);
  if (!generated?.fieldRules) {
    throw new Error(`Missing generated field rules: category_authority/${category}/_generated/field_rules.json`);
  }

  const schema = generated?.schema || baseConfig.schema || defaultSchema(category);
  const requiredFields = Array.isArray(generated?.requiredFields) && generated.requiredFields.length > 0
    ? generated.requiredFields
    : (baseConfig.requiredFields || []);

  let sources = mergeSources(baseConfig.sources || defaultSources(), generated.sources || null);
  let sourcesOverrideKey = null;

  if (storage) {
    const overrideKey = toPosixKey(
      INPUT_KEY_PREFIX,
      '_sources',
      'overrides',
      category,
      'sources.override.json'
    );
    const overrideSources = await storage.readJsonOrNull(overrideKey);
    if (overrideSources) {
      sources = mergeSources(sources, overrideSources);
      sourcesOverrideKey = overrideKey;
    }
  }

  const resolved = buildCategoryConfig({
    category,
    schema,
    sources,
    requiredFields,
    anchors: generated.anchors || baseConfig.anchorFields || {},
    searchTemplates: generated.searchTemplates || baseConfig.searchTemplates || []
  });

  resolved.fieldRules = generated.fieldRules;
  resolved.uiFieldCatalog = generated.uiFieldCatalog || null;
  resolved.fieldGroups = generated.fieldGroups || null;
  resolved.generated_root = generated.generatedRoot;
  resolved.generated_schema_path = generated.schemaPath;
  resolved.generated_required_fields_path = generated.requiredPath;
  if (sourcesOverrideKey) {
    resolved.sources_override_key = sourcesOverrideKey;
  }

  // Source registry validation (Phase 02) — always runs
  const { registry, validationErrors, sparsityWarnings } = loadSourceRegistry(category, sources);
  if (validationErrors.length > 0) {
    console.warn(`[source-registry] ${category}: ${validationErrors.length} validation error(s):`, validationErrors);
  }
  if (sparsityWarnings.length > 0) {
    console.warn(`[source-registry] ${category}: ${sparsityWarnings.length} sparsity warning(s)`);
  }
  const gate = checkCategoryPopulationHardGate(registry);
  if (!gate.passed) {
    console.warn(`[source-registry] ${category}: population gate BLOCKED —`, gate.reasons.join('; '));
  }
  resolved.validatedRegistry = registry;
  resolved.registryPopulationGate = gate;

  return resolved;
}
