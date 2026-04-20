// WHY: Tier-label formatter is the one authoritative mapping from raw
// evidenceContract tier codes to the short display chips the GUI shows
// everywhere tier appears (finder evidence row, review drawer published
// list, review drawer candidates block, evidence-kind popover).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatEvidenceTier, EVIDENCE_TIER_LABELS } from '../evidenceTierLabels.ts';

describe('formatEvidenceTier', () => {
  it('maps each tier1-5 + other to the locked display label', () => {
    assert.equal(formatEvidenceTier('tier1'), 'T1-Mfr');
    assert.equal(formatEvidenceTier('tier2'), 'T2-Lab');
    assert.equal(formatEvidenceTier('tier3'), 'T3-Retail');
    assert.equal(formatEvidenceTier('tier4'), 'T4-Comm');
    assert.equal(formatEvidenceTier('tier5'), 'T5-DB');
    assert.equal(formatEvidenceTier('other'), 'Other');
  });

  it('returns empty string for null / undefined / empty', () => {
    assert.equal(formatEvidenceTier(null), '');
    assert.equal(formatEvidenceTier(undefined), '');
    assert.equal(formatEvidenceTier(''), '');
  });

  it('falls back to the raw string for unknown codes (forward-compat)', () => {
    assert.equal(formatEvidenceTier('tier99'), 'tier99');
    assert.equal(formatEvidenceTier('custom'), 'custom');
  });
});

describe('EVIDENCE_TIER_LABELS', () => {
  it('contains exactly the 6 locked keys', () => {
    assert.deepEqual(
      Object.keys(EVIDENCE_TIER_LABELS).sort(),
      ['other', 'tier1', 'tier2', 'tier3', 'tier4', 'tier5'].sort(),
    );
  });

  it('every label starts with T<n>- or is "Other"', () => {
    for (const [key, label] of Object.entries(EVIDENCE_TIER_LABELS)) {
      if (key === 'other') {
        assert.equal(label, 'Other');
      } else {
        assert.match(label, /^T[1-5]-[A-Za-z]+$/, `label for ${key} must match T<n>-<name> pattern`);
      }
    }
  });
});
