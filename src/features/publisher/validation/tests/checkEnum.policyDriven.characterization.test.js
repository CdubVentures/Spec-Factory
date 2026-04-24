// WHY: Golden-master characterization tests proving policy alone determines
// checkEnum behavior. Must be GREEN before any match_strategy retirement code changes.
// See: docs/implementation/field-rules-studio/match-strategy-retirement-roadmap.md

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkEnum } from '../checks/checkEnum.js';

const COLOR_KNOWN = ['black', 'white', 'red'];
const SWITCH_KNOWN = ['Cherry MX Red', 'Cherry MX Brown', 'Cherry MX Blue'];
const LIGHTING_KNOWN = ['3 Zone (RGB)', '4 Zone (RGB)', 'None'];

// ── closed — reject unknowns deterministically ─────────────────────────────

describe('characterization: closed policy — reject unknowns deterministically', () => {
  it('exact match → pass', () => {
    const r = checkEnum('black', 'closed', COLOR_KNOWN, 'exact');
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, []);
    assert.equal(r.needsReview, false);
  });

  it('case mismatch → flag unknown', () => {
    const r = checkEnum('Black', 'closed', COLOR_KNOWN, 'exact');
    assert.equal(r.pass, false);
    assert.deepStrictEqual(r.unknown, ['Black']);
    assert.equal(r.needsReview, true);
  });

  it('unknown value → flag unknown', () => {
    const r = checkEnum('teal', 'closed', COLOR_KNOWN, 'exact');
    assert.equal(r.pass, false);
    assert.deepStrictEqual(r.unknown, ['teal']);
    assert.equal(r.needsReview, true);
  });

  it('plus-atom both known → pass', () => {
    const r = checkEnum('black+red', 'closed', COLOR_KNOWN, 'exact');
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, []);
  });

  it('plus-atom unknown atom → flag unknown', () => {
    const r = checkEnum('black+pink', 'closed', COLOR_KNOWN, 'exact');
    assert.equal(r.pass, false);
    assert.deepStrictEqual(r.unknown, ['pink']);
    assert.equal(r.needsReview, true);
  });

  it('null (absence) always passes', () => {
    const r = checkEnum(null, 'closed', COLOR_KNOWN, 'exact');
    assert.equal(r.pass, true);
    assert.equal(r.needsReview, false);
  });
});

// ── open_prefer_known — alias resolution, accept new values ─────────────────

describe('characterization: open_prefer_known policy — alias resolution, accept new values', () => {
  it('exact match → pass, no repair', () => {
    const r = checkEnum('Cherry MX Red', 'open_prefer_known', SWITCH_KNOWN, 'alias');
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, []);
    assert.equal(r.needsReview, false);
    assert.equal(r.repaired, undefined);
  });

  it('case mismatch → alias repair to canonical', () => {
    const r = checkEnum('cherry mx red', 'open_prefer_known', SWITCH_KNOWN, 'alias');
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, []);
    assert.equal(r.needsReview, false);
    assert.equal(r.repaired, 'Cherry MX Red');
  });

  it('uppercase → alias repair to canonical', () => {
    const r = checkEnum('CHERRY MX BROWN', 'open_prefer_known', SWITCH_KNOWN, 'alias');
    assert.equal(r.pass, true);
    assert.equal(r.repaired, 'Cherry MX Brown');
  });

  it('normalized match (hyphens vs spaces) → alias repair', () => {
    const r = checkEnum('3-zone-(rgb)', 'open_prefer_known', LIGHTING_KNOWN, 'alias');
    assert.equal(r.pass, true);
    assert.equal(r.repaired, '3 Zone (RGB)');
    assert.equal(r.needsReview, false);
  });

  it('truly unknown value → accept + flag unknown', () => {
    const r = checkEnum('Gateron Red', 'open_prefer_known', SWITCH_KNOWN, 'alias');
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, ['Gateron Red']);
    assert.equal(r.needsReview, true);
    assert.equal(r.repaired, undefined);
  });

  it('plus-atom case mismatch → alias repair atoms', () => {
    const r = checkEnum('Black+White', 'open_prefer_known', COLOR_KNOWN, 'alias');
    assert.equal(r.pass, true);
    assert.equal(r.repaired, 'black+white');
    assert.equal(r.needsReview, false);
  });

  it('plus-atom one unknown → accept + flag', () => {
    const r = checkEnum('black+pink', 'open_prefer_known', COLOR_KNOWN, 'alias');
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, ['pink']);
    assert.equal(r.needsReview, true);
  });
});

// ── open — accept everything ────────────────────────────────────────────────

describe('characterization: open policy — accept everything', () => {
  it('known value → pass', () => {
    const r = checkEnum('black', 'open', COLOR_KNOWN, 'alias');
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, []);
    assert.equal(r.needsReview, false);
  });

  it('unknown value → pass', () => {
    const r = checkEnum('anything-goes', 'open', COLOR_KNOWN, 'alias');
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, []);
    assert.equal(r.needsReview, false);
  });

  it('case mismatch → pass (no repair needed)', () => {
    const r = checkEnum('Black', 'open', COLOR_KNOWN, 'alias');
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, []);
    assert.equal(r.needsReview, false);
  });

  // WHY: 7 anomaly fields have open+exact — proves strategy is irrelevant for open.
  it('with exact strategy → same result as alias', () => {
    const rExact = checkEnum('anything-goes', 'open', COLOR_KNOWN, 'exact');
    const rAlias = checkEnum('anything-goes', 'open', COLOR_KNOWN, 'alias');
    assert.equal(rExact.pass, rAlias.pass);
    assert.deepStrictEqual(rExact.unknown, rAlias.unknown);
    assert.equal(rExact.needsReview, rAlias.needsReview);
  });

  it('case mismatch with exact strategy → still passes', () => {
    const r = checkEnum('Black', 'open', COLOR_KNOWN, 'exact');
    assert.equal(r.pass, true);
    assert.deepStrictEqual(r.unknown, []);
    assert.equal(r.needsReview, false);
  });
});
