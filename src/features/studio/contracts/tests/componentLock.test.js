import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isComponentLocked,
  isComponentLockEditablePath,
  isComponentIdentityProjectionLocked,
  sanitizeComponentLockedOverrides,
} from '../componentLock.js';

describe('isComponentLocked', () => {
  it('returns true when nested enum.source self-locks to component_db.<key>', () => {
    assert.equal(isComponentLocked({ enum: { source: 'component_db.sensor' } }, 'sensor'), true);
  });

  it('returns true when flat enum_source string self-locks', () => {
    assert.equal(isComponentLocked({ enum_source: 'component_db.sensor' }, 'sensor'), true);
  });

  it('returns true when enum_source object form self-locks', () => {
    assert.equal(
      isComponentLocked({ enum_source: { type: 'component_db', ref: 'sensor' } }, 'sensor'),
      true,
    );
  });

  it('returns false on cross-locks (ref !== key)', () => {
    assert.equal(isComponentLocked({ enum: { source: 'component_db.sensor' } }, 'dpi'), false);
    assert.equal(isComponentLocked({ enum_source: 'component_db.sensor' }, 'dpi'), false);
  });

  it('returns false when enum block missing', () => {
    assert.equal(isComponentLocked({}, 'sensor'), false);
    assert.equal(isComponentLocked(undefined, 'sensor'), false);
    assert.equal(isComponentLocked(null, 'sensor'), false);
  });

  it('returns false when key is empty', () => {
    assert.equal(isComponentLocked({ enum: { source: 'component_db.sensor' } }, ''), false);
  });

  it('returns false for data_lists.* sources', () => {
    assert.equal(isComponentLocked({ enum: { source: 'data_lists.lighting' } }, 'lighting'), false);
  });

  it('returns true for generated component identity projection fields', () => {
    assert.equal(
      isComponentLocked({
        component_identity_projection: { component_type: 'sensor', facet: 'brand' },
        enum: { source: 'data_lists.mouse_sensor_brand' },
      }, 'sensor_brand'),
      true,
    );
    assert.equal(
      isComponentLocked({
        component_identity_projection: { component_type: 'sensor', facet: 'link' },
        enum: { policy: 'open', source: null },
      }, 'sensor_link'),
      true,
    );
  });
});

describe('isComponentIdentityProjectionLocked', () => {
  it('accepts generated brand/link projection metadata', () => {
    assert.equal(
      isComponentIdentityProjectionLocked({
        component_identity_projection: { component_type: 'sensor', facet: 'brand' },
      }),
      true,
    );
    assert.equal(
      isComponentIdentityProjectionLocked({
        component_identity_projection: { component_type: 'sensor', facet: 'link' },
      }),
      true,
    );
  });

  it('rejects missing or unknown projection metadata', () => {
    assert.equal(isComponentIdentityProjectionLocked({}), false);
    assert.equal(
      isComponentIdentityProjectionLocked({
        component_identity_projection: { component_type: 'sensor', facet: 'aliases' },
      }),
      false,
    );
    assert.equal(
      isComponentIdentityProjectionLocked({
        component_identity_projection: { facet: 'brand' },
      }),
      false,
    );
  });
});

describe('isComponentLockEditablePath', () => {
  const editable = [
    'enum.policy',
    'enum.match.format_hint',
    'aliases',
    'constraints',
    'ui.label',
    'ui.group',
    'ui.order',
    'ui.tooltip_md',
    'ui.aliases',
    'priority.required_level',
    'priority.availability',
    'priority.difficulty',
    'ai_assist.reasoning_note',
    'ai_assist.pif_priority_images',
    'evidence.min_evidence_refs',
    'evidence.tier_preference',
    'search_hints.domain_hints',
    'search_hints.content_types',
    'search_hints.query_terms',
  ];

  const nonEditable = [
    'contract.type',
    'contract.shape',
    'contract.unit',
    'enum.source',
    'enum.values',
    'enum.allow_new',
    'enum.allow_unknown',
    'value_form',
    'parse.delimiters',
    'ui.tooltip_key',
    'ui.placeholder',
    'list_rules.dedupe',
  ];

  for (const path of editable) {
    it(`accepts editable path "${path}"`, () => {
      assert.equal(isComponentLockEditablePath(path), true);
    });
  }

  for (const path of nonEditable) {
    it(`rejects non-editable path "${path}"`, () => {
      assert.equal(isComponentLockEditablePath(path), false);
    });
  }

  it('rejects non-string input', () => {
    assert.equal(isComponentLockEditablePath(undefined), false);
    assert.equal(isComponentLockEditablePath(null), false);
    assert.equal(isComponentLockEditablePath(42), false);
  });
});

describe('sanitizeComponentLockedOverrides', () => {
  it('strips contract/enum-identity paths from a self-locked override', () => {
    const input = {
      sensor: {
        enum: { source: 'component_db.sensor', policy: 'open_prefer_known' },
        contract: { type: 'integer', shape: 'list', unit: 'mm' },
        aliases: ['s'],
      },
    };
    const out = sanitizeComponentLockedOverrides(input);
    assert.notEqual(out, input, 'returns a new object when changes occur');
    assert.equal(out.sensor.contract, undefined, 'contract block removed (was emptied)');
    assert.equal(out.sensor.enum.policy, 'open_prefer_known', 'enum.policy survives');
    assert.equal(out.sensor.enum.source, undefined, 'enum.source stripped');
    assert.deepEqual(out.sensor.aliases, ['s'], 'aliases survive');
  });

  it('removes empty enum block when only enum.source was present', () => {
    const input = {
      sensor: {
        enum: { source: 'component_db.sensor' },
      },
    };
    const out = sanitizeComponentLockedOverrides(input);
    assert.equal(out.sensor.enum, undefined, 'emptied enum block removed');
  });

  it('strips flat enum_source string and object forms', () => {
    const input = {
      sensor: {
        enum: { source: 'component_db.sensor', policy: 'open' },
        enum_policy: 'open',
        enum_source: 'component_db.sensor',
        enum_values: ['a', 'b'],
      },
    };
    const out = sanitizeComponentLockedOverrides(input);
    assert.equal(out.sensor.enum_source, undefined);
    assert.equal(out.sensor.enum_values, undefined);
    assert.equal(out.sensor.enum.policy, 'open_prefer_known');
    assert.equal(out.sensor.enum_policy, 'open_prefer_known');
  });

  it('strips identity projection contract, enum, and label overrides', () => {
    const input = {
      sensor_brand: {
        component_identity_projection: { component_type: 'sensor', facet: 'brand' },
        ui: { label: 'Maker', group: 'sensor identity' },
        variant_dependent: true,
        product_image_dependent: true,
        enum: { policy: 'closed', source: 'data_lists.maker' },
        contract: { type: 'number', shape: 'list', unit: 'dpi' },
        priority: { required_level: 'mandatory' },
      },
      sensor_link: {
        component_identity_projection: { component_type: 'sensor', facet: 'link' },
        enum_policy: 'closed',
        enum_source: 'data_lists.sensor_link',
      },
    };

    const out = sanitizeComponentLockedOverrides(input);

    assert.equal(out.sensor_brand.contract, undefined);
    assert.equal(out.sensor_brand.enum, undefined);
    assert.equal(out.sensor_brand.ui.label, undefined);
    assert.equal(out.sensor_brand.ui.group, 'sensor identity');
    assert.equal(out.sensor_brand.variant_dependent, undefined);
    assert.equal(out.sensor_brand.product_image_dependent, undefined);
    assert.deepEqual(out.sensor_brand.priority, { required_level: 'mandatory' });
    assert.equal(out.sensor_link.enum_policy, undefined);
    assert.equal(out.sensor_link.enum_source, undefined);
  });

  it('passes through overrides that are not component-locked (referential equality)', () => {
    const input = {
      dpi: { contract: { type: 'integer', unit: 'dpi' } },
      lighting: { enum: { source: 'data_lists.lighting', policy: 'closed' } },
    };
    const out = sanitizeComponentLockedOverrides(input);
    assert.equal(out, input, 'no locked overrides → same reference returned');
  });

  it('handles empty / non-object input', () => {
    assert.deepEqual(sanitizeComponentLockedOverrides({}), {});
    assert.equal(sanitizeComponentLockedOverrides(null), null);
    assert.equal(sanitizeComponentLockedOverrides(undefined), undefined);
  });

  it('mixed bag: only the component-locked entry has paths stripped', () => {
    const input = {
      sensor: {
        enum: { source: 'component_db.sensor' },
        contract: { type: 'string' },
      },
      dpi: { contract: { type: 'integer' } },
      colors: { enum: { policy: 'closed' } },
    };
    const out = sanitizeComponentLockedOverrides(input);
    assert.equal(out.sensor.enum, undefined);
    assert.equal(out.sensor.contract, undefined);
    assert.deepEqual(out.dpi, { contract: { type: 'integer' } });
    assert.deepEqual(out.colors, { enum: { policy: 'closed' } });
  });

  it('does not strip cross-locks (ref !== key) — the dpi case', () => {
    // Cross-locks aren't "locked" per the SSOT predicate, so the sanitizer
    // leaves them alone. INV-2 is what catches them at compile time, and the
    // migration script is what cleans them out of authored overrides.
    const input = {
      dpi: {
        enum: { source: 'component_db.sensor', policy: 'open' },
        contract: { type: 'number', unit: 'dpi' },
      },
    };
    const out = sanitizeComponentLockedOverrides(input);
    assert.equal(out, input, 'cross-lock pass-through');
  });
});
