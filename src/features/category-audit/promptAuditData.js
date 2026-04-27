import { PHASE_SCHEMA_REGISTRY } from '../indexing/pipeline/shared/phaseSchemaRegistry.js';
import { GLOBAL_PROMPTS, resolveGlobalPrompt } from '../../core/llm/prompts/globalPromptRegistry.js';
import { buildColorEditionFinderPrompt, buildVariantIdentityCheckPrompt } from '../color-edition/colorEditionLlmAdapter.js';
import {
  buildProductImageFinderPrompt,
  buildHeroImageFinderPrompt,
  resolveViewConfig,
  resolveViewBudget,
  resolveViewEvalCriteria,
  resolveHeroEvalCriteria,
  CATEGORY_VIEW_DEFAULTS,
  CATEGORY_VIEW_EVAL_CRITERIA,
  CATEGORY_HERO_EVAL_CRITERIA,
} from '../product-image/productImageLlmAdapter.js';
import { buildViewEvalPrompt, buildHeroSelectionPrompt } from '../product-image/imageEvaluator.js';
import { resolveViewPrompt, viewPromptSettingKey, VIEW_PROMPT_DEFAULTS } from '../product-image/viewPromptDefaults.js';
import { resolveSingleRunSecondaryHints } from '../product-image/secondaryHintsDefaults.js';
import { buildReleaseDateFinderPrompt } from '../release-date/releaseDateLlmAdapter.js';
import { buildSkuFinderPrompt } from '../sku/skuLlmAdapter.js';

const PROMPT_SURFACES = Object.freeze([
  { owner: 'cef', ownerLabel: 'CEF', phaseId: 'color-finder', promptKey: 'discovery', slug: 'discovery', title: 'CEF Discovery Prompt', schemaKey: 'response_schema' },
  { owner: 'cef', ownerLabel: 'CEF', phaseId: 'color-finder', promptKey: 'identityCheck', slug: 'identity-check', title: 'CEF Identity Check Prompt', schemaKey: 'identity_check_response_schema' },
  { owner: 'pif', ownerLabel: 'PIF', phaseId: 'image-finder', promptKey: 'view', slug: 'view-search', title: 'PIF View Search Prompt', schemaKey: 'response_schema' },
  { owner: 'pif', ownerLabel: 'PIF', phaseId: 'image-finder', promptKey: 'hero', slug: 'hero-search', title: 'PIF Hero Search Prompt', schemaKey: 'response_schema' },
  { owner: 'eval', ownerLabel: 'Image Eval', phaseId: 'image-evaluator', promptKey: 'viewEval', slug: 'view-eval', title: 'Image Eval View Eval Prompt', schemaKey: 'response_schema' },
  { owner: 'eval', ownerLabel: 'Image Eval', phaseId: 'image-evaluator', promptKey: 'heroEval', slug: 'hero-eval', title: 'Image Eval Hero Eval Prompt', schemaKey: 'hero_response_schema' },
  { owner: 'rdf', ownerLabel: 'RDF', phaseId: 'release-date-finder', promptKey: 'discovery', slug: 'discovery', title: 'RDF Discovery Prompt', schemaKey: 'response_schema' },
  { owner: 'sku', ownerLabel: 'SKU', phaseId: 'sku-finder', promptKey: 'discovery', slug: 'discovery', title: 'SKU Discovery Prompt', schemaKey: 'response_schema' },
]);

const VARIABLE_GLOBAL_SOURCES = Object.freeze({
  CATEGORY_CONTEXT: ['categoryContext'],
  IDENTITY_INTRO: ['identityIntro'],
  IDENTITY_WARNING: ['identityWarningEasy', 'identityWarningMedium', 'identityWarningHard', 'siblingsExclusion'],
  SIBLING_VARIANTS: ['siblingVariantsExclusion'],
  EVIDENCE_REQUIREMENTS: ['evidenceContract', 'evidenceVerification', 'evidenceKindGuidance'],
  VALUE_CONFIDENCE_GUIDANCE: ['valueConfidenceRubric'],
  SOURCE_GUIDANCE: ['variantScalarSourceGuidance', 'scalarSourceGuidanceCloser'],
  VARIANT_DISAMBIGUATION: ['variantScalarDisambiguation'],
  UNK_POLICY: ['unkPolicy'],
  PREVIOUS_DISCOVERY: ['discoveryHistoryBlock'],
  DISCOVERY_LOG_SHAPE: ['discoveryLogShape'],
  SCALAR_RETURN_JSON_TAIL: ['scalarReturnJsonTail'],
});

const SAMPLE_PRODUCT_ID = '<PRODUCT_ID>';
const SAMPLE_PRODUCT = Object.freeze({
  product_id: SAMPLE_PRODUCT_ID,
  brand: '<BRAND>',
  base_model: '<BASE_MODEL>',
  model: '<MODEL>',
  variant: 'black',
});
const SAMPLE_VARIANTS = Object.freeze([
  { variant_id: 'v_black', key: 'color:black', label: 'black', type: 'color' },
  { variant_id: 'v_white', key: 'color:white', label: 'white', type: 'color' },
  { variant_id: 'v_special', key: 'edition:special-edition', label: 'Special Edition', type: 'edition' },
]);

function firstLine(value, max = 180) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function getSetting(moduleSettings, moduleId, key) {
  const value = moduleSettings?.[moduleId]?.[key];
  return typeof value === 'string' ? value : '';
}

function getPromptTemplate(phaseId, promptKey) {
  const phase = PHASE_SCHEMA_REGISTRY[phaseId];
  const prompt = phase?.prompt_templates?.find((entry) => entry.promptKey === promptKey);
  if (!prompt) {
    throw new Error(`extractPromptAuditData: missing prompt template ${phaseId}/${promptKey}`);
  }
  return { phase, prompt };
}

function extractPlaceholders(text) {
  const out = new Set();
  const re = /\{\{([A-Z0-9_]+)\}\}/g;
  let match;
  while ((match = re.exec(String(text || '')))) out.add(match[1]);
  return [...out].sort();
}

function buildGlobalFragments(globalFragments = {}) {
  return Object.fromEntries(Object.keys(GLOBAL_PROMPTS).map((key) => {
    const supplied = globalFragments[key];
    return [key, typeof supplied === 'string' ? supplied : resolveGlobalPrompt(key)];
  }));
}

function globalSourceLabels(variableName) {
  return VARIABLE_GLOBAL_SOURCES[variableName] || [];
}

function buildProduct(category) {
  return { ...SAMPLE_PRODUCT, category };
}

function buildPreviousDiscovery() {
  return { urlsChecked: ['https://example.com/already-checked'], queriesRun: ['<BRAND> <MODEL> black'] };
}

function parseIntSetting(moduleSettings, moduleId, key, fallback) {
  const raw = getSetting(moduleSettings, moduleId, key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolvePifViewContext({ category, moduleSettings }) {
  const moduleId = 'productImageFinder';
  const viewConfig = resolveViewConfig(getSetting(moduleSettings, moduleId, 'viewConfig'), category);
  const viewBudget = resolveViewBudget(getSetting(moduleSettings, moduleId, 'viewBudget'), category);
  const priorityViews = viewConfig
    .filter((entry) => entry.priority)
    .map((entry) => ({
      key: entry.key,
      description: resolveViewPrompt({
        role: 'priority',
        category,
        view: entry.key,
        dbOverride: getSetting(moduleSettings, moduleId, viewPromptSettingKey('priority', entry.key)),
      }),
    }));
  const priorityKeySet = new Set(priorityViews.map((entry) => entry.key));
  const singleHints = resolveSingleRunSecondaryHints(getSetting(moduleSettings, moduleId, 'singleRunSecondaryHints'), category);
  const additionalViews = singleHints
    .filter((view) => !priorityKeySet.has(view))
    .map((view) => ({
      key: view,
      description: resolveViewPrompt({
        role: 'additional',
        category,
        view,
        dbOverride: getSetting(moduleSettings, moduleId, viewPromptSettingKey('additional', view)),
      }),
    }));
  const focusView = viewBudget[0] || priorityViews[0]?.key || 'top';
  const focusConfig = viewConfig.find((entry) => entry.key === focusView) || viewConfig[0] || { key: focusView, description: `${focusView} view` };
  return { viewConfig, viewBudget, priorityViews, additionalViews, focusView, focusDescription: focusConfig.description || `${focusView} view` };
}

function buildCommonValues({ category, globalFragments, moduleSettings, moduleId }) {
  return {
    BRAND: '<BRAND>',
    MODEL: '<MODEL>',
    CATEGORY_CONTEXT: `Category: ${category}`,
    VARIANT_DESC: 'the "black" color variant',
    VARIANT_SUFFIX: ' (variant: black)',
    VARIANT_TYPE_WORD: 'color',
    IDENTITY_INTRO: firstLine(globalFragments.identityIntro),
    IDENTITY_WARNING: firstLine(globalFragments.identityWarningEasy),
    SIBLING_VARIANTS: firstLine(globalFragments.siblingVariantsExclusion),
    EVIDENCE_REQUIREMENTS: firstLine(`${globalFragments.evidenceContract}\n${globalFragments.evidenceVerification}`),
    VALUE_CONFIDENCE_GUIDANCE: firstLine(globalFragments.valueConfidenceRubric),
    SOURCE_GUIDANCE: firstLine(globalFragments.variantScalarSourceGuidance),
    VARIANT_DISAMBIGUATION: firstLine(globalFragments.variantScalarDisambiguation),
    UNK_POLICY: firstLine(globalFragments.unkPolicy),
    PREVIOUS_DISCOVERY: firstLine(globalFragments.discoveryHistoryBlock),
    DISCOVERY_LOG_SHAPE: firstLine(globalFragments.discoveryLogShape),
    SCALAR_RETURN_JSON_TAIL: firstLine(globalFragments.scalarReturnJsonTail),
    PRODUCT_IMAGE_IDENTITY_FACTS: 'connection: wired',
    PALETTE: 'black (#000000), white (#ffffff), red (#ff0000)',
    KNOWN_FINDINGS: 'Previous findings to verify and expand beyond',
    DISCOVERY_IDENTITY_GATE: 'PIF exact-product/source-confidence/acceptance checklist',
    HERO_INSTRUCTIONS: 'Built-in hero search rules',
    PIF_PROMPT_HISTORY: 'Prompt history blocks when image/link history settings are enabled; empty in this sample.',
    COUNT_LINE: 'You are evaluating sample candidates.',
    VARIANT_IDENTITY_GATE: 'Strict near-sibling variant rejection gate',
    CRITERIA: 'Category or fallback evaluation criteria',
    CAROUSEL_CONTEXT: 'Existing carousel slots used as duplicate/near-duplicate context.',
    HERO_COUNT: String(parseIntSetting(moduleSettings, moduleId, 'heroCount', 3)),
  };
}

function buildCefDiscovery({ category, moduleSettings }) {
  const moduleId = 'colorEditionFinder';
  return buildColorEditionFinderPrompt({
    colorNames: ['black', 'white', 'red'],
    colors: [
      { name: 'black', hex: '#000000' },
      { name: 'white', hex: '#ffffff' },
      { name: 'red', hex: '#ff0000' },
    ],
    product: buildProduct(category),
    previousRuns: [],
    previousDiscovery: buildPreviousDiscovery(),
    familyModelCount: 1,
    ambiguityLevel: 'easy',
    siblingModels: [],
    templateOverride: getSetting(moduleSettings, moduleId, 'discoveryPromptTemplate'),
  });
}

function buildCefIdentityCheck({ category, moduleSettings }) {
  const moduleId = 'colorEditionFinder';
  return buildVariantIdentityCheckPrompt({
    product: buildProduct(category),
    existingRegistry: [
      { variant_id: 'v_black', variant_type: 'color', variant_key: 'color:black', variant_label: 'black', color_atoms: ['black'] },
    ],
    newColors: ['black', 'white'],
    newColorNames: { white: 'White' },
    newEditions: { 'special-edition': { display_name: 'Special Edition', colors: ['black+red'] } },
    promptOverride: getSetting(moduleSettings, moduleId, 'identityCheckPromptTemplate'),
    familyModelCount: 1,
    ambiguityLevel: 'easy',
    siblingModels: [],
    runCount: 1,
    orphanedPifKeys: ['color:old-black'],
  });
}

function buildPifView({ category, moduleSettings }) {
  const moduleId = 'productImageFinder';
  const pif = resolvePifViewContext({ category, moduleSettings });
  return buildProductImageFinderPrompt({
    product: buildProduct(category),
    variantLabel: 'black',
    variantType: 'color',
    variantKey: 'color:black',
    allVariants: SAMPLE_VARIANTS,
    priorityViews: pif.priorityViews,
    additionalViews: pif.additionalViews,
    minWidth: parseIntSetting(moduleSettings, moduleId, 'minWidth', 800),
    minHeight: parseIntSetting(moduleSettings, moduleId, 'minHeight', 600),
    siblingsExcluded: [],
    familyModelCount: 1,
    ambiguityLevel: 'easy',
    previousDiscovery: buildPreviousDiscovery(),
    promptOverride: getSetting(moduleSettings, moduleId, 'viewPromptOverride'),
    productImageIdentityFacts: [{ fieldKey: 'connection', label: 'Connection', value: 'wired' }],
  });
}

function buildPifHero({ category, moduleSettings }) {
  const moduleId = 'productImageFinder';
  return buildHeroImageFinderPrompt({
    product: buildProduct(category),
    variantLabel: 'black',
    variantType: 'color',
    minWidth: parseIntSetting(moduleSettings, moduleId, 'minWidth', 800),
    minHeight: parseIntSetting(moduleSettings, moduleId, 'minHeight', 600),
    siblingsExcluded: [],
    familyModelCount: 1,
    ambiguityLevel: 'easy',
    previousDiscovery: buildPreviousDiscovery(),
    promptOverride: getSetting(moduleSettings, moduleId, 'heroPromptOverride'),
    productImageIdentityFacts: [{ fieldKey: 'connection', label: 'Connection', value: 'wired' }],
  });
}

function buildViewEval({ category, moduleSettings }) {
  const moduleId = 'productImageFinder';
  const pif = resolvePifViewContext({ category, moduleSettings });
  const settingKey = `evalViewCriteria_${pif.focusView}`;
  return buildViewEvalPrompt({
    product: buildProduct(category),
    variantLabel: 'black',
    variantType: 'color',
    view: pif.focusView,
    viewDescription: pif.focusDescription,
    candidateCount: 3,
    promptOverride: getSetting(moduleSettings, moduleId, 'evalPromptOverride'),
    evalCriteria: getSetting(moduleSettings, moduleId, settingKey) || resolveViewEvalCriteria(category, pif.focusView),
    carouselContext: [{ slot: 'sangle', filename: 'existing-sangle.png' }],
    productImageIdentityFacts: [{ fieldKey: 'connection', label: 'Connection', value: 'wired' }],
  });
}

function buildHeroEval({ category, moduleSettings }) {
  const moduleId = 'productImageFinder';
  return buildHeroSelectionPrompt({
    product: buildProduct(category),
    variantLabel: 'black',
    variantType: 'color',
    candidates: [{ filename: 'hero-1.png' }, { filename: 'hero-2.png' }],
    promptOverride: getSetting(moduleSettings, moduleId, 'heroEvalPromptOverride'),
    heroCriteria: getSetting(moduleSettings, moduleId, 'heroEvalCriteria') || resolveHeroEvalCriteria(category),
    heroCount: parseIntSetting(moduleSettings, moduleId, 'heroCount', 3),
    productImageIdentityFacts: [{ fieldKey: 'connection', label: 'Connection', value: 'wired' }],
  });
}

function buildRdf({ category, moduleSettings }) {
  const moduleId = 'releaseDateFinder';
  return buildReleaseDateFinderPrompt({
    product: buildProduct(category),
    variantLabel: 'black',
    variantType: 'color',
    variantKey: 'color:black',
    allVariants: SAMPLE_VARIANTS,
    siblingsExcluded: [],
    familyModelCount: 1,
    ambiguityLevel: 'easy',
    previousDiscovery: buildPreviousDiscovery(),
    promptOverride: getSetting(moduleSettings, moduleId, 'discoveryPromptTemplate'),
  });
}

function buildSku({ category, moduleSettings }) {
  const moduleId = 'skuFinder';
  return buildSkuFinderPrompt({
    product: buildProduct(category),
    variantLabel: 'black',
    variantType: 'color',
    variantKey: 'color:black',
    allVariants: SAMPLE_VARIANTS,
    siblingsExcluded: [],
    familyModelCount: 1,
    ambiguityLevel: 'easy',
    previousDiscovery: buildPreviousDiscovery(),
    promptOverride: getSetting(moduleSettings, moduleId, 'discoveryPromptTemplate'),
  });
}

const SAMPLE_BUILDERS = Object.freeze({
  'cef/discovery': buildCefDiscovery,
  'cef/identity-check': buildCefIdentityCheck,
  'pif/view-search': buildPifView,
  'pif/hero-search': buildPifHero,
  'eval/view-eval': buildViewEval,
  'eval/hero-eval': buildHeroEval,
  'rdf/discovery': buildRdf,
  'sku/discovery': buildSku,
});

function buildSamplePrompt(surface, opts) {
  const key = `${surface.owner}/${surface.slug}`;
  const builder = SAMPLE_BUILDERS[key];
  return builder ? builder(opts) : '';
}

function resolveEffectiveTemplate(prompt, moduleSettings) {
  const override = getSetting(moduleSettings, prompt.moduleId, prompt.settingKey);
  return {
    override,
    overrideActive: Boolean(override.trim()),
    template: override.trim() ? override : prompt.defaultTemplate,
  };
}

function buildPromptFlags({ surface, category, compiledPrompt, effectiveTemplate, prompt }) {
  const flags = [];
  const unresolved = extractPlaceholders(compiledPrompt);
  if (unresolved.length > 0) flags.push(`Unresolved placeholders after compile: ${unresolved.map((v) => `{{${v}}}`).join(', ')}`);

  const effectivePlaceholders = new Set(extractPlaceholders(effectiveTemplate));
  const declaredVariables = new Set((prompt.variables || []).map((variable) => variable.name));
  const undeclaredPlaceholders = [...effectivePlaceholders]
    .filter((name) => !declaredVariables.has(name))
    .sort();
  if (undeclaredPlaceholders.length > 0) flags.push(`Template placeholder not declared in prompt metadata: ${undeclaredPlaceholders.map((v) => `{{${v}}}`).join(', ')}`);

  const missingRequired = (prompt.variables || [])
    .filter((variable) => variable.required && !effectivePlaceholders.has(variable.name))
    .map((variable) => variable.name);
  if (missingRequired.length > 0) flags.push(`Required variable missing from effective template: ${missingRequired.map((v) => `{{${v}}}`).join(', ')}`);

  if (surface.owner === 'pif' && !CATEGORY_VIEW_DEFAULTS[category] && !VIEW_PROMPT_DEFAULTS[category]) {
    flags.push('Generic fallback: no authored category PIF view defaults found.');
  }
  if (surface.owner === 'eval' && surface.slug === 'view-eval' && !CATEGORY_VIEW_EVAL_CRITERIA[category]) {
    flags.push('Generic fallback: no authored category view-eval criteria found.');
  }
  if (surface.owner === 'eval' && surface.slug === 'hero-eval' && !CATEGORY_HERO_EVAL_CRITERIA[category]) {
    flags.push('Generic fallback: no authored category hero-eval criteria found.');
  }
  if ((surface.owner === 'rdf' || surface.owner === 'sku') && /peripherals?/i.test(compiledPrompt) && !['mouse', 'keyboard', 'monitor', 'mousepad', 'headset', 'controller', 'mic'].includes(category)) {
    flags.push('Category wording review: prompt contains peripheral-oriented wording.');
  }
  if (surface.owner === 'pif' && surface.slug === 'hero-search' && /desk setup|gaming setup|mousepad|keyboard\/monitor/i.test(compiledPrompt) && !['mouse', 'keyboard', 'monitor', 'mousepad'].includes(category)) {
    flags.push('Category wording review: hero prompt contains desk/peripheral-oriented wording.');
  }
  return flags;
}

function variableRows({ prompt, effectiveTemplate, defaultTemplate, globalFragments, sampleValues }) {
  const defaultPlaceholders = new Set(extractPlaceholders(defaultTemplate));
  const effectivePlaceholders = new Set(extractPlaceholders(effectiveTemplate));
  const declaredVariables = new Map((prompt.variables || []).map((variable) => [variable.name, variable]));
  const allVariableNames = [...new Set([
    ...declaredVariables.keys(),
    ...defaultPlaceholders,
    ...effectivePlaceholders,
  ])].sort();

  return allVariableNames.map((name) => {
    const variable = declaredVariables.get(name) || {
      name,
      required: false,
      category: 'template-placeholder',
      description: 'Placeholder appears in the prompt template but is not declared in the phase prompt metadata. Audit whether the editor contract should document its source and requiredness.',
    };
    const sources = globalSourceLabels(variable.name);
    const value = sampleValues[variable.name] || sources.map((key) => firstLine(globalFragments[key], 100)).filter(Boolean).join(' / ');
    return {
      name: variable.name,
      required: Boolean(variable.required),
      category: variable.category || '',
      description: variable.description || '',
      globalSources: sources,
      presentInDefault: defaultPlaceholders.has(variable.name),
      presentInEffective: effectivePlaceholders.has(variable.name),
      sampleValue: value || '',
    };
  });
}

function usedGlobalPromptKeys(record) {
  const keys = new Set();
  for (const variable of record.variables) {
    for (const key of variable.globalSources) keys.add(key);
  }
  return [...keys].sort();
}

function buildPromptRecord(surface, opts) {
  const { category, moduleSettings, globalFragments } = opts;
  const { phase, prompt } = getPromptTemplate(surface.phaseId, surface.promptKey);
  const effective = resolveEffectiveTemplate(prompt, moduleSettings);
  const compiledPrompt = buildSamplePrompt(surface, opts);
  const commonValues = buildCommonValues({ category, globalFragments, moduleSettings, moduleId: prompt.moduleId });
  const variables = variableRows({
    prompt,
    effectiveTemplate: effective.template,
    defaultTemplate: prompt.defaultTemplate,
    globalFragments,
    sampleValues: commonValues,
  });
  const record = {
    ...surface,
    moduleId: prompt.moduleId,
    settingKey: prompt.settingKey,
    storageScope: prompt.storageScope,
    defaultTemplate: prompt.defaultTemplate,
    effectiveTemplate: effective.template,
    overrideActive: effective.overrideActive,
    variables,
    userMessageInfo: prompt.userMessageInfo || [],
    responseSchema: phase?.[surface.schemaKey] || phase?.response_schema || null,
    compiledPrompt,
    templatePlaceholders: extractPlaceholders(prompt.defaultTemplate).map((name) => `{{${name}}}`),
    effectivePlaceholders: extractPlaceholders(effective.template).map((name) => `{{${name}}}`),
    unresolvedPlaceholders: extractPlaceholders(compiledPrompt).map((name) => `{{${name}}}`),
  };
  return {
    ...record,
    usedGlobalPrompts: usedGlobalPromptKeys(record),
    flags: buildPromptFlags({ surface, category, compiledPrompt, effectiveTemplate: effective.template, prompt }),
  };
}

function buildGlobalPromptRows(globalFragments) {
  return Object.entries(GLOBAL_PROMPTS).map(([key, prompt]) => ({
    key,
    label: prompt.label || key,
    appliesTo: Array.isArray(prompt.appliesTo) ? prompt.appliesTo.join(', ') : '',
    variables: (prompt.variables || []).map((variable) => `{{${variable.name}}}${variable.required ? ' required' : ''}`).join(', '),
    variableRows: (prompt.variables || []).map((variable) => ({
      name: variable.name,
      required: Boolean(variable.required),
    })),
    description: prompt.description || '',
    defaultTemplate: prompt.defaultTemplate || '',
    resolvedTemplate: globalFragments[key] || '',
    overrideActive: String(globalFragments[key] || '').trim() !== String(prompt.defaultTemplate || '').trim(),
    resolvedPreview: firstLine(globalFragments[key], 220),
  }));
}

export function extractPromptAuditData({
  category,
  moduleSettings = {},
  globalFragments = {},
  now = new Date(),
} = {}) {
  if (!category || typeof category !== 'string') {
    throw new Error('extractPromptAuditData: category is required');
  }
  const resolvedGlobals = buildGlobalFragments(globalFragments);
  const opts = { category, moduleSettings, globalFragments: resolvedGlobals };
  const prompts = PROMPT_SURFACES.map((surface) => buildPromptRecord(surface, opts));
  return {
    category,
    generatedAt: now.toISOString(),
    prompts,
    globalPrompts: buildGlobalPromptRows(resolvedGlobals),
    stats: {
      promptCount: prompts.length,
      ownerCount: new Set(prompts.map((prompt) => prompt.owner)).size,
      flagsCount: prompts.reduce((sum, prompt) => sum + prompt.flags.length, 0),
      overrideCount: prompts.filter((prompt) => prompt.overrideActive).length,
      globalPromptCount: Object.keys(GLOBAL_PROMPTS).length,
    },
  };
}
