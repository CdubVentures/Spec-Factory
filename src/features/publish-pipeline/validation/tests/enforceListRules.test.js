import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enforceListRules } from '../checks/enforceListRules.js';

describe('enforceListRules — dedupe', () => {
  it('removes duplicates, preserves first occurrence', () => {
    const r = enforceListRules(['a', 'b', 'a', 'c'], { dedupe: true });
    assert.deepStrictEqual(r.values, ['a', 'b', 'c']);
    assert.equal(r.repairs.length, 1);
    assert.equal(r.repairs[0].rule, 'dedupe');
    assert.equal(r.repairs[0].removed, 1);
  });

  it('no dups → no repair', () => {
    const r = enforceListRules(['a', 'b', 'c'], { dedupe: true });
    assert.deepStrictEqual(r.values, ['a', 'b', 'c']);
    assert.equal(r.repairs.length, 0);
  });

  it('dedupe off → no change', () => {
    const r = enforceListRules(['a', 'b', 'a'], { dedupe: false });
    assert.deepStrictEqual(r.values, ['a', 'b', 'a']);
    assert.equal(r.repairs.length, 0);
  });
});

describe('enforceListRules — sort', () => {
  it('alpha sort', () => {
    const r = enforceListRules(['wired', 'bluetooth'], { sort: 'alpha' });
    assert.deepStrictEqual(r.values, ['bluetooth', 'wired']);
    assert.ok(r.repairs.some(rep => rep.rule === 'sort_alpha'));
  });

  it('numeric sort (ascending)', () => {
    const r = enforceListRules([1000, 500, 125], { sort: 'numeric' });
    assert.deepStrictEqual(r.values, [125, 500, 1000]);
    assert.ok(r.repairs.some(rep => rep.rule === 'sort_numeric'));
  });

  it('sort: none → preserve order', () => {
    const r = enforceListRules(['white', 'black'], { sort: 'none' });
    assert.deepStrictEqual(r.values, ['white', 'black']);
    assert.equal(r.repairs.length, 0);
  });

  it('no sort rule → preserve order', () => {
    const r = enforceListRules(['a', 'b'], {});
    assert.deepStrictEqual(r.values, ['a', 'b']);
    assert.equal(r.repairs.length, 0);
  });
});

describe('enforceListRules — max items', () => {
  it('truncates when over max', () => {
    const r = enforceListRules(['a', 'b', 'c', 'd'], { max_items: 2 });
    assert.deepStrictEqual(r.values, ['a', 'b']);
    assert.ok(r.repairs.some(rep => rep.rule === 'max_items'));
  });

  it('under max → no repair', () => {
    const r = enforceListRules(['a', 'b'], { max_items: 5 });
    assert.deepStrictEqual(r.values, ['a', 'b']);
    assert.equal(r.repairs.length, 0);
  });

  it('exact max → no repair', () => {
    const r = enforceListRules(['a', 'b'], { max_items: 2 });
    assert.deepStrictEqual(r.values, ['a', 'b']);
    assert.equal(r.repairs.length, 0);
  });
});

describe('enforceListRules — min items (flag only)', () => {
  it('below min → flag violation', () => {
    const r = enforceListRules([], { min_items: 1 });
    assert.deepStrictEqual(r.values, []);
    assert.ok(r.repairs.some(rep => rep.rule === 'min_items_violation'));
  });

  it('meets min → no flag', () => {
    const r = enforceListRules(['a'], { min_items: 1 });
    assert.deepStrictEqual(r.values, ['a']);
    assert.equal(r.repairs.length, 0);
  });

  it('min_items: 0 with empty array → no flag', () => {
    const r = enforceListRules([], { min_items: 0 });
    assert.deepStrictEqual(r.values, []);
    assert.equal(r.repairs.length, 0);
  });
});

describe('enforceListRules — combined rules', () => {
  it('dedupe → sort → truncate in order', () => {
    const r = enforceListRules(['c', 'a', 'b', 'a'], { dedupe: true, sort: 'alpha', max_items: 2 });
    assert.deepStrictEqual(r.values, ['a', 'b']);
  });
});

describe('enforceListRules — edge cases', () => {
  it('empty array + dedupe → empty', () => {
    const r = enforceListRules([], { dedupe: true });
    assert.deepStrictEqual(r.values, []);
    assert.equal(r.repairs.length, 0);
  });

  it('null rules → passthrough', () => {
    const r = enforceListRules(['a'], null);
    assert.deepStrictEqual(r.values, ['a']);
    assert.equal(r.repairs.length, 0);
  });

  it('undefined rules → passthrough', () => {
    const r = enforceListRules(['a'], undefined);
    assert.deepStrictEqual(r.values, ['a']);
    assert.equal(r.repairs.length, 0);
  });

  it('non-array input → empty', () => {
    const r = enforceListRules('not-array', { dedupe: true });
    assert.deepStrictEqual(r.values, []);
    assert.equal(r.repairs.length, 0);
  });

  it('null input → empty', () => {
    const r = enforceListRules(null, { dedupe: true });
    assert.deepStrictEqual(r.values, []);
  });
});
