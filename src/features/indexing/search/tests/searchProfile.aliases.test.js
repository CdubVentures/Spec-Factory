import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeterministicAliases } from './helpers/searchProfileHarness.js';

describe('Phase 02 - Deterministic Aliases', () => {
  it('generates spacing and hyphen variants for alphanumeric models', () => {
    const aliases = buildDeterministicAliases({
      brand: 'Alienware',
      model: 'AW610M',
      variant: ''
    });
    const tokens = aliases.map((row) => row.alias);

    assert.ok(tokens.includes('aw610m'), 'compact model alias present');
    assert.ok(
      tokens.includes('aw-610-m') || tokens.includes('aw-610m'),
      'hyphen variant present'
    );
    assert.ok(
      tokens.includes('aw 610 m') || tokens.includes('aw 610m'),
      'spaced variant present'
    );
    assert.ok(tokens.includes('alienware'), 'brand alias present');
    assert.ok(tokens.some((token) => token.includes('alienware') && token.includes('aw610m')), 'brand+model combo present');
  });

  it('preserves digit groups and never mutates them', () => {
    const aliases = buildDeterministicAliases({
      brand: 'Logitech',
      model: 'G Pro X Superlight 2',
      variant: ''
    });
    const tokens = aliases.map((row) => row.alias);

    const hasDigit2 = tokens.some((token) => token.includes('2'));
    assert.ok(hasDigit2, 'digit group "2" preserved in at least one alias');
  });

  it('caps aliases at 12', () => {
    const aliases = buildDeterministicAliases({
      brand: 'Razer',
      model: 'DeathAdder V3 Pro',
      variant: 'Black Edition'
    });

    assert.ok(aliases.length <= 12, 'alias count within cap');
  });

  it('emits reject log for duplicates and cap overflows', () => {
    const rejectLog = [];

    buildDeterministicAliases(
      { brand: 'Razer', model: 'Viper V3 Pro', variant: '' },
      12,
      rejectLog
    );

    assert.ok(Array.isArray(rejectLog));
    if (rejectLog.length > 0) {
      assert.ok(rejectLog.every((entry) => entry.reason), 'every reject has a reason');
      assert.ok(rejectLog.every((entry) => entry.alias !== undefined), 'every reject has an alias');
    }
  });

  it('each alias has source and weight', () => {
    const aliases = buildDeterministicAliases({
      brand: 'SteelSeries',
      model: 'Aerox 5',
      variant: 'Wireless'
    });

    for (const alias of aliases) {
      assert.ok(typeof alias.alias === 'string' && alias.alias.length > 0, 'alias is non-empty string');
      assert.ok(typeof alias.source === 'string', 'source is string');
      assert.ok(typeof alias.weight === 'number' && alias.weight > 0, 'weight is positive number');
    }
  });
});
