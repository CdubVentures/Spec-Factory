import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchPlanningContext,
  makeField,
  makeNeedSetOutput,
  makeFieldGroupsData,
  makeRunContext,
} from './helpers/searchPlanningContextHarness.js';

// --- Tests ---

describe('buildSearchPlanningContext', () => {

  describe('group_catalog', () => {
    it('known group gets default metadata (no search_intent or host_class)', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'sensor', group_key: 'sensor_performance', state: 'unknown' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const entry = result.group_catalog.sensor_performance;
      assert.ok(entry);
      assert.equal(entry.source_target, 'spec_sheet');
      assert.equal(entry.search_intent, undefined);
      assert.equal(entry.host_class, undefined);
    });

    it('unknown group gets generic fallback (no search_intent or host_class)', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'exotic_group', state: 'unknown' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const entry = result.group_catalog.exotic_group;
      assert.ok(entry);
      assert.equal(entry.source_target, 'product_page');
      assert.equal(entry.search_intent, undefined);
    });

    it('label comes from fieldGroupsData display_name', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'sensor', group_key: 'sensor_performance', state: 'unknown' })
        ]
      });
      const fgd = makeFieldGroupsData({
        groups: [
          { group_key: 'sensor_performance', display_name: 'Sensor & Performance', field_keys: ['sensor'], count: 1 }
        ],
        group_index: { sensor_performance: ['sensor'] }
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        fieldGroupsData: fgd,
        runContext: makeRunContext()
      });
      assert.equal(result.group_catalog.sensor_performance.label, 'Sensor & Performance');
    });
  });

  // ===== planner_limits =====

  describe('GAP-1: inline catalog metadata', () => {
    it('known group has label, desc, source_target, content_target inlined (no search_intent or host_class â€” those are per-key)', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'sensor', group_key: 'sensor_performance', state: 'unknown' })
        ]
      });
      const fgd = makeFieldGroupsData({
        groups: [
          { group_key: 'sensor_performance', display_name: 'Sensor & Performance', field_keys: ['sensor'], count: 1 }
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        fieldGroupsData: fgd,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'sensor_performance');
      assert.ok(grp);
      assert.equal(grp.label, 'Sensor & Performance');
      assert.equal(grp.desc, 'Sensor and performance metrics');
      assert.equal(grp.source_target, 'spec_sheet');
      assert.equal(grp.content_target, 'technical_specs');
      assert.equal(grp.search_intent, undefined);
      assert.equal(grp.host_class, undefined);
    });

    it('unknown group gets generic fallback metadata', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'exotic_group', state: 'unknown' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'exotic_group');
      assert.ok(grp);
      assert.equal(grp.label, 'exotic_group');
      assert.equal(grp.desc, '');
      assert.equal(grp.source_target, 'product_page');
      assert.equal(grp.search_intent, undefined);
      assert.equal(grp.host_class, undefined);
    });

    it('group_catalog is still present as top-level key (retained for GUI panel)', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'sensor', group_key: 'sensor_performance', state: 'unknown' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      assert.ok(result.group_catalog);
      assert.ok(result.group_catalog.sensor_performance);
    });
  });

  // ===== PROFILE-GAP-3: aliases_union per focus group =====

  describe('GAP-10: focus_groups use key not group_key', () => {
    it('focus_group entries have key, not group_key', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'sensor_performance', state: 'unknown' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups[0];
      assert.equal(grp.key, 'sensor_performance');
      assert.equal(grp.group_key, undefined);
    });
  });

  // ===== PROFILE-GAP-7: Category-aware GROUP_DEFAULTS =====

  describe('GAP-7: category-aware group defaults', () => {
    it('category passed in fieldGroupsData can supply group metadata', () => {
      // For now, just verify that groups from fieldGroupsData get their metadata
      // when GROUP_DEFAULTS doesn't have the group (keyboard-specific group)
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'key_switches', state: 'unknown' })
        ]
      });
      const fgd = makeFieldGroupsData({
        category: 'keyboard',
        groups: [
          {
            group_key: 'key_switches',
            display_name: 'Key Switches',
            field_keys: ['f1'],
            count: 1,
            desc: 'Mechanical key switch specifications',
            source_target: 'spec_sheet',
            content_target: 'technical_specs',
          }
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        fieldGroupsData: fgd,
        runContext: makeRunContext({ category: 'keyboard' })
      });
      const grp = result.focus_groups.find(g => g.key === 'key_switches');
      assert.ok(grp);
      assert.equal(grp.label, 'Key Switches');
      assert.equal(grp.desc, 'Mechanical key switch specifications');
      assert.equal(grp.source_target, 'spec_sheet');
    });
  });

  // ===== Needset heavy passthrough removal =====

});
