import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyLlmCallType } from '../runtimeBridgeCoercers.js';

describe('classifyLlmCallType', () => {
  const cases = [
    // brand resolver
    ['brand_resolution', 'brand_resolver'],

    // needset planner
    ['needset_search_planner', 'needset_planner'],

    // search planner — includes uber_query_planner and tier-aware enhance
    ['search_planner', 'search_planner'],
    ['search_planner_enhance', 'search_planner'],
    ['discovery_planner', 'search_planner'],
    ['discovery_planner_v2', 'search_planner'],
    ['uber_query_planner', 'search_planner'],

    // serp triage
    ['serp_selector', 'serp_selector'],
    ['serp_rerank', 'serp_selector'],
    ['triage_candidates', 'serp_selector'],

    // domain classifier
    ['domain_safety_classification', 'domain_classifier'],

    // validation
    ['validate', 'validation'],
    ['validate_candidates', 'validation'],

    // verification
    ['verify_extract', 'verification'],

    // extraction
    ['extract', 'extraction'],
    ['extract_candidates', 'extraction'],
    ['extract_fields', 'extraction'],

    // escalation planner
    ['escalation_planner', 'escalation_planner'],
    ['escalation_check', 'escalation_planner'],

    // unknown
    ['', 'unknown'],
    ['completely_unrecognized', 'unknown'],
  ];

  for (const [input, expected] of cases) {
    it(`classifies "${input}" → "${expected}"`, () => {
      assert.equal(classifyLlmCallType(input), expected);
    });
  }
});
