import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

async function loadFieldRulesStore() {
  const mod = await import('../useFieldRulesStore.ts');
  return mod.useFieldRulesStore;
}

describe('Component lock guards', async () => {
  const useFieldRulesStore = await loadFieldRulesStore();

  beforeEach(() => {
    useFieldRulesStore.getState().reset();
    useFieldRulesStore.getState().hydrate(
      {
        // Component-locked: enum.source === `component_db.${self}`.
        sensor: {
          key: 'sensor',
          contract: { type: 'string', shape: 'scalar' },
          enum: { source: 'component_db.sensor', policy: 'open_prefer_known' },
          ui: { label: 'Sensor' },
          aliases: ['imaging sensor'],
        },
        // Not component-locked: a sensor property.
        dpi: {
          key: 'dpi',
          contract: { type: 'number' },
          ui: { label: 'DPI' },
        },
        // Not component-locked: regular enum-source field.
        lighting: {
          key: 'lighting',
          contract: { type: 'string', shape: 'list' },
          enum: { source: 'data_lists.lighting', policy: 'open_prefer_known' },
          ui: { label: 'Lighting' },
        },
      },
      ['sensor', 'dpi', 'lighting'],
      [],
      ['ui.aliases', 'search_hints.domain_hints', 'ui.tooltip_md'],
      {},
    );
  });

  describe('updateField guard', () => {
    it('blocks contract.type on component-locked key', () => {
      useFieldRulesStore.getState().updateField('sensor', 'contract.type', 'number');
      const rule = useFieldRulesStore.getState().editedRules.sensor;
      assert.equal(rule.contract.type, 'string', 'contract.type should not change');
    });

    it('blocks contract.shape on component-locked key', () => {
      useFieldRulesStore.getState().updateField('sensor', 'contract.shape', 'list');
      const rule = useFieldRulesStore.getState().editedRules.sensor;
      assert.equal(rule.contract.shape, 'scalar');
    });

    it('blocks contract.unit on component-locked key', () => {
      useFieldRulesStore.getState().updateField('sensor', 'contract.unit', 'g');
      const rule = useFieldRulesStore.getState().editedRules.sensor;
      assert.equal(rule.contract.unit, undefined);
    });

    it('blocks enum.source on component-locked key', () => {
      useFieldRulesStore.getState().updateField('sensor', 'enum.source', 'data_lists.sensor');
      const rule = useFieldRulesStore.getState().editedRules.sensor;
      assert.equal(rule.enum.source, 'component_db.sensor', 'enum.source should not change');
    });

    it('blocks enum.values on component-locked key', () => {
      useFieldRulesStore.getState().updateField('sensor', 'enum.values', ['x', 'y']);
      const rule = useFieldRulesStore.getState().editedRules.sensor;
      assert.equal(rule.enum.values, undefined);
    });

    it('allows enum.policy on component-locked key', () => {
      useFieldRulesStore.getState().updateField('sensor', 'enum.policy', 'closed');
      const rule = useFieldRulesStore.getState().editedRules.sensor;
      assert.equal(rule.enum.policy, 'closed');
    });

    it('allows enum.match.format_hint on component-locked key', () => {
      useFieldRulesStore.getState().updateField('sensor', 'enum.match.format_hint', '^[A-Z]{3}\\d{4}$');
      const rule = useFieldRulesStore.getState().editedRules.sensor;
      assert.equal(rule.enum.match.format_hint, '^[A-Z]{3}\\d{4}$');
    });

    it('allows aliases on component-locked key', () => {
      useFieldRulesStore.getState().updateField('sensor', 'aliases', ['s1', 's2']);
      const rule = useFieldRulesStore.getState().editedRules.sensor;
      assert.deepEqual(rule.aliases, ['s1', 's2']);
    });

    it('allows priority.required_level on component-locked key', () => {
      useFieldRulesStore.getState().updateField('sensor', 'priority.required_level', 'mandatory');
      const rule = useFieldRulesStore.getState().editedRules.sensor;
      assert.equal(rule.priority.required_level, 'mandatory');
    });

    it('allows ai_assist.reasoning_note on component-locked key', () => {
      useFieldRulesStore.getState().updateField('sensor', 'ai_assist.reasoning_note', 'note');
      const rule = useFieldRulesStore.getState().editedRules.sensor;
      assert.equal(rule.ai_assist.reasoning_note, 'note');
    });

    it('allows search_hints.domain_hints on component-locked key', () => {
      useFieldRulesStore.getState().updateField('sensor', 'search_hints.domain_hints', ['pixart.com']);
      const rule = useFieldRulesStore.getState().editedRules.sensor;
      assert.deepEqual(rule.search_hints.domain_hints, ['pixart.com']);
    });

    it('allows evidence.min_evidence_refs on component-locked key', () => {
      useFieldRulesStore.getState().updateField('sensor', 'evidence.min_evidence_refs', 2);
      const rule = useFieldRulesStore.getState().editedRules.sensor;
      assert.equal(rule.evidence.min_evidence_refs, 2);
    });

    it('allows constraints on component-locked key', () => {
      useFieldRulesStore.getState().updateField('sensor', 'constraints', ['dpi <= 26000']);
      const rule = useFieldRulesStore.getState().editedRules.sensor;
      assert.deepEqual(rule.constraints, ['dpi <= 26000']);
    });

    it('allows ui.tooltip_md on component-locked key', () => {
      useFieldRulesStore.getState().updateField('sensor', 'ui.tooltip_md', '## Sensor');
      const rule = useFieldRulesStore.getState().editedRules.sensor;
      assert.equal(rule.ui.tooltip_md, '## Sensor');
    });

    it('allows contract.type on a non-component-locked key (dpi)', () => {
      useFieldRulesStore.getState().updateField('dpi', 'contract.type', 'integer');
      const rule = useFieldRulesStore.getState().editedRules.dpi;
      assert.equal(rule.contract.type, 'integer');
    });

    it('allows enum.source on a regular data_lists key (lighting)', () => {
      useFieldRulesStore.getState().updateField('lighting', 'enum.source', 'data_lists.lighting2');
      const rule = useFieldRulesStore.getState().editedRules.lighting;
      assert.equal(rule.enum.source, 'data_lists.lighting2');
    });
  });

  describe('removeKey guard', () => {
    it('blocks deletion of component-locked key', () => {
      useFieldRulesStore.getState().removeKey('sensor');
      const order = useFieldRulesStore.getState().editedFieldOrder;
      assert.ok(order.includes('sensor'), 'sensor should not be removed');
      assert.ok(useFieldRulesStore.getState().editedRules.sensor, 'sensor rule should still exist');
    });

    it('allows deletion of non-component-locked subfield (dpi)', () => {
      useFieldRulesStore.getState().removeKey('dpi');
      const order = useFieldRulesStore.getState().editedFieldOrder;
      assert.ok(!order.includes('dpi'), 'dpi should be removed');
    });

    it('allows deletion of regular enum-source key (lighting)', () => {
      useFieldRulesStore.getState().removeKey('lighting');
      const order = useFieldRulesStore.getState().editedFieldOrder;
      assert.ok(!order.includes('lighting'));
    });
  });
});
