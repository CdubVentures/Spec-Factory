import { describe, it } from 'node:test';
import { ok, strictEqual } from 'node:assert';
import {
  METHOD_BADGE_REGISTRY,
  TIER_BADGE_REGISTRY,
  resolveMethodBadge,
  resolveTierBadge,
  resolveStatusBadge,
  resolveWorkerStateBadge,
  resolveFieldStatusBadge,
  resolveFallbackResultBadge,
  resolveFetchModeBadge,
  resolveQueueStatusBadge,
  resolveLlmCallStatusBadge,
  resolveSerpSelectorDecisionBadge,
  resolveDomainRoleBadge,
  resolveSafetyClassBadge,
  resolveNeedsetState,
  resolveNeedsetBucket,
  resolveIdentityBadge,
  resolveBlockerBadge,
  resolveBrandResolutionBadge,
  resolveSkipReasonLabel,
  resolveConfidenceRingClass,
  resolveConfidenceTextClass,
  resolveApprovalBadge,
  resolveGateBadge,
  resolveLlmReasonBadge,
} from '../badgeRegistries.ts';

function assertChipFamily(actual: string, family: string) {
  ok(actual.includes(`sf-chip-${family}`), `expected "${actual}" to include "sf-chip-${family}"`);
}

function registerChipFamilyCases(
  name: string,
  resolver: (value: string) => string,
  cases: Array<[string, string]>,
) {
  describe(name, () => {
    for (const [input, family] of cases) {
      it(`maps "${input}" to the ${family} chip family`, () => {
        assertChipFamily(resolver(input), family);
      });
    }

    it('falls back to neutral for unknown input', () => {
      assertChipFamily(resolver('__unknown__'), 'neutral');
    });
  });
}

describe('resolveMethodBadge', () => {
  it('gives every configured method a visible label and chip badge', () => {
    for (const [key, entry] of Object.entries(METHOD_BADGE_REGISTRY)) {
      ok(entry.label.length > 0, `expected ${key} to have a non-empty label`);
      assertChipFamily(entry.badge, entry.badge.replace('sf-chip-', '').split(' ')[0]);
    }
  });

  it('preserves human-readable labels for special method names', () => {
    strictEqual(resolveMethodBadge('json_ld').label, 'JSON-LD');
    strictEqual(resolveMethodBadge('opengraph').label, 'OpenGraph');
    strictEqual(resolveMethodBadge('scanned_pdf_ocr').label, 'Scanned PDF (OCR)');
  });

  it('falls back to a neutral badge with an empty label for unknown methods', () => {
    const result = resolveMethodBadge('__unknown__');
    strictEqual(result.label, '');
    strictEqual(result.badge, 'sf-chip-neutral');
  });
});

describe('resolveTierBadge', () => {
  it('keeps the canonical tier labels and badge families', () => {
    strictEqual(TIER_BADGE_REGISTRY[1].label, 'T1 Official');
    strictEqual(TIER_BADGE_REGISTRY[2].label, 'T2 Lab Review');
    strictEqual(TIER_BADGE_REGISTRY[3].label, 'T3 Retail');
    strictEqual(TIER_BADGE_REGISTRY[4].label, 'T4 Unverified');
    assertChipFamily(resolveTierBadge(1).badge, 'success');
    assertChipFamily(resolveTierBadge(2).badge, 'info');
    assertChipFamily(resolveTierBadge(3).badge, 'warning');
    assertChipFamily(resolveTierBadge(4).badge, 'neutral');
  });

  it('falls back to a neutral "-" tier for null or unknown values', () => {
    strictEqual(resolveTierBadge(null).label, '-');
    strictEqual(resolveTierBadge(99).label, '-');
    assertChipFamily(resolveTierBadge(null).badge, 'neutral');
    assertChipFamily(resolveTierBadge(99).badge, 'neutral');
  });
});

registerChipFamilyCases('resolveStatusBadge', resolveStatusBadge, [
  ['running', 'info'],
  ['fetching', 'success'],
  ['completed', 'success'],
  ['stuck', 'danger'],
  ['skipped', 'warning'],
]);

registerChipFamilyCases('resolveWorkerStateBadge', resolveWorkerStateBadge, [
  ['running', 'info'],
  ['blocked', 'warning'],
  ['captcha', 'danger'],
  ['queued', 'neutral'],
]);

registerChipFamilyCases('resolveFieldStatusBadge', resolveFieldStatusBadge, [
  ['accepted', 'success'],
  ['candidate', 'info'],
  ['unknown', 'warning'],
  ['conflict', 'danger'],
]);

registerChipFamilyCases('resolveFallbackResultBadge', resolveFallbackResultBadge, [
  ['succeeded', 'success'],
  ['pending', 'info'],
  ['exhausted', 'danger'],
]);

registerChipFamilyCases('resolveFetchModeBadge', resolveFetchModeBadge, [
  ['playwright', 'accent'],
  ['crawlee', 'info'],
  ['http', 'success'],
]);

registerChipFamilyCases('resolveQueueStatusBadge', resolveQueueStatusBadge, [
  ['queued', 'info'],
  ['running', 'info'],
  ['done', 'success'],
  ['cooldown', 'warning'],
  ['failed', 'danger'],
]);

registerChipFamilyCases('resolveLlmCallStatusBadge', resolveLlmCallStatusBadge, [
  ['running', 'info'],
  ['finished', 'success'],
  ['failed', 'danger'],
]);

registerChipFamilyCases('resolveSerpSelectorDecisionBadge', resolveSerpSelectorDecisionBadge, [
  ['keep', 'success'],
  ['fetch', 'info'],
  ['hard_drop', 'warning'],
  ['drop', 'danger'],
]);

registerChipFamilyCases('resolveDomainRoleBadge', resolveDomainRoleBadge, [
  ['manufacturer', 'success'],
  ['review', 'info'],
  ['database', 'accent'],
  ['retail', 'warning'],
]);

registerChipFamilyCases('resolveSafetyClassBadge', resolveSafetyClassBadge, [
  ['safe', 'success'],
  ['caution', 'warning'],
  ['blocked', 'danger'],
]);

registerChipFamilyCases('resolveIdentityBadge', resolveIdentityBadge, [
  ['exact', 'success'],
  ['family', 'info'],
  ['variant', 'warning'],
  ['off_target', 'danger'],
]);

registerChipFamilyCases('resolveBlockerBadge', resolveBlockerBadge, [
  ['missing', 'neutral'],
  ['weak', 'warning'],
  ['conflict', 'danger'],
  ['needs_exact_match', 'confirm'],
]);

describe('resolveNeedsetState', () => {
  it('aliases covered into the satisfied label and keeps success semantics', () => {
    const result = resolveNeedsetState('covered');
    strictEqual(result.label, 'satisfied');
    assertChipFamily(result.badge, 'success');
    ok(result.dot.includes('success'), `expected "${result.dot}" to include the success token`);
  });

  it('preserves warning and danger semantics for unresolved states', () => {
    assertChipFamily(resolveNeedsetState('weak').badge, 'warning');
    assertChipFamily(resolveNeedsetState('conflict').badge, 'danger');
  });

  it('falls back to a neutral badge and dynamic label', () => {
    const exotic = resolveNeedsetState('exotic');
    strictEqual(exotic.label, 'exotic');
    strictEqual(exotic.dot, 'sf-bg-surface-soft-strong');
    assertChipFamily(exotic.badge, 'neutral');

    const empty = resolveNeedsetState('');
    strictEqual(empty.label, 'unknown');
    assertChipFamily(empty.badge, 'neutral');
  });
});

describe('resolveNeedsetBucket', () => {
  it('preserves the canonical need-set priority buckets', () => {
    strictEqual(resolveNeedsetBucket('core').label, 'core');
    strictEqual(resolveNeedsetBucket('secondary').label, 'secondary');
    strictEqual(resolveNeedsetBucket('expected').label, 'expected');
    strictEqual(resolveNeedsetBucket('optional').label, 'optional');
    assertChipFamily(resolveNeedsetBucket('core').badge, 'danger');
    assertChipFamily(resolveNeedsetBucket('secondary').badge, 'warning');
    assertChipFamily(resolveNeedsetBucket('expected').badge, 'info');
    assertChipFamily(resolveNeedsetBucket('optional').badge, 'neutral');
  });

  it('falls back to a neutral badge and dynamic label', () => {
    strictEqual(resolveNeedsetBucket('exotic').label, 'exotic');
    assertChipFamily(resolveNeedsetBucket('exotic').badge, 'neutral');
    strictEqual(resolveNeedsetBucket('').label, 'unknown');
  });
});

describe('prefetch registry helpers', () => {
  it('maps brand resolution outcomes to visible severity families', () => {
    assertChipFamily(resolveBrandResolutionBadge('resolved'), 'success');
    assertChipFamily(resolveBrandResolutionBadge('resolved_empty'), 'warning');
    assertChipFamily(resolveBrandResolutionBadge('failed'), 'danger');
    assertChipFamily(resolveBrandResolutionBadge('__unknown__'), 'neutral');
  });

  it('keeps known skip reasons human-readable and passes unknown reasons through', () => {
    ok(resolveSkipReasonLabel('no_brand_in_identity_lock').includes('No brand name'));
    ok(resolveSkipReasonLabel('no_api_key_for_triage_role').includes('No API key'));
    strictEqual(resolveSkipReasonLabel('custom_skip_reason'), 'custom_skip_reason');
  });

  it('maps confidence thresholds onto ring and text severity families', () => {
    strictEqual(resolveConfidenceRingClass(null), 'sf-metric-ring-muted');
    strictEqual(resolveConfidenceRingClass(0.9), 'sf-metric-ring-success');
    strictEqual(resolveConfidenceRingClass(0.6), 'sf-metric-ring-warning');
    strictEqual(resolveConfidenceRingClass(0.2), 'sf-metric-ring-danger');

    strictEqual(resolveConfidenceTextClass(null), 'sf-text-muted');
    ok(resolveConfidenceTextClass(0.9).includes('success'));
    ok(resolveConfidenceTextClass(0.6).includes('warning'));
    ok(resolveConfidenceTextClass(0.2).includes('error'));
  });

  it('maps approval, gate, and llm reason helpers to the expected badge families', () => {
    assertChipFamily(resolveApprovalBadge('approved'), 'success');
    assertChipFamily(resolveApprovalBadge('candidate'), 'neutral');
    assertChipFamily(resolveApprovalBadge('reject'), 'danger');

    assertChipFamily(resolveGateBadge(true), 'success');
    assertChipFamily(resolveGateBadge(false), 'neutral');

    assertChipFamily(resolveLlmReasonBadge('discovery_planner_primary'), 'info');
    assertChipFamily(resolveLlmReasonBadge('manual_override'), 'neutral');
  });
});
