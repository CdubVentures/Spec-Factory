// WHY: Each EG preset declares variant_dependent at the field rule top level.
// The value depends on whether the field is a variant GENERATOR (colors/editions —
// the field values ARE the variants) or a variant ATTRIBUTE (release_date — each
// variant has its own value for an orthogonal field).
//
//   colors        — variant-generator → variant_dependent: false
//   editions      — variant-generator → variant_dependent: false
//   release_date  — variant-attribute → variant_dependent: true
//
// Adding a 4th EG default later: if it's a variant-attribute (discontinued, SKU,
// per-variant price), its builder sets variant_dependent: true and this test
// grows by one case. If it's another variant-generator, false.

import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import {
  buildEgColorFieldRule,
  buildEgEditionFieldRule,
  buildEgReleaseDateFieldRule,
  EG_EDITABLE_PATHS,
  sanitizeEgLockedOverrides,
  resolveEgLockedKeys,
} from '../egPresets.js';

describe('EG preset variant_dependent declarations', () => {
  it('colors is a variant-generator → variant_dependent: false', () => {
    strictEqual(buildEgColorFieldRule({}).variant_dependent, false);
  });

  it('editions is a variant-generator → variant_dependent: false', () => {
    strictEqual(buildEgEditionFieldRule({}).variant_dependent, false);
  });

  it('release_date is a variant-attribute → variant_dependent: true', () => {
    strictEqual(buildEgReleaseDateFieldRule({}).variant_dependent, true);
  });
});

describe('variant_dependent is locked on EG-managed fields', () => {
  it('variant_dependent is NOT in EG_EDITABLE_PATHS (structural, not user-editable)', () => {
    strictEqual(EG_EDITABLE_PATHS.includes('variant_dependent'), false);
  });

  it('sanitizeEgLockedOverrides resets a user attempt to flip release_date.variant_dependent false → true (preset wins)', () => {
    // User tried to flip release_date's variant_dependent off. Because the field is
    // EG-locked and variant_dependent is NOT in EG_EDITABLE_PATHS, the override is
    // discarded on save — preset value (true) wins.
    const overrides = { release_date: { variant_dependent: false } };
    const egToggles = { colors: true, editions: true, release_date: true };
    const sanitized = sanitizeEgLockedOverrides(overrides, egToggles, {});
    strictEqual(sanitized.release_date.variant_dependent, true);
  });

  it('sanitizeEgLockedOverrides resets a user attempt to flip colors.variant_dependent true → false (preset wins)', () => {
    // Symmetric: user tried to flip colors on. Sanitizer resets to preset (false).
    const overrides = { colors: { variant_dependent: true } };
    const egToggles = { colors: true, editions: true, release_date: true };
    const sanitized = sanitizeEgLockedOverrides(overrides, egToggles, {});
    strictEqual(sanitized.colors.variant_dependent, false);
  });

  it('resolveEgLockedKeys returns all three EG defaults (no regression)', () => {
    const active = resolveEgLockedKeys({ colors: true, editions: true, release_date: true });
    strictEqual(active.length, 3);
    strictEqual(active.includes('colors'), true);
    strictEqual(active.includes('editions'), true);
    strictEqual(active.includes('release_date'), true);
  });
});
