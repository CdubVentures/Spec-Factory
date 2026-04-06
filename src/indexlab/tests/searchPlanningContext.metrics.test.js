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

  describe('scalar sums', () => {
    it('no_value_attempts summed across group fields', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, no_value_attempts: 3 }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, no_value_attempts: 2 }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.no_value_attempts, 5);
      assert.equal(grp.duplicate_attempts_suppressed, 0);
    });
  });

  // ===== Unresolved counts by required_level =====

  describe('unresolved counts', () => {
    it('counts unresolved by required_level correctly', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'identity' }),
          makeField({ field_key: 'f2', group_key: 'grp', state: 'unknown', required_level: 'critical' }),
          makeField({ field_key: 'f3', group_key: 'grp', state: 'unknown', required_level: 'required' }),
          makeField({ field_key: 'f4', group_key: 'grp', state: 'unknown', required_level: 'expected' }),
          makeField({ field_key: 'f5', group_key: 'grp', state: 'unknown', required_level: 'optional' }),
          makeField({ field_key: 'f6', group_key: 'grp', state: 'accepted', required_level: 'identity', need_score: 0, reasons: [] })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.core_unresolved_count, 3);     // identity + critical + required
      assert.equal(grp.secondary_unresolved_count, 1); // expected
      assert.equal(grp.optional_unresolved_count, 1);  // optional
    });
  });

  // ===== Additional SET unions =====

  describe('duplicate_attempts_suppressed sum', () => {
    it('sums duplicate_attempts_suppressed across group fields', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, duplicate_attempts_suppressed: 4 }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, duplicate_attempts_suppressed: 1 }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.duplicate_attempts_suppressed, 5);
    });
  });

  // ===== PROFILE-GAP-1: Inline catalog metadata into focus_groups =====

  describe('GAP-4: search_exhausted', () => {
    it('field with no_value_attempts >= 3 AND evidence_classes_tried.length >= 3 is search-exhausted', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'required',
            history: { ...makeField().history, no_value_attempts: 5, evidence_classes_tried: ['html', 'pdf', 'json'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown', required_level: 'required',
            history: { ...makeField().history, no_value_attempts: 1, evidence_classes_tried: ['html'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.search_exhausted_count, 1);
      assert.deepStrictEqual(grp.search_exhausted_field_keys, ['f1']);
    });

    it('group where ALL fields are search-exhausted â†’ phase becomes hold', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'required',
            history: { ...makeField().history, no_value_attempts: 4, evidence_classes_tried: ['html', 'pdf', 'json'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown', required_level: 'required',
            history: { ...makeField().history, no_value_attempts: 3, evidence_classes_tried: ['html', 'pdf', 'review'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.search_exhausted_count, 2);
      assert.equal(grp.phase, 'hold');
    });

    it('group with SOME exhausted fields â†’ not hold (still has unexhausted fields)', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'required',
            history: { ...makeField().history, no_value_attempts: 5, evidence_classes_tried: ['html', 'pdf', 'json'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown', required_level: 'required',
            history: { ...makeField().history, no_value_attempts: 0, evidence_classes_tried: [] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext({ round: 1 })
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.search_exhausted_count, 1);
      assert.ok(grp.phase === 'now' || grp.phase === 'next'); // not hold â€” still has work
    });
  });

  // ===== PROFILE-GAP-5: base_model + aliases in run block =====

  describe('GAP-8: urls_examined_count + query_count sums', () => {
    it('urls_examined_count summed across group fields', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, urls_examined_count: 10 }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, urls_examined_count: 5 }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.urls_examined_count, 15);
    });

    it('query_count summed across group fields', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, query_count: 3 }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, query_count: 2 }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.query_count, 5);
    });
  });

  // ===== PROFILE-GAP-9: previous_round_fields with confidence =====

  describe('field_priority_map', () => {
    it('fields with varied required_levels â†’ correct map entries', () => {
      const fields = [
        makeField({ field_key: 'sensor', group_key: 'sensor_performance', required_level: 'critical' }),
        makeField({ field_key: 'dpi', group_key: 'sensor_performance', required_level: 'required' }),
        makeField({ field_key: 'weight', group_key: 'dimensions', required_level: 'expected' }),
        makeField({ field_key: 'color', group_key: 'construction', required_level: 'optional' }),
      ];
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput({ fields }),
        runContext: makeRunContext(),
      });
      assert.deepStrictEqual(result.field_priority_map, {
        sensor: 'critical',
        dpi: 'required',
        weight: 'expected',
        color: 'optional',
      });
    });

    it('empty fields â†’ empty map', () => {
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput({ fields: [] }),
        runContext: makeRunContext(),
      });
      assert.deepStrictEqual(result.field_priority_map, {});
    });

    it('every field_key from needSetOutput.fields appears in the map', () => {
      const fields = [
        makeField({ field_key: 'sensor', group_key: 'sp', required_level: 'critical' }),
        makeField({ field_key: 'dpi', group_key: 'sp', required_level: 'required' }),
        makeField({ field_key: 'hz', group_key: 'sp' }), // no required_level â†’ defaults to 'optional'
      ];
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput({ fields }),
        runContext: makeRunContext(),
      });
      const mapKeys = Object.keys(result.field_priority_map).sort();
      const fieldKeys = fields.map(f => f.field_key).sort();
      assert.deepStrictEqual(mapKeys, fieldKeys);
      assert.equal(result.field_priority_map.hz, 'optional');
    });
  });

});
