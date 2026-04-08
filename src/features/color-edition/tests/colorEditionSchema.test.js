import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { colorEditionFinderResponseSchema } from '../colorEditionSchema.js';

describe('colorEditionFinderResponseSchema', () => {
  it('parses a valid response with colors, paired editions, and default_color', () => {
    const input = {
      colors: ['black', 'white', 'black+red'],
      editions: {
        'launch-edition': { colors: ['black'] },
        'cyberpunk-2077-edition': { colors: ['black+red'] },
      },
      default_color: 'black',
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.colors, ['black', 'white', 'black+red']);
    assert.deepEqual(result.editions, {
      'launch-edition': { display_name: '', colors: ['black'] },
      'cyberpunk-2077-edition': { display_name: '', colors: ['black+red'] },
    });
    assert.equal(result.default_color, 'black');
  });

  it('editions defaults to empty object when omitted', () => {
    const input = { colors: ['black'], default_color: 'black' };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.editions, {});
  });

  it('default_color defaults to empty string when omitted', () => {
    const input = { colors: ['black'], editions: {} };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.equal(result.default_color, '');
  });

  it('parses empty colors and editions', () => {
    const input = { colors: [], editions: {}, default_color: '' };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.colors, []);
    assert.deepEqual(result.editions, {});
    assert.equal(result.default_color, '');
  });

  it('rejects non-string in colors array', () => {
    const input = { colors: [123], editions: {}, default_color: '' };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });

  it('rejects missing colors field', () => {
    const input = { editions: {}, default_color: '' };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });

  it('rejects edition with missing colors array', () => {
    const input = {
      colors: ['black'],
      editions: { 'launch-edition': {} },
      default_color: 'black',
    };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });

  it('rejects edition with non-array colors', () => {
    const input = {
      colors: ['black'],
      editions: { 'launch-edition': { colors: 'black' } },
      default_color: 'black',
    };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });

  // ── color_names ──

  it('parses color_names map alongside colors', () => {
    const input = {
      colors: ['black', 'white+silver'],
      color_names: { 'white+silver': 'Frost White' },
      default_color: 'black',
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.color_names, { 'white+silver': 'Frost White' });
  });

  it('color_names defaults to empty object when omitted', () => {
    const input = { colors: ['black'], default_color: 'black' };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.color_names, {});
  });

  // ── edition display_name ──

  it('parses edition display_name alongside colors', () => {
    const input = {
      colors: ['black', 'black+orange'],
      editions: {
        'cod-bo6-edition': { display_name: 'Call of Duty: Black Ops 6 Edition', colors: ['black+orange'] },
      },
      default_color: 'black',
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.equal(result.editions['cod-bo6-edition'].display_name, 'Call of Duty: Black Ops 6 Edition');
    assert.deepEqual(result.editions['cod-bo6-edition'].colors, ['black+orange']);
  });

  it('edition display_name defaults to empty string when omitted', () => {
    const input = {
      colors: ['black'],
      editions: { 'launch-edition': { colors: ['black'] } },
      default_color: 'black',
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.equal(result.editions['launch-edition'].display_name, '');
  });
});
