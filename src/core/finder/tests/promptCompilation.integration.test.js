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
import { FINDER_PHASE_SCHEMAS } from '../../../features/indexing/pipeline/shared/phaseSchemaRegistry.generated.js';
import { FINDER_MODULES } from '../finderModuleRegistry.js';

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
