import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkShape } from '../checks/checkShape.js';

describe('checkShape — scalar', () => {
  const pass = [
    ['black',  'string is scalar'],
    [42,       'number is scalar'],
    [true,     'boolean is scalar'],
    [null,     'null is valid scalar (absence)'],
    [0,        'zero is scalar'],
    ['',       'empty string is scalar'],
    [false,    'false is scalar'],
  ];

  for (const [value, label] of pass) {
    it(`pass: ${label}`, () => {
      const r = checkShape(value, 'scalar');
      assert.equal(r.pass, true);
    });
  }

  const fail = [
    [['a'],     'array where scalar expected'],
    [{ a: 1 },  'object where scalar expected'],
    [undefined,  'undefined is not a valid scalar'],
  ];

  for (const [value, label] of fail) {
    it(`reject: ${label}`, () => {
      const r = checkShape(value, 'scalar');
      assert.equal(r.pass, false);
      assert.equal(typeof r.reason, 'string');
      assert.ok(r.reason.length > 0);
    });
  }
});

describe('checkShape — list', () => {
  const pass = [
    [['a', 'b'],  'array of strings'],
    [[],           'empty array'],
    [[1, 2, 3],   'array of numbers'],
    [[{ a: 1 }],  'array of objects'],
  ];

  for (const [value, label] of pass) {
    it(`pass: ${label}`, () => {
      const r = checkShape(value, 'list');
      assert.equal(r.pass, true);
    });
  }

  const fail = [
    ['a',       'string where list expected'],
    [42,        'number where list expected'],
    [null,      'null where list expected'],
    [undefined, 'undefined where list expected'],
    [{ a: 1 },  'object where list expected'],
  ];

  for (const [value, label] of fail) {
    it(`reject: ${label}`, () => {
      const r = checkShape(value, 'list');
      assert.equal(r.pass, false);
      assert.equal(typeof r.reason, 'string');
    });
  }
});

describe('checkShape — unknown shape', () => {
  it('rejects unknown shape string', () => {
    const r = checkShape('hello', 'matrix');
    assert.equal(r.pass, false);
    assert.ok(r.reason.includes('unknown'));
  });

  it('rejects retired "record" shape', () => {
    const r = checkShape({ a: 1 }, 'record');
    assert.equal(r.pass, false);
    assert.ok(r.reason.includes('unknown'));
  });
});
