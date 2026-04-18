import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { colorEditionFinderResponseSchema, variantIdentityCheckResponseSchema } from '../colorEditionSchema.js';

describe('colorEditionFinderResponseSchema (per-item evidence)', () => {
  const blackItem = { name: 'black', evidence_refs: [{ url: 'https://razer.com/m1', tier: 'tier1', confidence: 95 }] };
  const whiteItem = { name: 'white', evidence_refs: [{ url: 'https://razer.com/m1', tier: 'tier1', confidence: 90 }] };
  const comboItem = { name: 'black+red', evidence_refs: [{ url: 'https://razer.com/m1', tier: 'tier1', confidence: 88 }] };

  it('parses a valid response with per-item colors and editions', () => {
    const input = {
      colors: [blackItem, whiteItem, comboItem],
      editions: {
        'cyberpunk-2077-edition': {
          colors: ['black+red'],
          evidence_refs: [{ url: 'https://razer.com/cp', tier: 'tier1', confidence: 90 }],
        },
      },
      default_color: 'black',
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.equal(result.colors.length, 3);
    assert.equal(result.colors[0].name, 'black');
    assert.equal(result.colors[0].evidence_refs.length, 1);
    assert.deepEqual(result.editions['cyberpunk-2077-edition'].colors, ['black+red']);
    assert.equal(result.editions['cyberpunk-2077-edition'].evidence_refs.length, 1);
    assert.equal(result.default_color, 'black');
  });

  it('editions defaults to empty object when omitted', () => {
    const input = { colors: [blackItem], default_color: 'black' };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.editions, {});
  });

  it('default_color defaults to empty string when omitted', () => {
    const input = { colors: [blackItem], editions: {} };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.equal(result.default_color, '');
  });

  it('parses empty colors and editions', () => {
    const input = { colors: [], editions: {}, default_color: '' };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.colors, []);
    assert.deepEqual(result.editions, {});
  });

  it('rejects a flat string in colors (old shape)', () => {
    const input = { colors: ['black'], editions: {}, default_color: '' };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });

  it('rejects colors item missing name', () => {
    const input = { colors: [{ evidence_refs: [] }], editions: {}, default_color: '' };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });

  it('rejects missing colors field', () => {
    const input = { editions: {}, default_color: '' };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });

  it('rejects edition with missing colors array', () => {
    const input = {
      colors: [blackItem],
      editions: { 'launch-edition': { evidence_refs: [] } },
      default_color: 'black',
    };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });

  it('rejects edition with non-array colors', () => {
    const input = {
      colors: [blackItem],
      editions: { 'launch-edition': { colors: 'black', evidence_refs: [] } },
      default_color: 'black',
    };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });

  // ── color_names ──

  it('parses color_names map alongside colors', () => {
    const input = {
      colors: [blackItem, { name: 'white+silver', evidence_refs: [] }],
      color_names: { 'white+silver': 'Frost White' },
      default_color: 'black',
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.color_names, { 'white+silver': 'Frost White' });
  });

  it('color_names defaults to empty object when omitted', () => {
    const input = { colors: [blackItem], default_color: 'black' };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.color_names, {});
  });

  // ── edition display_name ──

  it('parses edition display_name alongside colors', () => {
    const input = {
      colors: [blackItem, { name: 'black+orange', evidence_refs: [] }],
      editions: {
        'cod-bo6-edition': {
          display_name: 'Call of Duty: Black Ops 6 Edition',
          colors: ['black+orange'],
          evidence_refs: [{ url: 'https://razer.com/cod', tier: 'tier1', confidence: 90 }],
        },
      },
      default_color: 'black',
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.equal(result.editions['cod-bo6-edition'].display_name, 'Call of Duty: Black Ops 6 Edition');
    assert.deepEqual(result.editions['cod-bo6-edition'].colors, ['black+orange']);
  });

  it('edition display_name defaults to empty string when omitted', () => {
    const input = {
      colors: [blackItem],
      editions: { 'launch-edition': { colors: ['black'], evidence_refs: [] } },
      default_color: 'black',
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.equal(result.editions['launch-edition'].display_name, '');
  });

  // ── siblings_excluded ──

  it('parses siblings_excluded array', () => {
    const input = {
      colors: [blackItem],
      default_color: 'black',
      siblings_excluded: ['M75 Air Wireless Pro', 'M75 Wired'],
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.siblings_excluded, ['M75 Air Wireless Pro', 'M75 Wired']);
  });

  it('siblings_excluded defaults to empty array when omitted', () => {
    const input = { colors: [blackItem], default_color: 'black' };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.siblings_excluded, []);
  });

  // ── discovery_log ──

  it('parses full discovery_log with all sub-arrays', () => {
    const input = {
      colors: [blackItem],
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
    assert.deepEqual(result.discovery_log.urls_checked, ['https://corsair.com/m75']);
  });

  it('discovery_log defaults to all-empty when omitted', () => {
    const input = { colors: [blackItem], default_color: 'black' };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.discovery_log, {
      confirmed_from_known: [],
      added_new: [],
      rejected_from_known: [],
      urls_checked: [],
      queries_run: [],
    });
  });

  // ── per-item evidence_refs ──

  it('each color carries its own evidence_refs', () => {
    const input = {
      colors: [
        { name: 'black', evidence_refs: [
          { url: 'https://razer.com/m1', tier: 'tier1', confidence: 95 },
          { url: 'https://bestbuy.com/m1', tier: 'tier3', confidence: 70 },
        ]},
        { name: 'white', evidence_refs: [
          { url: 'https://razer.com/m1', tier: 'tier1', confidence: 90 },
        ]},
      ],
      default_color: 'black',
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.equal(result.colors[0].evidence_refs.length, 2);
    assert.equal(result.colors[1].evidence_refs.length, 1);
  });

  it('each edition carries its own evidence_refs', () => {
    const input = {
      colors: [comboItem],
      editions: {
        'doom-edition': {
          display_name: 'DOOM Edition',
          colors: ['black+red'],
          evidence_refs: [
            { url: 'https://razer.com/doom', tier: 'tier1', confidence: 92 },
          ],
        },
      },
      default_color: 'black+red',
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.equal(result.editions['doom-edition'].evidence_refs.length, 1);
    assert.equal(result.editions['doom-edition'].evidence_refs[0].url, 'https://razer.com/doom');
  });

  it('per-item evidence_refs defaults to empty array when omitted', () => {
    const input = {
      colors: [{ name: 'black' }],
      editions: { 'e1': { colors: ['black'] } },
      default_color: 'black',
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.deepEqual(result.colors[0].evidence_refs, []);
    assert.deepEqual(result.editions['e1'].evidence_refs, []);
  });

  it('per-item evidence_refs entry defaults confidence to 0 when omitted', () => {
    const input = {
      colors: [{ name: 'black', evidence_refs: [{ url: 'u', tier: 'tier1' }] }],
      default_color: 'black',
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.equal(result.colors[0].evidence_refs[0].confidence, 0);
  });

  it('rejects per-item evidence_refs entry with confidence out of 0-100 range', () => {
    const inputLow = {
      colors: [{ name: 'black', evidence_refs: [{ url: 'u', tier: 'tier1', confidence: -5 }] }],
      default_color: 'black',
    };
    const inputHigh = {
      colors: [{ name: 'black', evidence_refs: [{ url: 'u', tier: 'tier1', confidence: 101 }] }],
      default_color: 'black',
    };
    assert.throws(() => colorEditionFinderResponseSchema.parse(inputLow));
    assert.throws(() => colorEditionFinderResponseSchema.parse(inputHigh));
  });

  it('rejects per-item evidence_refs entry missing url', () => {
    const input = {
      colors: [{ name: 'black', evidence_refs: [{ tier: 'tier1' }] }],
      default_color: 'black',
    };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });

  it('rejects per-item evidence_refs entry missing tier', () => {
    const input = {
      colors: [{ name: 'black', evidence_refs: [{ url: 'https://razer.com/m1' }] }],
      default_color: 'black',
    };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });

  // ── per-item value-level confidence ──

  it('parses color items with value-level confidence', () => {
    const input = {
      colors: [
        { name: 'black', confidence: 85, evidence_refs: [{ url: 'u', tier: 'tier1', confidence: 95 }] },
        { name: 'white', confidence: 70, evidence_refs: [{ url: 'u', tier: 'tier2', confidence: 90 }] },
      ],
      default_color: 'black',
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.equal(result.colors[0].confidence, 85);
    assert.equal(result.colors[1].confidence, 70);
  });

  it('parses edition items with value-level confidence', () => {
    const input = {
      colors: [{ name: 'black+red', evidence_refs: [] }],
      editions: {
        'doom-edition': {
          display_name: 'DOOM Edition',
          colors: ['black+red'],
          confidence: 92,
          evidence_refs: [{ url: 'u', tier: 'tier1', confidence: 95 }],
        },
      },
      default_color: 'black+red',
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.equal(result.editions['doom-edition'].confidence, 92);
  });

  it('per-item confidence defaults to 0 when omitted (prompt miss, not a parse failure)', () => {
    const input = {
      colors: [{ name: 'black', evidence_refs: [] }],
      editions: { 'e1': { colors: ['black'], evidence_refs: [] } },
      default_color: 'black',
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.equal(result.colors[0].confidence, 0);
    assert.equal(result.editions['e1'].confidence, 0);
  });

  it('rejects per-item confidence outside 0-100', () => {
    const inputLow = {
      colors: [{ name: 'black', confidence: -1, evidence_refs: [] }],
      default_color: 'black',
    };
    const inputHigh = {
      colors: [{ name: 'black', confidence: 101, evidence_refs: [] }],
      default_color: 'black',
    };
    assert.throws(() => colorEditionFinderResponseSchema.parse(inputLow));
    assert.throws(() => colorEditionFinderResponseSchema.parse(inputHigh));
  });

  it('rejects non-integer per-item confidence', () => {
    const input = {
      colors: [{ name: 'black', confidence: 85.5, evidence_refs: [] }],
      default_color: 'black',
    };
    assert.throws(() => colorEditionFinderResponseSchema.parse(input));
  });

  it('accepts all 6 tier codes on per-item evidence_refs entries', () => {
    const input = {
      colors: [{
        name: 'black',
        evidence_refs: [
          { url: 'u1', tier: 'tier1', confidence: 95 },
          { url: 'u2', tier: 'tier2', confidence: 90 },
          { url: 'u3', tier: 'tier3', confidence: 70 },
          { url: 'u4', tier: 'tier4', confidence: 40 },
          { url: 'u5', tier: 'tier5', confidence: 30 },
          { url: 'u6', tier: 'other', confidence: 10 },
        ],
      }],
      default_color: 'black',
    };
    const result = colorEditionFinderResponseSchema.parse(input);
    assert.equal(result.colors[0].evidence_refs.length, 6);
  });
});

/* ── variantIdentityCheckResponseSchema (unchanged) ────────────────────── */

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
      remove: [],
    });
    assert.ok(result.success);
    assert.equal(result.data.mappings[0].action, 'match');
    assert.equal(result.data.mappings[0].match, 'v_a1b2c3d4');
  });

  it('accepts valid response with new mapping (null match)', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [{ new_key: 'color:crimson-red', match: null, action: 'new', reason: 'genuinely new color' }],
      remove: [],
    });
    assert.ok(result.success);
    assert.equal(result.data.mappings[0].action, 'new');
    assert.equal(result.data.mappings[0].match, null);
  });

  it('accepts valid response with reject mapping (null match)', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [{ new_key: 'color:light-olive+black', match: null, action: 'reject', reason: 'hallucinated' }],
      remove: [],
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
      remove: ['v_deadbeef'],
    });
    assert.ok(result.success);
    assert.equal(result.data.mappings.length, 3);
    assert.deepStrictEqual(result.data.remove, ['v_deadbeef']);
  });

  it('rejects invalid action value', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [{ ...validMapping, action: 'delete' }],
      remove: [],
    });
    assert.ok(!result.success);
  });

  it('rejects missing new_key', () => {
    const { new_key: _, ...noKey } = validMapping;
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [noKey],
      remove: [],
    });
    assert.ok(!result.success);
  });

  it('remove defaults to empty array when omitted', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({ mappings: [] });
    assert.ok(result.success);
    assert.deepStrictEqual(result.data.remove, []);
  });

  it('verified defaults to false when omitted', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [validMapping],
      remove: [],
    });
    assert.ok(result.success);
    assert.equal(result.data.mappings[0].verified, false);
  });

  it('preferred_label accepts a string', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [{ ...validMapping, preferred_label: 'Official Black' }],
      remove: [],
    });
    assert.ok(result.success);
    assert.equal(result.data.mappings[0].preferred_label, 'Official Black');
  });

  it('orphan_remaps defaults to empty array when omitted', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [validMapping],
      remove: [],
    });
    assert.ok(result.success);
    assert.deepEqual(result.data.orphan_remaps, []);
  });

  it('accepts valid remap orphan entry', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [],
      remove: [],
      orphan_remaps: [
        { orphan_key: 'edition:doom-old', action: 'remap', remap_to: 'edition:doom-new', reason: 'slug drift' },
      ],
    });
    assert.ok(result.success);
    assert.equal(result.data.orphan_remaps[0].action, 'remap');
  });

  it('accepts valid dead orphan entry with null remap_to', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [],
      remove: [],
      orphan_remaps: [
        { orphan_key: 'color:navy', action: 'dead', remap_to: null, reason: 'hallucinated' },
      ],
    });
    assert.ok(result.success);
    assert.equal(result.data.orphan_remaps[0].action, 'dead');
  });

  it('mapping accepts value-level confidence', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [{ ...validMapping, confidence: 88 }],
      remove: [],
    });
    assert.ok(result.success);
    assert.equal(result.data.mappings[0].confidence, 88);
  });

  it('mapping confidence defaults to 0 when omitted', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [validMapping],
      remove: [],
    });
    assert.ok(result.success);
    assert.equal(result.data.mappings[0].confidence, 0);
  });

  it('mapping rejects confidence outside 0-100', () => {
    const resultLow = variantIdentityCheckResponseSchema.safeParse({
      mappings: [{ ...validMapping, confidence: -5 }],
      remove: [],
    });
    const resultHigh = variantIdentityCheckResponseSchema.safeParse({
      mappings: [{ ...validMapping, confidence: 150 }],
      remove: [],
    });
    assert.ok(!resultLow.success);
    assert.ok(!resultHigh.success);
  });

  it('mapping accepts evidence_refs array', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [{
        new_key: 'color:black',
        match: null,
        action: 'new',
        reason: 'confirmed on razer.com',
        verified: true,
        evidence_refs: [{ url: 'https://razer.com/m1', tier: 'tier1', confidence: 95 }],
      }],
      remove: [],
    });
    assert.ok(result.success);
    assert.equal(result.data.mappings[0].evidence_refs.length, 1);
  });

  it('mapping evidence_refs defaults to empty array when omitted', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [validMapping],
      remove: [],
    });
    assert.ok(result.success);
    assert.deepEqual(result.data.mappings[0].evidence_refs, []);
  });

  it('mapping rejects evidence_refs entry missing url', () => {
    const result = variantIdentityCheckResponseSchema.safeParse({
      mappings: [{
        new_key: 'color:black', match: null, action: 'new', reason: 'new',
        evidence_refs: [{ tier: 'tier1' }],
      }],
      remove: [],
    });
    assert.ok(!result.success);
  });
});
