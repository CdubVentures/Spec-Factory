/**
 * Contract tests for unified identity-warning + siblings-exclusion builders.
 *
 * These are the single source of truth for prompt text shared by CEF, PIF,
 * RDF. Any future finder should consume these builders — do not re-inline.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentityWarning, buildSiblingsLine } from '../identityContext.js';
import { setGlobalPromptsSnapshot } from '../globalPromptStore.js';

const FIELD_NOUNS = ['colors or editions', 'product images', 'release dates'];

afterEach(() => setGlobalPromptsSnapshot({}));

describe('buildIdentityWarning — tier behavior', () => {
  beforeEach(() => setGlobalPromptsSnapshot({}));

  it('easy tier with familyModelCount=1 emits positive "no known siblings" line', () => {
    const out = buildIdentityWarning({
      familyModelCount: 1, ambiguityLevel: 'easy',
      brand: 'Corsair', model: 'M75', siblingModels: [],
      fieldDomainNoun: 'colors or editions',
    });
    assert.ok(out.includes('no known siblings'));
    assert.ok(!out.includes('CAUTION'));
    assert.ok(!out.includes('HIGH AMBIGUITY'));
  });

  it('medium tier emits CAUTION with count, brand, model, fieldDomainNoun', () => {
    const out = buildIdentityWarning({
      familyModelCount: 3, ambiguityLevel: 'medium',
      brand: 'Corsair', model: 'M75 Air Wireless', siblingModels: [],
      fieldDomainNoun: 'colors or editions',
    });
    assert.ok(out.includes('CAUTION'));
    assert.ok(out.includes('3 models'));
    assert.ok(out.includes('Corsair'));
    assert.ok(out.includes('M75 Air Wireless'));
    assert.ok(out.includes('colors or editions'));
  });

  it('hard tier emits HIGH AMBIGUITY + TRIPLE-CHECK', () => {
    const out = buildIdentityWarning({
      familyModelCount: 8, ambiguityLevel: 'hard',
      brand: 'Logitech', model: 'G502 X', siblingModels: [],
      fieldDomainNoun: 'product images',
    });
    assert.ok(out.includes('HIGH AMBIGUITY'));
    assert.ok(out.includes('TRIPLE-CHECK'));
    assert.ok(out.includes('8 models'));
    assert.ok(out.includes('G502 X'));
    assert.ok(out.includes('product images'));
  });

  it('"high" alias maps to hard tier', () => {
    const out = buildIdentityWarning({
      familyModelCount: 4, ambiguityLevel: 'high',
      brand: 'Razer', model: 'Viper', siblingModels: [], fieldDomainNoun: 'release dates',
    });
    assert.ok(out.includes('HIGH AMBIGUITY'));
  });

  it('familyModelCount<=1 forces easy tier even if ambiguityLevel says medium', () => {
    const out = buildIdentityWarning({
      familyModelCount: 1, ambiguityLevel: 'medium',
      brand: 'x', model: 'y', siblingModels: [], fieldDomainNoun: 'release dates',
    });
    assert.ok(out.includes('no known siblings'));
    assert.ok(!out.includes('CAUTION'));
  });

  it('normalizes familyModelCount — zero/negative/NaN → 1 (easy)', () => {
    for (const bad of [0, -5, NaN, null, undefined]) {
      const out = buildIdentityWarning({
        familyModelCount: bad, ambiguityLevel: 'medium',
        brand: 'x', model: 'y', siblingModels: [], fieldDomainNoun: 'release dates',
      });
      assert.ok(out.includes('no known siblings'), `familyModelCount=${bad} should fall to easy tier`);
    }
  });
});

describe('buildIdentityWarning — siblings integration', () => {
  beforeEach(() => setGlobalPromptsSnapshot({}));

  it('empty siblingModels emits warning without sibling list', () => {
    const out = buildIdentityWarning({
      familyModelCount: 3, ambiguityLevel: 'medium',
      brand: 'x', model: 'y', siblingModels: [], fieldDomainNoun: 'release dates',
    });
    assert.ok(out.includes('CAUTION'));
    assert.ok(!out.includes('This product is NOT'));
  });

  it('non-empty siblingModels appends sibling list after warning', () => {
    const out = buildIdentityWarning({
      familyModelCount: 3, ambiguityLevel: 'medium',
      brand: 'x', model: 'y',
      siblingModels: ['M75 RGB', 'M75 Wireless'],
      fieldDomainNoun: 'colors or editions',
    });
    assert.ok(out.includes('CAUTION'));
    assert.ok(out.includes('This product is NOT: M75 RGB, M75 Wireless'));
    assert.ok(out.includes('colors or editions'));
  });

  it('siblings attach to easy tier too when provided', () => {
    const out = buildIdentityWarning({
      familyModelCount: 1, ambiguityLevel: 'easy',
      brand: 'x', model: 'y',
      siblingModels: ['Sibling1'],
      fieldDomainNoun: 'product images',
    });
    assert.ok(out.includes('no known siblings') || out.includes('This product is NOT'));
  });
});

describe('buildIdentityWarning — fieldDomainNoun variable injection', () => {
  beforeEach(() => setGlobalPromptsSnapshot({}));

  for (const noun of FIELD_NOUNS) {
    it(`medium tier includes fieldDomainNoun="${noun}"`, () => {
      const out = buildIdentityWarning({
        familyModelCount: 2, ambiguityLevel: 'medium',
        brand: 'x', model: 'y', siblingModels: [], fieldDomainNoun: noun,
      });
      assert.ok(out.includes(noun));
    });

    it(`hard tier includes fieldDomainNoun="${noun}"`, () => {
      const out = buildIdentityWarning({
        familyModelCount: 5, ambiguityLevel: 'hard',
        brand: 'x', model: 'y', siblingModels: [], fieldDomainNoun: noun,
      });
      assert.ok(out.includes(noun));
    });
  }
});

describe('buildIdentityWarning — global override integration', () => {
  beforeEach(() => setGlobalPromptsSnapshot({}));

  it('non-empty global override replaces medium template text', () => {
    setGlobalPromptsSnapshot({
      identityWarningMedium: 'CUSTOM MEDIUM WARNING for {{MODEL}}',
    });
    const out = buildIdentityWarning({
      familyModelCount: 2, ambiguityLevel: 'medium',
      brand: 'x', model: 'MyModel', siblingModels: [], fieldDomainNoun: 'release dates',
    });
    assert.ok(out.includes('CUSTOM MEDIUM WARNING for MyModel'));
    assert.ok(!out.includes('CAUTION'));
  });

  it('empty string override falls back to default', () => {
    setGlobalPromptsSnapshot({ identityWarningMedium: '' });
    const out = buildIdentityWarning({
      familyModelCount: 2, ambiguityLevel: 'medium',
      brand: 'x', model: 'y', siblingModels: [], fieldDomainNoun: 'release dates',
    });
    assert.ok(out.includes('CAUTION'));
  });
});

describe('buildSiblingsLine', () => {
  beforeEach(() => setGlobalPromptsSnapshot({}));

  it('empty siblingModels returns empty string', () => {
    assert.equal(buildSiblingsLine({ siblingModels: [], fieldDomainNoun: 'release dates' }), '');
  });

  it('null/undefined siblingModels returns empty string', () => {
    assert.equal(buildSiblingsLine({ siblingModels: null, fieldDomainNoun: 'x' }), '');
    assert.equal(buildSiblingsLine({ siblingModels: undefined, fieldDomainNoun: 'x' }), '');
  });

  it('non-array siblingModels returns empty string', () => {
    assert.equal(buildSiblingsLine({ siblingModels: 'not-array', fieldDomainNoun: 'x' }), '');
  });

  it('filters falsy values from siblingModels', () => {
    const out = buildSiblingsLine({
      siblingModels: ['Real', '', null, 'Also'],
      fieldDomainNoun: 'release dates',
    });
    assert.ok(out.includes('Real, Also'));
    assert.ok(!out.includes('null'));
  });

  it('returns text with sibling list + fieldDomainNoun', () => {
    const out = buildSiblingsLine({
      siblingModels: ['A', 'B', 'C'],
      fieldDomainNoun: 'colors or editions',
    });
    assert.ok(out.includes('This product is NOT: A, B, C'));
    assert.ok(out.includes('colors or editions'));
  });

  it('respects global override', () => {
    setGlobalPromptsSnapshot({
      siblingsExclusion: 'AVOID: {{SIBLING_LIST}} for {{FIELD_DOMAIN_NOUN}}',
    });
    const out = buildSiblingsLine({
      siblingModels: ['X', 'Y'], fieldDomainNoun: 'release dates',
    });
    assert.equal(out, 'AVOID: X, Y for release dates');
  });
});
