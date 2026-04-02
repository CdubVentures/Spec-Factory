import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildColorMatrix } from '../utils/buildColorMatrix.ts';
import type { ColorEntry } from '../types.ts';

function entry(name: string, hex = '#000000'): ColorEntry {
  return { name, hex, css_var: `--color-${name}`, created_at: '', updated_at: '' };
}

describe('buildColorMatrix', () => {
  it('aligns base, light, and dark into rows by base name', () => {
    const colors = [
      entry('red', '#ff0000'),
      entry('light-red', '#fca5a5'),
      entry('dark-red', '#7f1d1d'),
      entry('blue', '#0000ff'),
      entry('light-blue', '#93c5fd'),
    ];
    const matrix = buildColorMatrix(colors);

    assert.deepStrictEqual(matrix.prefixes, ['dark', 'light']);
    assert.equal(matrix.rows.length, 2);

    const blueRow = matrix.rows.find((r) => r.baseName === 'blue');
    assert.ok(blueRow);
    assert.equal(blueRow.cells['base']?.hex, '#0000ff');
    assert.equal(blueRow.cells['light']?.hex, '#93c5fd');
    assert.equal(blueRow.cells['dark'], null);

    const redRow = matrix.rows.find((r) => r.baseName === 'red');
    assert.ok(redRow);
    assert.equal(redRow.cells['base']?.hex, '#ff0000');
    assert.equal(redRow.cells['light']?.hex, '#fca5a5');
    assert.equal(redRow.cells['dark']?.hex, '#7f1d1d');
  });

  it('sorts rows A-Z by base name', () => {
    const colors = [entry('yellow'), entry('cyan'), entry('amber')];
    const matrix = buildColorMatrix(colors);

    assert.deepStrictEqual(matrix.rows.map((r) => r.baseName), ['amber', 'cyan', 'yellow']);
  });

  it('sorts prefixes A-Z', () => {
    const colors = [
      entry('red'), entry('dark-red'), entry('light-red'), entry('vivid-red'),
    ];
    const matrix = buildColorMatrix(colors);

    assert.deepStrictEqual(matrix.prefixes, ['dark', 'light', 'vivid']);
  });

  it('detects orphan variants — variant exists but base does not', () => {
    const colors = [
      entry('light-yellow', '#fef08a'),
      entry('dark-yellow', '#a16207'),
    ];
    const matrix = buildColorMatrix(colors);

    assert.equal(matrix.rows.length, 1);
    const row = matrix.rows[0];
    assert.equal(row.baseName, 'yellow');
    assert.equal(row.cells['base'], null);
    assert.equal(row.cells['light']?.hex, '#fef08a');
    assert.equal(row.cells['dark']?.hex, '#a16207');
  });

  it('fills null for missing variants', () => {
    const colors = [entry('gray'), entry('light-gray'), entry('blue'), entry('dark-blue')];
    const matrix = buildColorMatrix(colors);

    const grayRow = matrix.rows.find((r) => r.baseName === 'gray');
    assert.ok(grayRow);
    assert.equal(grayRow.cells['base']?.name, 'gray');
    assert.equal(grayRow.cells['light']?.name, 'light-gray');
    assert.equal(grayRow.cells['dark'], null);

    const blueRow = matrix.rows.find((r) => r.baseName === 'blue');
    assert.ok(blueRow);
    assert.equal(blueRow.cells['light'], null);
    assert.equal(blueRow.cells['dark']?.name, 'dark-blue');
  });

  it('handles empty input', () => {
    const matrix = buildColorMatrix([]);

    assert.deepStrictEqual(matrix.prefixes, []);
    assert.deepStrictEqual(matrix.rows, []);
  });

  it('handles only base colors — no prefixes detected', () => {
    const colors = [entry('red'), entry('blue'), entry('green')];
    const matrix = buildColorMatrix(colors);

    assert.deepStrictEqual(matrix.prefixes, []);
    assert.equal(matrix.rows.length, 3);
    assert.equal(matrix.rows[0].cells['base']?.name, 'blue');
  });

  it('includes extra prefixes passed explicitly', () => {
    const colors = [entry('red'), entry('light-red')];
    const matrix = buildColorMatrix(colors, ['dark', 'vivid']);

    assert.deepStrictEqual(matrix.prefixes, ['dark', 'light', 'vivid']);
    const row = matrix.rows[0];
    assert.equal(row.cells['dark'], null);
    assert.equal(row.cells['vivid'], null);
    assert.equal(row.cells['light']?.name, 'light-red');
  });
});
