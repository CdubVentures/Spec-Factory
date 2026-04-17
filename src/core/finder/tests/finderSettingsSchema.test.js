import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFinderSettingsSchema,
  deriveFinderSettingsDefaults,
} from '../finderSettingsSchema.js';

describe('validateFinderSettingsSchema', () => {
  it('accepts an empty schema (finders with no settings)', () => {
    const parsed = validateFinderSettingsSchema([]);
    assert.deepEqual(parsed, []);
  });

  it('accepts primitive entries for every supported type', () => {
    const schema = [
      { key: 'heroEnabled', type: 'bool', default: true },
      { key: 'heroCount', type: 'int', default: 3, min: 1, max: 10 },
      { key: 'threshold', type: 'float', default: 0.75, min: 0, max: 1 },
      { key: 'hfToken', type: 'string', default: '', secret: true },
      { key: 'mode', type: 'enum', default: 'fast', allowed: ['fast', 'precise'] },
    ];
    const parsed = validateFinderSettingsSchema(schema);
    assert.equal(parsed.length, 5);
  });

  it('accepts optional UI metadata (label, tip, group, hero, disabledBy, allowEmpty, hidden)', () => {
    const parsed = validateFinderSettingsSchema([
      {
        key: 'heroEnabled',
        type: 'bool',
        default: true,
        uiLabel: 'Hero Enabled',
        uiTip: 'Whether hero search runs',
        uiGroup: 'Hero Slots',
        uiHero: true,
      },
      {
        key: 'heroCount',
        type: 'int',
        default: 3,
        disabledBy: 'heroEnabled',
      },
      {
        key: 'promptOverride',
        type: 'string',
        default: '',
        allowEmpty: true,
        hidden: true,
      },
    ]);
    assert.equal(parsed[0].uiHero, true);
    assert.equal(parsed[1].disabledBy, 'heroEnabled');
    assert.equal(parsed[2].hidden, true);
  });

  it('accepts entries that reference a named widget via widget + widgetProps', () => {
    const parsed = validateFinderSettingsSchema([
      {
        key: 'viewQualityConfig',
        type: 'string',
        default: '',
        widget: 'viewQualityGrid',
        widgetProps: { views: ['top', 'front', 'side'] },
      },
    ]);
    assert.equal(parsed[0].widget, 'viewQualityGrid');
    assert.deepEqual(parsed[0].widgetProps, { views: ['top', 'front', 'side'] });
  });

  it('rejects entries missing key', () => {
    assert.throws(() => validateFinderSettingsSchema([{ type: 'bool', default: true }]));
  });

  it('rejects entries with empty key', () => {
    assert.throws(() => validateFinderSettingsSchema([{ key: '', type: 'bool', default: true }]));
  });

  it('rejects entries missing type', () => {
    assert.throws(() => validateFinderSettingsSchema([{ key: 'x', default: true }]));
  });

  it('rejects entries missing default', () => {
    assert.throws(() => validateFinderSettingsSchema([{ key: 'x', type: 'bool' }]));
  });

  it('rejects entries with an unsupported type', () => {
    assert.throws(() => validateFinderSettingsSchema([{ key: 'x', type: 'date', default: '2024-01-01' }]));
  });

  it('rejects bool entries with a non-boolean default', () => {
    assert.throws(() => validateFinderSettingsSchema([{ key: 'x', type: 'bool', default: 'true' }]));
  });

  it('rejects int entries with a non-integer default', () => {
    assert.throws(() => validateFinderSettingsSchema([{ key: 'x', type: 'int', default: 1.5 }]));
  });

  it('rejects enum entries without allowed', () => {
    assert.throws(() => validateFinderSettingsSchema([{ key: 'x', type: 'enum', default: 'a' }]));
  });

  it('rejects enum entries whose default is not in allowed', () => {
    assert.throws(() =>
      validateFinderSettingsSchema([{ key: 'x', type: 'enum', default: 'c', allowed: ['a', 'b'] }]),
    );
  });

  it('rejects entries that specify an empty widget name', () => {
    assert.throws(() =>
      validateFinderSettingsSchema([{ key: 'x', type: 'string', default: '', widget: '' }]),
    );
  });
});

describe('deriveFinderSettingsDefaults', () => {
  it('returns an empty object for an empty schema', () => {
    assert.deepEqual(deriveFinderSettingsDefaults([]), {});
  });

  it('stringifies bool defaults as "true" / "false"', () => {
    const defaults = deriveFinderSettingsDefaults([
      { key: 'on', type: 'bool', default: true },
      { key: 'off', type: 'bool', default: false },
    ]);
    assert.deepEqual(defaults, { on: 'true', off: 'false' });
  });

  it('stringifies int defaults', () => {
    const defaults = deriveFinderSettingsDefaults([
      { key: 'count', type: 'int', default: 42 },
      { key: 'zero', type: 'int', default: 0 },
    ]);
    assert.deepEqual(defaults, { count: '42', zero: '0' });
  });

  it('stringifies float defaults', () => {
    const defaults = deriveFinderSettingsDefaults([
      { key: 'threshold', type: 'float', default: 0.75 },
    ]);
    assert.deepEqual(defaults, { threshold: '0.75' });
  });

  it('passes string defaults through verbatim', () => {
    const defaults = deriveFinderSettingsDefaults([
      { key: 'hfToken', type: 'string', default: '' },
      { key: 'note', type: 'string', default: 'hello world' },
    ]);
    assert.deepEqual(defaults, { hfToken: '', note: 'hello world' });
  });

  it('passes enum defaults through verbatim', () => {
    const defaults = deriveFinderSettingsDefaults([
      { key: 'mode', type: 'enum', default: 'fast', allowed: ['fast', 'precise'] },
    ]);
    assert.deepEqual(defaults, { mode: 'fast' });
  });

  it('preserves all keys including hidden and widget-backed entries', () => {
    const defaults = deriveFinderSettingsDefaults([
      { key: 'visible', type: 'bool', default: true },
      { key: 'backstage', type: 'string', default: '', hidden: true },
      { key: 'viewBudget', type: 'string', default: '', widget: 'viewBudget' },
    ]);
    assert.deepEqual(defaults, { visible: 'true', backstage: '', viewBudget: '' });
  });

  it('throws on invalid schema (same validation as validateFinderSettingsSchema)', () => {
    assert.throws(() => deriveFinderSettingsDefaults([{ key: 'x' }]));
  });
});
