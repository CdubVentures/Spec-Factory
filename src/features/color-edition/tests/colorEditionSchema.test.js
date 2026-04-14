import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { colorEditionFinderResponseSchema, variantIdentityCheckResponseSchema } from '../colorEditionSchema.js';

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

  // ── siblings_excluded ──

  it('parses siblings_excluded array', () => {
    const input = {
      colors: ['black'],
      default_color: 'black',
      siblings_excluded: ['M75 Air Wireless Pro', 'M75 Wired'],
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.siblings_excluded, ['M75 Air Wireless Pro', 'M75 Wired']);
  });

  it('siblings_excluded defaults to empty array when omitted', () => {
    const input = { colors: ['black'], default_color: 'black' };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.siblings_excluded, []);
  });

  // ── discovery_log ──

  it('parses full discovery_log with all sub-arrays', () => {
    const input = {
      colors: ['black'],
      default_color: 'black',
      discovery_log: {
        confirmed_from_known: ['black'],
        added_new: ['white'],
        rejected_from_known: ['gray'],
        urls_checked: ['https://corsair.com/m75'],
        queries_run: ['Corsair M75 colors'],
      },
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.discovery_log.confirmed_from_known, ['black']);
    assert.deepEqual(result.discovery_log.added_new, ['white']);
    assert.deepEqual(result.discovery_log.rejected_from_known, ['gray']);
    assert.deepEqual(result.discovery_log.urls_checked, ['https://corsair.com/m75']);
    assert.deepEqual(result.discovery_log.queries_run, ['Corsair M75 colors']);
  });

  it('discovery_log defaults to all-empty when omitted', () => {
    const input = { colors: ['black'], default_color: 'black' };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.discovery_log, {
      confirmed_from_known: [],
      added_new: [],
      rejected_from_known: [],
      urls_checked: [],
      queries_run: [],
    });
  });

  it('discovery_log partial: only urls_checked provided, rest default', () => {
    const input = {
      colors: ['black'],
      default_color: 'black',
      discovery_log: { urls_checked: ['https://example.com'] },
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.discovery_log.urls_checked, ['https://example.com']);
    assert.deepEqual(result.discovery_log.confirmed_from_known, []);
    assert.deepEqual(result.discovery_log.added_new, []);
    assert.deepEqual(result.discovery_log.rejected_from_known, []);
    assert.deepEqual(result.discovery_log.queries_run, []);
  });

  // ── backward compat ──

  it('v1 response without siblings_excluded or discovery_log still parses', () => {
    const v1Input = {
      colors: ['black', 'white'],
      color_names: { 'white': 'Arctic White' },
      editions: { 'launch-edition': { display_name: 'Launch Edition', colors: ['black'] } },
      default_color: 'black',
    };
    const result = colorEditionFinderResponseSchema.parse(v1Input);
    assert.deepEqual(result.siblings_excluded, []);
    assert.deepEqual(result.discovery_log, {
      confirmed_from_known: [],
      added_new: [],
      rejected_from_known: [],
      urls_checked: [],
      queries_run: [],
    });
    assert.deepEqual(result.colors, ['black', 'white']);
    assert.deepEqual(result.color_names, { 'white': 'Arctic White' });
  });
});

/* ── variantIdentityCheckResponseSchema ────────────────────────── */

describe('variantIdentityCheckResponseSchema', () => {
  const validMapping = {
    new_key: 'color:black',
    match: 'v_a1b2c3d4',
    action: 'match',
    reason: 'same color, name unchanged',
  };

  it('accepts valid response with match mapping', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [validMapping],
      retired: [],
    });
    assert.ok(result.success);
    assert.equal(result.data.mappings[0].action, 'match');
    assert.equal(result.data.mappings[0].match, 'v_a1b2c3d4');
  });

  it('accepts valid response with new mapping (null match)', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [{ new_key: 'color:crimson-red', match: null, action: 'new', reason: 'genuinely new color' }],
      retired: [],
    });
    assert.ok(result.success);
    assert.equal(result.data.mappings[0].action, 'new');
    assert.equal(result.data.mappings[0].match, null);
  });

  it('accepts valid response with reject mapping (null match)', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [{ new_key: 'color:light-olive+black', match: null, action: 'reject', reason: 'hallucinated' }],
      retired: [],
    });
    assert.ok(result.success);
    assert.equal(result.data.mappings[0].action, 'reject');
  });

  it('accepts mixed match + new + reject mappings', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [
        validMapping,
        { new_key: 'color:crimson-red', match: null, action: 'new', reason: 'new' },
        { new_key: 'color:fake', match: null, action: 'reject', reason: 'garbage' },
      ],
      retired: ['v_deadbeef'],
    });
    assert.ok(result.success);
    assert.equal(result.data.mappings.length, 3);
    assert.deepStrictEqual(result.data.retired, ['v_deadbeef']);
  });

  it('rejects old update action', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [{ ...validMapping, action: 'update' }],
      retired: [],
    });
    assert.ok(!result.success, 'update is no longer a valid action');
  });

  it('rejects old create action', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [{ new_key: 'color:red', match: null, action: 'create', reason: 'new' }],
      retired: [],
    });
    assert.ok(!result.success, 'create is no longer a valid action');
  });

  it('accepts empty mappings and retired', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [],
      retired: [],
    });
    assert.ok(result.success);
  });

  it('rejects invalid action value', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [{ ...validMapping, action: 'delete' }],
      retired: [],
    });
    assert.ok(!result.success);
  });

  it('rejects missing new_key', () => {
    const { new_key: _, ...noKey } = validMapping;
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [noKey],
      retired: [],
    });
    assert.ok(!result.success);
  });

  it('rejects missing reason', () => {
    const { reason: _, ...noReason } = validMapping;
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [noReason],
      retired: [],
    });
    assert.ok(!result.success);
  });

  it('rejects missing mappings field', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({ retired: [] });
    assert.ok(!result.success);
  });

  it('rejects missing retired field', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({ mappings: [] });
    assert.ok(!result.success);
  });
});
