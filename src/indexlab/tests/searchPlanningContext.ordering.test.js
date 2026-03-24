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

  describe('sorting', () => {
    it('focus_groups sorted by phase, then priority, then key', () => {
      const ns = makeNeedSetOutput({
        fields: [
          // optional group â†’ hold (when core exists)
          makeField({ field_key: 'f_opt', group_key: 'zzz_optional', state: 'accepted', required_level: 'optional', need_score: 0, reasons: [] }),
          // secondary group â†’ next (because core exists)
          makeField({ field_key: 'f_sec', group_key: 'bbb_secondary', state: 'unknown', required_level: 'expected' }),
          // core group â†’ now
          makeField({ field_key: 'f_core', group_key: 'aaa_core', state: 'unknown', required_level: 'critical' }),
          // another core group â†’ now
          makeField({ field_key: 'f_core2', group_key: 'ccc_core', state: 'unknown', required_level: 'required' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });

      const keys = result.focus_groups.map(g => g.key);
      // now/core: aaa_core, ccc_core | next/secondary: bbb_secondary | hold/optional: zzz_optional
      assert.deepStrictEqual(keys, ['aaa_core', 'ccc_core', 'bbb_secondary', 'zzz_optional']);
    });
  });

  // ===== Determinism =====

  describe('determinism', () => {
    it('same inputs â†’ identical output', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'sensor', group_key: 'sensor_performance', state: 'unknown',
            idx: { ...makeField().idx, query_terms: ['dpi', 'sensor'], domain_hints: ['example.com'] },
            history: { ...makeField().history, domains_tried: ['foo.com'], no_value_attempts: 2 }
          }),
          makeField({ field_key: 'weight', group_key: 'construction', state: 'unknown', required_level: 'expected' })
        ]
      });
      const rc = makeRunContext();
      const config = { discoveryEnabled: true, searchProfileQueryCap: 8 };
      const fgd = makeFieldGroupsData({
        groups: [
          { group_key: 'sensor_performance', display_name: 'Sensor & Performance', field_keys: ['sensor'], count: 1 },
          { group_key: 'construction', display_name: 'Construction', field_keys: ['weight'], count: 1 }
        ]
      });

      const r1 = buildSearchPlanningContext({ needSetOutput: ns, config, fieldGroupsData: fgd, runContext: rc });
      const r2 = buildSearchPlanningContext({ needSetOutput: ns, config, fieldGroupsData: fgd, runContext: rc });

      assert.deepStrictEqual(r1, r2);
    });
  });

  // ===== Exact match count =====

});
