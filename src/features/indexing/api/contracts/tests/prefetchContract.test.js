// WHY: Contract test for prefetch tab keys and LLM reason classification.
// Verifies the contract-based classifier matches the original hardcoded behavior.

import { describe, it } from 'node:test';
import { ok, strictEqual } from 'node:assert';
import {
  PREFETCH_TAB_KEYS,
  classifyPrefetchLlmReason,
  PREFETCH_LLM_GROUP_KEYS,
  SEARCH_RESULT_ENTRY_SHAPE,
  SEARCH_RESULT_DETAIL_SHAPE,
  SERP_SCORE_COMPONENTS_SHAPE,
  SERP_SELECTOR_CANDIDATE_SHAPE,
  SERP_SELECTOR_ENVELOPE_SHAPE,
  SEARCH_PROFILE_SHAPE,
  SEARCH_PLAN_ENHANCEMENT_ROW_SHAPE,
} from '../prefetchContract.js';

describe('prefetchContract', () => {

  describe('PREFETCH_TAB_KEYS', () => {
    it('is frozen and non-empty', () => {
      ok(Array.isArray(PREFETCH_TAB_KEYS));
      ok(PREFETCH_TAB_KEYS.length >= 8);
      ok(Object.isFrozen(PREFETCH_TAB_KEYS));
    });

    it('includes all expected tab keys', () => {
      for (const key of ['needset', 'search_profile', 'brand_resolver', 'search_planner',
                          'query_journey', 'serp_selector', 'domain_classifier', 'search_results']) {
        ok(PREFETCH_TAB_KEYS.includes(key), `missing: ${key}`);
      }
    });
  });

  describe('classifyPrefetchLlmReason', () => {
    it('brand_resolution → brand_resolver', () => {
      strictEqual(classifyPrefetchLlmReason('brand_resolution'), 'brand_resolver');
    });

    it('needset_search_planner → needset_planner', () => {
      strictEqual(classifyPrefetchLlmReason('needset_search_planner'), 'needset_planner');
    });

    it('discovery_planner prefix → search_planner', () => {
      strictEqual(classifyPrefetchLlmReason('discovery_planner'), 'search_planner');
      strictEqual(classifyPrefetchLlmReason('discovery_planner_v2'), 'search_planner');
    });

    it('search_planner_enhance prefix → search_planner', () => {
      strictEqual(classifyPrefetchLlmReason('search_planner_enhance'), 'search_planner');
      strictEqual(classifyPrefetchLlmReason('search_planner'), 'search_planner');
    });

    it('triage substring → serp_selector', () => {
      strictEqual(classifyPrefetchLlmReason('serp_triage'), 'serp_selector');
      strictEqual(classifyPrefetchLlmReason('triage_pass_1'), 'serp_selector');
    });

    it('rerank substring → serp_selector', () => {
      strictEqual(classifyPrefetchLlmReason('serp_rerank'), 'serp_selector');
    });

    it('serp substring → serp_selector', () => {
      strictEqual(classifyPrefetchLlmReason('serp_scoring'), 'serp_selector');
    });

    it('domain_safety_classification → domain_classifier', () => {
      strictEqual(classifyPrefetchLlmReason('domain_safety_classification'), 'domain_classifier');
    });

    it('unknown reason → null', () => {
      strictEqual(classifyPrefetchLlmReason('something_else'), null);
      strictEqual(classifyPrefetchLlmReason(''), null);
      strictEqual(classifyPrefetchLlmReason(null), null);
    });

    it('is case-insensitive', () => {
      strictEqual(classifyPrefetchLlmReason('Brand_Resolution'), 'brand_resolver');
      strictEqual(classifyPrefetchLlmReason('NEEDSET_SEARCH_PLANNER'), 'needset_planner');
    });
  });

  // ── Shape descriptor alignment ──

  function assertFrozenDescriptor(descriptor, name, expectedCount) {
    it(`${name} is frozen`, () => {
      ok(Object.isFrozen(descriptor), `${name} must be frozen`);
    });
    it(`${name} has ${expectedCount} entries`, () => {
      strictEqual(descriptor.length, expectedCount);
    });
    it(`${name} has no duplicate keys`, () => {
      const keys = descriptor.map((d) => d.key);
      strictEqual(keys.length, new Set(keys).size, `duplicate keys in ${name}`);
    });
    it(`${name} entries all have valid coerce types`, () => {
      const validTypes = new Set(['string', 'int', 'float', 'bool', 'array', 'array_or_null', 'object_or_null', 'object_or_empty', 'passthrough']);
      for (const { key, coerce } of descriptor) {
        ok(validTypes.has(coerce), `${name}.${key} has invalid coerce type: ${coerce}`);
      }
    });
  }

  describe('PREFETCH_LLM_GROUP_KEYS', () => {
    it('is frozen', () => {
      ok(Object.isFrozen(PREFETCH_LLM_GROUP_KEYS));
    });
    it('contains exactly 5 expected group keys', () => {
      const expected = ['brand_resolver', 'needset_planner', 'search_planner', 'serp_selector', 'domain_classifier'];
      strictEqual(PREFETCH_LLM_GROUP_KEYS.length, 5);
      for (const key of expected) {
        ok(PREFETCH_LLM_GROUP_KEYS.includes(key), `missing group key: ${key}`);
      }
    });
  });

  describe('SEARCH_RESULT_ENTRY_SHAPE', () => {
    assertFrozenDescriptor(SEARCH_RESULT_ENTRY_SHAPE, 'SEARCH_RESULT_ENTRY_SHAPE', 10);
    it('has expected keys', () => {
      const keys = SEARCH_RESULT_ENTRY_SHAPE.map((d) => d.key);
      for (const k of ['title', 'url', 'domain', 'snippet', 'rank', 'relevance_score', 'decision', 'reason', 'provider', 'already_crawled']) {
        ok(keys.includes(k), `missing key: ${k}`);
      }
    });
  });

  describe('SEARCH_RESULT_DETAIL_SHAPE', () => {
    assertFrozenDescriptor(SEARCH_RESULT_DETAIL_SHAPE, 'SEARCH_RESULT_DETAIL_SHAPE', 3);
    it('has expected keys', () => {
      const keys = SEARCH_RESULT_DETAIL_SHAPE.map((d) => d.key);
      for (const k of ['query', 'provider', 'dedupe_count']) {
        ok(keys.includes(k), `missing key: ${k}`);
      }
    });
  });

  describe('SERP_SCORE_COMPONENTS_SHAPE', () => {
    assertFrozenDescriptor(SERP_SCORE_COMPONENTS_SHAPE, 'SERP_SCORE_COMPONENTS_SHAPE', 4);
    it('all entries are float coercion', () => {
      for (const { key, coerce } of SERP_SCORE_COMPONENTS_SHAPE) {
        strictEqual(coerce, 'float', `${key} should be float`);
      }
    });
  });

  describe('SERP_SELECTOR_CANDIDATE_SHAPE', () => {
    assertFrozenDescriptor(SERP_SELECTOR_CANDIDATE_SHAPE, 'SERP_SELECTOR_CANDIDATE_SHAPE', 13);
    it('has expected keys', () => {
      const keys = SERP_SELECTOR_CANDIDATE_SHAPE.map((d) => d.key);
      for (const k of ['url', 'title', 'domain', 'snippet', 'score', 'decision', 'rationale',
                        'role', 'identity_prelim', 'host_trust_class',
                        'triage_disposition', 'doc_kind_guess', 'approval_bucket']) {
        ok(keys.includes(k), `missing key: ${k}`);
      }
    });
  });

  describe('SERP_SELECTOR_ENVELOPE_SHAPE', () => {
    assertFrozenDescriptor(SERP_SELECTOR_ENVELOPE_SHAPE, 'SERP_SELECTOR_ENVELOPE_SHAPE', 3);
  });

  describe('SEARCH_PROFILE_SHAPE', () => {
    assertFrozenDescriptor(SEARCH_PROFILE_SHAPE, 'SEARCH_PROFILE_SHAPE', 28);
    it('has expected keys', () => {
      const keys = SEARCH_PROFILE_SHAPE.map((d) => d.key);
      for (const k of ['query_count', 'selected_query_count', 'provider', 'llm_query_planning',
                        'llm_query_model', 'llm_queries', 'identity_aliases', 'variant_guard_terms',
                        'focus_fields', 'query_rows', 'query_guard', 'hint_source_counts',
                        'field_rule_gate_counts', 'field_rule_hint_counts_by_field',
                        'generated_at', 'product_id', 'source', 'query_reject_log',
                        'alias_reject_log', 'brand_resolution',
                        'base_model', 'aliases', 'discovered_count', 'approved_count',
                        'candidate_count', 'llm_serp_selector', 'serp_explorer']) {
        ok(keys.includes(k), `missing key: ${k}`);
      }
    });
  });

  describe('SEARCH_PLAN_ENHANCEMENT_ROW_SHAPE', () => {
    assertFrozenDescriptor(SEARCH_PLAN_ENHANCEMENT_ROW_SHAPE, 'SEARCH_PLAN_ENHANCEMENT_ROW_SHAPE', 17);
    it('has expected keys', () => {
      const keys = SEARCH_PLAN_ENHANCEMENT_ROW_SHAPE.map((d) => d.key);
      for (const k of [
        'query', 'hint_source', 'tier', 'target_fields', 'doc_hint', 'alias',
        'domain_hint', 'source_host', 'group_key', 'normalized_key', 'repeat_count',
        'all_aliases', 'domain_hints', 'preferred_content_types',
        'domains_tried_for_key', 'content_types_tried_for_key', 'original_query',
      ]) {
        ok(keys.includes(k), `missing key: ${k}`);
      }
    });
  });
});
