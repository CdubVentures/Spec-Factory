import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { deriveAmbiguityMarkerPct } from '../ambiguityMarker.ts';

describe('deriveAmbiguityMarkerPct', () => {
  it('maps each tier to the center of its band', () => {
    strictEqual(deriveAmbiguityMarkerPct('easy'), 10);
    strictEqual(deriveAmbiguityMarkerPct('medium'), 30);
    strictEqual(deriveAmbiguityMarkerPct('hard'), 50);
    strictEqual(deriveAmbiguityMarkerPct('very_hard'), 70);
    strictEqual(deriveAmbiguityMarkerPct('extra_hard'), 90);
  });

  it('returns 0 for unknown tier', () => {
    strictEqual(deriveAmbiguityMarkerPct('unknown'), 0);
  });

  it('returns 0 for unrecognized string', () => {
    strictEqual(deriveAmbiguityMarkerPct(''), 0);
    strictEqual(deriveAmbiguityMarkerPct('bogus'), 0);
  });
});
