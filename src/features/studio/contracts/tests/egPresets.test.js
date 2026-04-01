import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EG_CANONICAL_COLORS,
  EG_PRESET_REGISTRY,
  EG_LOCKED_KEYS,
  EG_EDITABLE_PATHS,
  EG_DEFAULT_TOGGLES,
  buildEgColorFieldRule,
  buildEgEditionFieldRule,
  buildAllEgDefaults,
  getEgPresetForKey,
  preserveEgEditablePaths,
  sanitizeEgLockedOverrides,
  isEgLockedField,
  isEgEditablePath,
  resolveEgLockedKeys,
} from '../egPresets.js';

// ── Constants ────────────────────────────────────────────────────────────────

describe('EG_CANONICAL_COLORS', () => {
  it('is a non-empty frozen array of strings', () => {
    assert.ok(Array.isArray(EG_CANONICAL_COLORS));
    assert.ok(EG_CANONICAL_COLORS.length >= 10, 'expected at least 10 canonical colors');
    for (const c of EG_CANONICAL_COLORS) {
      assert.equal(typeof c, 'string');
      assert.ok(c.length > 0);
    }
    assert.ok(Object.isFrozen(EG_CANONICAL_COLORS));
  });

  it('includes core EG colors', () => {
    const expected = ['black', 'white', 'red', 'blue', 'green', 'gray', 'orange', 'pink', 'purple', 'yellow'];
    for (const c of expected) {
      assert.ok(EG_CANONICAL_COLORS.includes(c), `missing canonical color: ${c}`);
    }
  });

  it('includes light/dark variants (modifier-first)', () => {
    assert.ok(EG_CANONICAL_COLORS.includes('light-gray'));
    assert.ok(EG_CANONICAL_COLORS.includes('dark-blue'));
    assert.ok(EG_CANONICAL_COLORS.includes('light-blue'));
    assert.ok(EG_CANONICAL_COLORS.includes('dark-green'));
  });

  it('does not contain "+" multi-color strings', () => {
    for (const c of EG_CANONICAL_COLORS) {
      assert.ok(!c.includes('+'), `canonical color must be atomic, got: ${c}`);
    }
  });
});

describe('EG_LOCKED_KEYS', () => {
  it('contains colors and editions', () => {
    assert.deepEqual([...EG_LOCKED_KEYS].sort(), ['colors', 'editions']);
  });

  it('is frozen', () => {
    assert.ok(Object.isFrozen(EG_LOCKED_KEYS));
  });
});

describe('EG_EDITABLE_PATHS', () => {
  it('contains only search/alias paths', () => {
    const allowed = new Set([
      'ui.aliases',
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

  it('has list_of_tokens_delimited parse template', () => {
    const rule = buildEgColorFieldRule();
    assert.equal(rule.parse.template, 'list_of_tokens_delimited');
  });

  it('has open enum policy (infinite color+color combos cannot be enumerated)', () => {
    const rule = buildEgColorFieldRule();
    assert.equal(rule.enum_policy, 'open');
    assert.equal(rule.enum.policy, 'open');
    assert.equal(rule.enum.match.strategy, 'exact');
    assert.equal(rule.enum.new_value_policy.accept_if_evidence, true);
    assert.equal(rule.enum.new_value_policy.mark_needs_curation, false);
  });

  it('has expected priority level', () => {
    const rule = buildEgColorFieldRule();
    assert.equal(rule.priority.required_level, 'expected');
  });

  it('has UI metadata', () => {
    const rule = buildEgColorFieldRule();
    assert.equal(rule.ui.label, 'Colors');
    assert.equal(rule.ui.input_control, 'token_list');
  });

  it('has ai_assist with EG extraction guidance', () => {
    const rule = buildEgColorFieldRule();
    assert.equal(rule.ai_assist.mode, 'advisory');
    assert.ok(rule.ai_assist.reasoning_note.includes('lowercase'));
    assert.ok(rule.ai_assist.reasoning_note.includes('+'));
    assert.ok(rule.ai_assist.reasoning_note.includes('hex'));
  });

  it('has search_hints with domain hints populated', () => {
    const rule = buildEgColorFieldRule();
    assert.ok(rule.search_hints.domain_hints.length > 0, 'domain_hints should be populated');
  });

  it('has set_union item_union for cross-source merge', () => {
    const rule = buildEgColorFieldRule();
    assert.equal(rule.contract.list_rules.item_union, 'set_union');
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
    assert.equal(rule.enum.match.strategy, 'exact');
    assert.equal(rule.enum.new_value_policy.mark_needs_curation, true);
  });

  it('has ai_assist with kebab-case guidance', () => {
    const rule = buildEgEditionFieldRule();
    assert.equal(rule.ai_assist.mode, 'advisory');
    assert.ok(rule.ai_assist.reasoning_note.includes('kebab-case'));
    assert.ok(rule.ai_assist.reasoning_note.toLowerCase().includes('lowercase'));
  });

  it('has optional required level', () => {
    const rule = buildEgEditionFieldRule();
    assert.equal(rule.priority.required_level, 'optional');
  });

  it('has UI metadata', () => {
    const rule = buildEgEditionFieldRule();
    assert.equal(rule.ui.label, 'Editions');
    assert.equal(rule.ui.input_control, 'token_list');
  });

  it('has list_of_tokens_delimited parse template', () => {
    const rule = buildEgEditionFieldRule();
    assert.equal(rule.parse.template, 'list_of_tokens_delimited');
  });

  it('returns a new object each call', () => {
    const a = buildEgEditionFieldRule();
    const b = buildEgEditionFieldRule();
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
    assert.equal(isEgEditablePath('ui.input_control'), false);
  });
});

// ── EG_DEFAULT_TOGGLES ───────────────────────────────────────────────────────

describe('EG_DEFAULT_TOGGLES', () => {
  it('has both colors and editions set to true', () => {
    assert.equal(EG_DEFAULT_TOGGLES.colors, true);
    assert.equal(EG_DEFAULT_TOGGLES.editions, true);
  });

  it('is frozen', () => {
    assert.ok(Object.isFrozen(EG_DEFAULT_TOGGLES));
  });
});

// ── resolveEgLockedKeys ──────────────────────────────────────────────────────

describe('resolveEgLockedKeys', () => {
  it('returns both keys when both toggles are true', () => {
    assert.deepEqual(resolveEgLockedKeys({ colors: true, editions: true }), ['colors', 'editions']);
  });

  it('returns only colors when editions is false', () => {
    assert.deepEqual(resolveEgLockedKeys({ colors: true, editions: false }), ['colors']);
  });

  it('returns only editions when colors is false', () => {
    assert.deepEqual(resolveEgLockedKeys({ colors: false, editions: true }), ['editions']);
  });

  it('returns empty array when both are false', () => {
    assert.deepEqual(resolveEgLockedKeys({ colors: false, editions: false }), []);
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

  it('handles null/undefined gracefully', () => {
    assert.equal(sanitizeEgLockedOverrides(null, {}), null);
    assert.equal(sanitizeEgLockedOverrides(undefined, {}), undefined);
  });
});
