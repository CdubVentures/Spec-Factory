import { describe, it } from 'node:test';
import { ok, strictEqual, deepStrictEqual } from 'node:assert';
import {
  BILLING_CALL_TYPE_REGISTRY,
  BILLING_CALL_TYPE_MAP,
  BILLING_CALL_TYPE_FALLBACK,
  resolveBillingCallType,
} from '../billingCallTypeRegistry.ts';
import type { BillingCallTypeEntry } from '../billingCallTypeRegistry.ts';

// WHY: All 15 verified reason keys from createPhaseCallLlm specs across the codebase.
const KNOWN_REASONS = [
  'needset_search_planner',
  'brand_resolution',
  'search_planner_enhance',
  'serp_url_selector',
  'product_image_finding',
  'image_view_evaluation',
  'image_hero_selection',
  'hero_image_finding',
  'color_edition_finding',
  'variant_identity_check',
  'validate_enum_consistency',
  'validate_component_matches',
  'field_repair',
  'health',
  'extract',
] as const;

describe('BILLING_CALL_TYPE_REGISTRY', () => {
  it('is frozen (immutable)', () => {
    ok(Object.isFrozen(BILLING_CALL_TYPE_REGISTRY));
  });

  it('every entry has non-empty reason, label, and color', () => {
    for (const entry of BILLING_CALL_TYPE_REGISTRY) {
      ok(entry.reason.length > 0, `entry has empty reason`);
      ok(entry.label.length > 0, `"${entry.reason}" has empty label`);
      ok(entry.color.length > 0, `"${entry.reason}" has empty color`);
    }
  });

  it('has no duplicate reason keys', () => {
    const reasons = BILLING_CALL_TYPE_REGISTRY.map((e) => e.reason);
    strictEqual(new Set(reasons).size, reasons.length, 'duplicate reason keys found');
  });

  it('includes all known pipeline reason keys', () => {
    const registered = new Set(BILLING_CALL_TYPE_REGISTRY.map((e) => e.reason));
    for (const reason of KNOWN_REASONS) {
      ok(registered.has(reason), `missing reason: "${reason}"`);
    }
  });

  it('all colors use semantic var(--) tokens', () => {
    for (const entry of BILLING_CALL_TYPE_REGISTRY) {
      ok(entry.color.startsWith('var(--'), `"${entry.reason}" color "${entry.color}" must use var(--) token`);
    }
  });
});

describe('BILLING_CALL_TYPE_MAP', () => {
  it('covers every registry entry', () => {
    for (const entry of BILLING_CALL_TYPE_REGISTRY) {
      deepStrictEqual(BILLING_CALL_TYPE_MAP[entry.reason], entry);
    }
  });
});

describe('resolveBillingCallType', () => {
  it('returns the correct entry for known reasons', () => {
    const cef = resolveBillingCallType('color_edition_finding');
    strictEqual(cef.label, 'CEF');
    ok(cef.color.startsWith('var(--'));

    const vid = resolveBillingCallType('variant_identity_check');
    strictEqual(vid.label, 'Variant ID');
  });

  it('returns fallback for unknown reasons', () => {
    deepStrictEqual(resolveBillingCallType('totally_made_up'), BILLING_CALL_TYPE_FALLBACK);
  });

  it('returns fallback for empty string', () => {
    deepStrictEqual(resolveBillingCallType(''), BILLING_CALL_TYPE_FALLBACK);
  });
});

describe('BILLING_CALL_TYPE_FALLBACK', () => {
  it('is frozen and has the expected shape', () => {
    ok(Object.isFrozen(BILLING_CALL_TYPE_FALLBACK));
    strictEqual(BILLING_CALL_TYPE_FALLBACK.label, 'Other');
    ok(BILLING_CALL_TYPE_FALLBACK.color.startsWith('var(--'));
  });
});
