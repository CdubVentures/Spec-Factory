import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { deriveConfidenceRingSpec } from '../confidenceRingMath.ts';

describe('deriveConfidenceRingSpec', () => {
  it('returns em-dash label and empty arc for null', () => {
    const r = deriveConfidenceRingSpec(null);
    strictEqual(r.label, '—');
    strictEqual(r.tone, 'neutral');
    strictEqual(r.isNa, true);
    strictEqual(r.dasharray.startsWith('0 '), true);
  });

  it('returns em-dash label for undefined', () => {
    const r = deriveConfidenceRingSpec(undefined);
    strictEqual(r.label, '—');
    strictEqual(r.isNa, true);
  });

  it('returns em-dash for NaN', () => {
    const r = deriveConfidenceRingSpec(Number.NaN);
    strictEqual(r.label, '—');
    strictEqual(r.isNa, true);
  });

  it('returns em-dash for negative confidence', () => {
    const r = deriveConfidenceRingSpec(-0.1);
    strictEqual(r.label, '—');
    strictEqual(r.isNa, true);
  });

  it('returns "0" label with empty arc for exactly 0', () => {
    const r = deriveConfidenceRingSpec(0);
    strictEqual(r.label, '0');
    strictEqual(r.isNa, false);
    strictEqual(r.dasharray.startsWith('0.000 '), true);
  });

  it('returns "100" label for 1', () => {
    const r = deriveConfidenceRingSpec(1);
    strictEqual(r.label, '100');
    strictEqual(r.tone, 'good');
  });

  it('clamps values above 1', () => {
    const r = deriveConfidenceRingSpec(1.5);
    strictEqual(r.label, '100');
    strictEqual(r.tone, 'good');
  });

  it('tone is good when confidence >= 0.85', () => {
    strictEqual(deriveConfidenceRingSpec(0.85).tone, 'good');
    strictEqual(deriveConfidenceRingSpec(0.97).tone, 'good');
  });

  it('tone is warn when 0.60 <= confidence < 0.85', () => {
    strictEqual(deriveConfidenceRingSpec(0.60).tone, 'warn');
    strictEqual(deriveConfidenceRingSpec(0.84).tone, 'warn');
  });

  it('tone is danger when confidence < 0.60', () => {
    strictEqual(deriveConfidenceRingSpec(0.59).tone, 'danger');
    strictEqual(deriveConfidenceRingSpec(0.1).tone, 'danger');
  });

  it('label is rounded to nearest integer percent', () => {
    strictEqual(deriveConfidenceRingSpec(0.947).label, '95');
    strictEqual(deriveConfidenceRingSpec(0.944).label, '94');
    strictEqual(deriveConfidenceRingSpec(0.895).label, '90');
  });

  it('dasharray scales with confidence — arc length monotonic increasing', () => {
    const low = parseFloat(deriveConfidenceRingSpec(0.3).dasharray.split(' ')[0]);
    const mid = parseFloat(deriveConfidenceRingSpec(0.5).dasharray.split(' ')[0]);
    const high = parseFloat(deriveConfidenceRingSpec(0.9).dasharray.split(' ')[0]);
    strictEqual(low < mid, true);
    strictEqual(mid < high, true);
  });
});
