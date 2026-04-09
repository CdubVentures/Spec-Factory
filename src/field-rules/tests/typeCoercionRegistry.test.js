import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VALID_TYPES,
  VALID_SHAPES,
  TYPE_SHAPE_CONSTRAINTS,
  validateTypeShapeCombo,
} from '../typeCoercionRegistry.js';

describe('VALID_TYPES', () => {
  const expected = ['string', 'number', 'integer', 'boolean', 'date', 'url', 'range', 'mixed_number_range'];

  for (const type of expected) {
    it(`includes "${type}"`, () => {
      assert.ok(VALID_TYPES.has(type));
    });
  }

  it('has exactly 8 types', () => {
    assert.equal(VALID_TYPES.size, 8);
  });

  it('rejects unknown type', () => {
    assert.equal(VALID_TYPES.has('component_ref'), false);
    assert.equal(VALID_TYPES.has('text_field'), false);
  });
});

describe('VALID_SHAPES', () => {
  it('includes scalar and list', () => {
    assert.ok(VALID_SHAPES.has('scalar'));
    assert.ok(VALID_SHAPES.has('list'));
  });

  it('has exactly 2 shapes', () => {
    assert.equal(VALID_SHAPES.size, 2);
  });

  it('rejects removed shapes', () => {
    assert.equal(VALID_SHAPES.has('record'), false);
    assert.equal(VALID_SHAPES.has('key_value'), false);
    assert.equal(VALID_SHAPES.has('structured'), false);
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
    assert.equal(TYPE_SHAPE_CONSTRAINTS.integer, undefined);
    assert.equal(TYPE_SHAPE_CONSTRAINTS.date, undefined);
    assert.equal(TYPE_SHAPE_CONSTRAINTS.url, undefined);
  });
});

describe('validateTypeShapeCombo', () => {
  const unconstrained = [
    ['string', 'scalar'], ['string', 'list'],
    ['number', 'scalar'], ['number', 'list'],
    ['integer', 'scalar'], ['integer', 'list'],
    ['date', 'scalar'], ['date', 'list'],
    ['url', 'scalar'], ['url', 'list'],
    ['boolean', 'scalar'],
    ['range', 'scalar'],
    ['mixed_number_range', 'list'],
  ];

  for (const [type, shape] of unconstrained) {
    it(`${type} + ${shape} → valid`, () => {
      const r = validateTypeShapeCombo(type, shape);
      assert.equal(r.valid, true);
    });
  }

  const constrained = [
    ['boolean', 'list', 'boolean'],
    ['range', 'list', 'range'],
    ['mixed_number_range', 'scalar', 'mixed_number_range'],
  ];

  for (const [type, shape] of constrained) {
    it(`${type} + ${shape} → invalid`, () => {
      const r = validateTypeShapeCombo(type, shape);
      assert.equal(r.valid, false);
      assert.ok(r.reason);
    });
  }

  it('unknown type → invalid', () => {
    const r = validateTypeShapeCombo('component_ref', 'scalar');
    assert.equal(r.valid, false);
  });

  it('unknown shape → invalid', () => {
    const r = validateTypeShapeCombo('string', 'record');
    assert.equal(r.valid, false);
  });
});
