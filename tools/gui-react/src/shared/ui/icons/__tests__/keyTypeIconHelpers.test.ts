import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveKeyTypeIcons,
  deriveOwningComponent,
  type KeyTypeIconKind,
} from '../keyTypeIconHelpers.ts';
import { componentColorClass } from '../componentColor.ts';

// WHY: deriveKeyTypeIcons is a boundary contract used by Key Navigator,
// Review Grid, and Studio Workbench. Exhaustive matrix protects all three
// surfaces from drift.

describe('deriveKeyTypeIcons — single-flag matrix', () => {
  it('returns [] for a plain scalar with no flags', () => {
    assert.deepEqual(
      deriveKeyTypeIcons({ rule: {}, fieldKey: 'weight', belongsToComponent: '' }),
      [],
    );
  });

  it('returns ["variant"] when variant_dependent is true', () => {
    assert.deepEqual(
      deriveKeyTypeIcons({
        rule: { variant_dependent: true },
        fieldKey: 'release_date',
        belongsToComponent: '',
      }),
      ['variant'],
    );
  });

  it('returns ["variant"] for variant-generator keys (colors) even without the flag', () => {
    assert.deepEqual(
      deriveKeyTypeIcons({ rule: {}, fieldKey: 'colors', belongsToComponent: '' }),
      ['variant'],
    );
  });

  it('returns ["variant"] for variant-generator key editions', () => {
    assert.deepEqual(
      deriveKeyTypeIcons({ rule: {}, fieldKey: 'editions', belongsToComponent: '' }),
      ['variant'],
    );
  });

  it('returns ["pif"] when product_image_dependent is true', () => {
    assert.deepEqual(
      deriveKeyTypeIcons({
        rule: { product_image_dependent: true },
        fieldKey: 'shape',
        belongsToComponent: '',
      }),
      ['pif'],
    );
  });

  it('returns ["component_self"] when enum.source is component_db.<self>', () => {
    assert.deepEqual(
      deriveKeyTypeIcons({
        rule: { enum: { source: 'component_db.sensor' } },
        fieldKey: 'sensor',
        belongsToComponent: '',
      }),
      ['component_self'],
    );
  });

  it('returns ["component_identity_brand"] for force-made <component>_brand', () => {
    assert.deepEqual(
      deriveKeyTypeIcons({
        rule: {
          component_identity_projection: { component_type: 'sensor', facet: 'brand' },
        },
        fieldKey: 'sensor_brand',
        belongsToComponent: '',
      }),
      ['component_identity_brand'],
    );
  });

  it('returns ["component_identity_link"] for force-made <component>_link', () => {
    assert.deepEqual(
      deriveKeyTypeIcons({
        rule: {
          component_identity_projection: { component_type: 'sensor', facet: 'link' },
        },
        fieldKey: 'sensor_link',
        belongsToComponent: '',
      }),
      ['component_identity_link'],
    );
  });

  it('returns ["component_attribute"] when belongsToComponent is set', () => {
    assert.deepEqual(
      deriveKeyTypeIcons({
        rule: {},
        fieldKey: 'sensor_dpi_max',
        belongsToComponent: 'sensor',
      }),
      ['component_attribute'],
    );
  });
});

describe('deriveKeyTypeIcons — combined flags', () => {
  it('returns variant + pif when both flags set', () => {
    assert.deepEqual(
      deriveKeyTypeIcons({
        rule: { variant_dependent: true, product_image_dependent: true },
        fieldKey: 'shape',
        belongsToComponent: '',
      }),
      ['variant', 'pif'],
    );
  });

  it('returns variant + component_attribute (variant-dependent property of a component)', () => {
    assert.deepEqual(
      deriveKeyTypeIcons({
        rule: { variant_dependent: true },
        fieldKey: 'switch_color',
        belongsToComponent: 'switch',
      }),
      ['variant', 'component_attribute'],
    );
  });

  it('returns identity_brand alone (does NOT also tag attribute even if belongsToComponent is set)', () => {
    // WHY: identity-projection IS the more specific component relationship.
    // Don't double-flag; the projection icon already implies component lineage.
    assert.deepEqual(
      deriveKeyTypeIcons({
        rule: {
          component_identity_projection: { component_type: 'sensor', facet: 'brand' },
        },
        fieldKey: 'sensor_brand',
        belongsToComponent: 'sensor',
      }),
      ['component_identity_brand'],
    );
  });

  it('returns component_self over component_attribute when both could apply', () => {
    // WHY: a key that IS the component should not also be flagged as one of
    // its own attributes — the self-source predicate wins.
    assert.deepEqual(
      deriveKeyTypeIcons({
        rule: { enum: { source: 'component_db.sensor' } },
        fieldKey: 'sensor',
        belongsToComponent: 'sensor',
      }),
      ['component_self'],
    );
  });

  it('orders icons consistently: variant → pif → component_self → identity_projection → attribute', () => {
    // Identity-projection cannot co-exist with component_self in valid data,
    // but ordering for the realistic combinations must hold.
    const result = deriveKeyTypeIcons({
      rule: {
        variant_dependent: true,
        product_image_dependent: true,
      },
      fieldKey: 'switch_color',
      belongsToComponent: 'switch',
    });
    assert.deepEqual(result, ['variant', 'pif', 'component_attribute']);
  });
});

describe('deriveKeyTypeIcons — null/empty inputs', () => {
  it('treats undefined rule as empty', () => {
    assert.deepEqual(
      deriveKeyTypeIcons({ rule: undefined, fieldKey: 'x', belongsToComponent: '' }),
      [],
    );
  });

  it('ignores variant_dependent when value is not strictly true', () => {
    assert.deepEqual(
      deriveKeyTypeIcons({
        rule: { variant_dependent: 'yes' as unknown as boolean },
        fieldKey: 'x',
        belongsToComponent: '',
      }),
      [],
    );
  });

  it('ignores product_image_dependent when value is not strictly true', () => {
    assert.deepEqual(
      deriveKeyTypeIcons({
        rule: { product_image_dependent: 1 as unknown as boolean },
        fieldKey: 'x',
        belongsToComponent: '',
      }),
      [],
    );
  });
});

describe('KeyTypeIconKind type', () => {
  it('exports the six canonical kinds (brand and link projections are distinct)', () => {
    const all: KeyTypeIconKind[] = [
      'variant',
      'pif',
      'component_self',
      'component_identity_brand',
      'component_identity_link',
      'component_attribute',
    ];
    assert.equal(all.length, 6);
  });
});

describe('deriveKeyTypeIcons — knownComponentTypes fallback', () => {
  it('detects component_self when fieldKey is in knownComponentTypes (no enum.source set)', () => {
    assert.deepEqual(
      deriveKeyTypeIcons({
        rule: {},
        fieldKey: 'sensor',
        belongsToComponent: '',
        knownComponentTypes: new Set(['sensor', 'switch']),
      }),
      ['component_self'],
    );
  });

  it('still prefers component_self over attribute when fieldKey is in knownComponentTypes', () => {
    assert.deepEqual(
      deriveKeyTypeIcons({
        rule: {},
        fieldKey: 'sensor',
        belongsToComponent: 'sensor',
        knownComponentTypes: new Set(['sensor']),
      }),
      ['component_self'],
    );
  });
});

describe('deriveOwningComponent', () => {
  it('returns "" for a plain key', () => {
    assert.equal(
      deriveOwningComponent({ rule: {}, fieldKey: 'weight', belongsToComponent: '' }),
      '',
    );
  });

  it('returns the component type for component_self via enum.source', () => {
    assert.equal(
      deriveOwningComponent({
        rule: { enum: { source: 'component_db.sensor' } },
        fieldKey: 'sensor',
        belongsToComponent: '',
      }),
      'sensor',
    );
  });

  it('returns the component type for component_self via knownComponentTypes', () => {
    assert.equal(
      deriveOwningComponent({
        rule: {},
        fieldKey: 'sensor',
        belongsToComponent: '',
        knownComponentTypes: new Set(['sensor']),
      }),
      'sensor',
    );
  });

  it('returns the component type for identity_projection', () => {
    assert.equal(
      deriveOwningComponent({
        rule: { component_identity_projection: { component_type: 'sensor', facet: 'brand' } },
        fieldKey: 'sensor_brand',
        belongsToComponent: '',
      }),
      'sensor',
    );
  });

  it('returns the component type for component_attribute', () => {
    assert.equal(
      deriveOwningComponent({
        rule: {},
        fieldKey: 'sensor_dpi_max',
        belongsToComponent: 'sensor',
      }),
      'sensor',
    );
  });
});

describe('componentColorClass', () => {
  it('returns "" for empty input', () => {
    assert.equal(componentColorClass(''), '');
  });

  it('is deterministic — same input returns the same class across calls', () => {
    const a = componentColorClass('sensor');
    const b = componentColorClass('sensor');
    assert.equal(a, b);
    assert.notEqual(a, '');
  });

  it('returns visually-distinct classes for typical components', () => {
    // WHY: 10-color palette + 4 typical components — collisions are unlikely but
    // the test only asserts at least 3 distinct outputs to remain robust to palette tweaks.
    const colors = new Set([
      componentColorClass('sensor'),
      componentColorClass('switch'),
      componentColorClass('paracord'),
      componentColorClass('battery'),
    ]);
    assert.ok(colors.size >= 3, `expected at least 3 distinct colors, got ${colors.size}`);
  });
});
