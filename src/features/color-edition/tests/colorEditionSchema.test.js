import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { colorEditionFinderResponseSchema } from '../colorEditionSchema.js';

describe('colorEditionFinderResponseSchema', () => {
  it('parses a valid response with colors and editions', () => {
    const input = {
      colors: ['black', 'white', 'black+red'],
      editions: ['cyberpunk-2077-edition'],
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.colors, ['black', 'white', 'black+red']);
    assert.deepEqual(result.editions, ['cyberpunk-2077-edition']);
    assert.deepEqual(result.new_colors, []);
  });

  it('new_colors is optional and defaults to empty array', () => {
    const input = { colors: ['black'], editions: [] };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.new_colors, []);
  });

  it('parses new_colors when provided', () => {
    const input = {
      colors: ['black', 'seafoam'],
      editions: [],
      new_colors: [{ name: 'seafoam', hex: '#20b2aa' }],
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.equal(result.new_colors.length, 1);
    assert.equal(result.new_colors[0].name, 'seafoam');
    assert.equal(result.new_colors[0].hex, '#20b2aa');
  });

  it('parses empty colors and editions arrays', () => {
    const input = { colors: [], editions: [] };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.colors, []);
    assert.deepEqual(result.editions, []);
  });

  it('rejects non-string in colors array', () => {
    const input = { colors: [123], editions: [] };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });

  it('rejects missing colors field', () => {
    const input = { editions: [] };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });

  it('rejects missing editions field', () => {
    const input = { colors: [] };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });

  it('rejects new_colors entry missing hex', () => {
    const input = {
      colors: ['seafoam'],
      editions: [],
      new_colors: [{ name: 'seafoam' }],
    };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });

  it('rejects new_colors entry missing name', () => {
    const input = {
      colors: ['seafoam'],
      editions: [],
      new_colors: [{ hex: '#20b2aa' }],
    };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });
});
