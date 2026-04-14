/**
 * View eval criteria resolver — contract tests.
 *
 * Covers: resolveViewEvalCriteria, resolveHeroEvalCriteria
 * These pure resolvers return category+view specific eval prompt criteria text.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveViewEvalCriteria,
  resolveHeroEvalCriteria,
  CATEGORY_VIEW_EVAL_CRITERIA,
  GENERIC_VIEW_EVAL_CRITERIA,
  CATEGORY_HERO_EVAL_CRITERIA,
  GENERIC_HERO_EVAL_CRITERIA,
  CANONICAL_VIEW_KEYS,
} from '../productImageLlmAdapter.js';

const KNOWN_CATEGORIES = ['mouse', 'keyboard', 'monitor', 'mousepad'];

/* ── resolveViewEvalCriteria ─────────────────────────────────────── */

describe('resolveViewEvalCriteria', () => {
  it('returns category-specific text for mouse + top', () => {
    const result = resolveViewEvalCriteria('mouse', 'top');
    assert.ok(result.length > 0, 'should return non-empty string');
    assert.notEqual(result, GENERIC_VIEW_EVAL_CRITERIA, 'should differ from generic');
  });

  it('returns category-specific text for keyboard + top', () => {
    const result = resolveViewEvalCriteria('keyboard', 'top');
    assert.ok(result.length > 0);
    assert.notEqual(result, GENERIC_VIEW_EVAL_CRITERIA);
  });

  it('returns category-specific text for monitor + front', () => {
    const result = resolveViewEvalCriteria('monitor', 'front');
    assert.ok(result.length > 0);
    assert.notEqual(result, GENERIC_VIEW_EVAL_CRITERIA);
  });

  it('returns generic fallback for unknown category', () => {
    const result = resolveViewEvalCriteria('headset', 'top');
    assert.equal(result, GENERIC_VIEW_EVAL_CRITERIA);
  });

  it('returns generic fallback for unknown view within known category', () => {
    const result = resolveViewEvalCriteria('mouse', 'nonexistent');
    assert.equal(result, GENERIC_VIEW_EVAL_CRITERIA);
  });

  it('returns non-empty for all 32 category × view combos', () => {
    for (const cat of KNOWN_CATEGORIES) {
      for (const view of CANONICAL_VIEW_KEYS) {
        const result = resolveViewEvalCriteria(cat, view);
        assert.ok(result.length > 0, `${cat}/${view} should return non-empty criteria`);
      }
    }
  });

  it('common views have longer criteria than uncommon views', () => {
    // Mouse common views should be more detailed than uncommon ones
    const mouseTop = resolveViewEvalCriteria('mouse', 'top');
    const mouseRear = resolveViewEvalCriteria('mouse', 'rear');
    assert.ok(
      mouseTop.length > mouseRear.length,
      `mouse/top (${mouseTop.length} chars) should be longer than mouse/rear (${mouseRear.length} chars)`,
    );
  });

  it('different categories return different criteria for the same view', () => {
    const mouseTop = resolveViewEvalCriteria('mouse', 'top');
    const keyboardTop = resolveViewEvalCriteria('keyboard', 'top');
    assert.notEqual(mouseTop, keyboardTop, 'mouse/top should differ from keyboard/top');
  });
});

/* ── resolveHeroEvalCriteria ─────────────────────────────────────── */

describe('resolveHeroEvalCriteria', () => {
  it('returns category-specific text for mouse', () => {
    const result = resolveHeroEvalCriteria('mouse');
    assert.ok(result.length > 0);
    assert.notEqual(result, GENERIC_HERO_EVAL_CRITERIA);
  });

  it('returns category-specific text for monitor', () => {
    const result = resolveHeroEvalCriteria('monitor');
    assert.ok(result.length > 0);
    assert.notEqual(result, GENERIC_HERO_EVAL_CRITERIA);
  });

  it('returns generic fallback for unknown category', () => {
    const result = resolveHeroEvalCriteria('headset');
    assert.equal(result, GENERIC_HERO_EVAL_CRITERIA);
  });

  it('returns non-empty for all known categories', () => {
    for (const cat of KNOWN_CATEGORIES) {
      const result = resolveHeroEvalCriteria(cat);
      assert.ok(result.length > 0, `${cat} hero criteria should be non-empty`);
    }
  });

  it('all category hero criteria contain disqualification gates matching view eval rigor', () => {
    for (const cat of KNOWN_CATEGORIES) {
      const result = resolveHeroEvalCriteria(cat);
      const lower = result.toLowerCase();
      assert.ok(lower.includes('watermark'), `${cat} hero criteria must mention watermarks`);
      assert.ok(lower.includes('wrong') || lower.includes('identity'), `${cat} hero criteria must mention wrong product / identity`);
      assert.ok(lower.includes('resolution'), `${cat} hero criteria must mention resolution`);
    }
  });

  it('all category hero criteria contain explicit diversity requirement', () => {
    for (const cat of KNOWN_CATEGORIES) {
      const result = resolveHeroEvalCriteria(cat);
      const lower = result.toLowerCase();
      const hasDiversity = lower.includes('different') && (lower.includes('perspective') || lower.includes('angle') || lower.includes('composition') || lower.includes('shot'));
      assert.ok(hasDiversity, `${cat} hero criteria must require different perspectives/shots`);
    }
  });

  it('generic hero criteria contain disqualification gates', () => {
    const lower = GENERIC_HERO_EVAL_CRITERIA.toLowerCase();
    assert.ok(lower.includes('watermark'), 'generic hero criteria must mention watermarks');
    assert.ok(lower.includes('wrong') || lower.includes('identity'), 'generic hero criteria must mention wrong product / identity');
    assert.ok(lower.includes('resolution'), 'generic hero criteria must mention resolution');
  });

  it('generic hero criteria contain explicit diversity requirement', () => {
    const lower = GENERIC_HERO_EVAL_CRITERIA.toLowerCase();
    const hasDiversity = lower.includes('different') && (lower.includes('perspective') || lower.includes('angle') || lower.includes('composition') || lower.includes('shot'));
    assert.ok(hasDiversity, 'generic hero criteria must require different perspectives/shots');
  });
});

/* ── Data shape guards ───────────────────────────────────────────── */

describe('eval criteria data shape', () => {
  it('CATEGORY_VIEW_EVAL_CRITERIA has entries for all known categories', () => {
    for (const cat of KNOWN_CATEGORIES) {
      assert.ok(CATEGORY_VIEW_EVAL_CRITERIA[cat], `missing category: ${cat}`);
    }
  });

  it('each category has entries for all 8 canonical views', () => {
    for (const cat of KNOWN_CATEGORIES) {
      for (const view of CANONICAL_VIEW_KEYS) {
        assert.ok(
          typeof CATEGORY_VIEW_EVAL_CRITERIA[cat][view] === 'string' &&
          CATEGORY_VIEW_EVAL_CRITERIA[cat][view].length > 0,
          `${cat}/${view} should be a non-empty string`,
        );
      }
    }
  });

  it('CATEGORY_HERO_EVAL_CRITERIA has entries for all known categories', () => {
    for (const cat of KNOWN_CATEGORIES) {
      assert.ok(
        typeof CATEGORY_HERO_EVAL_CRITERIA[cat] === 'string' &&
        CATEGORY_HERO_EVAL_CRITERIA[cat].length > 0,
        `missing hero criteria for: ${cat}`,
      );
    }
  });

  it('GENERIC_VIEW_EVAL_CRITERIA is a non-empty string', () => {
    assert.ok(typeof GENERIC_VIEW_EVAL_CRITERIA === 'string');
    assert.ok(GENERIC_VIEW_EVAL_CRITERIA.length > 0);
  });

  it('GENERIC_HERO_EVAL_CRITERIA is a non-empty string', () => {
    assert.ok(typeof GENERIC_HERO_EVAL_CRITERIA === 'string');
    assert.ok(GENERIC_HERO_EVAL_CRITERIA.length > 0);
  });
});
