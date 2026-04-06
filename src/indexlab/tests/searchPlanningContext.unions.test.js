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

  describe('SET unions', () => {
    it('query_terms from multiple fields unioned, sorted, no dupes', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, query_terms: ['zebra', 'apple'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, query_terms: ['apple', 'mango'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.query_terms_union, ['apple', 'mango', 'zebra']);
    });

    it('domains_tried unioned from history', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, domains_tried: ['a.com', 'b.com'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, domains_tried: ['b.com', 'c.com'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.domains_tried_union, ['a.com', 'b.com', 'c.com']);
    });
  });

  // ===== Scalar sums =====

  describe('additional SET unions', () => {
    it('domain_hints unioned from idx', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, domain_hints: ['razer.com', 'example.com'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, domain_hints: ['example.com', 'other.com'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.domain_hints_union, ['example.com', 'other.com', 'razer.com']);
    });

    it('content_types unioned from idx', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, content_types: ['spec_sheet', 'review'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, content_types: ['review', 'product_page'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.content_types_union, ['product_page', 'review', 'spec_sheet']);
    });

    it('existing_queries unioned from history', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, existing_queries: ['q1', 'q2'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, existing_queries: ['q2', 'q3'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.existing_queries_union, ['q1', 'q2', 'q3']);
    });

    it('host_classes_tried unioned from history', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, host_classes_tried: ['manufacturer', 'review'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, host_classes_tried: ['review', 'forum'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.host_classes_tried_union, ['forum', 'manufacturer', 'review']);
    });

    it('evidence_classes_tried unioned from history', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, evidence_classes_tried: ['html', 'pdf'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, evidence_classes_tried: ['pdf', 'json'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.evidence_classes_tried_union, ['html', 'json', 'pdf']);
    });
  });

  // ===== Run context passthrough =====

  describe('GAP-3: aliases_union', () => {
    it('aliases from idx aggregated per group with SET semantics', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f1', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, aliases: ['GPX2', 'G Pro X2'] }
          }),
          makeField({
            field_key: 'f2', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, aliases: ['G Pro X2', 'GPXS2'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.aliases_union, ['G Pro X2', 'GPX2', 'GPXS2']);
    });

    it('empty aliases â†’ empty aliases_union', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.aliases_union, []);
    });
  });

  // ===== PROFILE-GAP-4: search_exhausted signals =====

  describe('GAP-6: unresolved-only unions', () => {
    it('accepted fields do NOT contribute to query_terms_union', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f_ok', group_key: 'grp', state: 'accepted', need_score: 0, reasons: [],
            idx: { ...makeField().idx, query_terms: ['satisfied_term'] }
          }),
          makeField({
            field_key: 'f_missing', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, query_terms: ['needed_term'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.query_terms_union, ['needed_term']);
    });

    it('accepted fields do NOT contribute to domain_hints_union', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f_ok', group_key: 'grp', state: 'accepted', need_score: 0, reasons: [],
            idx: { ...makeField().idx, domain_hints: ['old.com'] }
          }),
          makeField({
            field_key: 'f_missing', group_key: 'grp', state: 'unknown',
            idx: { ...makeField().idx, domain_hints: ['new.com'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.domain_hints_union, ['new.com']);
    });

    it('accepted fields do NOT contribute to history unions (existing_queries, domains_tried, etc.)', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f_ok', group_key: 'grp', state: 'accepted', need_score: 0, reasons: [],
            history: { ...makeField().history, existing_queries: ['old_query'], domains_tried: ['old.com'] }
          }),
          makeField({
            field_key: 'f_missing', group_key: 'grp', state: 'unknown',
            history: { ...makeField().history, existing_queries: ['new_query'], domains_tried: ['new.com'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.existing_queries_union, ['new_query']);
      assert.deepStrictEqual(grp.domains_tried_union, ['new.com']);
    });

    it('weak and conflict fields DO contribute to unions', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({
            field_key: 'f_weak', group_key: 'grp', state: 'weak',
            idx: { ...makeField().idx, query_terms: ['weak_term'] }
          }),
          makeField({
            field_key: 'f_conflict', group_key: 'grp', state: 'conflict',
            idx: { ...makeField().idx, query_terms: ['conflict_term'] }
          })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.query_terms_union, ['conflict_term', 'weak_term']);
    });
  });

  // ===== PROFILE-GAP-8: urls_examined_count + query_count aggregations =====

});
