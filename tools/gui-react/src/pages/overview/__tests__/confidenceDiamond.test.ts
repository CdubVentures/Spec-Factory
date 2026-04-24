import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { confidenceTier } from '../confidenceDiamondTiers.ts';

describe('confidenceTier', () => {
  it('returns empty for 0, negative, NaN, or infinite', () => {
    strictEqual(confidenceTier(0), 'empty');
    strictEqual(confidenceTier(-5), 'empty');
    strictEqual(confidenceTier(NaN), 'empty');
    strictEqual(confidenceTier(Infinity), 'empty'); // !isFinite short-circuits before >= check
  });

  it('returns good at 85 and above', () => {
    strictEqual(confidenceTier(85), 'good');
    strictEqual(confidenceTier(92), 'good');
    strictEqual(confidenceTier(100), 'good');
  });

  it('returns warn between 60 and 84', () => {
    strictEqual(confidenceTier(60), 'warn');
    strictEqual(confidenceTier(72), 'warn');
    strictEqual(confidenceTier(84.9), 'warn');
  });

  it('returns danger between 1 and 59', () => {
    strictEqual(confidenceTier(1), 'danger');
    strictEqual(confidenceTier(42), 'danger');
    strictEqual(confidenceTier(59.9), 'danger');
  });
});
