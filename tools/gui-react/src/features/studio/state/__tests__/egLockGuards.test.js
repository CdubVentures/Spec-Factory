import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

async function loadFieldRulesStore() {
  const mod = await import('../useFieldRulesStore.ts');
  return mod.useFieldRulesStore;
}

describe('EG lock guards', async () => {
  const useFieldRulesStore = await loadFieldRulesStore();

  beforeEach(() => {
    useFieldRulesStore.getState().reset();
    useFieldRulesStore.getState().hydrate(
      {
        colors: { key: 'colors', parse: { delimiters: [','] }, ui: { label: 'Colors', aliases: ['colour'] } },
        editions: { key: 'editions', parse: { delimiters: [','] }, ui: { label: 'Editions' } },
        weight: { key: 'weight', contract: { type: 'number' }, ui: { label: 'Weight' } },
      },
      ['colors', 'editions', 'weight'],
      ['colors', 'editions'],
      ['ui.aliases', 'search_hints.domain_hints', 'search_hints.content_types', 'search_hints.query_terms', 'ui.tooltip_md'],
      { colors: true, editions: true },
    );
  });

  describe('updateField guard', () => {
    it('blocks non-editable path on locked key', () => {
      const before = useFieldRulesStore.getState().editedRules.colors;
      useFieldRulesStore.getState().updateField('colors', 'parse.delimiters', [',', '+']);
      const after = useFieldRulesStore.getState().editedRules.colors;
      assert.deepEqual(before, after, 'locked path should not change');
    });

    it('allows editable path on locked key', () => {
      useFieldRulesStore.getState().updateField('colors', 'ui.aliases', ['colour', 'color']);
      const rule = useFieldRulesStore.getState().editedRules.colors;
      assert.deepEqual(rule.ui.aliases, ['colour', 'color']);
    });

    it('allows search_hints.domain_hints on locked key', () => {
      useFieldRulesStore.getState().updateField('colors', 'search_hints.domain_hints', ['amazon.com']);
      const rule = useFieldRulesStore.getState().editedRules.colors;
      assert.deepEqual(rule.search_hints.domain_hints, ['amazon.com']);
    });

    it('allows any path on non-locked key', () => {
      useFieldRulesStore.getState().updateField('weight', 'contract.type', 'string');
      const rule = useFieldRulesStore.getState().editedRules.weight;
      assert.equal(rule.contract.type, 'string');
    });

    it('blocks contract.type on locked key', () => {
      useFieldRulesStore.getState().updateField('colors', 'contract.type', 'number');
      const rule = useFieldRulesStore.getState().editedRules.colors;
      assert.notEqual(rule.contract?.type, 'number');
    });

    it('blocks enum_policy on locked key', () => {
      useFieldRulesStore.getState().updateField('editions', 'enum_policy', 'closed');
      const rule = useFieldRulesStore.getState().editedRules.editions;
      assert.notEqual(rule.enum_policy, 'closed');
    });
  });

  describe('removeKey guard', () => {
    it('blocks deletion of locked key', () => {
      useFieldRulesStore.getState().removeKey('colors');
      const order = useFieldRulesStore.getState().editedFieldOrder;
      assert.ok(order.includes('colors'), 'colors should not be removed');
      assert.ok(useFieldRulesStore.getState().editedRules.colors, 'colors rule should still exist');
    });

    it('blocks deletion of editions when locked', () => {
      useFieldRulesStore.getState().removeKey('editions');
      const order = useFieldRulesStore.getState().editedFieldOrder;
      assert.ok(order.includes('editions'), 'editions should not be removed');
    });

    it('allows deletion of non-locked key', () => {
      useFieldRulesStore.getState().removeKey('weight');
      const order = useFieldRulesStore.getState().editedFieldOrder;
      assert.ok(!order.includes('weight'), 'weight should be removed');
      assert.equal(useFieldRulesStore.getState().editedRules.weight, undefined);
    });
  });

  describe('setEgToggle', () => {
    it('toggling ON replaces field with preset', () => {
      const preset = {
        key: 'colors',
        contract: { type: 'string', shape: 'list' },
        parse: { template: 'list_of_tokens_delimited', delimiters: [',', '/', '|', ';'] },
        ui: { label: 'Colors', input_control: 'token_list' },
        search_hints: { domain_hints: [], content_types: [], query_terms: [] },
      };
      useFieldRulesStore.getState().setEgToggle('colors', true, preset);
      const rule = useFieldRulesStore.getState().editedRules.colors;
      assert.deepEqual(rule.parse.delimiters, [',', '/', '|', ';']);
      assert.equal(rule._edited, true);
    });

    it('toggling ON preserves user-editable aliases', () => {
      // Set custom aliases first
      useFieldRulesStore.getState().updateField('colors', 'ui.aliases', ['my-alias']);
      const preset = {
        key: 'colors',
        parse: { delimiters: [','] },
        ui: { label: 'Colors', aliases: [] },
        search_hints: { domain_hints: [], content_types: [], query_terms: [] },
      };
      useFieldRulesStore.getState().setEgToggle('colors', true, preset);
      const rule = useFieldRulesStore.getState().editedRules.colors;
      assert.deepEqual(rule.ui.aliases, ['my-alias'], 'user aliases preserved');
    });

    it('toggling ON preserves user domain_hints', () => {
      useFieldRulesStore.getState().updateField('colors', 'search_hints.domain_hints', ['custom.com']);
      const preset = {
        key: 'colors',
        parse: { delimiters: [','] },
        ui: { label: 'Colors' },
        search_hints: { domain_hints: ['default.com'], content_types: [], query_terms: [] },
      };
      useFieldRulesStore.getState().setEgToggle('colors', true, preset);
      const rule = useFieldRulesStore.getState().editedRules.colors;
      assert.deepEqual(rule.search_hints.domain_hints, ['custom.com'], 'user domain_hints preserved');
    });

    it('toggling OFF keeps values but unlocks', () => {
      useFieldRulesStore.getState().setEgToggle('colors', false, {});
      const state = useFieldRulesStore.getState();
      assert.equal(state.egToggles.colors, false);
      assert.ok(!state.egLockedKeys.includes('colors'), 'colors should be unlocked');
      assert.ok(state.editedRules.colors, 'colors rule still exists');
    });

    it('updates egLockedKeys correctly', () => {
      useFieldRulesStore.getState().setEgToggle('colors', false, {});
      assert.deepEqual(useFieldRulesStore.getState().egLockedKeys, ['editions']);
      useFieldRulesStore.getState().setEgToggle('editions', false, {});
      assert.deepEqual([...useFieldRulesStore.getState().egLockedKeys], []);
    });

    it('updates egToggles correctly', () => {
      useFieldRulesStore.getState().setEgToggle('colors', false, {});
      assert.deepEqual(useFieldRulesStore.getState().egToggles, { colors: false, editions: true });
    });
  });
});
