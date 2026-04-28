import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPifVariantRingSpecs } from '../pifVariantRingRoles.ts';

describe('buildPifVariantRingSpecs', () => {
  it('maps outer to carousel target, middle to additional images, and inner to hero images', () => {
    const specs = buildPifVariantRingSpecs({
      priorityFilled: 4,
      priorityTotal: 5,
      loopFilled: 2,
      loopTotal: 3,
      heroFilled: 1,
      heroTarget: 2,
    });

    assert.deepEqual(
      specs.map(({ cls, filled, target }) => ({ cls, filled, target })),
      [
        { cls: 'outer', filled: 4, target: 5 },
        { cls: 'middle', filled: 2, target: 3 },
        { cls: 'inner', filled: 1, target: 2 },
      ],
    );
  });
});
