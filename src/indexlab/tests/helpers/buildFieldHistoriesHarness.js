import {
  buildFieldHistories,
  classifyHostClass,
  classifyEvidenceClass
} from '../../buildFieldHistories.js';

export {
  buildFieldHistories,
  classifyHostClass,
  classifyEvidenceClass,
};

export function makeEvidence(overrides = {}) {
  return {
    url: 'https://example.com/page',
    host: 'example.com',
    rootDomain: 'example.com',
    tier: 2,
    tierName: 'review',
    method: 'dom',
    ...overrides
  };
}

export function makeQuery(overrides = {}) {
  return {
    query: 'test query',
    query_hash: 'hash_abc',
    family: 'manufacturer_html',
    target_fields: ['sensor_brand'],
    group_keys: ['core_specs'],
    ...overrides
  };
}

export function emptyHistory() {
  return {
    existing_queries: [],
    domains_tried: [],
    host_classes_tried: [],
    evidence_classes_tried: [],
    query_count: 0,
    urls_examined_count: 0,
    no_value_attempts: 0,
    duplicate_attempts_suppressed: 0
  };
}
