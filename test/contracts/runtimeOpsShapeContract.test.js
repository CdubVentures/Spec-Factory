// WHY: Contract test verifying runtime ops builder output shapes match the
// canonical key arrays in the contract modules. If a builder adds/removes a key,
// these tests catch the drift before it reaches production.

import { describe, it } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';

import {
  buildRuntimeOpsSummary,
  buildRuntimeOpsDocuments,
  buildRuntimeOpsDocumentDetail,
  buildRuntimeOpsMetricsRail,
  buildFallbackEvents,
  buildQueueState,
  buildPipelineFlow,
  buildExtractionFields,
  buildLlmCallsDashboard,
  buildPreFetchPhases,
} from '../../src/features/indexing/api/builders/runtimeOpsDataBuilders.js';

import {
  SUMMARY_KEYS,
  DOCUMENT_ROW_KEYS,
  DOCUMENT_DETAIL_KEYS,
  METRICS_RAIL_KEYS,
  POOL_METRIC_KEYS,
  QUALITY_METRIC_KEYS,
  FAILURE_METRIC_KEYS,
  FALLBACK_RESPONSE_KEYS,
  QUEUE_STATE_KEYS,
  PIPELINE_FLOW_KEYS,
  EXTRACTION_RESPONSE_KEYS,
  EXTRACTION_FIELD_KEYS,
  EXTRACTION_CANDIDATE_KEYS,
  LLM_DASHBOARD_KEYS,
} from '../../src/features/indexing/api/contracts/runtimeOpsContract.js';

import {
  PREFETCH_RESPONSE_KEYS,
  NEEDSET_DATA_KEYS,
} from '../../src/features/indexing/api/contracts/runtimeOpsPrefetchContract.js';

import {
  SEARCH_PROFILE_SHAPE,
} from '../../src/features/indexing/api/contracts/prefetchContract.js';

const sorted = (arr) => [...arr].sort();

// ── Summary ──

describe('runtimeOpsShapeContract — buildRuntimeOpsSummary', () => {
  it('top-level keys match SUMMARY_KEYS', () => {
    const result = buildRuntimeOpsSummary([], {});
    deepStrictEqual(sorted(Object.keys(result)), sorted(SUMMARY_KEYS));
  });
});

// ── Documents ──

describe('runtimeOpsShapeContract — buildRuntimeOpsDocuments', () => {
  it('returns an array (empty for empty events)', () => {
    const result = buildRuntimeOpsDocuments([], {});
    ok(Array.isArray(result));
  });

  it('row keys match DOCUMENT_ROW_KEYS when events produce rows', () => {
    const events = [
      { type: 'source_discovered', payload: { url: 'https://example.com' }, ts: '2024-01-01T00:00:00Z' },
    ];
    const result = buildRuntimeOpsDocuments(events, {});
    ok(result.length > 0, 'should produce at least one row');
    deepStrictEqual(sorted(Object.keys(result[0])), sorted(DOCUMENT_ROW_KEYS));
  });
});

// ── Document Detail ──

describe('runtimeOpsShapeContract — buildRuntimeOpsDocumentDetail', () => {
  it('top-level keys match DOCUMENT_DETAIL_KEYS', () => {
    const events = [
      { type: 'fetch_started', payload: { url: 'https://example.com' }, ts: '2024-01-01T00:00:00Z' },
    ];
    const result = buildRuntimeOpsDocumentDetail(events, 'https://example.com');
    ok(result !== null, 'should return a detail object for a matching URL');
    deepStrictEqual(sorted(Object.keys(result)), sorted(DOCUMENT_DETAIL_KEYS));
  });
});

// ── Metrics Rail ──

describe('runtimeOpsShapeContract — buildRuntimeOpsMetricsRail', () => {
  it('top-level keys match METRICS_RAIL_KEYS', () => {
    const result = buildRuntimeOpsMetricsRail([], {});
    deepStrictEqual(sorted(Object.keys(result)), sorted(METRICS_RAIL_KEYS));
  });

  it('pool_metrics sub-keys are search, fetch, parse, llm', () => {
    const result = buildRuntimeOpsMetricsRail([], {});
    deepStrictEqual(sorted(Object.keys(result.pool_metrics)), ['fetch', 'llm', 'parse', 'search']);
  });

  it('each pool metric has POOL_METRIC_KEYS', () => {
    const result = buildRuntimeOpsMetricsRail([], {});
    for (const pool of ['search', 'fetch', 'parse', 'llm']) {
      deepStrictEqual(sorted(Object.keys(result.pool_metrics[pool])), sorted(POOL_METRIC_KEYS));
    }
  });

  it('quality_metrics keys match QUALITY_METRIC_KEYS', () => {
    const result = buildRuntimeOpsMetricsRail([], {});
    deepStrictEqual(sorted(Object.keys(result.quality_metrics)), sorted(QUALITY_METRIC_KEYS));
  });

  it('failure_metrics keys match FAILURE_METRIC_KEYS', () => {
    const result = buildRuntimeOpsMetricsRail([], {});
    deepStrictEqual(sorted(Object.keys(result.failure_metrics)), sorted(FAILURE_METRIC_KEYS));
  });
});

// ── Fallbacks ──

describe('runtimeOpsShapeContract — buildFallbackEvents', () => {
  it('top-level keys match FALLBACK_RESPONSE_KEYS', () => {
    const result = buildFallbackEvents([], {});
    deepStrictEqual(sorted(Object.keys(result)), sorted(FALLBACK_RESPONSE_KEYS));
  });
});

// ── Queue ──

describe('runtimeOpsShapeContract — buildQueueState', () => {
  it('top-level keys match QUEUE_STATE_KEYS', () => {
    const result = buildQueueState([], {});
    deepStrictEqual(sorted(Object.keys(result)), sorted(QUEUE_STATE_KEYS));
  });
});

// ── Pipeline Flow ──

describe('runtimeOpsShapeContract — buildPipelineFlow', () => {
  it('top-level keys match PIPELINE_FLOW_KEYS', () => {
    const result = buildPipelineFlow([]);
    deepStrictEqual(sorted(Object.keys(result)), sorted(PIPELINE_FLOW_KEYS));
  });
});

// ── Extraction Fields ──

describe('runtimeOpsShapeContract — buildExtractionFields', () => {
  it('top-level keys match EXTRACTION_RESPONSE_KEYS', () => {
    const result = buildExtractionFields([], {});
    deepStrictEqual(sorted(Object.keys(result)), sorted(EXTRACTION_RESPONSE_KEYS));
  });
});

// ── LLM Dashboard ──

describe('runtimeOpsShapeContract — buildLlmCallsDashboard', () => {
  it('top-level keys match LLM_DASHBOARD_KEYS', () => {
    const result = buildLlmCallsDashboard([], {});
    deepStrictEqual(sorted(Object.keys(result)), sorted(LLM_DASHBOARD_KEYS));
  });
});

// ── PreFetch Phases ──

describe('runtimeOpsShapeContract — buildPreFetchPhases', () => {
  it('top-level keys match PREFETCH_RESPONSE_KEYS', () => {
    const result = buildPreFetchPhases([], {}, {});
    deepStrictEqual(sorted(Object.keys(result)), sorted(PREFETCH_RESPONSE_KEYS));
  });

  it('needset sub-shape keys match NEEDSET_DATA_KEYS', () => {
    const result = buildPreFetchPhases([], {}, {});
    deepStrictEqual(sorted(Object.keys(result.needset)), sorted(NEEDSET_DATA_KEYS));
  });

  it('search_profile sub-shape keys match SEARCH_PROFILE_SHAPE', () => {
    const result = buildPreFetchPhases([], {}, {});
    const contractKeys = SEARCH_PROFILE_SHAPE.map((s) => s.key);
    deepStrictEqual(sorted(Object.keys(result.search_profile)), sorted(contractKeys));
  });
});
