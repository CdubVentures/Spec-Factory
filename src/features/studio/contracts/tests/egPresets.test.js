import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EG_PRESET_REGISTRY,
  EG_LOCKED_KEYS,
  EG_EDITABLE_PATHS,
  EG_DEFAULT_TOGGLES,
  buildEgColorFieldRule,
  buildEgEditionFieldRule,
  buildEgReleaseDateFieldRule,
  buildEgSkuFieldRule,
  buildAllEgDefaults,
  getEgPresetForKey,
  preserveEgEditablePaths,
  sanitizeEgLockedOverrides,
  isEgLockedField,
  isEgEditablePath,
  resolveEgLockedKeys,
} from '../egPresets.js';

describe('EG_LOCKED_KEYS', () => {
  it('contains colors, editions, release_date, and sku', () => {
    assert.deepEqual([...EG_LOCKED_KEYS].sort(), ['colors', 'editions', 'release_date', 'sku']);
  });

  it('is frozen', () => {
    assert.ok(Object.isFrozen(EG_LOCKED_KEYS));
  });
});

describe('EG_EDITABLE_PATHS', () => {
  it('contains search/alias paths plus user-movable ui.group', () => {
    const allowed = new Set([
      'ui.aliases',
      'ui.group',
      'search_hints.domain_hints',
      'search_hints.content_types',
      'search_hints.query_terms',
      'ui.tooltip_md',
    ]);
    assert.deepEqual(new Set(EG_EDITABLE_PATHS), allowed);
  });

  it('is frozen', () => {
    assert.ok(Object.isFrozen(EG_EDITABLE_PATHS));
  });
});

// ── buildEgColorFieldRule ────────────────────────────────────────────────────

describe('buildEgColorFieldRule', () => {
  it('returns an object with correct contract', () => {
    const rule = buildEgColorFieldRule();
    assert.equal(rule.contract.type, 'string');
    assert.equal(rule.contract.shape, 'list');
  });

  it('has delimiters WITHOUT "+"', () => {
    const rule = buildEgColorFieldRule();
    assert.ok(Array.isArray(rule.parse.delimiters));
    assert.ok(!rule.parse.delimiters.includes('+'), 'delimiters must not include "+"');
    assert.ok(rule.parse.delimiters.includes(','), 'must include comma');
  });

  it('has standard non-plus delimiters', () => {
    const rule = buildEgColorFieldRule();
    const expected = [',', '/', '|', ';'];
    assert.deepEqual(rule.parse.delimiters.sort(), expected.sort());
  });

  it('has token_map with grey→gray and modifier-first normalization', () => {
    const rule = buildEgColorFieldRule();
    assert.equal(rule.parse.token_map.grey, 'gray');
    // modifier-last → modifier-first
    assert.equal(rule.parse.token_map['gray-light'], 'light-gray');
    assert.equal(rule.parse.token_map['blue-dark'], 'dark-blue');
    assert.equal(rule.parse.token_map['green-dark'], 'dark-green');
    // natural language → modifier-first
    assert.equal(rule.parse.token_map['light gray'], 'light-gray');
    assert.equal(rule.parse.token_map['dark blue'], 'dark-blue');
    assert.equal(rule.parse.token_map['light green'], 'light-green');
  });

  it('has delimiters in parse (template eliminated)', () => {
    const rule = buildEgColorFieldRule();
    assert.equal(rule.parse.template, undefined);
    assert.deepEqual(rule.parse.delimiters, [',', '/', '|', ';']);
  });

  it('has closed enum policy (colors are a closed vocabulary from the registry)', () => {
    const rule = buildEgColorFieldRule();
    assert.equal(rule.enum_policy, 'closed');
    assert.equal(rule.enum.policy, 'closed');
    assert.equal(rule.enum.new_value_policy.accept_if_evidence, true);
    assert.equal(rule.enum.new_value_policy.mark_needs_curation, false);
  });

  it('has expected priority level', () => {
    const rule = buildEgColorFieldRule();
    assert.equal(rule.priority.required_level, 'non_mandatory');
  });

  it('has UI metadata', () => {
    const rule = buildEgColorFieldRule();
    assert.equal(rule.ui.label, 'Colors');
  });

  it('has ai_assist with empty reasoning_note (placeholder for future extraction guidance)', () => {
    const rule = buildEgColorFieldRule();
    assert.strictEqual(rule.ai_assist.reasoning_note, '');
  });

  it('has search_hints with domain hints populated', () => {
    const rule = buildEgColorFieldRule();
    assert.ok(rule.search_hints.domain_hints.length > 0, 'domain_hints should be populated');
  });

  it('has winner_only item_union for complete-list submissions', () => {
    const rule = buildEgColorFieldRule();
    assert.equal(rule.contract.list_rules.item_union, 'winner_only');
  });

  it('returns a new object each call (no shared mutation)', () => {
    const a = buildEgColorFieldRule();
    const b = buildEgColorFieldRule();
    assert.notEqual(a, b);
    a.parse.delimiters.push('X');
    assert.ok(!b.parse.delimiters.includes('X'));
  });
});

// ── buildEgEditionFieldRule ──────────────────────────────────────────────────

describe('buildEgEditionFieldRule', () => {
  it('returns an object with correct contract', () => {
    const rule = buildEgEditionFieldRule();
    assert.equal(rule.contract.type, 'string');
    assert.equal(rule.contract.shape, 'list');
  });

  it('has comma-only delimiter', () => {
    const rule = buildEgEditionFieldRule();
    assert.deepEqual(rule.parse.delimiters, [',']);
  });

  it('has open enum policy with exact matching', () => {
    const rule = buildEgEditionFieldRule();
    assert.equal(rule.enum_policy, 'open');
    assert.equal(rule.enum.policy, 'open');
    assert.equal(rule.enum.new_value_policy.mark_needs_curation, true);
  });

  it('has ai_assist with empty reasoning_note (placeholder for future extraction guidance)', () => {
    const rule = buildEgEditionFieldRule();
    assert.strictEqual(rule.ai_assist.reasoning_note, '');
  });

  it('has optional required level', () => {
    const rule = buildEgEditionFieldRule();
    assert.equal(rule.priority.required_level, 'non_mandatory');
  });

  it('has UI metadata', () => {
    const rule = buildEgEditionFieldRule();
    assert.equal(rule.ui.label, 'Editions');
  });

  it('has delimiters in parse (template eliminated)', () => {
    const rule = buildEgEditionFieldRule();
    assert.equal(rule.parse.template, undefined);
    assert.deepEqual(rule.parse.delimiters, [',']);
  });

  it('returns a new object each call', () => {
    const a = buildEgEditionFieldRule();
    const b = buildEgEditionFieldRule();
    assert.notEqual(a, b);
  });
});

// ── buildEgReleaseDateFieldRule ──────────────────────────────────────────────

describe('buildEgReleaseDateFieldRule', () => {
  it('returns an object with key release_date', () => {
    const rule = buildEgReleaseDateFieldRule();
    assert.equal(rule.key, 'release_date');
  });

  it('has scalar date contract', () => {
    const rule = buildEgReleaseDateFieldRule();
    assert.equal(rule.contract.type, 'date');
    assert.equal(rule.contract.shape, 'scalar');
  });

  it('has empty delimiters (scalar, not list)', () => {
    const rule = buildEgReleaseDateFieldRule();
    assert.deepEqual(rule.parse.delimiters, []);
  });

  it('has accepted_formats covering every precision the prompt asks the LLM to return', () => {
    const rule = buildEgReleaseDateFieldRule();
    assert.deepEqual(
      rule.parse.accepted_formats,
      ['YYYY-MM-DD', 'YYYY-MM', 'YYYY', 'MMM YYYY', 'Month YYYY'],
    );
  });

  it('has open enum policy (new dates acceptable with evidence)', () => {
    const rule = buildEgReleaseDateFieldRule();
    assert.equal(rule.enum_policy, 'open');
    assert.equal(rule.enum.policy, 'open');
    assert.equal(rule.enum.new_value_policy.accept_if_evidence, true);
  });

  it('has expected required_level with sometimes availability', () => {
    const rule = buildEgReleaseDateFieldRule();
    assert.equal(rule.priority.required_level, 'non_mandatory');
    assert.equal(rule.priority.availability, 'sometimes');
    assert.equal(rule.priority.difficulty, 'medium');
  });

  it('has evidence min_refs 1 with standard tier preference', () => {
    const rule = buildEgReleaseDateFieldRule();
    assert.equal(rule.evidence.min_evidence_refs, 1);
    assert.deepEqual(rule.evidence.tier_preference, ['tier1', 'tier2', 'tier3']);
  });

  it('has UI label "Release Date"', () => {
    const rule = buildEgReleaseDateFieldRule();
    assert.equal(rule.ui.label, 'Release Date');
  });

  it('has search_hints with date-oriented query terms and domain hints', () => {
    const rule = buildEgReleaseDateFieldRule();
    assert.ok(rule.search_hints.query_terms.includes('release date'));
    assert.ok(rule.search_hints.query_terms.includes('launch date'));
    assert.ok(rule.search_hints.domain_hints.length > 0);
    assert.ok(rule.search_hints.content_types.includes('product_page'));
  });

  it('has ai_assist with reasoning_note field (may be empty or populated)', () => {
    const rule = buildEgReleaseDateFieldRule();
    assert.equal(typeof rule.ai_assist.reasoning_note, 'string');
  });

  it('has no token_map (scalar date, no normalization vocabulary)', () => {
    const rule = buildEgReleaseDateFieldRule();
    assert.ok(!rule.parse.token_map || Object.keys(rule.parse.token_map).length === 0);
  });

  it('returns a new object each call (no shared mutation)', () => {
    const a = buildEgReleaseDateFieldRule();
    const b = buildEgReleaseDateFieldRule();
    assert.notEqual(a, b);
  });
});

// ── buildEgSkuFieldRule ──────────────────────────────────────────────────────

describe('buildEgSkuFieldRule', () => {
  it('returns an object with key sku', () => {
    const rule = buildEgSkuFieldRule();
    assert.equal(rule.key, 'sku');
  });

  it('has scalar string contract', () => {
    const rule = buildEgSkuFieldRule();
    assert.equal(rule.contract.type, 'string');
    assert.equal(rule.contract.shape, 'scalar');
  });

  it('is variant-dependent (per-variant MPN)', () => {
    const rule = buildEgSkuFieldRule();
    assert.equal(rule.variant_dependent, true);
  });

  it('has empty delimiters (scalar, not list)', () => {
    const rule = buildEgSkuFieldRule();
    assert.deepEqual(rule.parse.delimiters, []);
  });

  it('has empty accepted_formats (MPN formats vary per manufacturer)', () => {
    const rule = buildEgSkuFieldRule();
    assert.deepEqual(rule.parse.accepted_formats, []);
  });

  it('has open enum policy (new MPNs acceptable with evidence)', () => {
    const rule = buildEgSkuFieldRule();
    assert.equal(rule.enum_policy, 'open');
    assert.equal(rule.enum.policy, 'open');
    assert.equal(rule.enum.new_value_policy.accept_if_evidence, true);
    assert.equal(rule.enum.new_value_policy.mark_needs_curation, false);
  });

  it('has mandatory required_level and hard difficulty (identity-class, per-variant MPN is hard)', () => {
    const rule = buildEgSkuFieldRule();
    assert.equal(rule.priority.required_level, 'mandatory');
    assert.equal(rule.priority.availability, 'sometimes');
    assert.equal(rule.priority.difficulty, 'hard');
  });

  it('has evidence min_refs 1 with standard tier preference', () => {
    const rule = buildEgSkuFieldRule();
    assert.equal(rule.evidence.min_evidence_refs, 1);
    assert.deepEqual(rule.evidence.tier_preference, ['tier1', 'tier2', 'tier3']);
  });

  it('has UI label "SKU"', () => {
    const rule = buildEgSkuFieldRule();
    assert.equal(rule.ui.label, 'SKU');
  });

  // WHY: sku is an identity field (DEFAULT_IDENTITY_FIELDS + common_identity).
  // Seed matches the system-wide convention; users may still move it via Field Studio.
  it('seeds ui.group to identity', () => {
    const rule = buildEgSkuFieldRule();
    assert.equal(rule.ui.group, 'identity');
  });

  it('has search_hints with MPN-oriented query terms', () => {
    const rule = buildEgSkuFieldRule();
    assert.ok(rule.search_hints.query_terms.includes('part number'));
    assert.ok(rule.search_hints.query_terms.includes('mpn'));
    assert.ok(rule.search_hints.content_types.includes('product_page'));
  });

  it('has ai_assist with reasoning_note field (empty placeholder — prompt lives in LLM adapter)', () => {
    const rule = buildEgSkuFieldRule();
    assert.equal(typeof rule.ai_assist.reasoning_note, 'string');
  });

  it('returns a new object each call (no shared mutation)', () => {
    const a = buildEgSkuFieldRule();
    const b = buildEgSkuFieldRule();
    assert.notEqual(a, b);
  });
});

// ── isEgLockedField ──────────────────────────────────────────────────────────

describe('isEgLockedField', () => {
  it('returns true for colors', () => {
    assert.equal(isEgLockedField('colors'), true);
  });

  it('returns true for editions', () => {
    assert.equal(isEgLockedField('editions'), true);
  });

  it('returns true for release_date', () => {
    assert.equal(isEgLockedField('release_date'), true);
  });

  it('returns true for sku', () => {
    assert.equal(isEgLockedField('sku'), true);
  });

  it('returns false for other fields', () => {
    assert.equal(isEgLockedField('brand'), false);
    assert.equal(isEgLockedField('weight'), false);
    assert.equal(isEgLockedField('sensor'), false);
  });
});

// ── isEgEditablePath ─────────────────────────────────────────────────────────

describe('isEgEditablePath', () => {
  it('returns true for allowed paths', () => {
    assert.equal(isEgEditablePath('ui.aliases'), true);
    assert.equal(isEgEditablePath('search_hints.domain_hints'), true);
    assert.equal(isEgEditablePath('search_hints.content_types'), true);
    assert.equal(isEgEditablePath('search_hints.query_terms'), true);
    assert.equal(isEgEditablePath('ui.tooltip_md'), true);
  });

  it('returns false for locked paths', () => {
    assert.equal(isEgEditablePath('contract.type'), false);
    assert.equal(isEgEditablePath('parse.delimiters'), false);
    assert.equal(isEgEditablePath('parse.template'), false);
    assert.equal(isEgEditablePath('enum_policy'), false);
    assert.equal(isEgEditablePath('priority.required_level'), false);
  });
});

// ── EG_DEFAULT_TOGGLES ───────────────────────────────────────────────────────

describe('EG_DEFAULT_TOGGLES', () => {
  it('has colors, editions, release_date, and sku all set to true', () => {
    assert.equal(EG_DEFAULT_TOGGLES.colors, true);
    assert.equal(EG_DEFAULT_TOGGLES.editions, true);
    assert.equal(EG_DEFAULT_TOGGLES.release_date, true);
    assert.equal(EG_DEFAULT_TOGGLES.sku, true);
  });

  it('is frozen', () => {
    assert.ok(Object.isFrozen(EG_DEFAULT_TOGGLES));
  });
});

// ── resolveEgLockedKeys ──────────────────────────────────────────────────────

describe('resolveEgLockedKeys', () => {
  it('returns all four keys when all toggles are true', () => {
    assert.deepEqual(
      resolveEgLockedKeys({ colors: true, editions: true, release_date: true, sku: true }).sort(),
      ['colors', 'editions', 'release_date', 'sku'],
    );
  });

  it('returns only colors when editions, release_date, and sku are false', () => {
    assert.deepEqual(
      resolveEgLockedKeys({ colors: true, editions: false, release_date: false, sku: false }),
      ['colors'],
    );
  });

  it('returns only editions when colors, release_date, and sku are false', () => {
    assert.deepEqual(
      resolveEgLockedKeys({ colors: false, editions: true, release_date: false, sku: false }),
      ['editions'],
    );
  });

  it('returns only release_date when colors, editions, and sku are false', () => {
    assert.deepEqual(
      resolveEgLockedKeys({ colors: false, editions: false, release_date: true, sku: false }),
      ['release_date'],
    );
  });

  it('returns only sku when colors, editions, and release_date are false', () => {
    assert.deepEqual(
      resolveEgLockedKeys({ colors: false, editions: false, release_date: false, sku: true }),
      ['sku'],
    );
  });

  it('excludes release_date when its toggle is missing', () => {
    assert.ok(!resolveEgLockedKeys({ colors: true, editions: true, sku: true }).includes('release_date'));
  });

  it('excludes sku when its toggle is missing', () => {
    assert.ok(!resolveEgLockedKeys({ colors: true, editions: true, release_date: true }).includes('sku'));
  });

  it('returns empty array when all are false', () => {
    assert.deepEqual(
      resolveEgLockedKeys({ colors: false, editions: false, release_date: false, sku: false }),
      [],
    );
  });

  it('returns empty array for empty object', () => {
    assert.deepEqual(resolveEgLockedKeys({}), []);
  });

  it('returns empty array for undefined', () => {
    assert.deepEqual(resolveEgLockedKeys(undefined), []);
  });

  it('returns empty array for null', () => {
    assert.deepEqual(resolveEgLockedKeys(null), []);
  });
});

// ── EG_PRESET_REGISTRY ──────────────────────────────────────────────────────

describe('EG_PRESET_REGISTRY', () => {
  it('is frozen', () => {
    assert.ok(Object.isFrozen(EG_PRESET_REGISTRY));
  });

  it('keys match EG_LOCKED_KEYS', () => {
    assert.deepEqual(Object.keys(EG_PRESET_REGISTRY).sort(), [...EG_LOCKED_KEYS].sort());
  });

  it('each value is a builder function', () => {
    for (const [key, builder] of Object.entries(EG_PRESET_REGISTRY)) {
      assert.equal(typeof builder, 'function', `${key} builder must be a function`);
      const result = builder();
      assert.equal(result.key, key, `builder for ${key} must return rule with key=${key}`);
    }
  });
});

// ── buildAllEgDefaults ──────────────────────────────────────────────────────

describe('buildAllEgDefaults', () => {
  it('returns an entry per registry key', () => {
    const defaults = buildAllEgDefaults();
    assert.deepEqual(Object.keys(defaults).sort(), [...EG_LOCKED_KEYS].sort());
  });

  it('each entry matches its individual builder output', () => {
    const defaults = buildAllEgDefaults();
    assert.deepEqual(defaults.colors, buildEgColorFieldRule());
    assert.deepEqual(defaults.editions, buildEgEditionFieldRule());
    assert.deepEqual(defaults.release_date, buildEgReleaseDateFieldRule());
    assert.deepEqual(defaults.sku, buildEgSkuFieldRule());
  });

  it('returns fresh objects each call', () => {
    const a = buildAllEgDefaults();
    const b = buildAllEgDefaults();
    assert.notEqual(a, b);
    assert.notEqual(a.colors, b.colors);
  });
});

// ── getEgPresetForKey ───────────────────────────────────────────────────────

describe('getEgPresetForKey', () => {
  it('returns color rule for "colors"', () => {
    const rule = getEgPresetForKey('colors');
    assert.deepEqual(rule, buildEgColorFieldRule());
  });

  it('returns edition rule for "editions"', () => {
    const rule = getEgPresetForKey('editions');
    assert.deepEqual(rule, buildEgEditionFieldRule());
  });

  it('returns release_date rule for "release_date"', () => {
    const rule = getEgPresetForKey('release_date');
    assert.deepEqual(rule, buildEgReleaseDateFieldRule());
  });

  it('returns sku rule for "sku"', () => {
    const rule = getEgPresetForKey('sku');
    assert.deepEqual(rule, buildEgSkuFieldRule());
  });

  it('returns null for unknown key', () => {
    assert.equal(getEgPresetForKey('brand'), null);
    assert.equal(getEgPresetForKey(''), null);
  });
});

// ── preserveEgEditablePaths ─────────────────────────────────────────────────

describe('preserveEgEditablePaths', () => {
  it('preserves editable paths from current, uses preset for everything else', () => {
    const current = {
      key: 'colors',
      contract: { type: 'MUTATED' },
      ui: { label: 'MUTATED', aliases: ['custom-alias'] },
      search_hints: { domain_hints: ['custom.com'], query_terms: ['custom query'] },
    };
    const preset = buildEgColorFieldRule();
    const merged = preserveEgEditablePaths(current, preset);

    // Non-editable paths reset to preset
    assert.equal(merged.contract.type, preset.contract.type);
    assert.equal(merged.ui.label, preset.ui.label);

    // Editable paths preserved from current
    assert.deepEqual(merged.ui.aliases, ['custom-alias']);
    assert.deepEqual(merged.search_hints.domain_hints, ['custom.com']);
    assert.deepEqual(merged.search_hints.query_terms, ['custom query']);
  });

  it('handles missing sections gracefully', () => {
    const current = {};
    const preset = buildEgColorFieldRule();
    const merged = preserveEgEditablePaths(current, preset);
    assert.deepEqual(merged, preset);
  });

  it('returns fresh object (does not mutate preset)', () => {
    const preset = buildEgColorFieldRule();
    const original = JSON.parse(JSON.stringify(preset));
    preserveEgEditablePaths({ ui: { aliases: ['x'] } }, preset);
    assert.deepEqual(preset, original);
  });

  it('preserves editable paths for release_date (aliases + search_hints)', () => {
    const current = {
      key: 'release_date',
      contract: { type: 'MUTATED' },
      ui: { label: 'MUTATED', aliases: ['launch_date', 'available_since'] },
      search_hints: { domain_hints: ['custom.com'] },
    };
    const preset = buildEgReleaseDateFieldRule();
    const merged = preserveEgEditablePaths(current, preset);

    assert.equal(merged.contract.type, preset.contract.type);
    assert.equal(merged.ui.label, preset.ui.label);
    assert.deepEqual(merged.ui.aliases, ['launch_date', 'available_since']);
    assert.deepEqual(merged.search_hints.domain_hints, ['custom.com']);
  });

  // WHY: Group is user-movable via Field Studio. Preset supplies only a seed;
  // any user-set ui.group on the override must win.
  it('preserves user-set ui.group over preset seed', () => {
    const current = {
      key: 'sku',
      ui: { group: 'identity', label: 'MUTATED' },
    };
    const preset = buildEgSkuFieldRule();
    const merged = preserveEgEditablePaths(current, preset);

    assert.equal(merged.ui.group, 'identity');
    assert.equal(merged.ui.label, preset.ui.label);
  });
});

// ── sanitizeEgLockedOverrides ───────────────────────────────────────────────

describe('sanitizeEgLockedOverrides', () => {
  it('resets non-editable paths on locked fields to preset', () => {
    const overrides = {
      colors: {
        key: 'colors',
        contract: { type: 'HACKED' },
        ui: { label: 'HACKED', aliases: ['my-alias'], tooltip_md: 'custom tip' },
        search_hints: { domain_hints: ['mine.com'], content_types: ['blog'] },
      },
    };
    const sanitized = sanitizeEgLockedOverrides(overrides, { colors: true, editions: true });
    const preset = buildEgColorFieldRule();

    // Non-editable: reset
    assert.equal(sanitized.colors.contract.type, preset.contract.type);
    assert.equal(sanitized.colors.ui.label, preset.ui.label);

    // Editable: preserved
    assert.deepEqual(sanitized.colors.ui.aliases, ['my-alias']);
    assert.equal(sanitized.colors.ui.tooltip_md, 'custom tip');
    assert.deepEqual(sanitized.colors.search_hints.domain_hints, ['mine.com']);
    assert.deepEqual(sanitized.colors.search_hints.content_types, ['blog']);
  });

  it('does not touch non-locked fields', () => {
    const overrides = {
      brand: { key: 'brand', contract: { type: 'custom' } },
    };
    const sanitized = sanitizeEgLockedOverrides(overrides, { colors: true, editions: true });
    assert.deepEqual(sanitized.brand, overrides.brand);
  });

  it('does not sanitize toggled-off keys', () => {
    const overrides = {
      colors: { key: 'colors', contract: { type: 'HACKED' } },
    };
    const sanitized = sanitizeEgLockedOverrides(overrides, { colors: false, editions: true });
    assert.equal(sanitized.colors.contract.type, 'HACKED');
  });

  it('sanitizes release_date non-editable paths when toggle is on', () => {
    const overrides = {
      release_date: {
        key: 'release_date',
        contract: { type: 'HACKED' },
        ui: { label: 'HACKED', aliases: ['launch_date'], tooltip_md: 'custom tip' },
        search_hints: { domain_hints: ['mine.com'] },
      },
    };
    const sanitized = sanitizeEgLockedOverrides(
      overrides,
      { colors: true, editions: true, release_date: true },
    );
    const preset = buildEgReleaseDateFieldRule();

    // Non-editable: reset
    assert.equal(sanitized.release_date.contract.type, preset.contract.type);
    assert.equal(sanitized.release_date.ui.label, preset.ui.label);

    // Editable: preserved
    assert.deepEqual(sanitized.release_date.ui.aliases, ['launch_date']);
    assert.equal(sanitized.release_date.ui.tooltip_md, 'custom tip');
    assert.deepEqual(sanitized.release_date.search_hints.domain_hints, ['mine.com']);
  });

  it('does not sanitize release_date when its toggle is off', () => {
    const overrides = {
      release_date: { key: 'release_date', contract: { type: 'HACKED' } },
    };
    const sanitized = sanitizeEgLockedOverrides(
      overrides,
      { colors: true, editions: true, release_date: false },
    );
    assert.equal(sanitized.release_date.contract.type, 'HACKED');
  });

  it('handles null/undefined gracefully', () => {
    assert.equal(sanitizeEgLockedOverrides(null, {}), null);
    assert.equal(sanitizeEgLockedOverrides(undefined, {}), undefined);
  });

  // WHY: A user moving sku into the identity group must survive re-save.
  it('preserves user-set ui.group on locked sku override', () => {
    const overrides = {
      sku: {
        key: 'sku',
        contract: { type: 'HACKED' },
        ui: { label: 'HACKED', group: 'identity' },
      },
    };
    const sanitized = sanitizeEgLockedOverrides(
      overrides,
      { colors: true, editions: true, release_date: true, sku: true },
    );
    const preset = buildEgSkuFieldRule();

    assert.equal(sanitized.sku.contract.type, preset.contract.type);
    assert.equal(sanitized.sku.ui.label, preset.ui.label);
    assert.equal(sanitized.sku.ui.group, 'identity');
  });
});
