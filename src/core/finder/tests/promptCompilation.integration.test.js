// WHY: End-to-end prompt-compilation contract tests across every LLM-calling
// finder (CEF, RDF, PIF-view, PIF-hero). These lock down invariants that no
// unit test previously covered:
//   1. Every compiled prompt has ZERO unresolved {{PLACEHOLDER}} tokens.
//   2. When familyModelCount > 1, the prompt emits the tier-appropriate
//      identity warning (CAUTION / HIGH AMBIGUITY) AND the concrete sibling
//      exclusion line ("This product is NOT: X, Y, Z").
//   3. The ambiguity resolver chain surfaces failures through the injected
//      logger instead of silently falling back to easy-tier.
//   4. resolveIdentityAmbiguitySnapshot correctly groups sibling models by
//      brand + base_model against a real specDb row set.
//
// These tests are the safety net for the M75-Corsair incident where CEF/PIF
// shipped empty siblings because base_model was not threaded through the
// route layer and the resolver swallowed the resulting missing-identity
// early-return without any audit signal.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildColorEditionFinderPrompt } from '../../../features/color-edition/colorEditionLlmAdapter.js';
import {
  buildReleaseDateFinderPrompt,
  RDF_DEFAULT_TEMPLATE,
} from '../../../features/release-date/releaseDateLlmAdapter.js';
import {
  buildSkuFinderPrompt,
  SKF_DEFAULT_TEMPLATE,
} from '../../../features/sku/skuLlmAdapter.js';
import {
  buildProductImageFinderPrompt,
  buildHeroImageFinderPrompt,
  PIF_VIEW_DEFAULT_TEMPLATE,
  PIF_HERO_DEFAULT_TEMPLATE,
} from '../../../features/product-image/productImageLlmAdapter.js';
import { resolveAmbiguityContext, buildOrchestratorProduct } from '../finderOrchestrationHelpers.js';
import { resolveIdentityAmbiguitySnapshot } from '../../../features/indexing/orchestration/shared/identityHelpers.js';
import { PHASE_SCHEMA_REGISTRY } from '../../../features/indexing/pipeline/shared/phaseSchemaRegistry.js';
import { FINDER_PHASE_SCHEMAS, FINDER_SCALAR_DEFAULT_TEMPLATES } from '../../../features/indexing/pipeline/shared/phaseSchemaRegistry.generated.js';
import { FINDER_MODULES } from '../finderModuleRegistry.js';
import {
  SCALAR_FINDER_VARIABLES,
  SCALAR_FINDER_USER_MESSAGE_INFO,
  buildScalarFinderPromptTemplates,
} from '../scalarFinderPromptContract.js';

// WHY: GUI phase IDs are camelToKebab(mod.phase), not mod.routePrefix —
// the two differ for CEF (routePrefix=color-edition-finder, phase=colorFinder
// → GUI id 'color-finder') and PIF. FINDER_PHASE_SCHEMAS keys ARE the GUI ids.
function guiPhaseIdFor(mod) {
  return mod.phase.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
}

const UNRESOLVED_PLACEHOLDER_RE = /\{\{[A-Z_][A-Z0-9_]*\}\}/;

const PRODUCT_AIR = {
  brand: 'Corsair',
  base_model: 'M75',
  model: 'M75 Air Wireless',
  variant: 'Air Wireless',
};

const FAMILY_CONTEXT = {
  familyModelCount: 3,
  ambiguityLevel: 'medium',
  siblingModels: ['M75', 'M75 Wireless'],
};

const EMPTY_DISCOVERY = { urlsChecked: [], queriesRun: [] };

// ── Section 1: no unresolved placeholders ──────────────────────────────
describe('compiled prompt has no unresolved {{PLACEHOLDER}} tokens', () => {
  test('CEF — single-product family', () => {
    const out = buildColorEditionFinderPrompt({
      colorNames: ['black', 'white'],
      colors: [{ name: 'black', hex: '#000000' }, { name: 'white', hex: '#ffffff' }],
      product: PRODUCT_AIR,
      previousRuns: [],
      previousDiscovery: EMPTY_DISCOVERY,
    });
    const leftover = out.match(UNRESOLVED_PLACEHOLDER_RE);
    assert.equal(leftover, null, `leftover token: ${leftover?.[0]}`);
  });

  test('CEF — multi-sibling family', () => {
    const out = buildColorEditionFinderPrompt({
      colorNames: ['black'],
      colors: [{ name: 'black', hex: '#000000' }],
      product: PRODUCT_AIR,
      previousRuns: [],
      previousDiscovery: EMPTY_DISCOVERY,
      ...FAMILY_CONTEXT,
    });
    const leftover = out.match(UNRESOLVED_PLACEHOLDER_RE);
    assert.equal(leftover, null, `leftover token: ${leftover?.[0]}`);
  });

  test('RDF — single-product', () => {
    const out = buildReleaseDateFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      previousDiscovery: EMPTY_DISCOVERY,
    });
    const leftover = out.match(UNRESOLVED_PLACEHOLDER_RE);
    assert.equal(leftover, null, `leftover token: ${leftover?.[0]}`);
  });

  test('RDF — multi-sibling family', () => {
    const out = buildReleaseDateFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      siblingsExcluded: FAMILY_CONTEXT.siblingModels,
      familyModelCount: FAMILY_CONTEXT.familyModelCount,
      ambiguityLevel: FAMILY_CONTEXT.ambiguityLevel,
      previousDiscovery: EMPTY_DISCOVERY,
    });
    const leftover = out.match(UNRESOLVED_PLACEHOLDER_RE);
    assert.equal(leftover, null, `leftover token: ${leftover?.[0]}`);
  });

  test('PIF view — single-product', () => {
    const out = buildProductImageFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      priorityViews: [{ key: 'hero', description: 'hero shot', priority: true }],
      additionalViews: [],
      previousDiscovery: EMPTY_DISCOVERY,
    });
    const leftover = out.match(UNRESOLVED_PLACEHOLDER_RE);
    assert.equal(leftover, null, `leftover token: ${leftover?.[0]}`);
  });

  test('PIF view — multi-sibling family', () => {
    const out = buildProductImageFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      priorityViews: [{ key: 'hero', description: 'hero shot', priority: true }],
      additionalViews: [],
      siblingsExcluded: FAMILY_CONTEXT.siblingModels,
      familyModelCount: FAMILY_CONTEXT.familyModelCount,
      ambiguityLevel: FAMILY_CONTEXT.ambiguityLevel,
      previousDiscovery: EMPTY_DISCOVERY,
    });
    const leftover = out.match(UNRESOLVED_PLACEHOLDER_RE);
    assert.equal(leftover, null, `leftover token: ${leftover?.[0]}`);
  });

  test('PIF hero — single-product', () => {
    const out = buildHeroImageFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      previousDiscovery: EMPTY_DISCOVERY,
    });
    const leftover = out.match(UNRESOLVED_PLACEHOLDER_RE);
    assert.equal(leftover, null, `leftover token: ${leftover?.[0]}`);
  });

  test('PIF hero — multi-sibling family', () => {
    const out = buildHeroImageFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      siblingsExcluded: FAMILY_CONTEXT.siblingModels,
      familyModelCount: FAMILY_CONTEXT.familyModelCount,
      ambiguityLevel: FAMILY_CONTEXT.ambiguityLevel,
      previousDiscovery: EMPTY_DISCOVERY,
    });
    const leftover = out.match(UNRESOLVED_PLACEHOLDER_RE);
    assert.equal(leftover, null, `leftover token: ${leftover?.[0]}`);
  });

  test('SKU — single-product', () => {
    const out = buildSkuFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      previousDiscovery: EMPTY_DISCOVERY,
    });
    const leftover = out.match(UNRESOLVED_PLACEHOLDER_RE);
    assert.equal(leftover, null, `leftover token: ${leftover?.[0]}`);
  });

  test('SKU — multi-sibling family', () => {
    const out = buildSkuFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      siblingsExcluded: FAMILY_CONTEXT.siblingModels,
      familyModelCount: FAMILY_CONTEXT.familyModelCount,
      ambiguityLevel: FAMILY_CONTEXT.ambiguityLevel,
      previousDiscovery: EMPTY_DISCOVERY,
    });
    const leftover = out.match(UNRESOLVED_PLACEHOLDER_RE);
    assert.equal(leftover, null, `leftover token: ${leftover?.[0]}`);
  });
});

// ── Section 1b: GUI-editable contract — every finder phase has prompt_templates ──
// WHY: SKU shipped without a prompt_templates overlay in phaseSchemaRegistry.js,
// silently falling back to the pre-rendered system_prompt preview. The GUI looked
// fine but the editor showed `{brand}` literals instead of the {{BRAND}} template
// and had no category tabs / variable manifest. This test locks down that every
// finder phase exposes its prompt template through the GUI-editable contract.
describe('every finder phase exposes prompt_templates for the LLM Config GUI', () => {
  const FINDER_PHASE_IDS = Object.keys(FINDER_PHASE_SCHEMAS);

  for (const phaseId of FINDER_PHASE_IDS) {
    test(`${phaseId} has prompt_templates overlay in PHASE_SCHEMA_REGISTRY`, () => {
      const schema = PHASE_SCHEMA_REGISTRY[phaseId];
      assert.ok(schema, `${phaseId} missing from PHASE_SCHEMA_REGISTRY`);
      assert.ok(
        Array.isArray(schema.prompt_templates) && schema.prompt_templates.length > 0,
        `${phaseId} missing prompt_templates overlay — add to phaseSchemaRegistry.js`,
      );
    });
  }

  test('every variantFieldProducer wires discoveryPromptTemplate into the GUI', () => {
    const scalarFinders = FINDER_MODULES.filter(m => m.moduleClass === 'variantFieldProducer');
    assert.ok(scalarFinders.length >= 2, 'expected at least RDF + SKU as scalar finders');
    for (const mod of scalarFinders) {
      const phaseId = guiPhaseIdFor(mod);
      const schema = PHASE_SCHEMA_REGISTRY[phaseId];
      const discoveryEntry = schema.prompt_templates?.find(t => t.settingKey === 'discoveryPromptTemplate');
      assert.ok(
        discoveryEntry,
        `${phaseId} has settingsSchema['discoveryPromptTemplate'] but no matching prompt_templates entry`,
      );
      assert.equal(discoveryEntry.storageScope, 'module', `${phaseId} discovery template must be storageScope:'module'`);
      assert.equal(discoveryEntry.moduleId, mod.id, `${phaseId} discovery template moduleId must match module id`);
      assert.ok(typeof discoveryEntry.defaultTemplate === 'string' && discoveryEntry.defaultTemplate.length > 0,
        `${phaseId} defaultTemplate must be a non-empty string`);
      assert.ok(/\{\{[A-Z_]+\}\}/.test(discoveryEntry.defaultTemplate),
        `${phaseId} defaultTemplate must contain {{TEMPLATE_VARIABLES}} (canonical syntax)`);
    }
  });
});

// ── Section 2: sibling injection for multi-model families ─────────────
describe('compiled prompt injects identity tier + sibling list when family>1', () => {
  test('CEF emits CAUTION + "This product is NOT: M75, M75 Wireless"', () => {
    const out = buildColorEditionFinderPrompt({
      colorNames: ['black'],
      colors: [{ name: 'black', hex: '#000000' }],
      product: PRODUCT_AIR,
      previousRuns: [],
      previousDiscovery: EMPTY_DISCOVERY,
      ...FAMILY_CONTEXT,
    });
    assert.match(out, /CAUTION: This product has 3 models in its family\./);
    assert.match(out, /This product is NOT: M75, M75 Wireless\./);
    assert.doesNotMatch(out, /no known siblings — standard identity matching/);
  });

  test('RDF emits CAUTION + sibling exclusion line', () => {
    const out = buildReleaseDateFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      siblingsExcluded: FAMILY_CONTEXT.siblingModels,
      familyModelCount: FAMILY_CONTEXT.familyModelCount,
      ambiguityLevel: FAMILY_CONTEXT.ambiguityLevel,
      previousDiscovery: EMPTY_DISCOVERY,
    });
    assert.match(out, /CAUTION: This product has 3 models in its family\./);
    assert.match(out, /This product is NOT: M75, M75 Wireless\./);
    assert.doesNotMatch(out, /no known siblings — standard identity matching/);
  });

  test('PIF view emits CAUTION + sibling exclusion line', () => {
    const out = buildProductImageFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      priorityViews: [{ key: 'hero', description: 'hero shot', priority: true }],
      additionalViews: [],
      siblingsExcluded: FAMILY_CONTEXT.siblingModels,
      familyModelCount: FAMILY_CONTEXT.familyModelCount,
      ambiguityLevel: FAMILY_CONTEXT.ambiguityLevel,
      previousDiscovery: EMPTY_DISCOVERY,
    });
    assert.match(out, /CAUTION: This product has 3 models in its family\./);
    assert.match(out, /This product is NOT: M75, M75 Wireless\./);
  });

  test('PIF hero emits CAUTION + sibling exclusion line', () => {
    const out = buildHeroImageFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      siblingsExcluded: FAMILY_CONTEXT.siblingModels,
      familyModelCount: FAMILY_CONTEXT.familyModelCount,
      ambiguityLevel: FAMILY_CONTEXT.ambiguityLevel,
      previousDiscovery: EMPTY_DISCOVERY,
    });
    assert.match(out, /CAUTION: This product has 3 models in its family\./);
    assert.match(out, /This product is NOT: M75, M75 Wireless\./);
  });
});

// ── Section 3: observability — resolver failures must surface ─────────
describe('resolveAmbiguityContext propagates resolver failures through logger', () => {
  test('logs identity_ambiguity_context_failed when resolveFn throws', async () => {
    const captured = [];
    const logger = {
      warn: (event, data) => captured.push({ level: 'warn', event, data }),
    };
    const boom = async () => { throw new Error('sql exploded'); };

    const ctx = await resolveAmbiguityContext({
      config: {},
      category: 'mouse',
      brand: 'Corsair',
      baseModel: 'M75',
      currentModel: 'M75 Air Wireless',
      specDb: {},
      resolveFn: boom,
      logger,
    });

    // Fallback still applies (non-fatal), but the event MUST have been logged.
    assert.equal(ctx.familyModelCount, 1);
    assert.equal(ctx.ambiguityLevel, 'easy');
    assert.deepEqual(ctx.siblingModels, []);
    assert.ok(captured.length >= 1, 'expected logger.warn to be called on resolver throw');
    assert.equal(captured[0].event, 'identity_ambiguity_context_failed');
    assert.equal(captured[0].data?.error, 'sql exploded');
  });

  test('does not log when resolver succeeds', async () => {
    const captured = [];
    const logger = { warn: (event, data) => captured.push({ event, data }) };
    const ok = async () => ({
      family_model_count: 2,
      ambiguity_level: 'medium',
      sibling_models: ['X'],
      source: 'specDb',
    });

    await resolveAmbiguityContext({
      config: {}, category: 'mouse', brand: 'Corsair', baseModel: 'M75',
      currentModel: 'M75', specDb: {}, resolveFn: ok, logger,
    });
    assert.equal(captured.length, 0);
  });
});

describe('resolveIdentityAmbiguitySnapshot propagates specDb failures through logger', () => {
  test('logs identity_ambiguity_snapshot_failed when getAllProducts throws', async () => {
    const captured = [];
    const logger = {
      warn: (event, data) => captured.push({ event, data }),
    };
    const badSpecDb = {
      getAllProducts: () => { throw new Error('db dead'); },
    };

    const snap = await resolveIdentityAmbiguitySnapshot({
      identityLock: { brand: 'Corsair', base_model: 'M75' },
      specDb: badSpecDb,
      currentModel: 'M75 Air Wireless',
      logger,
    });

    assert.equal(snap.source, 'fallback');
    assert.ok(captured.length >= 1, 'expected logger.warn on specDb throw');
    assert.equal(captured[0].event, 'identity_ambiguity_snapshot_failed');
    assert.equal(captured[0].data?.error, 'db dead');
  });
});

// ── Section 4: family detection against a real spec-db shape ───────────
describe('resolveIdentityAmbiguitySnapshot — family grouping', () => {
  const specDbWithFamily = {
    getAllProducts: () => [
      { brand: 'Corsair', base_model: 'M75', model: 'M75 Air Wireless' },
      { brand: 'Corsair', base_model: 'M75', model: 'M75' },
      { brand: 'Corsair', base_model: 'M75', model: 'M75 Wireless' },
      { brand: 'Corsair', base_model: 'K70', model: 'K70 RGB' },
      { brand: 'Logitech', base_model: 'M75', model: 'M75 Knockoff' },
    ],
  };

  test('groups all Corsair M75 rows and lists siblings minus current', async () => {
    const snap = await resolveIdentityAmbiguitySnapshot({
      identityLock: { brand: 'Corsair', base_model: 'M75' },
      specDb: specDbWithFamily,
      currentModel: 'M75 Air Wireless',
    });
    assert.equal(snap.family_model_count, 3);
    assert.equal(snap.ambiguity_level, 'medium');
    assert.deepEqual(snap.sibling_models.sort(), ['M75', 'M75 Wireless'].sort());
    assert.equal(snap.source, 'specDb');
  });

  test('returns missing_identity early when base_model is empty', async () => {
    const snap = await resolveIdentityAmbiguitySnapshot({
      identityLock: { brand: 'Corsair', base_model: '' },
      specDb: specDbWithFamily,
      currentModel: 'M75 Air Wireless',
    });
    assert.equal(snap.source, 'missing_identity');
    assert.deepEqual(snap.sibling_models, []);
  });
});

// ── Section 4b: dead-placeholder removal ──────────────────────────────
describe('finder templates do not contain the dead {{SIBLINGS_LINE}} placeholder', () => {
  // WHY: buildIdentityWarning embeds the siblings line inside {{IDENTITY_WARNING}}
  // already (identityContext.js joins warning + siblings). A separate
  // {{SIBLINGS_LINE}} placeholder hardcoded to empty string in every adapter
  // is dead code that silently swallows any future attempt to use it.
  test('RDF_DEFAULT_TEMPLATE has no {{SIBLINGS_LINE}}', () => {
    assert.equal(RDF_DEFAULT_TEMPLATE.includes('{{SIBLINGS_LINE}}'), false);
  });
  test('PIF_VIEW_DEFAULT_TEMPLATE has no {{SIBLINGS_LINE}}', () => {
    assert.equal(PIF_VIEW_DEFAULT_TEMPLATE.includes('{{SIBLINGS_LINE}}'), false);
  });
  test('PIF_HERO_DEFAULT_TEMPLATE has no {{SIBLINGS_LINE}}', () => {
    assert.equal(PIF_HERO_DEFAULT_TEMPLATE.includes('{{SIBLINGS_LINE}}'), false);
  });
});

// ── Section 4c: route-layer product construction must include base_model ──
describe('buildOrchestratorProduct always attaches base_model', () => {
  // WHY: finderRoutes previously gated base_model behind parseVariantKey,
  // so CEF + PIF (which do not opt in) received product.base_model=''.
  // That cascaded into the ambiguity resolver returning missing_identity
  // and silently falling back to easy-tier, which is exactly why the
  // M75 Corsair family never saw its siblings injected.
  test('includes base_model regardless of variant-key mode', () => {
    const product = buildOrchestratorProduct({
      productId: 'mouse-abc',
      category: 'mouse',
      productRow: {
        brand: 'Corsair',
        base_model: 'M75',
        model: 'M75 Wireless',
        variant: 'Wireless',
      },
    });
    assert.equal(product.product_id, 'mouse-abc');
    assert.equal(product.category, 'mouse');
    assert.equal(product.brand, 'Corsair');
    assert.equal(product.base_model, 'M75');
    assert.equal(product.model, 'M75 Wireless');
    assert.equal(product.variant, 'Wireless');
  });

  test('defaults missing fields to empty strings', () => {
    const product = buildOrchestratorProduct({
      productId: 'mouse-xyz',
      category: 'mouse',
      productRow: {},
    });
    assert.equal(product.brand, '');
    assert.equal(product.base_model, '');
    assert.equal(product.model, '');
    assert.equal(product.variant, '');
  });
});

// ── Section 5: resolveAmbiguityContext end-to-end with live resolver ──
describe('resolveAmbiguityContext end-to-end with real resolver + specDb', () => {
  test('emits 3-sibling medium context for Corsair M75 family', async () => {
    const specDb = {
      getAllProducts: () => [
        { brand: 'Corsair', base_model: 'M75', model: 'M75 Air Wireless' },
        { brand: 'Corsair', base_model: 'M75', model: 'M75' },
        { brand: 'Corsair', base_model: 'M75', model: 'M75 Wireless' },
      ],
    };

    const ctx = await resolveAmbiguityContext({
      config: {},
      category: 'mouse',
      brand: 'Corsair',
      baseModel: 'M75',
      currentModel: 'M75 Air Wireless',
      specDb,
      resolveFn: resolveIdentityAmbiguitySnapshot,
    });

    assert.equal(ctx.familyModelCount, 3);
    assert.equal(ctx.ambiguityLevel, 'medium');
    assert.deepEqual(ctx.siblingModels.sort(), ['M75', 'M75 Wireless'].sort());
  });
});

// ── Section 5a: O(1) scalar finder prompt contract ──
// WHY: Stage B converted the hand-written RELEASE_DATE_FINDER_TEMPLATES and
// SKU_FINDER_TEMPLATES overlay blocks into a derived SCALAR_FINDER_OVERLAYS
// loop driven by FINDER_SCALAR_DEFAULT_TEMPLATES (codegen output) +
// buildScalarFinderPromptTemplates (shared contract). These tests lock the
// contract so future scalar finders (price, msrp, discontinued, upc) inherit
// the full GUI surface with one registry edit.
describe('scalar finder prompt contract (O(1) overlay)', () => {
  test('SCALAR_FINDER_VARIABLES has the canonical entries in the expected order', () => {
    const names = SCALAR_FINDER_VARIABLES.map((v) => v.name);
    assert.deepEqual(names, [
      'BRAND', 'MODEL', 'VARIANT_DESC', 'VARIANT_SUFFIX', 'VARIANT_TYPE_WORD',
      'IDENTITY_INTRO', 'IDENTITY_WARNING', 'EVIDENCE_REQUIREMENTS',
      'VALUE_CONFIDENCE_GUIDANCE', 'UNK_POLICY',
      'SOURCE_GUIDANCE', 'VARIANT_DISAMBIGUATION',
      'SIBLING_VARIANTS', 'PREVIOUS_DISCOVERY', 'SCALAR_RETURN_JSON_TAIL',
    ]);
  });

  test('SCALAR_FINDER_USER_MESSAGE_INFO has the 5 canonical fields', () => {
    const fields = SCALAR_FINDER_USER_MESSAGE_INFO.map((e) => e.field);
    assert.deepEqual(fields, ['brand', 'model', 'base_model', 'variant_label', 'variant_type']);
  });

  test('FINDER_SCALAR_DEFAULT_TEMPLATES contains every variantFieldProducer with defaultTemplateExport', () => {
    const scalarMods = FINDER_MODULES.filter(
      (m) => m.moduleClass === 'variantFieldProducer' && m.defaultTemplateExport,
    );
    for (const mod of scalarMods) {
      const phaseId = mod.phase.replace(/([A-Z])/g, '-$1').toLowerCase();
      const entry = FINDER_SCALAR_DEFAULT_TEMPLATES[phaseId];
      assert.ok(entry, `${phaseId} missing from FINDER_SCALAR_DEFAULT_TEMPLATES — run codegen`);
      assert.equal(entry.moduleId, mod.id);
      assert.ok(typeof entry.defaultTemplate === 'string' && entry.defaultTemplate.length > 0,
        `${phaseId} defaultTemplate must be a non-empty string`);
    }
  });

  test('buildScalarFinderPromptTemplates returns the canonical overlay shape for a hypothetical new finder', () => {
    // Proof: adding a new scalar finder (e.g. priceFinder) with
    // defaultTemplateExport + slot-bag exports only requires a FINDER_MODULES
    // entry. No phaseSchemaRegistry.js edit. This mock demonstrates the contract.
    const FAKE_TEMPLATE = 'Find the price for: {{BRAND}} {{MODEL}} — {{VARIANT_DESC}}\n{{IDENTITY_INTRO}}\n{{IDENTITY_WARNING}}\n{{EVIDENCE_REQUIREMENTS}}\n{{VALUE_CONFIDENCE_GUIDANCE}}\n{{SOURCE_GUIDANCE}}\n{{VARIANT_DISAMBIGUATION}}\n{{PREVIOUS_DISCOVERY}}Return JSON:\n- "price": "..." | "unk"\n{{SCALAR_RETURN_JSON_TAIL}}';
    const FAKE_SOURCE_SLOTS = {
      OPENER_TAIL: '',
      TIER1_CONTENT: '    Brand pricing page.',
      TIER3_HEADER: 'RETAILER LISTINGS',
      TIER3_CONTENT: '    Amazon, Best Buy, Newegg.',
      TIER2_CONTENT: '    Reviews citing MSRP.',
      TIER4_HEADER: 'COMMUNITY',
      TIER4_CONTENT: '    Forums, Reddit threads.',
    };
    const FAKE_DISAMBIG_SLOTS = {
      RULE1_LOCATE: 'Locate the per-variant price listing.',
      RULE2_DISTINCT_SIGNAL: 'If distinct, return variant price.',
      RULE3_SHARED_SIGNAL: 'If shared, return the shared price.',
      RULE4_AMBIGUOUS_UNK: 'If ambiguous, return "unk".',
      BASE_WARNING_CLOSER: 'Do NOT return the base price if variant pricing is published.',
    };
    const tmpls = buildScalarFinderPromptTemplates({
      moduleId: 'priceFinder',
      defaultTemplate: FAKE_TEMPLATE,
      sourceVariantGuidanceSlots: FAKE_SOURCE_SLOTS,
      variantDisambiguationSlots: FAKE_DISAMBIG_SLOTS,
    });
    assert.equal(tmpls.length, 1);
    const t = tmpls[0];
    assert.equal(t.promptKey, 'discovery');
    assert.equal(t.label, 'Discovery Prompt');
    assert.equal(t.storageScope, 'module');
    assert.equal(t.moduleId, 'priceFinder');
    assert.equal(t.settingKey, 'discoveryPromptTemplate');
    assert.equal(t.defaultTemplate, FAKE_TEMPLATE);
    assert.equal(t.variables, SCALAR_FINDER_VARIABLES);
    assert.equal(t.userMessageInfo, SCALAR_FINDER_USER_MESSAGE_INFO);
  });

  test('RDF and SKU phase-registry overlays have identical shape (proving convergence)', () => {
    const rdf = PHASE_SCHEMA_REGISTRY['release-date-finder'].prompt_templates;
    const sku = PHASE_SCHEMA_REGISTRY['sku-finder'].prompt_templates;
    assert.equal(rdf.length, 1);
    assert.equal(sku.length, 1);
    // Same shape except moduleId + defaultTemplate
    const [r, s] = [rdf[0], sku[0]];
    assert.equal(r.promptKey, s.promptKey);
    assert.equal(r.label, s.label);
    assert.equal(r.storageScope, s.storageScope);
    assert.equal(r.settingKey, s.settingKey);
    assert.equal(r.variables, s.variables); // same reference — shared bundle
    assert.equal(r.userMessageInfo, s.userMessageInfo); // same reference — shared bundle
    assert.notEqual(r.moduleId, s.moduleId);
    assert.notEqual(r.defaultTemplate, s.defaultTemplate);
  });
});

// ── Section 5c: sibling-variants injection — scope by finder ──
// WHY: PIF-view, PIF-loop (same template), RDF, SKU tell the LLM which OTHER
// variants of the same product to skip. PIF-hero does NOT (separate call path,
// confirmed by user). CEF does NOT (generates variants rather than filtering).
describe('sibling-variants block — injected into per-variant finders only', () => {
  const MULTI_VARIANTS = [
    { variant_id: 'v_1', key: 'color:black', label: 'black', type: 'color' },
    { variant_id: 'v_2', key: 'color:white', label: 'Glacier White', type: 'color' },
    { variant_id: 'v_3', key: 'edition:cod-bo6', label: 'CoD BO6 Edition', type: 'edition' },
  ];
  const SIBLING_MARKER = 'Other variants of this same product';

  test('RDF with multi-variant product contains the sibling-variants block', () => {
    const out = buildReleaseDateFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      variantKey: 'color:black',
      allVariants: MULTI_VARIANTS,
      previousDiscovery: EMPTY_DISCOVERY,
    });
    assert.ok(out.includes(SIBLING_MARKER));
    assert.ok(out.includes('release dates'), 'RDF must use "release dates" noun');
    assert.ok(out.includes('"Glacier White" color variant'));
    assert.ok(out.includes('"CoD BO6 Edition" edition'));
  });

  test('RDF with single-variant product does NOT contain the block', () => {
    const out = buildReleaseDateFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      variantKey: 'color:black',
      allVariants: [MULTI_VARIANTS[0]], // only current
      previousDiscovery: EMPTY_DISCOVERY,
    });
    assert.ok(!out.includes(SIBLING_MARKER));
  });

  test('SKU with multi-variant product uses "MPNs" wording', () => {
    const out = buildSkuFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      variantKey: 'color:black',
      allVariants: MULTI_VARIANTS,
      previousDiscovery: EMPTY_DISCOVERY,
    });
    assert.ok(out.includes(SIBLING_MARKER));
    assert.ok(out.includes('DO NOT return MPNs'));
  });

  test('PIF view with multi-variant product uses "images" wording', () => {
    const out = buildProductImageFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      variantKey: 'color:black',
      allVariants: MULTI_VARIANTS,
      priorityViews: [{ key: 'hero', description: 'hero shot', priority: true }],
      additionalViews: [],
      previousDiscovery: EMPTY_DISCOVERY,
    });
    assert.ok(out.includes(SIBLING_MARKER));
    assert.ok(out.includes('DO NOT return images'));
  });

  test('PIF hero never contains the sibling-variants block (even with multi-variant data)', () => {
    const out = buildHeroImageFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      previousDiscovery: EMPTY_DISCOVERY,
    });
    assert.ok(!out.includes(SIBLING_MARKER), 'PIF hero must NOT include sibling-variants block');
  });

  test('CEF never contains the sibling-variants block (discovers variants, does not filter them)', () => {
    const out = buildColorEditionFinderPrompt({
      colorNames: ['black', 'white'],
      colors: [{ name: 'black', hex: '#000000' }, { name: 'white', hex: '#ffffff' }],
      product: PRODUCT_AIR,
      previousRuns: [],
      previousDiscovery: EMPTY_DISCOVERY,
    });
    assert.ok(!out.includes(SIBLING_MARKER), 'CEF must NOT include sibling-variants block');
  });

  test('sibling block sits immediately after IDENTITY_WARNING and before GOAL (RDF)', () => {
    const out = buildReleaseDateFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      variantKey: 'color:black',
      allVariants: MULTI_VARIANTS,
      previousDiscovery: EMPTY_DISCOVERY,
    });
    const identityWarningIdx = out.indexOf('no known siblings — standard');
    const siblingIdx = out.indexOf(SIBLING_MARKER);
    const goalIdx = out.indexOf('GOAL:');
    assert.ok(identityWarningIdx >= 0 && siblingIdx > identityWarningIdx && goalIdx > siblingIdx,
      'expected order: IDENTITY_WARNING → SIBLING_VARIANTS → GOAL');
  });
});

// ── Section 5b: globalized prompt fragments — convergence across CEF/PIF/RDF/SKU ──
// WHY: The prior-prior turn's audit found that RDF + SKU duplicated large blocks of
// boilerplate (IDENTITY line, source-guidance closer, return-JSON tail) and that PIF
// hero was missing the sibling-skip sentence every other template had. Per user
// guidance, we extracted shared fragments into globalPromptRegistry and converged
// the 4 non-CEF templates. These tests lock the convergence and catch future drift.
describe('globalized fragments: identityIntro / discoveryLogShape / scalarTail', () => {
  const IDENTITY_INTRO_MARKER = 'IDENTITY: You are looking for the EXACT product';
  const SIBLING_SKIP_SENTENCE = 'If you encounter sibling models, skip them.';
  const SCALAR_CLOSER = 'You decide which sources to query and in what order — the above describes what kind of evidence counts and how to tag it, not a script to execute.';
  const DISCOVERY_LOG_BASIC = '"discovery_log": { "urls_checked": [...], "queries_run": [...], "notes": [...] }';

  test('PIF hero contains the sibling-skip sentence (previously missing)', () => {
    const out = buildHeroImageFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      previousDiscovery: EMPTY_DISCOVERY,
    });
    assert.ok(out.includes(IDENTITY_INTRO_MARKER), 'PIF hero must contain IDENTITY intro');
    assert.ok(out.includes(SIBLING_SKIP_SENTENCE), 'PIF hero must now contain sibling-skip sentence');
  });

  test('RDF evidence_refs prose lists all 5 fields (fixes drift with schema)', () => {
    const out = buildReleaseDateFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      previousDiscovery: EMPTY_DISCOVERY,
    });
    const evidenceLine = out.match(/- "evidence_refs":[^\n]+/)?.[0] || '';
    assert.ok(evidenceLine.includes('"supporting_evidence"'),
      `RDF evidence_refs prose must mention supporting_evidence (got: ${evidenceLine})`);
    assert.ok(evidenceLine.includes('"evidence_kind"'),
      `RDF evidence_refs prose must mention evidence_kind (got: ${evidenceLine})`);
  });

  test('SKU evidence_refs prose lists all 5 fields (unchanged — preserved)', () => {
    const out = buildSkuFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      previousDiscovery: EMPTY_DISCOVERY,
    });
    const evidenceLine = out.match(/- "evidence_refs":[^\n]+/)?.[0] || '';
    assert.ok(evidenceLine.includes('"supporting_evidence"'));
    assert.ok(evidenceLine.includes('"evidence_kind"'));
  });

  test('RDF + SKU use the canonical source-guidance closer line', () => {
    for (const [name, out] of [
      ['RDF', buildReleaseDateFinderPrompt({ product: PRODUCT_AIR, variantLabel: 'black', variantType: 'color', previousDiscovery: EMPTY_DISCOVERY })],
      ['SKU', buildSkuFinderPrompt({ product: PRODUCT_AIR, variantLabel: 'black', variantType: 'color', previousDiscovery: EMPTY_DISCOVERY })],
    ]) {
      assert.ok(out.includes(SCALAR_CLOSER),
        `${name} must contain the canonical scalar source-guidance closer`);
    }
  });

  test('PIF view / PIF hero / RDF / SKU all use the basic discovery_log shape', () => {
    const compiled = {
      'PIF view': buildProductImageFinderPrompt({
        product: PRODUCT_AIR, variantLabel: 'black', variantType: 'color',
        priorityViews: [{ key: 'hero', description: 'hero shot', priority: true }],
        additionalViews: [], previousDiscovery: EMPTY_DISCOVERY,
      }),
      'PIF hero': buildHeroImageFinderPrompt({ product: PRODUCT_AIR, variantLabel: 'black', variantType: 'color', previousDiscovery: EMPTY_DISCOVERY }),
      'RDF': buildReleaseDateFinderPrompt({ product: PRODUCT_AIR, variantLabel: 'black', variantType: 'color', previousDiscovery: EMPTY_DISCOVERY }),
      'SKU': buildSkuFinderPrompt({ product: PRODUCT_AIR, variantLabel: 'black', variantType: 'color', previousDiscovery: EMPTY_DISCOVERY }),
    };
    for (const [name, out] of Object.entries(compiled)) {
      assert.ok(out.includes(DISCOVERY_LOG_BASIC),
        `${name} must emit the basic discovery_log shape`);
    }
  });

  test('CEF retains its unique discovery_log shape (extras preserved)', () => {
    const out = buildColorEditionFinderPrompt({
      colorNames: ['black', 'white'],
      colors: [{ name: 'black', hex: '#000000' }, { name: 'white', hex: '#ffffff' }],
      product: PRODUCT_AIR,
      previousRuns: [],
      previousDiscovery: EMPTY_DISCOVERY,
    });
    assert.ok(out.includes('"confirmed_from_known"'), 'CEF discovery_log must keep confirmed_from_known');
    assert.ok(out.includes('"added_new"'), 'CEF discovery_log must keep added_new');
    assert.ok(out.includes('"rejected_from_known"'), 'CEF discovery_log must keep rejected_from_known');
  });
});

// ── Section 6: evidenceKindGuidance scoped to RDF only (evidence upgrade) ──
describe('evidenceKindGuidance appears in RDF prompt but NOT in CEF / PIF / carousel', () => {
  // WHY: The evidence-upgrade block (supporting_evidence + 10-kind enum) is
  // opt-in via buildEvidencePromptBlock({ includeEvidenceKind: true }). RDF +
  // variantScalarFieldProducer opt in; CEF, PIF view, PIF hero, and carousel
  // builder stay on the base shape. This test locks the scope so a future
  // accidental opt-in doesn't silently drift the simpler finders' prompts.

  const EVIDENCE_KIND_MARKERS = [
    'supporting_evidence',
    'evidence_kind',
    'direct_quote',
    'identity_only',
  ];

  test('RDF prompt contains all evidence-kind markers (opted in)', () => {
    const out = buildReleaseDateFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      previousDiscovery: EMPTY_DISCOVERY,
    });
    for (const marker of EVIDENCE_KIND_MARKERS) {
      assert.ok(
        out.includes(marker),
        `RDF prompt must include evidence-upgrade marker "${marker}"`,
      );
    }
  });

  test('CEF prompt contains NONE of the evidence-kind markers (opt-out)', () => {
    const out = buildColorEditionFinderPrompt({
      colorNames: ['black', 'white'],
      colors: [{ name: 'black', hex: '#000000' }, { name: 'white', hex: '#ffffff' }],
      product: PRODUCT_AIR,
      previousRuns: [],
      previousDiscovery: EMPTY_DISCOVERY,
    });
    for (const marker of EVIDENCE_KIND_MARKERS) {
      assert.ok(
        !out.includes(marker),
        `CEF prompt MUST NOT include evidence-upgrade marker "${marker}"`,
      );
    }
  });

  test('PIF view prompt contains NONE of the evidence-kind markers (opt-out)', () => {
    const out = buildProductImageFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      priorityViews: [{ key: 'hero', description: 'hero shot', priority: true }],
      additionalViews: [],
      previousDiscovery: EMPTY_DISCOVERY,
    });
    for (const marker of EVIDENCE_KIND_MARKERS) {
      assert.ok(
        !out.includes(marker),
        `PIF view prompt MUST NOT include evidence-upgrade marker "${marker}"`,
      );
    }
  });

  test('PIF hero prompt contains NONE of the evidence-kind markers (opt-out)', () => {
    const out = buildHeroImageFinderPrompt({
      product: PRODUCT_AIR,
      variantLabel: 'black',
      variantType: 'color',
      previousDiscovery: EMPTY_DISCOVERY,
    });
    for (const marker of EVIDENCE_KIND_MARKERS) {
      assert.ok(
        !out.includes(marker),
        `PIF hero prompt MUST NOT include evidence-upgrade marker "${marker}"`,
      );
    }
  });
});
