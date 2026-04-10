import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VALID_TYPES,
  VALID_SHAPES,
  TYPE_SHAPE_CONSTRAINTS,
  UNIT_BEARING_TYPES,
  TYPE_COUPLING_MAP,
  isUnitBearingType,
  validateTypeShapeCombo,
} from '../typeShapeRegistry.ts';
import type { FieldType, FieldShape } from '../typeShapeRegistry.ts';

describe('typeShapeRegistry', () => {
  describe('VALID_TYPES', () => {
    const expected: FieldType[] = ['string', 'number', 'integer', 'boolean', 'date', 'url', 'range', 'mixed_number_range'];

    for (const type of expected) {
      it(`includes "${type}"`, () => {
        assert.ok(VALID_TYPES.includes(type));
      });
    }

    it('has exactly 8 types', () => {
      assert.equal(VALID_TYPES.length, 8);
    });

    it('does not include "object" (retired in Phase 3)', () => {
      assert.ok(!(VALID_TYPES as readonly string[]).includes('object'));
    });
  });

  describe('VALID_SHAPES', () => {
    it('includes scalar and list', () => {
      assert.ok(VALID_SHAPES.includes('scalar'));
      assert.ok(VALID_SHAPES.includes('list'));
    });

    it('has exactly 2 shapes', () => {
      assert.equal(VALID_SHAPES.length, 2);
    });
  });

  describe('TYPE_SHAPE_CONSTRAINTS', () => {
    it('boolean is scalar only', () => {
      assert.deepEqual(TYPE_SHAPE_CONSTRAINTS.boolean, ['scalar']);
    });

    it('range is scalar only', () => {
      assert.deepEqual(TYPE_SHAPE_CONSTRAINTS.range, ['scalar']);
    });

    it('mixed_number_range is list only', () => {
      assert.deepEqual(TYPE_SHAPE_CONSTRAINTS.mixed_number_range, ['list']);
    });

    it('unconstrained types are not in the map', () => {
      assert.equal(TYPE_SHAPE_CONSTRAINTS.string, undefined);
      assert.equal(TYPE_SHAPE_CONSTRAINTS.number, undefined);
    });
  });

  describe('isUnitBearingType', () => {
    const unitTypes = ['number', 'integer', 'range', 'mixed_number_range'];
    const nonUnitTypes = ['string', 'boolean', 'date', 'url'];

    for (const t of unitTypes) {
      it(`returns true for "${t}"`, () => {
        assert.equal(isUnitBearingType(t), true);
      });
    }

    for (const t of nonUnitTypes) {
      it(`returns false for "${t}"`, () => {
        assert.equal(isUnitBearingType(t), false);
      });
    }

    it('UNIT_BEARING_TYPES has exactly 4 entries', () => {
      assert.equal(UNIT_BEARING_TYPES.size, 4);
    });
  });

  describe('validateTypeShapeCombo', () => {
    it('string + scalar → valid', () => assert.equal(validateTypeShapeCombo('string', 'scalar').valid, true));
    it('string + list → valid', () => assert.equal(validateTypeShapeCombo('string', 'list').valid, true));
    it('number + scalar → valid', () => assert.equal(validateTypeShapeCombo('number', 'scalar').valid, true));
    it('number + list → valid', () => assert.equal(validateTypeShapeCombo('number', 'list').valid, true));
    it('boolean + scalar → valid', () => assert.equal(validateTypeShapeCombo('boolean', 'scalar').valid, true));
    it('range + scalar → valid', () => assert.equal(validateTypeShapeCombo('range', 'scalar').valid, true));
    it('mixed_number_range + list → valid', () => assert.equal(validateTypeShapeCombo('mixed_number_range', 'list').valid, true));

    it('boolean + list → invalid', () => {
      const r = validateTypeShapeCombo('boolean', 'list');
      assert.equal(r.valid, false);
      assert.ok(r.reason);
    });

    it('range + list → invalid', () => {
      const r = validateTypeShapeCombo('range', 'list');
      assert.equal(r.valid, false);
    });

    it('mixed_number_range + scalar → invalid', () => {
      const r = validateTypeShapeCombo('mixed_number_range', 'scalar');
      assert.equal(r.valid, false);
    });

    it('unknown type → invalid', () => {
      const r = validateTypeShapeCombo('component_ref', 'scalar');
      assert.equal(r.valid, false);
    });

    it('unknown shape → invalid', () => {
      const r = validateTypeShapeCombo('string', 'record');
      assert.equal(r.valid, false);
    });
  });

  describe('TYPE_COUPLING_MAP', () => {
    it('boolean sets enum.policy to closed', () => {
      assert.equal(TYPE_COUPLING_MAP.boolean?.['enum.policy'], 'closed');
    });

    it('string has no coupling (default)', () => {
      assert.equal(TYPE_COUPLING_MAP.string, undefined);
    });
  });
});
