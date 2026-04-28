import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeFieldOverride } from '../compileFieldRuleBuilder.js';

// WHY: Phase 4 tightening of the legacy `component.{type|source}` defensive
// bridge. The bridge folds the legacy authoring shape into `enum_source`, but
// only when the rule's key matches the component type — i.e., only on the
// parent component's own rule. Property rules (e.g. `dpi` carrying
// `component.type = sensor` from pre-Phase-1 dumps) MUST NOT cross-lock to
// `component_db.sensor`. Their linkage lives in component_sources[].

describe('mergeFieldOverride — Phase 4 cross-lock bridge fix', () => {
  it('parent rule self-lock (key=sensor + component.type=sensor) produces enum_source=component_db.sensor', () => {
    const baseRule = { key: 'sensor' };
    const override = { key: 'sensor', component: { type: 'sensor' } };
    const result = mergeFieldOverride(baseRule, override);
    assert.deepEqual(
      result.enum_source,
      { type: 'component_db', ref: 'sensor' },
      'self-locked parent rule preserves the bridge fold',
    );
  });

  it('property rule (key=dpi + component.type=sensor) produces NO enum_source — was a cross-lock bug', () => {
    const baseRule = { key: 'dpi' };
    const override = { key: 'dpi', component: { type: 'sensor' } };
    const result = mergeFieldOverride(baseRule, override);
    assert.equal(
      result.enum_source,
      undefined,
      'cross-lock case: bridge MUST NOT fold component.type=sensor into enum_source on a non-sensor rule',
    );
  });

  it('property rule with explicit component.source = component_db.sensor still suppressed', () => {
    const baseRule = { key: 'dpi' };
    const override = { key: 'dpi', component: { source: 'component_db.sensor' } };
    const result = mergeFieldOverride(baseRule, override);
    assert.equal(
      result.enum_source,
      undefined,
      'cross-lock from explicit component.source string also suppressed',
    );
  });

  it('parent rule with explicit component.source = component_db.sensor folds correctly', () => {
    const baseRule = { key: 'sensor' };
    const override = { key: 'sensor', component: { source: 'component_db.sensor' } };
    const result = mergeFieldOverride(baseRule, override);
    assert.deepEqual(
      result.enum_source,
      { type: 'component_db', ref: 'sensor' },
      'self-lock from explicit component.source preserved',
    );
  });

  it('rule that already has enum_source authored is preserved (no second-stage override)', () => {
    const baseRule = { key: 'dpi' };
    const override = {
      key: 'dpi',
      component: { type: 'sensor' }, // legacy block — would cross-lock
      enum_source: { type: 'known_values', ref: 'dpi' }, // explicit author choice
    };
    const result = mergeFieldOverride(baseRule, override);
    assert.deepEqual(
      result.enum_source,
      { type: 'known_values', ref: 'dpi' },
      'explicitly authored enum_source survives the bridge gating',
    );
  });

  it('partial nested enum override preserves base policy and source', () => {
    const baseRule = {
      key: 'sensor_latency_wired',
      enum: {
        policy: 'open_prefer_known',
        source: 'data_lists.sensor_latency_wired',
        match: { normalize: 'lower_trim' },
      },
    };
    const override = {
      key: 'sensor_latency_wired',
      enum: {
        new_value_policy: {},
      },
    };
    const result = mergeFieldOverride(baseRule, override);
    assert.deepEqual(result.enum, {
      policy: 'open_prefer_known',
      source: 'data_lists.sensor_latency_wired',
      match: { normalize: 'lower_trim' },
      new_value_policy: {},
    });
  });

  it('baseRule key + override without key still resolves correctly (parent case)', () => {
    const baseRule = { key: 'sensor' };
    const override = { component: { type: 'sensor' } }; // override carries no key
    const result = mergeFieldOverride(baseRule, override);
    assert.deepEqual(
      result.enum_source,
      { type: 'component_db', ref: 'sensor' },
      'effectiveKey falls back to baseRule.key when override.key absent',
    );
  });

  it('baseRule key=dpi + override without key + component.type=sensor → no cross-lock', () => {
    const baseRule = { key: 'dpi' };
    const override = { component: { type: 'sensor' } };
    const result = mergeFieldOverride(baseRule, override);
    assert.equal(
      result.enum_source,
      undefined,
      'effectiveKey from baseRule rejects cross-lock fold',
    );
  });
});
