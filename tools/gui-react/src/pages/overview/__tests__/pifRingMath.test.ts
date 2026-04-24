import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { buildRingDasharray } from '../pifRingMath.ts';

describe('buildRingDasharray', () => {
  it('returns null/null for target <= 0', () => {
    deepStrictEqual(buildRingDasharray({ filled: 0, target: 0, radius: 20 }), { track: null, fill: null });
    deepStrictEqual(buildRingDasharray({ filled: 5, target: -1, radius: 20 }), { track: null, fill: null });
  });

  it('returns null/null for radius <= 0', () => {
    deepStrictEqual(buildRingDasharray({ filled: 1, target: 3, radius: 0 }), { track: null, fill: null });
  });

  it('target === 1: null track, fill is full circumference when filled', () => {
    const r = 10;
    const circumference = 2 * Math.PI * r;
    const result = buildRingDasharray({ filled: 1, target: 1, radius: r });
    strictEqual(result.track, null);
    strictEqual(result.fill, `${circumference} 0`);
  });

  it('target === 1: null fill when empty', () => {
    const result = buildRingDasharray({ filled: 0, target: 1, radius: 10 });
    strictEqual(result.track, null);
    strictEqual(result.fill, null);
  });

  it('target > 1, empty: track is segmented, fill null', () => {
    const result = buildRingDasharray({ filled: 0, target: 3, radius: 20, gapPx: 3 });
    strictEqual(result.fill, null);
    // Track is "segLen gap"
    const [segLen, gap] = result.track!.split(' ').map(Number);
    strictEqual(gap, 3);
    // Three segments of segLen + three gaps = full circumference
    const circumference = 2 * Math.PI * 20;
    const reconstructed = 3 * segLen + 3 * gap;
    // Allow tiny floating-point delta
    strictEqual(Math.abs(reconstructed - circumference) < 0.001, true);
  });

  it('target > 1, partial: fill has one visible segment then hidden tail', () => {
    const result = buildRingDasharray({ filled: 1, target: 3, radius: 20, gapPx: 3 });
    const parts = result.fill!.split(' ').map(Number);
    // Pattern: [visible1, hiddenTail]
    strictEqual(parts.length, 2);
    const [seg, hiddenTail] = parts;
    const circumference = 2 * Math.PI * 20;
    // Visible = one segment
    const [trackSeg] = result.track!.split(' ').map(Number);
    strictEqual(seg, trackSeg);
    // Hidden tail = circumference - visible
    strictEqual(Math.abs((seg + hiddenTail) - circumference) < 0.001, true);
  });

  it('target > 1, fully filled: fill dasharray alternates N segments', () => {
    const result = buildRingDasharray({ filled: 3, target: 3, radius: 20, gapPx: 3 });
    const parts = result.fill!.split(' ').map(Number);
    // Pattern: [visible, gap, visible, gap, visible, hiddenTail]
    strictEqual(parts.length, 6);
    // First 3 segs all equal the track segLen
    const [trackSeg] = result.track!.split(' ').map(Number);
    strictEqual(parts[0], trackSeg);
    strictEqual(parts[2], trackSeg);
    strictEqual(parts[4], trackSeg);
    // First 2 gaps are normal gap
    strictEqual(parts[1], 3);
    strictEqual(parts[3], 3);
    // Final "hiddenTail" should be close to gap (since all visible → tail is just one gap)
    // hiddenTail = circumference - 3*(seg + gap) + gap
    const circumference = 2 * Math.PI * 20;
    const expected = circumference - 3 * (trackSeg + 3) + 3;
    strictEqual(Math.abs(parts[5] - expected) < 0.001, true);
  });

  it('clamps filled above target', () => {
    const result = buildRingDasharray({ filled: 10, target: 3, radius: 20, gapPx: 3 });
    const parts = result.fill!.split(' ').map(Number);
    // Should behave identically to filled=3
    const ref = buildRingDasharray({ filled: 3, target: 3, radius: 20, gapPx: 3 });
    strictEqual(parts.length, ref.fill!.split(' ').length);
  });

  it('clamps filled below zero to zero', () => {
    const result = buildRingDasharray({ filled: -5, target: 3, radius: 20 });
    strictEqual(result.fill, null);
  });

  it('defaults gapPx to 3.5 when not provided', () => {
    const result = buildRingDasharray({ filled: 0, target: 3, radius: 20 });
    const [, gap] = result.track!.split(' ').map(Number);
    strictEqual(gap, 3.5);
  });
});
