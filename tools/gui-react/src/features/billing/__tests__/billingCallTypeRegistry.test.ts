import { describe, it } from 'node:test';
import { ok, strictEqual, deepStrictEqual } from 'node:assert';
import {
  BILLING_CALL_TYPE_REGISTRY,
  BILLING_CALL_TYPE_MAP,
  BILLING_CALL_TYPE_FALLBACK,
  BILLING_CALL_TYPE_GROUPS,
  resolveBillingCallType,
} from '../billingCallTypeRegistry.generated.ts';
// @ts-expect-error JS import — backend SSOT with no TS declaration
import { LLM_PHASE_DEFS } from '../../../../../../src/core/config/llmPhaseDefs.js';

// WHY: SSOT drift detector. The registry is generated from `billing` blocks
// on LLM_PHASE_DEFS entries. Any phase that declares a `billing.reasons[]`
// must appear in the registry and vice versa — no hand-maintained parallel list.
function expectedReasonsFromPhaseDefs(): string[] {
  const reasons: string[] = [];
  for (const phase of LLM_PHASE_DEFS as Array<{ billing?: { reasons?: Array<{ reason: string }> } }>) {
    if (!phase.billing || !Array.isArray(phase.billing.reasons)) continue;
    for (const r of phase.billing.reasons) reasons.push(r.reason);
  }
  return reasons;
}

describe('BILLING_CALL_TYPE_REGISTRY', () => {
  it('is frozen (immutable)', () => {
    ok(Object.isFrozen(BILLING_CALL_TYPE_REGISTRY));
  });

  it('every entry has non-empty reason, label, color, and group', () => {
    for (const entry of BILLING_CALL_TYPE_REGISTRY) {
      ok(entry.reason.length > 0, `entry has empty reason`);
      ok(entry.label.length > 0, `"${entry.reason}" has empty label`);
      ok(entry.color.length > 0, `"${entry.reason}" has empty color`);
      ok(entry.group.length > 0, `"${entry.reason}" has empty group`);
    }
  });

  it('has no duplicate reason keys', () => {
    const reasons = BILLING_CALL_TYPE_REGISTRY.map((e) => e.reason);
    strictEqual(new Set(reasons).size, reasons.length, 'duplicate reason keys found');
  });

  it('covers every reason declared in LLM_PHASE_DEFS billing blocks', () => {
    const registered = new Set(BILLING_CALL_TYPE_REGISTRY.map((e) => e.reason));
    for (const reason of expectedReasonsFromPhaseDefs()) {
      ok(registered.has(reason), `missing reason: "${reason}"`);
    }
  });

  it('contains no reasons outside LLM_PHASE_DEFS billing blocks', () => {
    const expected = new Set(expectedReasonsFromPhaseDefs());
    for (const entry of BILLING_CALL_TYPE_REGISTRY) {
      ok(expected.has(entry.reason), `orphan reason in registry: "${entry.reason}" (not declared in LLM_PHASE_DEFS)`);
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

  it('resolves active generated finder reasons', () => {
    strictEqual(resolveBillingCallType('writer_formatting').group, 'Writer');
    strictEqual(resolveBillingCallType('release_date_finding').group, 'Release Date');
    strictEqual(resolveBillingCallType('key_finding_easy').group, 'Key Finder');
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
    strictEqual(BILLING_CALL_TYPE_FALLBACK.group, 'Other');
  });
});

describe('BILLING_CALL_TYPE_GROUPS', () => {
  it('derives unique ordered groups from registry', () => {
    ok(Array.isArray(BILLING_CALL_TYPE_GROUPS));
    ok(BILLING_CALL_TYPE_GROUPS.length > 0);
    strictEqual(new Set(BILLING_CALL_TYPE_GROUPS).size, BILLING_CALL_TYPE_GROUPS.length, 'groups must be unique');
  });

  it('every registry entry belongs to a listed group', () => {
    const groupSet = new Set(BILLING_CALL_TYPE_GROUPS);
    for (const entry of BILLING_CALL_TYPE_REGISTRY) {
      ok(groupSet.has(entry.group), `"${entry.reason}" has unknown group "${entry.group}"`);
    }
  });
});
