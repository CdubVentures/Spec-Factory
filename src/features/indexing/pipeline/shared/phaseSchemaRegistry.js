// WHY: O(1) registry mapping phase UI IDs to their LLM call contracts.
// Non-finder phases are manual. Finder phases are auto-generated from
// the finder module registry via codegen (phaseSchemaRegistry.generated.js).

import { zodToLlmSchema } from '../../../../core/llm/zodToLlmSchema.js';
import { plannerResponseZodSchema, PLANNER_SYSTEM_PROMPT } from '../needSet/searchPlanBuilderLlmAdapter.js';
import { queryEnhancerResponseZodSchema, buildEnhancerSystemPrompt } from '../searchPlanner/queryPlannerLlmAdapter.js';
import { brandResolverLlmResponseSchema, BRAND_RESOLVER_SYSTEM_PROMPT } from '../brandResolver/brandResolverLlmAdapter.js';
import { serpSelectorOutputSchema } from '../resultProcessing/serpSelector.js';
import { SERP_SELECT_URLS_SYSTEM_PROMPT } from '../resultProcessing/serpSelectorLlmAdapter.js';
import { REPAIR_SYSTEM_PROMPT, HALLUCINATION_PATTERNS } from '../../../publisher/repair-adapter/promptBuilder.js';
import { repairResponseJsonSchema } from '../../../publisher/repair-adapter/repairResponseSchema.js';
import { FINDER_PHASE_SCHEMAS } from './phaseSchemaRegistry.generated.js';
import { buildVariantIdentityCheckPrompt, CEF_DISCOVERY_DEFAULT_TEMPLATE } from '../../../color-edition/colorEditionLlmAdapter.js';
import { variantIdentityCheckResponseSchema } from '../../../color-edition/colorEditionSchema.js';
import { buildViewEvalPrompt, buildHeroSelectionPrompt, VIEW_EVAL_DEFAULT_TEMPLATE, HERO_EVAL_DEFAULT_TEMPLATE } from '../../../product-image/imageEvaluator.js';
import { viewEvalResponseSchema, heroEvalResponseSchema } from '../../../product-image/imageEvaluatorSchema.js';
import {
  GENERIC_VIEW_DESCRIPTIONS,
  CANONICAL_VIEW_KEYS,
  resolveViewEvalCriteria,
  resolveHeroEvalCriteria,
  PIF_VIEW_DEFAULT_TEMPLATE,
  PIF_HERO_DEFAULT_TEMPLATE,
} from '../../../product-image/productImageLlmAdapter.js';
import {
  resolveViewPrompt,
  VIEW_PROMPT_ROLES,
} from '../../../product-image/viewPromptDefaults.js';
import { RDF_DEFAULT_TEMPLATE } from '../../../release-date/releaseDateLlmAdapter.js';
import { SKF_DEFAULT_TEMPLATE } from '../../../sku/skuLlmAdapter.js';

const NON_FINDER_PHASES = Object.freeze({
  'needset': {
    system_prompt: PLANNER_SYSTEM_PROMPT,
    response_schema: zodToLlmSchema(plannerResponseZodSchema),
    prompt_templates: [{ promptKey: 'system', label: 'System Prompt', storageScope: 'global', defaultTemplate: PLANNER_SYSTEM_PROMPT, variables: [], userMessageInfo: [
      { field: 'identity_lock', description: '{ brand, base_model, model, variant } — product being indexed' },
      { field: 'groups[]', description: 'Focus groups with unresolved fields, weak_field_keys, conflict_field_keys' },
      { field: 'missing_fields', description: 'Fields still needing data from search' },
    ] }],
  },
  'search-planner': {
    system_prompt: buildEnhancerSystemPrompt(10),
    response_schema: zodToLlmSchema(queryEnhancerResponseZodSchema),
    prompt_templates: [{ promptKey: 'system', label: 'System Prompt', storageScope: 'global', defaultTemplate: buildEnhancerSystemPrompt(10), variables: [{ name: 'ROW_COUNT', description: 'e.g. "7" — row count is baked as 10 in the default; use {{ROW_COUNT}} in custom templates to get the real count', required: false }], userMessageInfo: [
      { field: 'identity_lock', description: '{ brand, base_model, model, variant } — product being indexed' },
      { field: 'query_history', description: 'Prior search queries already executed this run' },
      { field: 'missing_fields', description: 'Fields still needing data' },
      { field: 'rows[]', description: 'Query rows with tier, repeat_count, all_aliases, domain_hints, content_types_tried, domains_tried' },
    ] }],
  },
  'brand-resolver': {
    system_prompt: BRAND_RESOLVER_SYSTEM_PROMPT,
    response_schema: zodToLlmSchema(brandResolverLlmResponseSchema),
    prompt_templates: [{ promptKey: 'system', label: 'System Prompt', storageScope: 'global', defaultTemplate: BRAND_RESOLVER_SYSTEM_PROMPT, variables: [], userMessageInfo: [
      { field: 'brand', description: 'e.g. "Logitech" — the brand to resolve' },
      { field: 'category', description: 'e.g. "mouse" — product category for context' },
    ] }],
  },
  'serp-selector': {
    system_prompt: SERP_SELECT_URLS_SYSTEM_PROMPT,
    response_schema: serpSelectorOutputSchema(),
    prompt_templates: [{ promptKey: 'system', label: 'System Prompt', storageScope: 'global', defaultTemplate: SERP_SELECT_URLS_SYSTEM_PROMPT, variables: [], userMessageInfo: [
      { field: 'product', description: '{ brand, model } — the exact product to match URLs against' },
      { field: 'candidates[]', description: 'Candidate URLs with id, url, title, snippet from SERP results' },
      { field: 'max_keep', description: 'e.g. 8 — maximum URLs the LLM may return' },
    ] }],
  },
  'validate': {
    system_prompt: REPAIR_SYSTEM_PROMPT + '\n\n' + HALLUCINATION_PATTERNS,
    response_schema: repairResponseJsonSchema,
    prompt_templates: [{ promptKey: 'system', label: 'System Prompt (Repair + Hallucination Patterns)', storageScope: 'global', defaultTemplate: REPAIR_SYSTEM_PROMPT + '\n\n' + HALLUCINATION_PATTERNS, variables: [], userMessageInfo: [
      { field: 'field_contract', description: 'Per-key contract block — e.g. "FIELD CONTRACT for \'weight\':\\n  Type: number | Shape: scalar | Unit: g\\n  Range: 1 to 5000 g\\n  Rounding: 1 decimals"' },
      { field: 'rejected_value', description: 'e.g. "twenty grams" or ["pink", "sparkle-unicorn"] — the value that failed validation' },
      { field: 'rejection_code', description: 'P1 (closed enum), P2 (open enum), P3 (wrong type), P4 (format mismatch), P6 (cross-field), P7 (out of range)' },
      { field: 'known_values[]', description: 'e.g. ["black", "white", "red", "light-blue"] — registered values for enum fields' },
      { field: 'enum_policy', description: '"closed" (must map to existing) or "open_prefer_known" (can confirm genuinely new values)' },
      { field: 'format_hint', description: 'e.g. "kebab-case" — expected format pattern when applicable' },
      { field: 'P6: constraints', description: 'Cross-field failures — e.g. "wireless_battery: conditional — wireless mouse must have battery_hours"' },
    ] }],
  },
});

// WHY: Carousel Builder has per-view prompts — one system prompt per canonical view + hero.
// Stored as view_prompts map so the LLM Config GUI can render each individually.
// eval_criteria_defaults provides category-specific criteria text for the editable UI.
const EVAL_CRITERIA_CATEGORIES = ['mouse', 'keyboard', 'monitor', 'mousepad'];

function buildEvalCriteriaDefaults() {
  const defaults = {};
  for (const cat of EVAL_CRITERIA_CATEGORIES) {
    const catDefaults = {};
    for (const view of CANONICAL_VIEW_KEYS) {
      catDefaults[view] = resolveViewEvalCriteria(cat, view);
    }
    catDefaults.hero = resolveHeroEvalCriteria(cat);
    defaults[cat] = catDefaults;
  }
  return defaults;
}

const CAROUSEL_BUILDER_PHASE = Object.freeze({
  'image-evaluator': {
    system_prompt: buildViewEvalPrompt({ product: { brand: '{brand}', model: '{model}' }, view: 'top', viewDescription: GENERIC_VIEW_DESCRIPTIONS.top, candidateCount: 3 }),
    hero_system_prompt: buildHeroSelectionPrompt({ product: { brand: '{brand}', model: '{model}' }, viewWinners: [{ view: 'top', filename: 'top-black.png' }, { view: 'left', filename: 'left-black.png' }] }),
    response_schema: zodToLlmSchema(viewEvalResponseSchema),
    hero_response_schema: zodToLlmSchema(heroEvalResponseSchema),
    view_prompts: Object.freeze(
      Object.fromEntries(
        Object.entries(GENERIC_VIEW_DESCRIPTIONS).map(([view, desc]) => [
          view,
          buildViewEvalPrompt({ product: { brand: '{brand}', model: '{model}' }, view, viewDescription: desc, candidateCount: 3 }),
        ]),
      ),
    ),
    eval_criteria_defaults: Object.freeze(buildEvalCriteriaDefaults()),
    eval_criteria_categories: EVAL_CRITERIA_CATEGORIES,
    prompt_templates: [
      { promptKey: 'viewEval', label: 'View Eval Structural Prompt', storageScope: 'module', moduleId: 'productImageFinder', settingKey: 'evalPromptOverride', defaultTemplate: VIEW_EVAL_DEFAULT_TEMPLATE, variables: [
        { name: 'IDENTITY', description: 'e.g. "Product: Logitech G502 X Plus — the \\"black\\" color variant"', required: true },
        { name: 'VIEW_LINE', description: 'e.g. "View: \\"top\\" — Bird\'s-eye shot looking directly down..."', required: true },
        { name: 'COUNT_LINE', description: 'e.g. "You are evaluating 4 candidate images for this view."', required: true },
        { name: 'CRITERIA', description: 'Per-category/per-view eval criteria text — editable in the criteria tabs below', required: true },
      ], userMessageInfo: [
        { field: 'images[]', description: 'Base64-encoded thumbnail images as content parts (vision input)' },
        { field: 'image labels', description: 'e.g. "Image 1: top-black.png (1200x800, 145KB)" — filename + original dimensions' },
      ] },
      { promptKey: 'heroEval', label: 'Hero Eval Structural Prompt', storageScope: 'module', moduleId: 'productImageFinder', settingKey: 'heroEvalPromptOverride', defaultTemplate: HERO_EVAL_DEFAULT_TEMPLATE, variables: [
        { name: 'IDENTITY', description: 'e.g. "Product: Logitech G502 X Plus — the \\"black\\" color variant"', required: true },
        { name: 'COUNT_LINE', description: 'e.g. "You are evaluating 6 hero/marketing image candidates."', required: true },
        { name: 'CRITERIA', description: 'Per-category hero eval criteria text — editable in the criteria tabs below', required: true },
        { name: 'HERO_COUNT', description: 'e.g. "3" — from heroCount setting', required: true },
      ], userMessageInfo: [
        { field: 'images[]', description: 'Base64-encoded thumbnail images as content parts (vision input)' },
        { field: 'image labels', description: 'e.g. "Image 1: hero-black-desk.png (1920x1080, 230KB)" — filename + original dimensions' },
      ] },
    ],
  },
});

// WHY: Identity check is a sub-call within the colorFinder phase (Run 2+).
// Overlay adds the second prompt/schema to the auto-generated color-finder entry
// so the LLM Config GUI renders both side by side.
const identityCheckExample = buildVariantIdentityCheckPrompt({
  product: { brand: '{brand}', model: '{model}' },
  existingRegistry: [
    { variant_id: 'v_example1', variant_key: 'color:black', variant_type: 'color', variant_label: 'black', color_atoms: ['black'] },
  ],
  newColors: ['black', 'deep-ocean-blue'],
  newColorNames: { 'deep-ocean-blue': 'Deep Ocean Blue' },
  newEditions: {},
});

const COLOR_FINDER_IDENTITY_CHECK = Object.freeze({
  'color-finder': {
    ...FINDER_PHASE_SCHEMAS['color-finder'],
    identity_check_prompt: identityCheckExample,
    identity_check_response_schema: zodToLlmSchema(variantIdentityCheckResponseSchema),
    prompt_templates: [
      { promptKey: 'discovery', label: 'Discovery Prompt', storageScope: 'module', moduleId: 'colorEditionFinder', settingKey: 'discoveryPromptTemplate', defaultTemplate: CEF_DISCOVERY_DEFAULT_TEMPLATE, variables: [
        { name: 'BRAND', description: 'e.g. "Logitech"', required: true, category: 'deterministic' },
        { name: 'MODEL', description: 'e.g. "G502 X Plus"', required: true, category: 'deterministic' },
        { name: 'KNOWN_FINDINGS', description: 'Run 2+ discovery context — includes: colors found so far e.g. ["black","white"], color marketing names e.g. {"light-blue":"Glacier Blue"}, editions found so far e.g. ["cod-bo6"], urls already checked e.g. ["https://www.logitech.com/..."]. Empty string on Run 1.', required: false, category: 'deterministic' },
        { name: 'PALETTE', description: 'e.g. "black (#000000), white (#ffffff), red (#ff0000), light-blue (#add8e6)" — or "(no registered colors)" when palette is empty', required: true, category: 'deterministic' },
        { name: 'IDENTITY_WARNING', description: 'Unified block from buildIdentityWarning (src/core/llm/prompts/). 3 tiers: easy="no known siblings" | medium="CAUTION: ..." | hard="HIGH AMBIGUITY: TRIPLE-CHECK". Includes the siblings-exclusion line when sibling models are provided. Edit text via Global Prompts in LLM Config.', required: false, category: 'global-fragment' },
        { name: 'EVIDENCE_REQUIREMENTS', description: 'Evidence contract + URL verification block. Sourced from the Global Prompts panel (evidenceContract + evidenceVerification).', required: false, category: 'global-fragment' },
        { name: 'VALUE_CONFIDENCE_GUIDANCE', description: 'Epistemic confidence rubric (per-source + overall). Tier is a URL-type label only and does not factor into confidence. Sourced from the Global Prompts panel (valueConfidenceRubric).', required: false, category: 'global-fragment' },
        { name: 'PREVIOUS_DISCOVERY', description: 'Previously searched URLs + queries for this product. Empty on first run. Header text editable in Global Prompts (discoveryHistoryBlock).', required: false, category: 'global-fragment' },
      ], userMessageInfo: [
        { field: 'brand', description: 'e.g. "Logitech"' },
        { field: 'base_model', description: 'e.g. "G502 X" — family model name' },
        { field: 'model', description: 'e.g. "G502 X Plus" — exact model' },
        { field: 'variant', description: 'e.g. "black" — if base_model is set' },
      ] },
      // WHY: Identity check uses full-replacement override (not {{VARIABLE}} templates) because the
      // entire prompt is dynamically built from the existing registry + new discoveries. The example
      // output (built above with sample data) serves as the defaultTemplate so the editor shows the
      // prompt structure. Saving a custom value replaces the ENTIRE prompt at runtime.
      { promptKey: 'identityCheck', label: 'Identity Check Prompt (Run 2+)', storageScope: 'module', moduleId: 'colorEditionFinder', settingKey: 'identityCheckPromptTemplate', defaultTemplate: identityCheckExample, variables: [], userMessageInfo: [
        { field: 'brand', description: 'e.g. "Logitech"' },
        { field: 'model', description: 'e.g. "G502 X Plus"' },
        { field: 'existing_variants', description: 'Count of current variant registry entries' },
        { field: 'new_colors', description: 'Count of new color discoveries' },
        { field: 'new_editions', description: 'Count of new edition discoveries' },
      ] },
    ],
  },
});

// WHY: Per-view per-role discovery prompt defaults for the LLM Config GUI.
// Each (category, view, role) combo maps to a string the user can override via
// loopViewPrompt_<view>, priorityViewPrompt_<view>, additionalViewPrompt_<view>
// finder settings. Seeds are byte-identical to the current per-category view
// descriptions so default output is unchanged.
const VIEW_PROMPT_CATEGORIES = ['mouse', 'keyboard', 'monitor', 'mousepad'];

function buildViewPromptDefaults() {
  const out = {};
  for (const cat of VIEW_PROMPT_CATEGORIES) {
    const catOut = {};
    for (const view of CANONICAL_VIEW_KEYS) {
      const roles = {};
      for (const role of VIEW_PROMPT_ROLES) {
        roles[role] = resolveViewPrompt({ role, category: cat, view });
      }
      catOut[view] = roles;
    }
    out[cat] = catOut;
  }
  return out;
}

// WHY: Overlay image-finder with prompt_templates metadata (same pattern as color-finder overlay).
const IMAGE_FINDER_TEMPLATES = Object.freeze({
  'image-finder': {
    ...FINDER_PHASE_SCHEMAS['image-finder'],
    view_prompt_defaults: Object.freeze(buildViewPromptDefaults()),
    view_prompt_categories: VIEW_PROMPT_CATEGORIES,
    view_prompt_roles: VIEW_PROMPT_ROLES,
    prompt_templates: [
      { promptKey: 'view', label: 'View Search Prompt', storageScope: 'module', moduleId: 'productImageFinder', settingKey: 'viewPromptOverride', defaultTemplate: PIF_VIEW_DEFAULT_TEMPLATE, variables: [
        { name: 'BRAND', description: 'e.g. "Logitech"', required: true, category: 'deterministic' },
        { name: 'MODEL', description: 'e.g. "G502 X Plus"', required: true, category: 'deterministic' },
        { name: 'VARIANT_DESC', description: 'e.g. the "black" color variant — or the "COD BO6" edition', required: true, category: 'deterministic' },
        { name: 'VARIANT_SUFFIX', description: 'e.g. " (variant: black)" — empty when no variant', required: false, category: 'deterministic' },
        { name: 'VARIANT_TYPE_WORD', description: '"color" or "edition"', required: false, category: 'deterministic' },
        { name: 'PRIORITY_VIEWS', description: 'e.g. "PRIORITY (search first):\\n  1. \\"top\\" — Bird\'s-eye shot... (min 800w x 600h)\\n  2. \\"left\\" — Side profile..." — includes per-view min dimensions when viewQualityMap is set', required: true, category: 'deterministic' },
        { name: 'ADDITIONAL_VIEWS', description: 'e.g. "\\nADDITIONAL:\\n  - \\"bottom\\" — Underside view..." — empty when all views are priority. Also includes per-view min dimensions.', required: false, category: 'deterministic' },
        { name: 'ADDITIONAL_GUIDANCE', description: 'One-line note appended after the priority-views instructions when additional views are supplied. Empty when only priority views are requested.', required: false, category: 'deterministic' },
        { name: 'ALL_VIEW_KEYS', description: 'e.g. "top, bottom, left, right, front, rear, sangle, angle"', required: true, category: 'deterministic' },
        { name: 'IMAGE_REQUIREMENTS', description: 'Image quality rules section — uses promptOverride setting if set, otherwise the built-in requirements block', required: true, category: 'deterministic' },
        { name: 'IDENTITY_WARNING', description: 'Unified block from buildIdentityWarning (src/core/llm/prompts/). 3 tiers — includes siblings-exclusion line inline when provided. Edit text via Global Prompts in LLM Config.', required: false, category: 'global-fragment' },
        { name: 'PREVIOUS_DISCOVERY', description: 'e.g. "Previous searches:\\n- URLs already checked: [\\"https://...\\"]\\n- Queries already run: [\\"logitech g502\\"]\\n" — empty on first run. Header text editable in Global Prompts (discoveryHistoryBlock).', required: false, category: 'global-fragment' },
      ], userMessageInfo: [
        { field: 'brand', description: 'e.g. "Logitech"' },
        { field: 'model', description: 'e.g. "G502 X Plus"' },
        { field: 'base_model', description: 'e.g. "G502 X"' },
        { field: 'variant_label', description: 'e.g. "black" or "COD BO6 Edition"' },
        { field: 'variant_type', description: '"color" or "edition"' },
      ] },
      { promptKey: 'hero', label: 'Hero Search Prompt', storageScope: 'module', moduleId: 'productImageFinder', settingKey: 'heroPromptOverride', defaultTemplate: PIF_HERO_DEFAULT_TEMPLATE, variables: [
        { name: 'BRAND', description: 'e.g. "Logitech"', required: true, category: 'deterministic' },
        { name: 'MODEL', description: 'e.g. "G502 X Plus"', required: true, category: 'deterministic' },
        { name: 'VARIANT_SUFFIX', description: 'e.g. " (variant: black)" — empty when no variant', required: false, category: 'deterministic' },
        { name: 'HERO_INSTRUCTIONS', description: 'Hero search rules block — uses promptOverride setting if set, otherwise the built-in lifestyle/contextual instructions', required: true, category: 'deterministic' },
        { name: 'IDENTITY_WARNING', description: 'Unified block from buildIdentityWarning (src/core/llm/prompts/). Same wording as view-search prompt. Edit text via Global Prompts in LLM Config.', required: false, category: 'global-fragment' },
        { name: 'PREVIOUS_DISCOVERY', description: 'e.g. "Previous searches:\\n- URLs already checked: [...]\\n" — empty on first run. Header text editable in Global Prompts (discoveryHistoryBlock).', required: false, category: 'global-fragment' },
      ], userMessageInfo: [
        { field: 'brand', description: 'e.g. "Logitech"' },
        { field: 'model', description: 'e.g. "G502 X Plus"' },
        { field: 'base_model', description: 'e.g. "G502 X"' },
        { field: 'variant_label', description: 'e.g. "black"' },
        { field: 'variant_type', description: '"color" or "edition"' },
      ] },
    ],
  },
});

// WHY: Overlay release-date-finder with prompt_templates metadata so the
// LLM Config GUI exposes the discovery prompt editor and its variable
// reference panel (same pattern as color-finder + image-finder overlays).
const RELEASE_DATE_FINDER_TEMPLATES = Object.freeze({
  'release-date-finder': {
    ...FINDER_PHASE_SCHEMAS['release-date-finder'],
    prompt_templates: [
      { promptKey: 'discovery', label: 'Discovery Prompt', storageScope: 'module', moduleId: 'releaseDateFinder', settingKey: 'discoveryPromptTemplate', defaultTemplate: RDF_DEFAULT_TEMPLATE, variables: [
        { name: 'BRAND', description: 'e.g. "Logitech"', required: true, category: 'deterministic' },
        { name: 'MODEL', description: 'e.g. "G502 X Plus"', required: true, category: 'deterministic' },
        { name: 'VARIANT_DESC', description: 'e.g. the "black" color variant — or the "COD BO6" edition', required: true, category: 'deterministic' },
        { name: 'VARIANT_SUFFIX', description: 'e.g. " (variant: black)" — empty when no variant', required: false, category: 'deterministic' },
        { name: 'VARIANT_TYPE_WORD', description: '"color" or "edition"', required: false, category: 'deterministic' },
        { name: 'IDENTITY_WARNING', description: 'Unified block from buildIdentityWarning (src/core/llm/prompts/). 3 tiers: easy="no known siblings" | medium="CAUTION: ..." | hard="HIGH AMBIGUITY: TRIPLE-CHECK". Includes the siblings-exclusion line when sibling models are provided. Edit text via Global Prompts in LLM Config.', required: false, category: 'global-fragment' },
        { name: 'EVIDENCE_REQUIREMENTS', description: 'Evidence contract + URL verification block. Sourced from the Global Prompts panel (evidenceContract + evidenceVerification).', required: false, category: 'global-fragment' },
        { name: 'VALUE_CONFIDENCE_GUIDANCE', description: 'Epistemic confidence rubric (per-source + overall). Tier is a URL-type label only and does not factor into confidence. Sourced from the Global Prompts panel (valueConfidenceRubric).', required: false, category: 'global-fragment' },
        { name: 'PREVIOUS_DISCOVERY', description: 'Previously searched URLs + queries for this variant. Empty on first run. Header text editable in Global Prompts (discoveryHistoryBlock).', required: false, category: 'global-fragment' },
      ], userMessageInfo: [
        { field: 'brand', description: 'e.g. "Logitech"' },
        { field: 'model', description: 'e.g. "G502 X Plus"' },
        { field: 'base_model', description: 'e.g. "G502 X"' },
        { field: 'variant_label', description: 'e.g. "black" or "COD BO6 Edition"' },
        { field: 'variant_type', description: '"color" or "edition"' },
      ] },
    ],
  },
});

// WHY: Overlay sku-finder with prompt_templates metadata so the LLM Config GUI
// exposes the discovery prompt editor + variable manifest + per-category tabs
// (same pattern as release-date-finder overlay). SKU mirrors RDF's variable
// surface byte-for-byte because both are scalar variantFieldProducer modules
// sharing the same identity / evidence / confidence / discovery contract.
const SKU_FINDER_TEMPLATES = Object.freeze({
  'sku-finder': {
    ...FINDER_PHASE_SCHEMAS['sku-finder'],
    prompt_templates: [
      { promptKey: 'discovery', label: 'Discovery Prompt', storageScope: 'module', moduleId: 'skuFinder', settingKey: 'discoveryPromptTemplate', defaultTemplate: SKF_DEFAULT_TEMPLATE, variables: [
        { name: 'BRAND', description: 'e.g. "Logitech"', required: true, category: 'deterministic' },
        { name: 'MODEL', description: 'e.g. "G502 X Plus"', required: true, category: 'deterministic' },
        { name: 'VARIANT_DESC', description: 'e.g. the "black" color variant — or the "COD BO6" edition', required: true, category: 'deterministic' },
        { name: 'VARIANT_SUFFIX', description: 'e.g. " (variant: black)" — empty when no variant', required: false, category: 'deterministic' },
        { name: 'VARIANT_TYPE_WORD', description: '"color" or "edition"', required: false, category: 'deterministic' },
        { name: 'IDENTITY_WARNING', description: 'Unified block from buildIdentityWarning (src/core/llm/prompts/). 3 tiers: easy="no known siblings" | medium="CAUTION: ..." | hard="HIGH AMBIGUITY: TRIPLE-CHECK". Includes the siblings-exclusion line when sibling models are provided. Edit text via Global Prompts in LLM Config.', required: false, category: 'global-fragment' },
        { name: 'EVIDENCE_REQUIREMENTS', description: 'Evidence contract + URL verification block. Sourced from the Global Prompts panel (evidenceContract + evidenceVerification).', required: false, category: 'global-fragment' },
        { name: 'VALUE_CONFIDENCE_GUIDANCE', description: 'Epistemic confidence rubric (per-source + overall). Tier is a URL-type label only and does not factor into confidence. Sourced from the Global Prompts panel (valueConfidenceRubric).', required: false, category: 'global-fragment' },
        { name: 'PREVIOUS_DISCOVERY', description: 'Previously searched URLs + queries for this variant. Empty on first run. Header text editable in Global Prompts (discoveryHistoryBlock).', required: false, category: 'global-fragment' },
      ], userMessageInfo: [
        { field: 'brand', description: 'e.g. "Logitech"' },
        { field: 'model', description: 'e.g. "G502 X Plus"' },
        { field: 'base_model', description: 'e.g. "G502 X"' },
        { field: 'variant_label', description: 'e.g. "black" or "COD BO6 Edition"' },
        { field: 'variant_type', description: '"color" or "edition"' },
      ] },
    ],
  },
});

export const PHASE_SCHEMA_REGISTRY = Object.freeze({
  ...NON_FINDER_PHASES,
  ...FINDER_PHASE_SCHEMAS,
  ...COLOR_FINDER_IDENTITY_CHECK,
  ...IMAGE_FINDER_TEMPLATES,
  ...CAROUSEL_BUILDER_PHASE,
  ...RELEASE_DATE_FINDER_TEMPLATES,
  ...SKU_FINDER_TEMPLATES,
});
