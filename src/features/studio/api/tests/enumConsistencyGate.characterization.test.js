// WHY: Golden-master characterization tests for isEnumConsistencyReviewEnabled().
// Currently gates on both enum.match.strategy AND enum.match.format_hint consumers.
// After retirement, gates on format_hint only. Must be GREEN before Phase 2.
// See: docs/implementation/field-rules-studio/match-strategy-retirement-roadmap.md

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isEnumConsistencyReviewEnabled } from '../studioRouteHelpers.js';

// ── Lock down current behavior ──────────────────────────────────────────────

const GATE_CASES = [
  {
    label: 'no consumers block → enabled',
    rule: { enum: { policy: 'open_prefer_known' } },
    expected: true,
  },
  {
    label: 'empty consumers → enabled',
    rule: { enum: { policy: 'open_prefer_known' }, consumers: {} },
    expected: true,
  },
  {
    label: 'both strategy:false + format_hint:false → disabled',
    rule: {
      consumers: {
        'enum.match.strategy': { review: false },
        'enum.match.format_hint': { review: false },
      },
    },
    expected: false,
  },
  {
    label: 'only format_hint:false → disabled',
    rule: {
      consumers: {
        'enum.match.format_hint': { review: false },
      },
    },
    expected: false,
  },
  {
    label: 'only strategy:false → enabled (strategy no longer checked)',
    rule: {
      consumers: {
        'enum.match.strategy': { review: false },
      },
    },
    expected: true,
  },
  {
    label: 'both strategy:true + format_hint:true → enabled',
    rule: {
      consumers: {
        'enum.match.strategy': { review: true },
        'enum.match.format_hint': { review: true },
      },
    },
    expected: true,
  },
  {
    label: 'strategy:false + format_hint:true → enabled (strategy no longer checked)',
    rule: {
      consumers: {
        'enum.match.strategy': { review: false },
        'enum.match.format_hint': { review: true },
      },
    },
    expected: true,
  },
  {
    label: 'strategy:true + format_hint:false → disabled',
    rule: {
      consumers: {
        'enum.match.strategy': { review: true },
        'enum.match.format_hint': { review: false },
      },
    },
    expected: false,
  },
];

describe('characterization: isEnumConsistencyReviewEnabled current behavior', () => {
  for (const { label, rule, expected } of GATE_CASES) {
    it(label, () => {
      assert.equal(isEnumConsistencyReviewEnabled(rule), expected);
    });
  }

  it('undefined rule → enabled (safe default)', () => {
    assert.equal(isEnumConsistencyReviewEnabled(undefined), true);
  });

  it('empty rule → enabled', () => {
    assert.equal(isEnumConsistencyReviewEnabled({}), true);
  });
});

// ── Document known acceptable behavior changes after retirement ─────────────

// WHY: After retirement, the gate checks format_hint consumer only.
// These 2 cases change from disabled → enabled. Grep confirms zero production
// data sets strategy:false without also setting format_hint:false.
// Every EG preset and control-plane consumer override disables BOTH together.

// WHY: These 2 cases changed behavior after match_strategy retirement (Phase 2).
// strategy:false no longer blocks — gate checks format_hint only.
// Grep confirms zero production data uses strategy:false without format_hint:false.
describe('post-retirement: strategy consumer no longer gates', () => {
  it('strategy:false only → now enabled (format_hint defaults true)', () => {
    const rule = {
      consumers: { 'enum.match.strategy': { review: false } },
    };
    assert.equal(isEnumConsistencyReviewEnabled(rule), true);
  });

  it('strategy:false + format_hint:true → now enabled', () => {
    const rule = {
      consumers: {
        'enum.match.strategy': { review: false },
        'enum.match.format_hint': { review: true },
      },
    };
    assert.equal(isEnumConsistencyReviewEnabled(rule), true);
  });
});
